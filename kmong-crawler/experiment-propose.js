#!/usr/bin/env node
/**
 * A/B 실험 제안 생성 — 매주 월요일 09시 크론
 * 1. 진행 중 실험 조회 (전체 3개 제한 체크)
 * 2. 메트릭 로드
 * 3. Opus가 저성과 서비스 1개 + variant B 제안 생성
 * 4. kmong_ab_experiments에 state='drafted'로 insert
 * 5. 텔레그램 보고 (사용자가 승인하면 experiment-create-gig.js 실행)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const adminDb = require('./lib/supabase-admin');
const { notifyTyped } = require('./lib/notify-filter');
const { loadServiceMetrics } = require('./lib/ad-bot-metrics');
const { proposeExperiment } = require('./lib/experiment-judge');

const MAX_CONCURRENT = 3;

async function loadActiveExperiments() {
  const { data } = await supabase
    .from('kmong_ab_experiments')
    .select('id, variant_a_product_id, state, created_at')
    .in('state', ['drafted', 'approved_to_create', 'created', 'live', 'measuring']);
  return data || [];
}

async function insertExperimentRow(row) {
  const pg = await supabase.from('kmong_ab_experiments').insert([row]).select('id').single();
  if (!pg.error) return { ok: true, id: pg.data.id };
  console.log('[PostgREST 실패 → admin API]', pg.error.message);
  const admin = await adminDb.insertRow('kmong_ab_experiments', row);
  if (!admin.ok) return { ok: false, error: admin.error };
  return { ok: true, id: admin.row?.id };
}

async function main() {
  const start = Date.now();
  console.log('=== A/B 실험 제안 생성 ===');

  const active = await loadActiveExperiments();
  console.log(`[진행 중] ${active.length}개 (max ${MAX_CONCURRENT})`);
  if (active.length >= MAX_CONCURRENT) {
    const msg = `📋 A/B 실험 SKIP — 이미 ${active.length}개 진행 중 (한도 ${MAX_CONCURRENT})`;
    console.log(msg); notifyTyped('report', msg); return;
  }

  const metrics = await loadServiceMetrics(30);
  if (!metrics.length) { console.log('[중단] 메트릭 없음'); return; }

  // ★ 자동 트리거 조건: 모든 서비스가 Phase 2 (표본 충분)여야 A/B 의미 있음
  // 학습 중인 서비스가 있으면 skip (입찰가 학습 우선)
  const learning = metrics.filter(m => m.impressions_30d < 500 || m.clicks_30d < 10);
  if (learning.length > 0) {
    const names = learning.map(m => `${m.product_id}(노출${m.impressions_30d}/클릭${m.clicks_30d})`).join(', ');
    const msg = `📋 A/B 자동 SKIP — ${learning.length}개 서비스 아직 학습 중\n  ${names}\n  모두 Phase 2 (노출500+ 클릭10+) 도달 시 자동 시작`;
    console.log(msg); notifyTyped('report', msg); return;
  }
  console.log('[자동 트리거] 전 서비스 Phase 2 도달 → A/B 진행');

  const r = await proposeExperiment(metrics, active);
  if (!r.ok) {
    console.error('[실패]', r.error);
    notifyTyped('error', `A/B 제안 실패: ${r.error}`);
    process.exit(1);
  }
  const p = r.proposal;
  if (p.skip) {
    notifyTyped('report', `📋 A/B 제안 SKIP: ${p.reason}`);
    return;
  }

  const ins = await insertExperimentRow({
    variant_a_product_id: p.variant_a_product_id,
    hypothesis: p.hypothesis,
    variant_b_title: p.variant_b_title,
    variant_b_subtitle: p.variant_b_subtitle,
    variant_b_description: p.variant_b_description_summary,
    variant_b_thumbnail_concept: p.variant_b_thumbnail_concept,
    variant_b_changes: { differentiation_axis: p.differentiation_axis, expected_lift: p.expected_lift, priority: p.priority || 50 },
    state: 'drafted',
    budget_a_weekly: 100000,
    budget_b_weekly: 100000,
  });
  if (!ins.ok) {
    notifyTyped('error', `A/B insert 실패: ${ins.error}`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const msg = [
    `🧪 <b>A/B 실험 초안 생성 (id=${ins.id})</b>`,
    `  원본 A: ${p.variant_a_product_id}`,
    `  가설: ${p.hypothesis}`,
    `  차별 축: ${p.differentiation_axis}`,
    `  예상: ${p.expected_lift}`,
    '',
    `<b>제안 B 제목</b>: ${p.variant_b_title}`,
    `<b>B 부제</b>: ${p.variant_b_subtitle}`,
    `<b>B 상세 후킹</b>: ${p.variant_b_description_summary?.slice(0, 200)}`,
    `<b>B 썸네일</b>: ${p.variant_b_thumbnail_concept}`,
    '',
    `예산: A 10만/주 + B 10만/주 = 총 20만/주`,
    `<i>Opus 비용 $${r.cost_usd?.toFixed(4)} · ${elapsed}초</i>`,
    ``,
    `✅ 이 초안으로 신규 상품 등록 진행할까요?`,
    `OK → 텔레그램 봇에 "실험 ${ins.id} 승인" 보내면 experiment-create-gig.js 자동 실행`,
  ].join('\n');
  console.log(msg);
  notifyTyped('report', msg);
}

main().catch(err => {
  console.error('[치명적]', err);
  notifyTyped('error', `A/B 제안 크래시: ${err.message}`);
  process.exit(1);
});
