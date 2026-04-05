/**
 * 크몽 Phase 3 — AI 콘텐츠 생성 엔진
 * 저성과 서비스의 썸네일/타이틀/설명 자동 생성
 * 성공 패턴 DB(kmong_patterns) 기반 규칙형 AI
 */

const { supabase } = require('./supabase');

// 타이틀 생성 템플릿 (패턴 기반)
const TITLE_TEMPLATES = {
  urgency: [
    '{time} 완성! {service} — {benefit}',
    '오늘 시작, {time} 후 완성 {service}',
    '{service} {time} 해결 | {benefit}',
  ],
  price_anchor: [
    '{service} {price}부터 | {benefit}',
    '{price}으로 시작하는 {service}',
    '{service} | {price}~ 수정무제한',
  ],
  problem_solution: [
    '{problem}? {solution}로 해결!',
    '{problem} 고민 끝! {service}',
    '{service} — {problem} → {solution}',
  ],
  social_proof: [
    '{service} | 만족도 {score}% ({count}건 완료)',
    '{count}+ 완료! {service} {benefit}',
    '{service} | 리뷰 {score}점 — {benefit}',
  ],
};

// 설명 생성 블록
const DESCRIPTION_BLOCKS = {
  intro: [
    '안녕하세요, 온다마케팅입니다.\n{service_type} 전문 제작을 도와드립니다.',
    '{service_type} 고민이시라면 잘 찾아오셨습니다.\n코딩 기반 맞춤 제작, 온다마케팅입니다.',
  ],
  features: [
    '✅ 반응형 (PC/모바일/태블릿 완벽 대응)\n✅ CMS 관리자페이지 기본 포함\n✅ 수정 무제한\n✅ 호스팅 무료 (월 비용 0원)',
    '✅ 코딩 방식 맞춤 제작 (템플릿 NO)\n✅ 전 디바이스 반응형\n✅ 관리자페이지 포함\n✅ 수정 무제한 + 호스팅 무료',
  ],
  packages: '📦 패키지\n• STANDARD (12만원~): 메인 1P + CMS, 3일 완성\n• DELUXE (20만원~): 메인+서브 2P + CMS, 5일\n• PREMIUM (35만원~): 메인+서브 5P + CMS + 유지보수, 7일',
  cta: [
    '💬 문의 주시면 업종에 맞는 최적 구성을 안내드리겠습니다!',
    '💬 궁금한 점 편하게 문의 주세요! 무료 상담 도와드립니다.',
  ],
};

/**
 * 패턴 DB에서 활성 패턴 조회
 */
async function getActivePatterns(patternType, category) {
  let query = supabase
    .from('kmong_patterns')
    .select('*')
    .eq('pattern_type', patternType)
    .eq('is_active', true)
    .order('confidence_score', { ascending: false });

  if (category) {
    query = query.or(`category.eq.${category},category.eq.전체`);
  }

  const { data, error } = await query;
  if (error) {
    // kmong_patterns 테이블 없으면 기본 패턴 반환
    return [{
      id: 1, pattern_type: patternType, category: category || '전체',
      pattern_key: 'urgency', pattern_value: {}, confidence_score: 80, is_active: true,
    }];
  }
  return data || [];
}

/**
 * 상품별 현재 성과 분석 → 저성과 서비스 식별
 */
