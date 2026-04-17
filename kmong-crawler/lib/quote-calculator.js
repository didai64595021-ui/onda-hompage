/**
 * 크몽 자동 견적 계산기
 *  - 고객 메시지 + intent.customer_facts 로부터 페이지 수 / 추가 옵션 추출
 *  - 패키지 권장 + 옵션 합산 → 명확한 가격 제시
 *  - Claude가 숫자 만들어내는 걸 방지 (hallucination 방지)
 *
 *  ※ 실제 크몽 packages price 는 gig-detail 블록에서 참조. 이 모듈은 보조 견적 가이드.
 */

// 기본 패키지 (reply-generator의 PACKAGES 와 동기화)
const PACKAGES = {
  STANDARD: { name: 'STANDARD', price: 120000, desc: '메인 1P + CMS', days: 3, includes: ['메인페이지', 'CMS'] },
  DELUXE:   { name: 'DELUXE',   price: 200000, desc: '메인 + 서브 2P + CMS', days: 5, includes: ['메인페이지', '서브페이지 2개', 'CMS'] },
  PREMIUM:  { name: 'PREMIUM',  price: 350000, desc: '메인 + 서브 5P + CMS + 유지보수 1개월', days: 7, includes: ['메인페이지', '서브페이지 5개', 'CMS', '유지보수 1개월'] },
};

const OPTIONS = [
  { keywords: ['서브페이지', '서브 페이지', '추가 페이지', '추가페이지'], name: '서브페이지 추가', price: 20000, unit: 'page' },
  { keywords: ['카카오', '카톡 채널', '카카오톡'], name: '카카오톡 채널 연동', price: 30000 },
  { keywords: ['네이버 예약', '네이버예약', '예약 버튼'], name: '네이버 예약 버튼', price: 30000 },
  { keywords: ['공지 배너', '이벤트 배너', '상단 배너'], name: '상단 공지/이벤트 배너', price: 30000 },
  { keywords: ['QR', 'qr코드', '큐알'], name: 'QR 코드 제작', price: 30000 },
  { keywords: ['인스타', 'instagram', '인스타그램'], name: '인스타그램 피드 연동', price: 50000 },
  { keywords: ['SEO 심화', 'seo 심화', '검색 심화', '검색 최적화 심화'], name: 'SEO 심화 등록', price: 50000 },
  { keywords: ['유지보수', '관리 계약'], name: '유지보수 1개월', price: 50000 },
];

/**
 * 페이지 수 추출: "서브페이지 3개", "페이지 5페이지", "메뉴 4개"
 */
function extractPageCount(text) {
  const t = String(text || '');
  // 서브페이지 N개
  let m = t.match(/서브\s*페이지\s*(\d+)\s*개/);
  if (m) return { sub: parseInt(m[1]) };
  // 페이지 N개/N페이지
  m = t.match(/(\d+)\s*페이지|페이지\s*(\d+)\s*개/);
  if (m) {
    const n = parseInt(m[1] || m[2]);
    // 메인 1 포함 가정 → sub = n-1
    return { total: n, sub: Math.max(0, n - 1) };
  }
  // 메뉴 N개
  m = t.match(/메뉴\s*(\d+)\s*개/);
  if (m) return { menu: parseInt(m[1]), sub: parseInt(m[1]) };
  return null;
}

/**
 * 패키지 추천 로직
 *  - pageInfo.sub 기준: 0~1 → STANDARD, 2~3 → DELUXE, 4+ → PREMIUM
 *  - "유지보수" 키워드 있으면 PREMIUM 우선
 */
function recommendPackage(text, pageInfo, options) {
  const t = String(text || '').toLowerCase();
  if (/유지보수|1개월.*관리|운영.*해주/i.test(t) || options.some(o => o.name.includes('유지보수'))) {
    return PACKAGES.PREMIUM;
  }
  if (pageInfo) {
    const sub = pageInfo.sub || 0;
    if (sub >= 4) return PACKAGES.PREMIUM;
    if (sub >= 2) return PACKAGES.DELUXE;
    return PACKAGES.STANDARD;
  }
  return null; // 정보 부족 → 권장 없음
}

