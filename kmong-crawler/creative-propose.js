#!/usr/bin/env node
/**
 * 소재 개선 제안 오케스트레이터
 * - 하루 1회 크론 실행 (apply 직전 단계)
 * - 지난 30일 메트릭 로드
 * - 기존 큐 상태 확인 (submitted/measuring 서비스는 후보 제외)
 * - Opus가 1개 서비스 × 1개 요소 제안
 * - kmong_creative_queue에 pending으로 insert
 *
 * 실제 크몽 제출은 creative-submit.js가 pending → submitted 전환 시 담당 (다음 단계)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { notifyTyped } = require('./lib/notify-filter');
const { loadServiceMetrics } = require('./lib/ad-bot-metrics');
const { proposeCreativeChange } = require('./lib/creative-judge');

async function main() {
  const start = Date.now();
  console.log('=== 크몽 소재 제안 생성 ===');

  const metrics = await loadServiceMetrics(30);
  console.log(`[메트릭] 서비스 ${metrics.length}개`);
  if (!metrics.length) { console.log('[중단] 메트릭 없음'); return; }

  // 현재 진행 중인 큐 (서비스당 동시 1개만 허용)
  const { data: activeQueue } = await supabase
    .from('kmong_creative_queue')
    .select('product_id, element_type, state')
    .in('state', ['pending', 'submitted', 'measuring']);
  console.log(`[큐] 진행 중 ${(activeQueue || []).length}개`);

  // Opus 제안
  const r = await proposeCreativeChange(metrics, activeQueue || []);
  if (!r.ok) {
    console.error('[제안 실패]', r.error);
    notifyTyped('error', `소재 제안 실패: ${r.error}`);
    process.exit(1);
  }
  const p = r.proposal;
  if (p.skip) {
    console.log('[SKIP]', p.reason);
    notifyTyped('report', `📋 소재 제안 SKIP: ${p.reason}`);
    return;
  }

  // 메트릭 snapshot 저장
  const mt = metrics.find(m => m.product_id === p.product_id);
  const { data, error } = await supabase.from('kmong_creative_queue').insert([{
    product_id: p.product_id,
    element_type: p.element_type,
    priority: p.priority || 50,
    state: 'pending',
    reasoning: p.reasoning,
    before_value: String(p.before_value || '').slice(0, 2000),
    after_value: String(p.after_value || '').slice(0, 2000),
    metrics_before: mt ? {
      ctr_30d: mt.ctr_30d, cvr_inquiry_30d: mt.cvr_inquiry_30d, cvr_order_30d: mt.cvr_order_30d,
      impressions_30d: mt.impressions_30d, clicks_30d: mt.clicks_30d,
      inquiries_30d: mt.inquiries_30d, orders_30d: mt.orders_30d, revenue_30d: mt.revenue_30d,
      cost_30d: mt.cost_30d, roi_30d: mt.roi_30d, roas_30d: mt.roas_30d,
    } : null,
  }]).select('id').single();

  if (error) {
    console.error('[insert 실패]', error.message);
    notifyTyped('error', `소재 큐 insert 실패: ${error.message}`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const msg = [
    `📋 <b>소재 제안 생성 (pending, id=${data.id})</b>`,
    `  서비스: ${p.product_id}`,
    `  요소: ${p.element_type}`,
    `  예상 lift: ${p.expected_lift || '-'}`,
    `  근거: ${p.reasoning}`,
    '',
    `<b>현재</b>: ${String(p.before_value).slice(0, 200)}`,
    `<b>제안</b>: ${String(p.after_value).slice(0, 400)}`,
    '',
    `<i>Opus 비용 $${r.cost_usd?.toFixed(4)} · ${elapsed}초</i>`,
    `다음 단계: creative-submit.js가 pending → submitted 제출 (Playwright)`,
  ].join('\n');
  console.log(msg);
  notifyTyped('report', msg);
}

main().catch(err => {
  console.error('[치명적 에러]', err);
  notifyTyped('error', `소재 제안 크래시: ${err.message}`);
  process.exit(1);
});
