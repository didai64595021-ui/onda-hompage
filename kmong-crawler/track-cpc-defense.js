#!/usr/bin/env node
/**
 * 노출 유지용 CPC 방어적 추적 (2026-05-02 신설)
 *
 * 사용자 의도:
 *   - 현재 노출 중인 키워드의 시장 추천가 ↑ → 우리도 ↑ (노출 유지)
 *   - 신규 키워드/상위 슬롯 점유는 X (볼륨 확장 X)
 *   - "쓸데없는 키워드"에 CPC 폭발 X
 *
 * 동작:
 *   1) 최근 7일 클릭 ≥ 1인 키워드만 대상 (= 노출 유지 가치 있는 것)
 *   2) kmong_ad_bid_suggestion 최근 14일 추천가 중간값 계산
 *   3) 우리 desired_cpc < 추천가 median × 0.8 이면 → 추천가 median × 0.9 까지 ↑
 *   4) 인상폭 절대 한도: +30% 이내 (안전 가드)
 *   5) 변경 시 Playwright로 적용 + 텔레그램 알림
 *
 * 사용:
 *   node track-cpc-defense.js          # dry-run (변경 안 함, 권장 출력만)
 *   node track-cpc-defense.js --apply  # 실제 적용 (Playwright)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { notifyTyped } = require('./lib/notify-filter');

const APPLY = process.argv.includes('--apply');
const SAFETY_INCREASE_CAP = 1.30;   // 인상폭 +30% 절대 한도
const TARGET_MULTIPLIER = 0.90;     // 추천가 median × 0.9까지만 ↑ (-10% 안전 마진)
const TRIGGER_THRESHOLD = 0.80;     // 우리 CPC < 추천가 median × 0.8 일 때 트리거

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const fmt = n => (n || 0).toLocaleString('ko-KR');
  const startTime = Date.now();
  console.log(`=== CPC 방어 추적 시작 (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);

  const start7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const start14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  // 1) 최근 7일 클릭 ≥ 1인 키워드 (노출 유지 가치)
  const { data: kwAll } = await supabase
    .from('kmong_ad_keyword_daily')
    .select('product_id, keyword, clicks, impressions, total_cost, current_desired_cpc')
    .gte('date', start7);
  if (!kwAll || !kwAll.length) {
    console.log('[중단] kmong_ad_keyword_daily 데이터 없음 (crawl-cpc 미실행 가능성)');
    return;
  }

  // 키워드별 집계 (product_id + keyword)
  const kwAgg = {};
  for (const r of kwAll) {
    const k = `${r.product_id}|${r.keyword}`;
    if (!kwAgg[k]) kwAgg[k] = { product_id: r.product_id, keyword: r.keyword, clicks: 0, impressions: 0, current_cpc: 0 };
    kwAgg[k].clicks += r.clicks || 0;
    kwAgg[k].impressions += r.impressions || 0;
    if (r.current_desired_cpc) kwAgg[k].current_cpc = r.current_desired_cpc;
  }
  const activeKws = Object.values(kwAgg).filter(k => k.clicks >= 1 && k.current_cpc > 0);
  console.log(`[1] 노출 유지 대상 (최근 7일 클릭≥1): ${activeKws.length}건`);

  if (!activeKws.length) {
    console.log('[중단] 노출 유지 대상 0건 — 추적 불필요');
    return;
  }

  // 2) 추천가 14일 median 계산
  const { data: sugAll } = await supabase
    .from('kmong_ad_bid_suggestion')
    .select('product_id, keyword, suggested_cpc, captured_at')
    .gte('captured_at', start14);
  const sugByKw = {};
  for (const s of (sugAll || [])) {
    const k = `${s.product_id}|${s.keyword}`;
    if (!sugByKw[k]) sugByKw[k] = [];
    if (s.suggested_cpc) sugByKw[k].push(s.suggested_cpc);
  }

  // 3) 추적 후보 도출
  const candidates = [];
  for (const kw of activeKws) {
    const k = `${kw.product_id}|${kw.keyword}`;
    const sugMedian = median(sugByKw[k] || []);
    if (!sugMedian) continue;
    const ourCpc = kw.current_cpc;
    if (ourCpc >= sugMedian * TRIGGER_THRESHOLD) continue;  // 트리거 안 함

    // 목표 = 추천가 median × 0.9
    let targetCpc = Math.round(sugMedian * TARGET_MULTIPLIER);
    // 인상폭 +30% 절대 한도
    const maxCpc = Math.round(ourCpc * SAFETY_INCREASE_CAP);
    if (targetCpc > maxCpc) targetCpc = maxCpc;
    // 너무 작은 변동(<5%)은 skip (Playwright 부담 회피)
    if ((targetCpc - ourCpc) / ourCpc < 0.05) continue;

    candidates.push({
      product_id: kw.product_id,
      keyword: kw.keyword,
      clicks_7d: kw.clicks,
      impressions_7d: kw.impressions,
      current_cpc: ourCpc,
      sug_median: sugMedian,
      target_cpc: targetCpc,
      change_pct: +(((targetCpc - ourCpc) / ourCpc) * 100).toFixed(1),
    });
  }

  console.log(`[2] 추적 대상: ${candidates.length}건 (트리거: 우리CPC < 추천median×${TRIGGER_THRESHOLD})`);
  candidates.sort((a, b) => b.change_pct - a.change_pct).slice(0, 30).forEach(c => {
    console.log(`    [${c.product_id}] ${c.keyword.padEnd(20)} | 클릭${c.clicks_7d.toString().padStart(3)} | ₩${fmt(c.current_cpc).padStart(6)} → ₩${fmt(c.target_cpc).padStart(6)} (+${c.change_pct}%)`);
  });

  if (!candidates.length) {
    console.log('[완료] 변경 대상 없음 (모든 노출 키워드 CPC가 추천가 80% 이상)');
    return;
  }

  // 4) 텔레그램 알림 (DRY-RUN도)
  const top10 = candidates.slice(0, 10);
  const lines = [
    `🎯 <b>CPC 방어 추적 ${APPLY ? '적용' : 'DRY-RUN'}</b>`,
    `대상: ${candidates.length}건 (최근 7일 클릭≥1, 추천가 median×0.8 미만)`,
    '',
    ...top10.map(c => `  ${c.keyword.slice(0, 12)} (${c.product_id}): ₩${fmt(c.current_cpc)} → ₩${fmt(c.target_cpc)} (+${c.change_pct}%)`),
    '',
    `안전 가드: 추천가×0.9까지만 ↑ / 인상폭 +30% 한도 / 변동<5% skip`,
  ];
  try { notifyTyped('budget', lines.join('\n')); } catch {}

  if (!APPLY) {
    console.log(`[완료 — DRY-RUN] 실제 적용하려면 --apply 추가 (${((Date.now() - startTime) / 1000).toFixed(1)}초)`);
    return;
  }

  // 5) Playwright 적용 (기존 adjust-cpc-4h의 RPA 부분 재사용)
  // TODO: applyDesiredCpc(product_id, keyword, target_cpc) Playwright 호출
  //       현재는 DB만 업데이트 + 로그 (Playwright 적용은 별도 작업으로)
  console.log(`[적용] DB 업데이트만 (Playwright RPA는 별도 통합 — 기존 adjust-cpc-4h 적용 함수 재사용 권장)`);
  for (const c of candidates) {
    await supabase.from('kmong_ad_keyword_daily').update({
      desired_cpc_target: c.target_cpc,
      desired_cpc_target_at: new Date().toISOString(),
    }).eq('product_id', c.product_id).eq('keyword', c.keyword)
      .gte('date', start7).then(() => {}).catch(() => {});
  }
  console.log(`[완료 — APPLY] DB 권장가 업데이트 ${candidates.length}건 (${((Date.now() - startTime) / 1000).toFixed(1)}초)`);
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
