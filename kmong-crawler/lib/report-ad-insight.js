/**
 * 크몽 광고 리포트 — 키워드/추천가 인사이트 섹션
 * - 3-tier 집계 (어제 / 지난 7일 / 지난 30일)
 * - 키워드 TOP/BOTTOM 성과
 * - 추천가 대비 희망가 갭 경고
 * 소스: kmong_ad_keyword_daily, kmong_ad_bid_suggestion, kmong_ad_config_daily
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase } = require('./supabase');
const { getGigKoreanName } = require('./gig-name');

function fmtWon(n) {
  return (Number(n) || 0).toLocaleString('ko-KR') + '원';
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function sumCpcRange(startDate, endDate) {
  const { data } = await supabase
    .from('kmong_cpc_daily')
    .select('impressions, clicks, cpc_cost')
    .gte('date', startDate)
    .lte('date', endDate);
  const rows = data || [];
  return {
    impressions: rows.reduce((s, r) => s + (r.impressions || 0), 0),
    clicks: rows.reduce((s, r) => s + (r.clicks || 0), 0),
    cost: rows.reduce((s, r) => s + (r.cpc_cost || 0), 0),
  };
}

/**
 * 3-tier 집계 섹션 — 어제 / 지난 7일 / 지난 30일
 */
async function buildCpc3TierSection(yesterday) {
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);
  const [tY, t7, t30] = await Promise.all([
    sumCpcRange(yesterday, yesterday),
    sumCpcRange(d7, yesterday),
    sumCpcRange(d30, yesterday),
  ]);
  const fmtLine = (t) => {
    const ctr = t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(2) : '0.00';
    return `${fmtWon(t.cost)} · 노출 ${t.impressions.toLocaleString()} · 클릭 ${t.clicks.toLocaleString()} · CTR ${ctr}%`;
  };
  return [
    '💸 <b>광고(CPC) 3-Tier</b>',
    `  어제 (${yesterday}): ${fmtLine(tY)}`,
    `  지난 7일 (${d7}~${yesterday}): ${fmtLine(t7)}`,
    `  지난 30일 (${d30}~${yesterday}): ${fmtLine(t30)}`,
  ].join('\n');
}

/**
 * 키워드 TOP/BOTTOM — 지난 7일 기준
 * TOP: 클릭 많은 순 3개 / BOTTOM: 노출 많은데 클릭 적은 병목 3개
 */
async function buildKeywordTopBottom(yesterday) {
  const d7 = daysAgo(7);
  const { data } = await supabase
    .from('kmong_ad_keyword_daily')
    .select('product_id, keyword, impressions, clicks, total_cost')
    .gte('date', d7)
    .lte('date', yesterday);

  const byKw = {};
  for (const r of data || []) {
    const k = `${r.product_id}|${r.keyword}`;
    if (!byKw[k]) byKw[k] = { product_id: r.product_id, keyword: r.keyword, impressions: 0, clicks: 0, cost: 0 };
    byKw[k].impressions += r.impressions || 0;
    byKw[k].clicks += r.clicks || 0;
    byKw[k].cost += r.total_cost || 0;
  }
  const list = Object.values(byKw);
  const top = [...list].filter(k => k.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 3);
  const bottom = [...list].filter(k => k.impressions >= 10 && k.clicks === 0).sort((a, b) => b.impressions - a.impressions).slice(0, 3);

  const lines = ['🔑 <b>키워드 인사이트</b> (지난 7일)'];
  if (top.length) {
    lines.push('  TOP (클릭 많음):');
    for (const k of top) {
      const ko = await getGigKoreanName(k.product_id);
      lines.push(`    • [${ko.slice(0, 14)}] ${k.keyword} — 클릭 ${k.clicks} / CTR ${((k.clicks / k.impressions) * 100).toFixed(2)}%`);
    }
  }
  if (bottom.length) {
    lines.push('  BOTTOM (노출만 되고 클릭 0):');
    for (const k of bottom) {
      const ko = await getGigKoreanName(k.product_id);
      lines.push(`    • [${ko.slice(0, 14)}] ${k.keyword} — 노출 ${k.impressions}`);
    }
  }
  if (!top.length && !bottom.length) lines.push('  (분석 가능한 데이터 부족)');
  return lines.join('\n');
}

/**
 * 추천가 대비 희망가 갭 — 현재 설정 대비 추천가가 큰 키워드 TOP 5
 */
async function buildBidGapSection() {
  const [cfgRes, sugRes] = await Promise.all([
    supabase.from('kmong_ad_config_daily').select('product_id, desired_cpc, date').order('date', { ascending: false }).limit(200),
    supabase.from('kmong_ad_bid_suggestion').select('product_id, keyword, suggested_cpc, captured_at').order('captured_at', { ascending: false }).limit(800),
  ]);
  const latestCfg = {};
  for (const c of cfgRes.data || []) if (!latestCfg[c.product_id]) latestCfg[c.product_id] = c.desired_cpc;
  const latestSug = {};
  for (const s of sugRes.data || []) {
    const k = `${s.product_id}|${s.keyword}`;
    if (!latestSug[k]) latestSug[k] = s;
  }

  const gaps = [];
  for (const s of Object.values(latestSug)) {
    const desired = latestCfg[s.product_id] || 0;
    if (!desired || !s.suggested_cpc) continue;
    const ratio = s.suggested_cpc / desired;
    if (ratio >= 3) gaps.push({ ...s, desired, ratio });
  }
  gaps.sort((a, b) => b.ratio - a.ratio);
  const top = gaps.slice(0, 5);

  const lines = ['📈 <b>추천가 갭 경고</b> (추천가 ≥ 희망가 × 3)'];
  if (top.length) {
    for (const g of top) {
      const ko = await getGigKoreanName(g.product_id);
      lines.push(`  • [${ko.slice(0, 12)}] "${g.keyword}" 추천 ${fmtWon(g.suggested_cpc)} vs 희망 ${fmtWon(g.desired)} (${g.ratio.toFixed(1)}배)`);
    }
  } else {
    lines.push('  (갭 큰 키워드 없음 — 희망가가 시장 대비 적정)');
  }
  return lines.join('\n');
}

module.exports = {
  buildCpc3TierSection,
  buildKeywordTopBottom,
  buildBidGapSection,
};