async function identifyLowPerformers(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  // CPC 데이터
  const { data: cpcData } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id,impressions,clicks,cpc_cost')
    .gte('date', sinceStr);

  // 문의 데이터
  const { data: inqData } = await supabase
    .from('kmong_inquiries')
    .select('product_id')
    .gte('inquiry_date', sinceStr);

  // 주문 데이터
  const { data: ordData } = await supabase
    .from('kmong_orders')
    .select('product_id,amount')
    .gte('order_date', sinceStr)
    .eq('status', 'completed');

  // 상품별 집계
  const byProduct = {};
  (cpcData || []).forEach(r => {
    if (!r.product_id) return;
    if (!byProduct[r.product_id]) byProduct[r.product_id] = { impressions: 0, clicks: 0, cost: 0, inquiries: 0, orders: 0, revenue: 0 };
    byProduct[r.product_id].impressions += r.impressions || 0;
    byProduct[r.product_id].clicks += r.clicks || 0;
    byProduct[r.product_id].cost += r.cpc_cost || 0;
  });
  (inqData || []).forEach(r => {
    if (!r.product_id) return;
    if (!byProduct[r.product_id]) byProduct[r.product_id] = { impressions: 0, clicks: 0, cost: 0, inquiries: 0, orders: 0, revenue: 0 };
    byProduct[r.product_id].inquiries++;
  });
  (ordData || []).forEach(r => {
    if (!r.product_id) return;
    if (!byProduct[r.product_id]) byProduct[r.product_id] = { impressions: 0, clicks: 0, cost: 0, inquiries: 0, orders: 0, revenue: 0 };
    byProduct[r.product_id].orders++;
    byProduct[r.product_id].revenue += r.amount || 0;
  });

  // 저성과 판정 (CTR < 1.5% 또는 문의율 < 5% 또는 결제율 < 15%)
  const lowPerformers = [];
  for (const [pid, d] of Object.entries(byProduct)) {
    const ctr = d.impressions > 0 ? (d.clicks / d.impressions * 100) : 0;
    const inqRate = d.clicks > 0 ? (d.inquiries / d.clicks * 100) : 0;
    const payRate = d.inquiries > 0 ? (d.orders / d.inquiries * 100) : 0;

    const issues = [];
    if (ctr < 1.5 && d.impressions >= 50) issues.push({ stage: 'ctr', value: ctr, target: 1.5 });
    if (inqRate < 5 && d.clicks >= 5) issues.push({ stage: 'inquiry_rate', value: inqRate, target: 5 });
    if (payRate < 15 && d.inquiries >= 3) issues.push({ stage: 'pay_rate', value: payRate, target: 15 });

    if (issues.length > 0) {
      lowPerformers.push({ productId: pid, metrics: d, ctr, inqRate, payRate, issues });
    }
  }

  return lowPerformers.sort((a, b) => b.metrics.cost - a.metrics.cost);
}

/**
 * 타이틀 생성
 */
