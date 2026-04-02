/**
 * 크몽 Phase 3 — A/B 테스트 프레임워크
 * 콘텐츠 변경 전후 효과 측정 + 통계적 유의성 판정
 */

const { supabase } = require('./supabase');

/**
 * A/B 테스트 생성
 * @param {string} productId - 상품 ID
 * @param {string} testType - title, thumbnail, description, reply_template
 * @param {object} variantA - 기존 콘텐츠 { content, contentId? }
 * @param {object} variantB - 새 콘텐츠 { content, contentId? }
 * @param {number} minSampleSize - 최소 표본 크기
 */
async function createTest(productId, testType, variantA, variantB, minSampleSize = 100) {
  const testName = `${productId}_${testType}_${Date.now()}`;

  const { data, error } = await supabase
    .from('kmong_ab_tests')
    .insert({
      product_id: productId,
      test_name: testName,
      test_type: testType,
      variant_a: variantA,
      variant_b: variantB,
      min_sample_size: minSampleSize,
      status: 'running',
      start_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error(`[A/B] 테스트 생성 실패: ${error.message}`);
    return null;
  }

  console.log(`[A/B] 테스트 시작: ${testName}`);
  return data;
}

/**
 * A/B 테스트 지표 업데이트
 * 크롤링 데이터를 기반으로 각 variant의 성과를 업데이트
 */
async function updateTestMetrics(testId) {
  const { data: test, error } = await supabase
    .from('kmong_ab_tests')
    .select('*')
    .eq('id', testId)
    .single();

  if (error || !test || test.status !== 'running') return null;

  const startDate = test.start_date.split('T')[0];
  const midDate = test.variant_a.applied_date || startDate;

  // variant A: 테스트 시작 전 데이터 (기존 콘텐츠)
  const { data: beforeData } = await supabase
    .from('kmong_cpc_daily')
    .select('impressions,clicks,cpc_cost')
    .eq('product_id', test.product_id)
    .lt('date', midDate)
    .gte('date', new Date(new Date(midDate).getTime() - 14 * 86400000).toISOString().split('T')[0]);

  // variant B: 테스트 시작 후 데이터 (새 콘텐츠)
  const { data: afterData } = await supabase
    .from('kmong_cpc_daily')
    .select('impressions,clicks,cpc_cost')
    .eq('product_id', test.product_id)
    .gte('date', midDate);

  // 문의 데이터
  const { data: inqBefore } = await supabase
    .from('kmong_inquiries')
    .select('id')
    .eq('product_id', test.product_id)
    .lt('inquiry_date', midDate)
    .gte('inquiry_date', new Date(new Date(midDate).getTime() - 14 * 86400000).toISOString());

  const { data: inqAfter } = await supabase
    .from('kmong_inquiries')
    .select('id')
    .eq('product_id', test.product_id)
    .gte('inquiry_date', midDate);

  // 주문 데이터
  const { data: ordBefore } = await supabase
    .from('kmong_orders')
    .select('amount')
    .eq('product_id', test.product_id)
    .eq('status', 'completed')
    .lt('order_date', midDate)
    .gte('order_date', new Date(new Date(midDate).getTime() - 14 * 86400000).toISOString().split('T')[0]);

  const { data: ordAfter } = await supabase
    .from('kmong_orders')
    .select('amount')
    .eq('product_id', test.product_id)
    .eq('status', 'completed')
    .gte('order_date', midDate);

  const metricsA = {
    impressions: (beforeData || []).reduce((s, r) => s + (r.impressions || 0), 0),
    clicks: (beforeData || []).reduce((s, r) => s + (r.clicks || 0), 0),
    inquiries: (inqBefore || []).length,
    orders: (ordBefore || []).length,
    revenue: (ordBefore || []).reduce((s, r) => s + (r.amount || 0), 0),
  };

  const metricsB = {
    impressions: (afterData || []).reduce((s, r) => s + (r.impressions || 0), 0),
    clicks: (afterData || []).reduce((s, r) => s + (r.clicks || 0), 0),
    inquiries: (inqAfter || []).length,
    orders: (ordAfter || []).length,
    revenue: (ordAfter || []).reduce((s, r) => s + (r.amount || 0), 0),
  };

  await supabase
    .from('kmong_ab_tests')
    .update({
      variant_a_metrics: metricsA,
      variant_b_metrics: metricsB,
      updated_at: new Date().toISOString(),
    })
    .eq('id', testId);

  return { metricsA, metricsB };
}

/**
 * 통계적 유의성 판정 (간소화된 Z-test)
 * CTR 기준 비교
 */
function calculateSignificance(metricsA, metricsB) {
  const nA = metricsA.impressions || 1;
  const nB = metricsB.impressions || 1;
  const pA = nA > 0 ? metricsA.clicks / nA : 0;
  const pB = nB > 0 ? metricsB.clicks / nB : 0;

  if (nA < 30 || nB < 30) {
    return { significant: false, zScore: 0, pValue: 1, lift: 0, reason: '표본 부족 (최소 30 필요)' };
  }

  const pPool = (metricsA.clicks + metricsB.clicks) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));

  if (se === 0) {
    return { significant: false, zScore: 0, pValue: 1, lift: 0, reason: '표준오차 0' };
  }

  const zScore = (pB - pA) / se;
  // 근사 p-value (양측 검정)
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
  const lift = pA > 0 ? ((pB - pA) / pA * 100) : 0;

  return {
    significant: pValue < 0.05,
    zScore: parseFloat(zScore.toFixed(4)),
    pValue: parseFloat(pValue.toFixed(4)),
    lift: parseFloat(lift.toFixed(2)),
    winner: pB > pA ? 'B' : pA > pB ? 'A' : 'tie',
    reason: pValue < 0.05 ? `유의미 (p=${pValue.toFixed(4)})` : `유의미하지 않음 (p=${pValue.toFixed(4)})`,
  };
}

