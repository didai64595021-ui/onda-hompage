/**
 * 크몽 Phase 2 — 답변 생성 로직 모듈
 * 문의 내용 분석 → 키워드 추출 → 서비스 유형 판단 → 답변 템플릿 선택 → 답변 생성
 */

const { supabase } = require('./supabase');

// 문의 키워드 → 답변 매핑
const ANSWER_MAP = [
  { keywords: ['견적', '가격', '비용', '얼마'], answer: '가격은 구성에 따라 12만~35만원 범위입니다 :)' },
  { keywords: ['기간', '얼마나 걸', '며칠', '일정'], answer: '구성에 따라 3~7일 내 완성해드립니다 :)' },
  { keywords: ['수정', '변경', '바꿀'], answer: '전 상품 수정 무제한입니다 :)' },
  { keywords: ['모바일', '반응형', '핸드폰'], answer: '모바일/PC 동시 대응 반응형으로 제작합니다 :)' },
  { keywords: ['도메인', 'domain'], answer: '도메인 구매부터 셋팅까지 전부 해드립니다 :)' },
  { keywords: ['CMS', 'cms', '직접 수정', '관리'], answer: '전 상품 CMS 기본 포함이라 코딩 없이 직접 수정 가능합니다 :)' },
  { keywords: ['기획', '디자인', '시안'], answer: '업종에 맞는 구성으로 저희가 기획부터 해드립니다 :)' },
  { keywords: ['파워링크', '광고', '랜딩'], answer: '파워링크 랜딩페이지로 전환율 높게 구성해드립니다 :)' },
  { keywords: ['견적문의', '팝업', '문의 버튼'], answer: '견적문의 버튼+팝업 기본 포함이라 추가비용 없습니다 :)' },
  { keywords: ['카페24', '아임웹', '워드프레스'], answer: '카페24/아임웹은 템플릿 기반이라 디자인 자유도가 낮고, 월 호스팅비도 별도로 나갑니다. 저희는 코딩 방식으로 제작하기 때문에 호스팅 무료에 디자인 제한 없이 원하시는 대로 구현 가능합니다. 관리자페이지(CMS)도 제공드려서 직접 수정도 가능하구요 :)' },
  { keywords: ['홈페이지', '만들', '제작', '개설'], answer: '홈페이지 제작 문의 감사합니다 :)' },
  { keywords: ['리뉴얼', '개편', '새로'], answer: '홈페이지 리뉴얼 문의 감사합니다 :)' },
];

// 서비스 유형 감지
const SERVICE_DETECTION = [
  { keywords: ['리뉴얼', '개편', '새로 만', '바꾸고'], type: '리뉴얼' },
  { keywords: ['반응형', '모바일 깨', '모바일 안'], type: '반응형 전환' },
  { keywords: ['SEO', 'seo', '검색', '상위노출'], type: 'SEO' },
  { keywords: ['유지보수', '관리'], type: '유지보수' },
  { keywords: ['홈페이지', '만들', '제작', '개설', '사이트'], type: '홈페이지 제작' },
];

// 견적 규칙
const PACKAGES = {
  STANDARD: { name: 'STANDARD', price: 120000, desc: '메인 1P + CMS', days: 3 },
  DELUXE: { name: 'DELUXE', price: 200000, desc: '메인+서브 2P + CMS', days: 5 },
  PREMIUM: { name: 'PREMIUM', price: 350000, desc: '메인+서브 5P + CMS + 유지보수 1개월', days: 7 },
};

const OPTIONS = [
  { keywords: ['서브페이지', '서브 페이지', '추가 페이지'], name: '서브페이지 추가', price: 20000 },
  { keywords: ['카카오', '카톡', '채널'], name: '카카오톡 채널 연동', price: 30000 },
  { keywords: ['네이버 예약', '예약 버튼'], name: '네이버 예약 버튼', price: 30000 },
  { keywords: ['배너', '공지', '이벤트'], name: '상단 공지/이벤트 배너', price: 30000 },
  { keywords: ['QR', 'qr', '큐알'], name: 'QR 코드 제작', price: 30000 },
  { keywords: ['인스타', 'instagram', '피드'], name: '인스타그램 피드 연동', price: 50000 },
  { keywords: ['CMS', 'cms', '관리 기능'], name: 'CMS 관리 기능', price: 50000 },
  { keywords: ['SEO', 'seo', '검색 최적화', '심화'], name: 'SEO 심화 등록', price: 50000 },
];

/**
 * 문의 내용에서 키워드 추출 및 자동 답변 생성 (강화 버전)
 * - 여러 질문이 있으면 각각 답변
 * - 서비스 유형을 더 정밀하게 감지
 * @param {string} messageContent - 고객 문의 내용
 * @returns {object} { answer, answers, serviceType, detectedKeywords, questionCount }
 */
