#!/usr/bin/env node
/**
 * 서비스별 CTR > CVR > ROI > ROAS 통합 funnel 분석기 v2 (고도화)
 *  - kmong_cpc_daily + kmong_inquiries + kmong_orders 조인
 *  - 각 단계별 승자 + 추세 + 소재 변경 영향 + 패키지 선호 + 시간대 성과 통합
 *  - funnel-insights.json 저장 → performance-playbook 이 읽음
 *
 *  cron: 매일 오전 11시
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('./lib/supabase');

const WINDOW_DAYS = 90;
const TREND_WINDOW = 14;       // 최근 N일 vs 이전 N일 비교
const OUT_PATH = path.join(__dirname, 'funnel-insights.json');

async function main() {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const trendCut = new Date(Date.now() - TREND_WINDOW * 86400000).toISOString().slice(0, 10);
  const trendPrev = new Date(Date.now() - TREND_WINDOW * 2 * 86400000).toISOString().slice(0, 10);
  console.log(`=== 전환 funnel 분석 (${since} ~ 현재) ===`);

  // 1) CPC 전체 (90일) — 일자별 row 유지 (추세·소재변경 분석용)
  const { data: cpcAll } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, title_text, thumbnail_hash, impressions, clicks, cpc_cost, date, ad_enabled')
    .gte('date', since)
    .limit(20000);

  const byProd = {};
  for (const r of (cpcAll || [])) {
    const k = r.product_id || 'null';
    if (!byProd[k]) byProd[k] = { imp: 0, clk: 0, cost: 0, titles: new Set(), daily: [] };
    byProd[k].imp += r.impressions || 0;
    byProd[k].clk += r.clicks || 0;
    byProd[k].cost += r.cpc_cost || 0;
    if (r.title_text) byProd[k].titles.add(r.title_text);
    byProd[k].daily.push(r);
  }

  // 2) 문의 집계 (+ 시간대별)
  const { data: inq } = await supabase
    .from('kmong_inquiries')
    .select('product_id, inquiry_date')
    .gte('inquiry_date', since + 'T00:00:00')
    .limit(5000);
  const inqByProd = {};
  const inqByHour = {};  // 전체 inquiry 시간대별
  for (const r of (inq || [])) {
    inqByProd[r.product_id || 'null'] = (inqByProd[r.product_id || 'null'] || 0) + 1;
    const h = new Date(r.inquiry_date).getUTCHours() + 9; // KST
    const hour = ((h % 24) + 24) % 24;
    inqByHour[hour] = (inqByHour[hour] || 0) + 1;
  }

  // 3) 주문 집계 (package_type 분포 + 시간대 매출)
  const { data: ord } = await supabase.from('kmong_orders').select('product_id, amount, status, package_type, service_name, order_date, completed_at').limit(3000);
  const ordByProd = {};
  const pkgPrefByProd = {};  // product → {pkg: count}
  for (const r of (ord || [])) {
    const k = r.product_id || 'null';
    if (!ordByProd[k]) ordByProd[k] = { count: 0, revenue: 0, service_name: r.service_name, packages: new Set() };
    ordByProd[k].count += 1;
    const isCompleted = /거래완료|completed|paid|done/.test(r.status || '');
    if (isCompleted) ordByProd[k].revenue += r.amount || 0;
    if (r.package_type) {
      ordByProd[k].packages.add(r.package_type);
      if (!pkgPrefByProd[k]) pkgPrefByProd[k] = {};
      pkgPrefByProd[k][r.package_type] = (pkgPrefByProd[k][r.package_type] || 0) + 1;
    }
  }

  // 4) 기본 funnel 통합 (기존 로직)
  const allIds = new Set([...Object.keys(byProd), ...Object.keys(inqByProd), ...Object.keys(ordByProd)]);
  const rows = [];
  for (const p of allIds) {
    const x = byProd[p] || { imp: 0, clk: 0, cost: 0, titles: new Set(), daily: [] };
    const inqN = inqByProd[p] || 0;
    const o = ordByProd[p] || { count: 0, revenue: 0 };
    const ctr = x.imp ? x.clk / x.imp * 100 : 0;
    const cvr_click_to_inq = x.clk ? inqN / x.clk * 100 : 0;
    const cvr_inq_to_order = inqN ? o.count / inqN * 100 : 0;
    const roi = x.cost ? (o.revenue - x.cost) / x.cost * 100 : (o.revenue > 0 ? 9999 : 0);
    const roas = x.cost ? o.revenue / x.cost * 100 : 0;

    // [신규] 14일 추세 — 최근 14일 vs 이전 14일 CTR 비교
    let trend = null;
    const recent = x.daily.filter(d => d.date >= trendCut);
    const prev = x.daily.filter(d => d.date >= trendPrev && d.date < trendCut);
    const agg = (arr) => {
      const i = arr.reduce((s, d) => s + (d.impressions || 0), 0);
      const c = arr.reduce((s, d) => s + (d.clicks || 0), 0);
      return { imp: i, clk: c, ctr: i ? c / i * 100 : 0 };
    };
    if (recent.length >= 3 && prev.length >= 3) {
      const a = agg(recent), b = agg(prev);
      trend = {
        recent_ctr: +a.ctr.toFixed(2),
        prev_ctr: +b.ctr.toFixed(2),
        ctr_change_pct: b.ctr > 0 ? +((a.ctr - b.ctr) / b.ctr * 100).toFixed(1) : null,
      };
    }

    // [신규] 소재 변경 영향 — thumbnail_hash 또는 title_text 바뀐 시점 감지
    const changes = [];
    const sorted = [...x.daily].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (let i = 1; i < sorted.length; i++) {
      const p1 = sorted[i - 1], p2 = sorted[i];
      const titleChanged = p1.title_text && p2.title_text && p1.title_text !== p2.title_text;
      const thumbChanged = p1.thumbnail_hash && p2.thumbnail_hash && p1.thumbnail_hash !== p2.thumbnail_hash;
      if (titleChanged || thumbChanged) {
        // 변경 전 7일 CTR vs 이후 7일 CTR
        const beforeRange = sorted.filter(d => d.date >= addDays(p2.date, -7) && d.date < p2.date);
        const afterRange = sorted.filter(d => d.date >= p2.date && d.date < addDays(p2.date, 7));
        const bb = agg(beforeRange), aa = agg(afterRange);
        if (bb.imp > 50 && aa.imp > 50) {
          changes.push({
            date: p2.date,
            type: titleChanged && thumbChanged ? 'title+thumb' : titleChanged ? 'title' : 'thumb',
            before_ctr: +bb.ctr.toFixed(2),
            after_ctr: +aa.ctr.toFixed(2),
            impact_pct: bb.ctr > 0 ? +((aa.ctr - bb.ctr) / bb.ctr * 100).toFixed(1) : null,
            ...(titleChanged ? { title_before: p1.title_text, title_after: p2.title_text } : {}),
          });
        }
      }
    }

    // [신규] 패키지 선호
    const pkgPref = pkgPrefByProd[p] || {};
    const pkgTotal = Object.values(pkgPref).reduce((s, v) => s + v, 0);
    const pkgRatio = {};
    for (const [k, v] of Object.entries(pkgPref)) pkgRatio[k] = +(v / pkgTotal).toFixed(2);

    rows.push({
      product_id: p,
      title: [...x.titles][0] || o.service_name || '',
      impressions: x.imp,
      clicks: x.clk,
      ctr: +ctr.toFixed(2),
      cost: x.cost,
      inquiries: inqN,
      cvr_click_to_inq: +cvr_click_to_inq.toFixed(1),
      orders: o.count,
      revenue: o.revenue,
      cvr_inq_to_order: +cvr_inq_to_order.toFixed(1),
      roi: +roi.toFixed(0),
      roas: +roas.toFixed(0),
      trend,
      creative_changes: changes.slice(-3),  // 최근 3건만
      package_preference: pkgRatio,
    });
  }

  // 5) 단계별 상위 3 추출
  const pickTop = (metric, filter) => {
    let list = rows.filter(filter);
    list.sort((a, b) => b[metric] - a[metric]);
    return list.slice(0, 3);
  };
  const leaders = {
    ctr: pickTop('ctr', r => r.impressions >= 100),
    cvr_click_to_inq: pickTop('cvr_click_to_inq', r => r.clicks >= 5),
    cvr_inq_to_order: pickTop('cvr_inq_to_order', r => r.inquiries >= 2),
    roi: pickTop('roi', r => r.cost >= 1000),
    roas: pickTop('roas', r => r.cost >= 1000),
    revenue: pickTop('revenue', r => r.revenue > 0),
  };

  // 6) [신규] 추세 기반 상승/하락
  const trendsRising = rows.filter(r => r.trend?.ctr_change_pct > 15).sort((a, b) => b.trend.ctr_change_pct - a.trend.ctr_change_pct).slice(0, 5);
  const trendsFalling = rows.filter(r => r.trend?.ctr_change_pct < -15).sort((a, b) => a.trend.ctr_change_pct - b.trend.ctr_change_pct).slice(0, 5);

  // 7) [신규] 소재 변경 성공 사례
  const creativeWins = rows.flatMap(r => (r.creative_changes || []).map(c => ({ product_id: r.product_id, title: r.title, ...c })))
    .filter(c => c.impact_pct > 20)
    .sort((a, b) => b.impact_pct - a.impact_pct).slice(0, 5);
  const creativeLosses = rows.flatMap(r => (r.creative_changes || []).map(c => ({ product_id: r.product_id, title: r.title, ...c })))
    .filter(c => c.impact_pct < -20)
    .sort((a, b) => a.impact_pct - b.impact_pct).slice(0, 5);

  // 8) [신규] 시간대별 문의 집중
  const hourRanked = Object.entries(inqByHour).sort((a, b) => b[1] - a[1]);

  // 9) 출력
  console.log('\n[단계별 상위 서비스]');
  for (const [metric, top] of Object.entries(leaders)) {
    console.log(`\n▼ ${metric}`);
    for (const r of top) console.log(`  ${r.product_id.padEnd(14)} ${String(r[metric]).padStart(6)} | ${(r.title || '').slice(0, 40)}`);
  }
  console.log('\n[추세 상승 🔺]');
  for (const r of trendsRising) console.log(`  ${r.product_id} +${r.trend.ctr_change_pct}% (${r.trend.prev_ctr}% → ${r.trend.recent_ctr}%) | ${(r.title || '').slice(0, 40)}`);
  console.log('\n[추세 하락 🔻]');
  for (const r of trendsFalling) console.log(`  ${r.product_id} ${r.trend.ctr_change_pct}% (${r.trend.prev_ctr}% → ${r.trend.recent_ctr}%) | ${(r.title || '').slice(0, 40)}`);
  console.log('\n[소재 변경 효과 🎨]');
  for (const c of creativeWins) console.log(`  ${c.product_id} ${c.type} ${c.date} → CTR ${c.before_ctr}% → ${c.after_ctr}% (+${c.impact_pct}%)`);
  console.log('\n[시간대별 문의 집중 (KST)]');
  for (const [h, n] of hourRanked.slice(0, 5)) console.log(`  ${h}시 ${n}건`);

  // 10) 저장
  const out = {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    since,
    rows: rows.sort((a, b) => b.roas - a.roas),
    leaders,
    trends: { rising: trendsRising, falling: trendsFalling },
    creative_impact: { wins: creativeWins, losses: creativeLosses },
    hour_performance: hourRanked.map(([h, n]) => ({ hour: +h, inquiries: n })),
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n저장: ${OUT_PATH}`);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
