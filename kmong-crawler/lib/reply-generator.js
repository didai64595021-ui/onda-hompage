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
 * 문의 내용에서 키워드 추출 및 자동 답변 생성
 * @param {string} messageContent - 고객 문의 내용
 * @returns {object} { answer, serviceType, detectedKeywords }
 */
function analyzeInquiry(messageContent) {
  if (!messageContent) {
    return {
      answer: '홈페이지 제작 문의 감사합니다 :)',
      serviceType: '홈페이지 제작',
      detectedKeywords: [],
    };
  }

  const text = messageContent.toLowerCase();
  const detectedKeywords = [];

  // 답변 생성
  let answer = '';
  for (const entry of ANSWER_MAP) {
    for (const kw of entry.keywords) {
      if (text.includes(kw.toLowerCase())) {
        detectedKeywords.push(kw);
        if (!answer) answer = entry.answer;
        break;
      }
    }
  }

  if (!answer) {
    answer = '홈페이지 제작 문의 감사합니다 :)';
  }

  // 서비스 유형 판단
  let serviceType = '홈페이지 제작';
  for (const sd of SERVICE_DETECTION) {
    for (const kw of sd.keywords) {
      if (text.includes(kw.toLowerCase())) {
        serviceType = sd.type;
        break;
      }
    }
  }

  return { answer, serviceType, detectedKeywords };
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

module.exports = {
  analyzeInquiry,
  selectBestTemplate,
  renderTemplate,
  parseQuoteInfo,
  generateQuoteMessage,
  PACKAGES,
  OPTIONS,
  ANSWER_MAP,
  SERVICE_DETECTION,
};