function analyzeInquiry(messageContent) {
  if (!messageContent) {
    return {
      answer: '홈페이지 제작 문의 감사합니다 :)',
      answers: [],
      serviceType: '홈페이지 제작',
      detectedKeywords: [],
      questionCount: 0,
    };
  }

  const text = messageContent.toLowerCase();
  const detectedKeywords = [];
  const answers = [];

  // 모든 매칭되는 답변 수집 (여러 질문 대응)
  for (const entry of ANSWER_MAP) {
    for (const kw of entry.keywords) {
      if (text.includes(kw.toLowerCase())) {
        detectedKeywords.push(kw);
        // 중복 답변 방지
        if (!answers.find(a => a.text === entry.answer)) {
          answers.push({ keyword: kw, text: entry.answer });
        }
        break;
      }
    }
  }

  // 여러 답변을 하나로 조합
  let answer;
  if (answers.length === 0) {
    answer = '홈페이지 제작 문의 감사합니다 :)';
  } else if (answers.length === 1) {
    answer = answers[0].text;
  } else {
    // 여러 질문에 각각 답변
    answer = answers.map((a, i) => `${i + 1}. ${a.text}`).join('\n');
  }

  // 서비스 유형 판단 (점수 기반 정밀 감지)
  let serviceType = '홈페이지 제작';
  let bestScore = 0;

  for (const sd of SERVICE_DETECTION) {
    let score = 0;
    for (const kw of sd.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      serviceType = sd.type;
    }
  }

  // 문장 수 / 질문 수 감지 (물음표 기준)
  const questionCount = (messageContent.match(/\?|요\?|까요|나요|는지|할까|하나요/g) || []).length;

  return { answer, answers, serviceType, detectedKeywords, questionCount };
}

/**
 * 해당 서비스의 최근 거래 데이터 조회 (견적 범위 제시용)
 * @param {string} productId - product_id
 * @returns {object} { avgAmount, orderCount, minAmount, maxAmount }
 */
async function getServiceStats(productId) {
  try {
    const { data: orders } = await supabase
      .from('kmong_orders')
      .select('amount')
      .eq('product_id', productId)
      .eq('status', 'completed')
      .order('order_date', { ascending: false })
      .limit(20);

    if (!orders || orders.length === 0) return null;

    const amounts = orders.map(o => o.amount).filter(Boolean);
    if (amounts.length === 0) return null;

    return {
      avgAmount: Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length),
      orderCount: amounts.length,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
    };
  } catch {
    return null;
  }
}

/**
 * 응답 품질 점수 산정 (0-100)
 * @param {object} analysis - analyzeInquiry 결과
 * @param {string} replyText - 생성된 답변 텍스트
 * @returns {object} { score, reasons }
 */
