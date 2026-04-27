/**
 * 크몽 서비스 제목 → product_id 별칭 매핑
 * fuzzy matching: 제목에 키워드가 포함되면 매칭
 */

// 각 제품마다 "다른 제품 제목에 절대 등장하지 않는" 고유 anchor를 배치.
// 기존 범용 키워드('기업', '리뉴얼', 'SEO', 'HTML 이전' 등)는 서로 겹쳐 점수 oscillate →
// 제목 한 글자만 바뀌어도 매칭이 옆 제품으로 넘어가는 사고 반복. 고유구문 우선 매칭으로 변경.
// primary = 절대 겹치지 않는 유일 앵커 (있으면 강제 매칭), fallback = 보조 점수용.
const PRODUCT_MAP = [
  { id: 'no-homepage', primary: ['사장님 전용', '홈페이지 없는'],      fallback: ['3일완성', '3일 완성'],                     category: '홈페이지 제작',        gig_url: null },
  { id: 'onepage',     primary: ['원페이지', '랜딩페이지'],            fallback: ['소상공인'],                                 category: '랜딩페이지 제작',      gig_url: null },
  { id: 'corp-seo',    primary: ['SEO까지 원스톱', '디자인부터 SEO'], fallback: ['원스톱 해결'],                              category: '기업 홈페이지 SEO',    gig_url: null },
  { id: 'corp-renew',  primary: ['10년 된 기업', '최신형 리뉴얼'],    fallback: ['7일 만에'],                                 category: '기업 홈페이지 리뉴얼', gig_url: null },
  { id: 'mobile-fix',  primary: ['모바일 깨짐'],                       fallback: ['24시간 안에 해결'],                         category: '모바일 반응형 수정',   gig_url: null },
  { id: 'pc-mobile',   primary: ['PC전용 홈페이지', '48시간 완성'],    fallback: ['PC→모바일'],                                category: 'PC→모바일 반응형 전환', gig_url: null },
  { id: 'responsive',  primary: ['반응형 전환'],                       fallback: ['PC사이트를 모바일'],                        category: '반응형 전환',          gig_url: null },
  { id: 'design-html', primary: ['디자인 그대로 HTML', '디자인그대로 HTML'], fallback: [],                                    category: '디자인 HTML 이전',     gig_url: null },
  { id: 'imweb-html',  primary: ['아임웹 홈페이지 HTML', '아임웹 HTML'], fallback: ['아임웹'],                                category: '아임웹 HTML 이전',     gig_url: null },
  { id: 'cafe24',      primary: ['카페24'],                            fallback: ['부분 수정 및 기능 추가', '당일 완료'],      category: '카페24 기능 추가',     gig_url: null },
  { id: 'maintenance', primary: ['월 유지보수 관리', '월 유지보수'],    fallback: ['유지보수'],                                 category: '홈페이지 유지보수',    gig_url: null },
  { id: 'portal-map',  primary: ['포털 지도', '무지성 트래픽'],         fallback: ['오르시던가요'],                             category: '포털/지도 트래픽',     gig_url: null },
  { id: 'insta-atoz',  primary: ['A to Z, 대행X', '대행X 실행O'],      fallback: ['A to Z', 'AtoZ'],                           category: '인스타그램 운영 A to Z', gig_url: null },
  { id: 'insta-core',  primary: ['핵심만 쏙쏙', '핵심 운영'],           fallback: ['인스타그램 핵심'],                          category: '인스타그램 핵심 운영', gig_url: null },
  { id: 'kakao-excel', primary: ['Zapier 대체 카톡', '카톡 자동발송, 노코드'], fallback: ['구글시트', 'Zapier', 'Make', '카톡 자동발송'], category: '카톡 알림봇 + 엑셀 자동연동', gig_url: null },
];

/**
 * product_id로 서비스 카테고리 조회 (답변 첫 줄 개인화용)
 * @param {string} productId
 * @returns {string|null}
 */
function getCategoryById(productId) {
  const p = PRODUCT_MAP.find((x) => x.id === productId);
  return p?.category || null;
}

/**
 * product_id로 gig URL 조회 (카드 링크용)
 * @param {string} productId
 * @returns {string|null}
 */
function getGigUrlById(productId) {
  const p = PRODUCT_MAP.find((x) => x.id === productId);
  return p?.gig_url || null;
}

/**
 * 서비스 제목으로 product_id를 찾는다.
 * 1순위: primary 고유 앵커 매칭 — 하나라도 포함되면 즉시 반환 (점수 경합 없음)
 *        primary가 여러 제품에 매칭되면 가장 긴 앵커 가진 제품 승.
 * 2순위: fallback 키워드 점수 합산 (기존 방식)
 * @param {string} title - 크몽 서비스 제목
 * @returns {string|null}
 */
function matchProductId(title) {
  if (!title) return null;
  const normalized = title.trim();

  // 1순위: primary 앵커
  let primaryBest = null;
  let primaryBestLen = 0;
  for (const product of PRODUCT_MAP) {
    for (const anchor of (product.primary || [])) {
      if (normalized.includes(anchor) && anchor.length > primaryBestLen) {
        primaryBest = product.id;
        primaryBestLen = anchor.length;
      }
    }
  }
  if (primaryBest) return primaryBest;

  // 2순위: fallback 점수합
  let bestMatch = null;
  let bestScore = 0;
  for (const product of PRODUCT_MAP) {
    let score = 0;
    for (const kw of (product.fallback || [])) {
      if (normalized.includes(kw)) score += kw.length;
    }
    if (score > bestScore) { bestScore = score; bestMatch = product.id; }
  }
  return bestMatch;
}

module.exports = { matchProductId, PRODUCT_MAP, getCategoryById, getGigUrlById };
