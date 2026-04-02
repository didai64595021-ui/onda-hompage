/**
 * 크몽 Phase 4 — 학습 루프 시스템
 * A/B 테스트 결과 → 성공 패턴 DB 반영 → 콘텐츠 생성 로직 자동 개선
 */

const { supabase } = require('./supabase');
const { notify } = require('./telegram');

/**
 * 완료된 A/B 테스트 결과를 패턴 DB에 반영
 */
async function learnFromAbTests() {
  console.log('[Phase 4] A/B 테스트 학습 시작...');

  // 아직 학습 반영되지 않은 완료 테스트 조회
  const { data: tests } = await supabase
    .from('kmong_ab_tests')
    .select('*')
    .eq('status', 'completed')
    .not('winner', 'is', null)
    .neq('winner', 'inconclusive')
    .order('end_date', { ascending: false })
    .limit(20);

  if (!tests || tests.length === 0) {
    console.log('[Phase 4] 학습할 A/B 테스트 없음');
    return [];
  }

  const learnings = [];

  for (const test of tests) {
    const winnerMetrics = test.winner === 'B' ? test.variant_b_metrics : test.variant_a_metrics;
    const loserMetrics = test.winner === 'B' ? test.variant_a_metrics : test.variant_b_metrics;
    const winnerContent = test.winner === 'B' ? test.variant_b : test.variant_a;

    // CTR lift 계산
    const winnerCtr = winnerMetrics.impressions > 0 ? (winnerMetrics.clicks / winnerMetrics.impressions * 100) : 0;
    const loserCtr = loserMetrics.impressions > 0 ? (loserMetrics.clicks / loserMetrics.impressions * 100) : 0;
    const ctrLift = loserCtr > 0 ? ((winnerCtr - loserCtr) / loserCtr * 100) : 0;

    // 전환율 lift 계산
    const winnerConv = winnerMetrics.clicks > 0 ? (winnerMetrics.orders / winnerMetrics.clicks * 100) : 0;
    const loserConv = loserMetrics.clicks > 0 ? (loserMetrics.orders / loserMetrics.clicks * 100) : 0;
    const convLift = loserConv > 0 ? ((winnerConv - loserConv) / loserConv * 100) : 0;

    // 승리 콘텐츠에서 패턴 추출
    const extractedPattern = extractPattern(test.test_type, winnerContent);
    if (extractedPattern) {
      // 기존 패턴 업데이트 또는 새 패턴 생성
      const { data: existing } = await supabase
        .from('kmong_patterns')
        .select('*')
        .eq('pattern_type', test.test_type)
        .eq('pattern_key', extractedPattern.key)
        .limit(1);

      if (existing && existing.length > 0) {
        // 기존 패턴 강화
        const pattern = existing[0];
        const newSuccessCount = pattern.success_count + 1;
        const newConfidence = Math.min(
          95,
          pattern.confidence_score + Math.max(5, ctrLift / 2)
        );

        await supabase
          .from('kmong_patterns')
          .update({
            success_count: newSuccessCount,
            confidence_score: parseFloat(newConfidence.toFixed(2)),
            pattern_value: {
              ...pattern.pattern_value,
              avg_lift: parseFloat(((pattern.pattern_value.avg_lift * pattern.success_count + ctrLift) / newSuccessCount).toFixed(2)),
              last_test_id: test.id,
            },
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', pattern.id);

        learnings.push({
          action: 'pattern_strengthened',
          patternKey: extractedPattern.key,
          oldConfidence: pattern.confidence_score,
          newConfidence,
          ctrLift,
        });

        console.log(`[Phase 4] 패턴 강화: ${extractedPattern.key} (${pattern.confidence_score} → ${newConfidence.toFixed(2)})`);
      } else {
        // 새 패턴 생성
        const { data: product } = await supabase
          .from('kmong_products')
          .select('category')
          .eq('product_id', test.product_id)
          .single();

        await supabase.from('kmong_patterns').insert({
          pattern_type: test.test_type,
          category: product?.category || '홈페이지',
          product_id: test.product_id,
          pattern_key: extractedPattern.key,
          pattern_value: {
            ...extractedPattern.value,
            avg_lift: parseFloat(ctrLift.toFixed(2)),
            source: 'ab_test',
            test_id: test.id,
          },
          success_count: 1,
          confidence_score: Math.min(60, 30 + ctrLift / 2),
          last_validated_at: new Date().toISOString(),
        });

        learnings.push({
          action: 'pattern_created',
          patternKey: extractedPattern.key,
          confidence: Math.min(60, 30 + ctrLift / 2),
          ctrLift,
        });

        console.log(`[Phase 4] 새 패턴 생성: ${extractedPattern.key} (CTR lift ${ctrLift.toFixed(1)}%)`);
      }
    }

    // 패배 콘텐츠의 패턴 약화
    const loserContent = test.winner === 'B' ? test.variant_a : test.variant_b;
    const loserPattern = extractPattern(test.test_type, loserContent);
    if (loserPattern) {
      const { data: loserExisting } = await supabase
        .from('kmong_patterns')
        .select('*')
        .eq('pattern_type', test.test_type)
        .eq('pattern_key', loserPattern.key)
        .limit(1);

      if (loserExisting && loserExisting.length > 0) {
        const lp = loserExisting[0];
        const newFailureCount = lp.failure_count + 1;
        const newConfidence = Math.max(0, lp.confidence_score - 10);

        await supabase
          .from('kmong_patterns')
          .update({
            failure_count: newFailureCount,
            confidence_score: parseFloat(newConfidence.toFixed(2)),
            is_active: newConfidence > 10,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lp.id);

        learnings.push({
          action: 'pattern_weakened',
          patternKey: loserPattern.key,
          oldConfidence: lp.confidence_score,
          newConfidence,
        });
      }
    }
  }

  console.log(`[Phase 4] ${learnings.length}건 학습 완료`);
  return learnings;
}

/**
 * 콘텐츠에서 패턴 추출
 */
function extractPattern(testType, content) {
  if (!content || !content.content) return null;
  const text = content.content.toLowerCase();

  if (testType === 'title') {
    // 긴급성 키워드
    if (/\d+일|24시간|48시간|즉시|빠른/.test(text)) {
      return { key: 'urgency_keyword', value: { keywords: text.match(/\d+일|24시간|48시간|즉시|빠른/g) || [] } };
    }
    // 가격 앵커
    if (/\d+만원|원부터|저렴|할인/.test(text)) {
      return { key: 'price_anchor', value: { keywords: text.match(/\d+만원|원부터|저렴|할인/g) || [] } };
    }
    // 문제-해결
    if (/깨짐|해결|고민|고민끝/.test(text)) {
      return { key: 'problem_solution', value: { keywords: text.match(/깨짐|해결|고민/g) || [] } };
    }
    // 소셜 프루프
    if (/만족도|리뷰|건 완료|★/.test(text)) {
      return { key: 'social_proof', value: { keywords: text.match(/만족도|리뷰|건 완료/g) || [] } };
    }
  }

  if (testType === 'description') {
    if (/포트폴리오|사례|완료 건/.test(text)) {
      return { key: 'social_proof', value: { elements: ['포트폴리오', '사례'] } };
    }
    if (/무료|호스팅 무료|수정 무제한/.test(text)) {
      return { key: 'value_proposition', value: { elements: ['무료', '무제한'] } };
    }
  }

  return null;
}

/**
 * 답변 템플릿 학습 (reply-optimizer와 연동)
 * 전환율 기반으로 패턴 DB 자동 업데이트
 */
async function learnFromReplyStats() {
  console.log('[Phase 4] 답변 템플릿 학습 시작...');

  const { data: templates } = await supabase
    .from('kmong_reply_templates')
    .select('*')
    .eq('is_active', true)
    .gt('total_sent', 2)
    .order('conversion_rate', { ascending: false });

  if (!templates || templates.length < 2) {
    console.log('[Phase 4] 학습할 템플릿 데이터 부족');
    return;
  }

  const best = templates[0];
  const avg = templates.reduce((s, t) => s + t.conversion_rate, 0) / templates.length;

  // 평균보다 높은 템플릿의 특성을 패턴으로 저장
  for (const tpl of templates) {
    if (tpl.conversion_rate > avg && tpl.total_sent >= 3) {
      const patternKey = tpl.template_type === 'first_contact' ?
        (tpl.template_text.includes('포트폴리오') ? 'portfolio_first' :
         tpl.template_text.includes('가격') ? 'price_transparency' : 'question_first') :
        `${tpl.template_type}_high_performer`;

      const { data: existing } = await supabase
        .from('kmong_patterns')
        .select('id, success_count, confidence_score')
        .eq('pattern_type', 'reply')
        .eq('pattern_key', patternKey)
        .limit(1);

      if (existing && existing.length > 0) {
        const newConfidence = Math.min(95, existing[0].confidence_score + 3);
        await supabase
          .from('kmong_patterns')
          .update({
            success_count: existing[0].success_count + 1,
            confidence_score: parseFloat(newConfidence.toFixed(2)),
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing[0].id);
      }
    }
  }

  console.log(`[Phase 4] 답변 학습 완료 — 최고 전환율 ${best.conversion_rate}% (${best.template_name})`);
}

/**
 * 저신뢰 패턴 정리 (비활성화)
 */
async function pruneWeakPatterns() {
  const { data: weak } = await supabase
    .from('kmong_patterns')
    .select('id, pattern_key, confidence_score')
    .eq('is_active', true)
    .lt('confidence_score', 10)
    .gt('failure_count', 3);

  if (!weak || weak.length === 0) return 0;

  for (const p of weak) {
    await supabase
      .from('kmong_patterns')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    console.log(`[Phase 4] 패턴 비활성화: ${p.pattern_key} (신뢰도 ${p.confidence_score})`);
  }

  return weak.length;
}

/**
 * 전체 학습 루프 실행 (일간/주간 크론에서 호출)
 */
async function runFullLearningLoop() {
  console.log('=== Phase 4 전체 학습 루프 시작 ===');

  try {
    // 1. A/B 테스트 결과 학습
    const abLearnings = await learnFromAbTests();

    // 2. 답변 템플릿 학습
    await learnFromReplyStats();

    // 3. 저신뢰 패턴 정리
    const pruned = await pruneWeakPatterns();

    // 4. 학습 리포트 생성
    const { data: activePatterns } = await supabase
      .from('kmong_patterns')
      .select('pattern_type, pattern_key, confidence_score')
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })
      .limit(10);

    const report = [
      '크몽 Phase 4 학습 루프 완료',
      '',
      `A/B 테스트 학습: ${abLearnings.length}건`,
      `저신뢰 패턴 정리: ${pruned}건`,
      '',
      '활성 패턴 TOP 5:',
      ...(activePatterns || []).slice(0, 5).map((p, i) =>
        `${i + 1}. [${p.pattern_type}] ${p.pattern_key} (${p.confidence_score}%)`
      ),
    ].join('\n');

    console.log(report);
    notify(report);

    return { abLearnings, pruned, activePatterns };
  } catch (err) {
    console.error(`[Phase 4] 학습 루프 에러: ${err.message}`);
    notify(`Phase 4 학습 루프 에러: ${err.message}`);
    return null;
  }
}

module.exports = {
  learnFromAbTests,
  learnFromReplyStats,
  pruneWeakPatterns,
  runFullLearningLoop,
  extractPattern,
};