function calculateReplyQuality(analysis, replyText) {
  let score = 50; // 기본점수
  const reasons = [];

  // 키워드 매칭률
  if (analysis.detectedKeywords.length >= 3) {
    score += 20;
    reasons.push('키워드 3개+ 매칭');
  } else if (analysis.detectedKeywords.length >= 1) {
    score += 10;
    reasons.push(`키워드 ${analysis.detectedKeywords.length}개 매칭`);
  } else {
    score -= 15;
    reasons.push('키워드 매칭 없음');
  }

  // 서비스 정확도 (기본 '홈페이지 제작'이 아닌 구체적 서비스 감지)
  if (analysis.serviceType !== '홈페이지 제작') {
    score += 15;
    reasons.push(`서비스 감지: ${analysis.serviceType}`);
  }

  // 여러 질문 대응
  if (analysis.questionCount > 1 && analysis.answers.length > 1) {
    score += 10;
    reasons.push('복수 질문 대응');
  } else if (analysis.questionCount > 1 && analysis.answers.length <= 1) {
    score -= 10;
    reasons.push('복수 질문이나 단일 답변');
  }

  // 답변 길이 적정성
  if (replyText && replyText.length > 50 && replyText.length < 500) {
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

/**
 * 전환율 높은 템플릿 선택
 * @param {string} templateType - first_contact, quote, followup, delivery
 * @param {string} serviceCategory - 서비스 카테고리
 */
async function selectBestTemplate(templateType = 'first_contact', serviceCategory = null) {
  let query = supabase
    .from('kmong_reply_templates')
    .select('*')
    .eq('template_type', templateType)
    .eq('is_active', true)
    .order('conversion_rate', { ascending: false })
    .limit(3);

  if (serviceCategory) {
    query = query.eq('service_category', serviceCategory);
  }

  const { data: templates } = await query;

  if (!templates || templates.length === 0) {
    // fallback: 타입 무관하게 가장 높은 전환율
    const { data: fallback } = await supabase
      .from('kmong_reply_templates')
      .select('*')
      .eq('is_active', true)
      .order('conversion_rate', { ascending: false })
      .limit(1);
    return fallback?.[0] || null;
  }

  // 전환율이 모두 0이면 랜덤 선택 (A/B 테스트)
  const hasStats = templates.some(t => t.total_sent > 0);
  if (!hasStats) {
    return templates[Math.floor(Math.random() * templates.length)];
  }

  return templates[0]; // 전환율 최고
}

/**
 * 템플릿에 변수 치환하여 최종 답변 생성
 */
function renderTemplate(template, variables) {
  let text = template.template_text;
  for (const [key, value] of Object.entries(variables)) {
    text = text.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return text;
}

/**
 * 고객 답변에서 견적 정보 파싱
 */
function parseQuoteInfo(customerReply) {
  if (!customerReply) return null;

  const text = customerReply.toLowerCase();
  let packageType = 'STANDARD';
  const selectedOptions = [];

  // 패키지 판단
  if (text.includes('메뉴') && (text.includes('4') || text.includes('5') || text.includes('많'))) {
    packageType = 'PREMIUM';
  } else if (text.includes('유지보수') || text.includes('관리')) {
    packageType = 'PREMIUM';
  } else if (text.includes('메뉴') && (text.includes('2') || text.includes('3') || text.includes('분리') || text.includes('나눠'))) {
    packageType = 'DELUXE';
  } else if (text.includes('한 페이지') || text.includes('원페이지') || text.includes('간단')) {
    packageType = 'STANDARD';
  }

  // 옵션 감지
  for (const opt of OPTIONS) {
    for (const kw of opt.keywords) {
      if (text.includes(kw.toLowerCase())) {
        selectedOptions.push(opt);
        break;
      }
    }
  }

  const pkg = PACKAGES[packageType];
  const optionTotal = selectedOptions.reduce((s, o) => s + o.price, 0);
  const total = pkg.price + optionTotal;

  return {
    packageType,
    package: pkg,
    selectedOptions,
    optionTotal,
    total,
  };
}

/**
 * 견적 메시지 생성
 */
function generateQuoteMessage(quoteInfo) {
  const { package: pkg, selectedOptions, total } = quoteInfo;

  let msg = `감사합니다 대표님! 확인했습니다 :)\n\n`;
  msg += `말씀해주신 내용 기준으로 ${pkg.name} 패키지가 딱 맞습니다.\n\n`;
  msg += `${pkg.name} (${(pkg.price / 10000).toFixed(0)}만원)\n`;
  msg += `- ${pkg.desc}\n`;
  msg += `- 작업일 ${pkg.days}일 / 수정 무제한\n`;

  if (selectedOptions.length > 0) {
    msg += `\n추가 옵션:\n`;
    for (const opt of selectedOptions) {
      msg += `- ${opt.name}: +${(opt.price / 10000).toFixed(0)}만원\n`;
    }
  }

  msg += `---\n`;
  msg += `합계: ${(total / 10000).toFixed(0)}만원\n\n`;
  msg += `도메인 셋팅은 별도 비용 없이 해드립니다.\n`;
  msg += `(도메인 연 1~2만원 별도, 호스팅은 무료입니다)\n\n`;
  msg += `확인해주시면 결제 안내드리겠습니다!`;

  return msg;
}

/**
 * 학습 — 최근 발송 완료된 답변 (합격 멘트) 조회
 *  - status가 'sent' 또는 auto_reply_status='sent' 인 inquiry 들의 final auto_reply_text
 *  - 같은 product_id 우선, 부족하면 같은 service_name 카테고리, 그래도 부족하면 전체
 *  - 차기 답변 생성 시 톤/구조 참고용 (Few-shot examples)
 */
async function getRecentApprovedReplies(productId, limit = 5) {
  // 1. 같은 product_id 의 sent 답변
  let { data: same, error } = await supabase
    .from('kmong_inquiries')
    .select('id, customer_name, message_content, auto_reply_text, inquiry_date, product_id')
    .eq('product_id', productId)
    .eq('auto_reply_status', 'sent')
    .not('auto_reply_text', 'is', null)
    .order('inquiry_date', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message, examples: [] };
  let examples = same || [];

  // 2. 부족하면 다른 product_id 의 sent 답변으로 보충 (전체 카테 톤 학습)
  if (examples.length < limit) {
    const remain = limit - examples.length;
    const { data: any } = await supabase
      .from('kmong_inquiries')
      .select('id, customer_name, message_content, auto_reply_text, inquiry_date, product_id')
      .eq('auto_reply_status', 'sent')
      .not('auto_reply_text', 'is', null)
      .order('inquiry_date', { ascending: false })
      .limit(remain * 2);
    const seen = new Set(examples.map(e => e.id));
    for (const r of (any || [])) {
      if (seen.has(r.id)) continue;
      examples.push(r);
      if (examples.length >= limit) break;
    }
  }
  return { ok: true, examples, sameProductCount: same?.length || 0 };
}

module.exports = {
  analyzeInquiry,
  selectBestTemplate,
  renderTemplate,
  parseQuoteInfo,
  generateQuoteMessage,
  getServiceStats,
  calculateReplyQuality,
  getRecentApprovedReplies,
  PACKAGES,
  OPTIONS,
  ANSWER_MAP,
  SERVICE_DETECTION,
};