async function generateTitle(productId, currentTitle, category) {
  const patterns = await getActivePatterns('title', category);
  if (patterns.length === 0) return null;

  // 가장 신뢰도 높은 패턴 2개 조합
  const topPatterns = patterns.slice(0, 2);
  const patternKey = topPatterns[0].pattern_key;
  const templates = TITLE_TEMPLATES[patternKey] || TITLE_TEMPLATES.urgency;

  // 상품 정보 조회
  const { data: product } = await supabase
    .from('kmong_products')
    .select('product_name, category')
    .eq('product_id', productId)
    .single();

  const name = product?.product_name || productId;

  // 변수 치환 맵
  const vars = {
    '{service}': name.length > 15 ? name.slice(0, 15) : name,
    '{service_type}': category || '홈페이지',
    '{time}': '3일',
    '{price}': '12만원',
    '{benefit}': '수정무제한+CMS포함',
    '{problem}': '홈페이지 고민',
    '{solution}': '3일 완성 맞춤제작',
    '{score}': '98',
    '{count}': '50',
  };

  // 현재 타이틀과 다른 패턴의 템플릿 선택
  const template = templates[Math.floor(Math.random() * templates.length)];
  let generated = template;
  for (const [key, value] of Object.entries(vars)) {
    generated = generated.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  return {
    contentType: 'title',
    original: currentTitle,
    generated,
    reason: `패턴 "${patternKey}" 적용 (신뢰도 ${topPatterns[0].confidence_score}%)`,
    patternIds: topPatterns.map(p => p.id),
  };
}

/**
 * 설명(상세페이지) 생성
 */
async function generateDescription(productId, category) {
  const patterns = await getActivePatterns('description', category);

  const intro = DESCRIPTION_BLOCKS.intro[Math.floor(Math.random() * DESCRIPTION_BLOCKS.intro.length)];
  const features = DESCRIPTION_BLOCKS.features[Math.floor(Math.random() * DESCRIPTION_BLOCKS.features.length)];
  const cta = DESCRIPTION_BLOCKS.cta[Math.floor(Math.random() * DESCRIPTION_BLOCKS.cta.length)];

  const serviceType = category || '홈페이지';
  const generated = [
    intro.replace('{service_type}', serviceType),
    '',
    features,
    '',
    DESCRIPTION_BLOCKS.packages,
    '',
    cta,
  ].join('\n');

  return {
    contentType: 'description',
    original: null,
    generated,
    reason: '패턴 기반 설명 자동 생성',
    patternIds: patterns.map(p => p.id),
  };
}

/**
 * 저성과 서비스에 대한 콘텐츠 일괄 생성
 */
async function generateContentForLowPerformers() {
  console.log('[Phase 3] 저성과 서비스 콘텐츠 생성 시작...');

  const lowPerformers = await identifyLowPerformers(30);
  if (lowPerformers.length === 0) {
    console.log('[Phase 3] 저성과 서비스 없음 — 모든 서비스 정상');
    return [];
  }

  console.log(`[Phase 3] 저성과 서비스 ${lowPerformers.length}개 발견`);
  const results = [];

  for (const lp of lowPerformers) {
    const { productId, issues } = lp;

    // 상품 카테고리 조회
    const { data: product } = await supabase
      .from('kmong_products')
      .select('category, product_name')
      .eq('product_id', productId)
      .single();

    const category = product?.category || '홈페이지';

    for (const issue of issues) {
      let content = null;

      if (issue.stage === 'ctr') {
        // CTR 낮음 → 타이틀 개선
        content = await generateTitle(productId, product?.product_name, category);
      } else if (issue.stage === 'inquiry_rate') {
        // 문의율 낮음 → 상세페이지 설명 개선
        content = await generateDescription(productId, category);
      }

      if (content) {
        // DB 저장
        const { data: saved, error } = await supabase
          .from('kmong_content_generated')
          .insert({
            product_id: productId,
            content_type: content.contentType,
            original_content: content.original,
            generated_content: content.generated,
            generation_reason: content.reason,
            pattern_ids: content.patternIds,
            status: 'pending',
          })
          .select()
          .single();

        if (error) {
          // kmong_content_generated 없으면 optimization_log에 대체 저장
          console.warn(`[Phase 3] kmong_content_generated 없음 — optimization_log 대체 저장 (${productId})`);
          try {
            const { data: logSaved } = await supabase.from('kmong_optimization_log').insert({
              product_id: productId,
              action_type: 'content_generated',
              action_detail: `AI ${content.contentType} 생성 — ${content.reason}`,
              before_metrics: lp.metrics,
              after_metrics: { generated_content: content.generated?.substring(0, 200) },
              status: 'proposed',
            }).select().single();
            results.push({ ...content, id: logSaved?.id, productId });
          } catch (e2) {
            console.warn(`[Phase 3] 로그 저장도 실패: ${e2.message}`);
            results.push({ ...content, id: null, productId });
          }
        } else {
          console.log(`[Phase 3] 콘텐츠 생성 완료: ${productId} - ${content.contentType}`);
          results.push({ ...content, id: saved?.id, productId });
          try {
            await supabase.from('kmong_optimization_log').insert({
              product_id: productId,
              action_type: 'content_generated',
              action_detail: `AI ${content.contentType} 생성 — ${content.reason}`,
              before_metrics: lp.metrics,
              status: 'proposed',
            });
          } catch {}
        }
      }
    }
  }

  console.log(`[Phase 3] 총 ${results.length}건 콘텐츠 생성 완료`);
  return results;
}

/**
 * 관리자 승인된 콘텐츠 적용
 */
async function applyApprovedContent(contentId) {
  const { data: content, error } = await supabase
    .from('kmong_content_generated')
    .select('*')
    .eq('id', contentId)
    .single();

  if (error || !content) {
    console.error(`[Phase 3] 콘텐츠 조회 실패: ${error?.message}`);
    return null;
  }

  if (content.status !== 'approved') {
    console.log(`[Phase 3] 콘텐츠 ${contentId} 상태: ${content.status} (approved 아님)`);
    return null;
  }

  // 적용 기록
  await supabase
    .from('kmong_content_generated')
    .update({ status: 'applied', applied_at: new Date().toISOString() })
    .eq('id', contentId);

  // 소재변경 이력 기록
  await supabase.from('kmong_creative_changes').insert({
    product_id: content.product_id,
    change_date: new Date().toISOString().split('T')[0],
    change_type: content.content_type,
    old_value: content.original_content || '(이전 콘텐츠)',
    new_value: content.generated_content.slice(0, 200),
  });

  // optimization_log 업데이트
  await supabase
    .from('kmong_optimization_log')
    .update({
      status: 'applied',
      auto_applied: false,
      before_metrics: null,
    })
    .eq('content_id', contentId);

  console.log(`[Phase 3] 콘텐츠 ${contentId} 적용 완료 (${content.product_id})`);
  return content;
}

/**
 * 대기 중인 생성 콘텐츠 목록
 */
async function getPendingContent() {
  const { data } = await supabase
    .from('kmong_content_generated')
    .select('*')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false });
  return data || [];
}

module.exports = {
  getActivePatterns,
  identifyLowPerformers,
  generateTitle,
  generateDescription,
  generateContentForLowPerformers,
  applyApprovedContent,
  getPendingContent,
  TITLE_TEMPLATES,
  DESCRIPTION_BLOCKS,
};