/** 표준 정규분포 CDF 근사 */
function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/**
 * 테스트 평가 + 승자 판정
 */
async function evaluateTest(testId) {
  const metrics = await updateTestMetrics(testId);
  if (!metrics) return null;

  const { metricsA, metricsB } = metrics;
  const significance = calculateSignificance(metricsA, metricsB);

  const { data: test } = await supabase
    .from('kmong_ab_tests')
    .select('*')
    .eq('id', testId)
    .single();

  if (!test) return null;

  // 최소 표본 크기 미달 시 아직 종료하지 않음
  const totalSample = metricsA.impressions + metricsB.impressions;
  if (totalSample < test.min_sample_size && !significance.significant) {
    console.log(`[A/B] 테스트 ${testId}: 표본 부족 (${totalSample}/${test.min_sample_size})`);
    return { testId, status: 'running', ...significance, totalSample };
  }

  // 승자 판정 후 종료
  const winner = significance.significant ? significance.winner : null;
  await supabase
    .from('kmong_ab_tests')
    .update({
      winner: winner || 'inconclusive',
      status: 'completed',
      end_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', testId);

  // optimization_log에 효과 기록
  await supabase.from('kmong_optimization_log').insert({
    product_id: test.product_id,
    action_type: 'ab_test_completed',
    action_detail: `A/B 테스트 완료: ${test.test_type} — 승자 ${winner || '없음'} (lift ${significance.lift}%)`,
    before_metrics: metricsA,
    after_metrics: metricsB,
    effect_score: significance.lift,
    ab_test_id: testId,
    status: 'measured',
    measured_at: new Date().toISOString(),
  });

  console.log(`[A/B] 테스트 ${testId} 완료: 승자=${winner || '없음'}, lift=${significance.lift}%`);
  return { testId, status: 'completed', winner, ...significance };
}

/**
 * 모든 실행 중인 테스트 평가
 */
async function evaluateAllTests() {
  const { data: tests } = await supabase
    .from('kmong_ab_tests')
    .select('id')
    .eq('status', 'running');

  if (!tests || tests.length === 0) {
    console.log('[A/B] 실행 중인 테스트 없음');
    return [];
  }

  const results = [];
  for (const test of tests) {
    const result = await evaluateTest(test.id);
    if (result) results.push(result);
  }

  return results;
}

/**
 * 테스트 목록 조회 (대시보드용)
 */
async function getTests(status) {
  let query = supabase
    .from('kmong_ab_tests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);

  const { data } = await query;
  return data || [];
}

module.exports = {
  createTest,
  updateTestMetrics,
  calculateSignificance,
  evaluateTest,
  evaluateAllTests,
  getTests,
};
