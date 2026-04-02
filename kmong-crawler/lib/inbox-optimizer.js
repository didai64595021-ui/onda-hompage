/**
 * 크몽 Phase 3-4 — 인박스 AI 최적화
 * 1. 문의 메시지 분류 + 우선순위 결정
 * 2. AI 최적 답변 제안
 * 3. 고객 감정 분석 + 의도 파악
 */

const { supabase } = require('./supabase');
const { analyzeInquiry, selectBestTemplate, renderTemplate } = require('./reply-generator');

// 우선순위 규칙
const PRIORITY_RULES = [
  { keywords: ['급합니다', '급해요', '오늘', '내일', '바로', '당장'], priority: 'urgent', score: 90 },
  { keywords: ['결제', '주문', '구매', '진행'], priority: 'high', score: 80 },
  { keywords: ['견적', '가격', '비용', '얼마'], priority: 'high', score: 75 },
  { keywords: ['수정', '변경', '추가', '리뉴얼'], priority: 'normal', score: 60 },
  { keywords: ['문의', '상담', '궁금', '질문'], priority: 'normal', score: 50 },
  { keywords: ['감사', '고맙', '리뷰'], priority: 'low', score: 30 },
];

// 감정 분석 키워드
const SENTIMENT_RULES = [
  { keywords: ['감사', '좋아요', '만족', '완벽', '최고', '대박'], sentiment: 'positive' },
  { keywords: ['불만', '화가', '실망', '별로', '나쁘', '최악', '환불'], sentiment: 'negative' },
  { keywords: ['급합니다', '빨리', '걱정', '불안'], sentiment: 'anxious' },
];

// 의도 분류 규칙
const INTENT_RULES = [
  { keywords: ['홈페이지', '만들', '제작', '개설', '사이트'], intent: 'new_order' },
  { keywords: ['리뉴얼', '개편', '바꾸', '새로'], intent: 'renewal' },
  { keywords: ['수정', '변경', '추가', '업데이트'], intent: 'modification' },
  { keywords: ['견적', '가격', '비용'], intent: 'pricing' },
  { keywords: ['유지보수', '관리', '월 비용'], intent: 'maintenance' },
  { keywords: ['결제', '주문', '진행', '시작'], intent: 'ready_to_buy' },
  { keywords: ['반응형', '모바일', '깨짐'], intent: 'responsive' },
  { keywords: ['SEO', '검색', '상위노출'], intent: 'seo' },
  { keywords: ['문의', '궁금', '질문', '상담'], intent: 'general_inquiry' },
];

/**
 * 메시지 분류 (우선순위 + 감정 + 의도)
 */
function classifyMessage(messageContent) {
  if (!messageContent) {
    return { priority: 'normal', urgencyScore: 50, sentiment: 'neutral', intent: 'general_inquiry' };
  }

  const text = messageContent.toLowerCase();

  // 우선순위 판정
  let priority = 'normal';
  let urgencyScore = 50;
  for (const rule of PRIORITY_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        if (rule.score > urgencyScore) {
          priority = rule.priority;
          urgencyScore = rule.score;
        }
        break;
      }
    }
  }

  // 감정 분석
  let sentiment = 'neutral';
  for (const rule of SENTIMENT_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        sentiment = rule.sentiment;
        break;
      }
    }
    if (sentiment !== 'neutral') break;
  }

  // 의도 분류
  let intent = 'general_inquiry';
  for (const rule of INTENT_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        intent = rule.intent;
        break;
      }
    }
    if (intent !== 'general_inquiry') break;
  }

  return { priority, urgencyScore, sentiment, intent };
}

/**
 * AI 최적 답변 생성
 * 기존 reply-generator + 패턴 DB + 분류 결과 종합
 */