/**
 * 옵션 감지 + 중복 제거
 */
function detectOptions(text) {
  const t = String(text || '').toLowerCase();
  const found = [];
  for (const opt of OPTIONS) {
    for (const kw of opt.keywords) {
      if (t.includes(kw.toLowerCase())) {
        if (!found.find(f => f.name === opt.name)) found.push(opt);
        break;
      }
    }
  }
  return found;
}

/**
 * 최종 견적 계산
 * @param {string} messageText - 고객 메시지 (+ facts 합친 텍스트)
 * @returns {object|null}
 *  {
 *    package: {...} | null,
 *    options: [{name, price}],
 *    addlPages: 0,  // DELUXE 기본 2P 초과 서브페이지
 *    subtotal: { package, options, addlPages },
 *    total: 280000,
 *    breakdown: string,  // 프롬프트/답변에 그대로 넣을 수 있는 한글 요약
 *  }
 */
function calculateQuote(messageText) {
  const pageInfo = extractPageCount(messageText);
  const options = detectOptions(messageText);
  const pkg = recommendPackage(messageText, pageInfo, options);

  if (!pkg && options.length === 0) {
    return null; // 견적 정보 부족
  }

  // 추가 서브페이지 (패키지 기본 포함분 초과)
  let addlPages = 0;
  if (pkg && pageInfo?.sub != null) {
    const baseSub = pkg.name === 'STANDARD' ? 0 : pkg.name === 'DELUXE' ? 2 : 5;
    addlPages = Math.max(0, pageInfo.sub - baseSub);
  }
  const addlPagesPrice = addlPages * 20000;

  // 중복 제거: "서브페이지 N개"가 감지되면 options의 서브페이지 항목은 addlPages로 대체되므로 빼기
  const dedupOptions = pageInfo?.sub != null
    ? options.filter(o => !o.name.includes('서브페이지'))
    : options;
  const optionsPrice = dedupOptions.reduce((s, o) => s + o.price, 0);
  const packagePrice = pkg?.price || 0;
  const total = packagePrice + optionsPrice + addlPagesPrice;

  // breakdown — Claude 프롬프트에 그대로 인용 가능한 형식
  const lines = [];
  lines.push(`[자동 견적 계산 — 고객 메시지 분석 결과]`);
  if (pkg) {
    lines.push(`• 권장 패키지: ${pkg.name} ${formatWon(pkg.price)} — ${pkg.desc}`);
    lines.push(`  (작업일 ${pkg.days}일, 수정 무제한)`);
  } else {
    lines.push(`• 권장 패키지: (정보 부족 — 메뉴 수 확인 필요)`);
  }
  if (addlPages > 0) {
    lines.push(`• 추가 서브페이지: ${addlPages}개 × 2만원 = ${formatWon(addlPagesPrice)}`);
  }
  if (dedupOptions.length) {
    lines.push(`• 추가 옵션:`);
    for (const o of dedupOptions) lines.push(`    - ${o.name}: +${formatWon(o.price)}`);
  }
  lines.push(`• 합계: ${formatWon(total)}`);
  lines.push(`⚠️ 주의: 이 견적은 자동 계산치. [크몽 서비스 스펙] 블록의 실제 패키지 price 우선. 둘이 다르면 서비스 스펙을 따르고 차이 설명할 것.`);

  return {
    package: pkg,
    options: dedupOptions,
    addlPages,
    subtotal: { package: packagePrice, options: optionsPrice, addlPages: addlPagesPrice },
    total,
    breakdown: lines.join('\n'),
  };
}

function formatWon(amount) {
  if (amount == null) return '';
  if (amount >= 10000) {
    const w = amount / 10000;
    return Number.isInteger(w) ? `${w}만원` : `${w.toFixed(1)}만원`;
  }
  return `${amount.toLocaleString()}원`;
}

module.exports = { calculateQuote, extractPageCount, detectOptions, recommendPackage, PACKAGES, OPTIONS };