async function generateOptimalReply(inquiryId) {
  // 문의 조회
  const { data: inquiry } = await supabase
    .from('kmong_inquiries')
    .select('*')
    .eq('id', inquiryId)
    .single();

  if (!inquiry) return null;

  const messageContent = inquiry.message_content || inquiry.notes || '';

  // 1. 메시지 분류
  const classification = classifyMessage(messageContent);

  // 2. 기존 답변 분석 엔진 사용
  const { answer, serviceType, detectedKeywords } = analyzeInquiry(messageContent);

  // 3. 최고 전환율 템플릿 선택
  const template = await selectBestTemplate('first_contact', serviceType === '홈페이지 제작' ? '신규제작' : null);

  // 4. 성공 패턴 조회
  const { data: patterns } = await supabase
    .from('kmong_patterns')
    .select('*')
    .eq('pattern_type', 'reply')
    .eq('is_active', true)
    .order('confidence_score', { ascending: false })
    .limit(3);

  // 5. 답변 생성
  let suggestedReply = '';
  let confidence = 50;

  if (template) {
    suggestedReply = renderTemplate(template, {
      '{inquiry_topic}': serviceType,
      '{answer_to_question}': answer,
    });
    confidence = Math.min(95, 50 + (template.conversion_rate || 0));
  } else {
    suggestedReply = `안녕하세요! ${serviceType} 문의 감사합니다.\n\n${answer}\n\n자세한 내용 말씀해주시면 맞춤 견적 안내드리겠습니다!`;
    confidence = 40;
  }

  // 감정에 따른 톤 조정
  if (classification.sentiment === 'anxious') {
    suggestedReply = '안녕하세요! 빠르게 도와드리겠습니다 :)\n\n' + suggestedReply.replace(/^안녕하세요.*?\n/m, '');
    confidence += 5;
  } else if (classification.sentiment === 'negative') {
    suggestedReply = '안녕하세요! 불편을 드려 죄송합니다.\n말씀해주신 부분 확인 후 빠르게 처리해드리겠습니다.\n\n' + suggestedReply.replace(/^안녕하세요.*?\n/m, '');
    confidence += 5;
  }

  // 구매 의도 높은 경우 견적 정보 추가
  if (classification.intent === 'ready_to_buy' || classification.intent === 'pricing') {
    if (!suggestedReply.includes('패키지')) {
      suggestedReply += '\n\n참고로 저희 패키지 가격대입니다:\n• 원페이지: 12만원~ (CMS포함, 3일)\n• 메인+서브 2P: 20만원~ (5일)\n• 메인+서브 5P: 35만원~ (유지보수 1개월, 7일)\n전 패키지 수정 무제한입니다.';
    }
    confidence += 10;
  }

  confidence = Math.min(95, confidence);

  // 6. DB에 분류 결과 저장
  await supabase
    .from('kmong_inquiries')
    .update({
      priority: classification.priority,
      sentiment: classification.sentiment,
      ai_suggested_reply: suggestedReply,
      reply_confidence: confidence,
    })
    .eq('id', inquiryId);

  // 분류 이력 저장
  await supabase.from('kmong_inbox_classification').insert({
    inquiry_id: inquiryId,
    priority: classification.priority,
    category: serviceType,
    sentiment: classification.sentiment,
    intent: classification.intent,
    urgency_score: classification.urgencyScore,
    suggested_reply: suggestedReply,
    suggested_template_id: template?.id,
    reply_confidence: confidence,
  });

  return {
    inquiryId,
    classification,
    serviceType,
    detectedKeywords,
    suggestedReply,
    confidence,
    templateUsed: template?.template_name,
  };
}

/**
 * 미분류 문의 일괄 분류 + 답변 생성
 */
async function classifyAndSuggestAll() {
  console.log('[Inbox AI] 미분류 문의 일괄 처리 시작...');

  // priority가 null이거나 ai_suggested_reply가 없는 문의
  const { data: unclassified } = await supabase
    .from('kmong_inquiries')
    .select('id, message_content, notes')
    .or('priority.is.null,ai_suggested_reply.is.null')
    .order('inquiry_date', { ascending: false })
    .limit(20);

  if (!unclassified || unclassified.length === 0) {
    console.log('[Inbox AI] 미분류 문의 없음');
    return [];
  }

  console.log(`[Inbox AI] ${unclassified.length}건 처리 중...`);
  const results = [];

  for (const inquiry of unclassified) {
    const result = await generateOptimalReply(inquiry.id);
    if (result) results.push(result);
  }

  console.log(`[Inbox AI] ${results.length}건 분류+답변 생성 완료`);
  return results;
}

/**
 * 인박스 통계 (대시보드용)
 */
async function getInboxStats(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const { data: inquiries } = await supabase
    .from('kmong_inquiries')
    .select('priority, sentiment, status, ai_suggested_reply')
    .gte('inquiry_date', sinceStr);

  const rows = inquiries || [];
  const total = rows.length;
  const byPriority = { urgent: 0, high: 0, normal: 0, low: 0 };
  const bySentiment = { positive: 0, neutral: 0, negative: 0, anxious: 0 };
  const byStatus = { pending: 0, quoted: 0, paid: 0, cancelled: 0 };
  let aiSuggested = 0;

  rows.forEach(r => {
    if (r.priority) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
    if (r.sentiment) bySentiment[r.sentiment] = (bySentiment[r.sentiment] || 0) + 1;
    if (r.status) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.ai_suggested_reply) aiSuggested++;
  });

  return { total, byPriority, bySentiment, byStatus, aiSuggested, aiCoverage: total > 0 ? (aiSuggested / total * 100) : 0 };
}

module.exports = {
  classifyMessage,
  generateOptimalReply,
  classifyAndSuggestAll,
  getInboxStats,
  PRIORITY_RULES,
  SENTIMENT_RULES,
  INTENT_RULES,
};
