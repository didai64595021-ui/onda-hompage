/**
 * 크몽 서비스 제목 → product_id 별칭 매핑
 * fuzzy matching: 제목에 키워드가 포함되면 매칭
 */

const PRODUCT_MAP = [
  { id: 'no-homepage',  keywords: ['홈페이지 없는', '사장님', '3일완성', '3일 완성'], category: '홈페이지 제작',     gig_url: null },
  { id: 'onepage',      keywords: ['원페이지', '소상공인', '랜딩'],                   category: '랜딩페이지 제작',   gig_url: null },
  { id: 'corp-seo',     keywords: ['기업', '리뉴얼', 'SEO', 'seo', '원스톱'],         category: '기업 홈페이지 SEO', gig_url: null },
  { id: 'corp-renew',   keywords: ['10년', '기업', '리뉴얼', '최신형'],                category: '기업 홈페이지 리뉴얼', gig_url: null },
  { id: 'mobile-fix',   keywords: ['모바일 깨짐', '24시간 해결', '24시간'],             category: '모바일 반응형 수정',   gig_url: null },
  { id: 'pc-mobile',    keywords: ['PC', '모바일 반응형', '48시간'],                   category: 'PC→모바일 반응형 전환', gig_url: null },
  { id: 'responsive',   keywords: ['반응형 전환'],                                    category: '반응형 전환',       gig_url: null },
  { id: 'design-html',  keywords: ['디자인 그대로', 'HTML 이전', '디자인그대로'],       category: '디자인 HTML 이전',  gig_url: null },
  { id: 'imweb-html',   keywords: ['아임웹', 'HTML 이전'],                            category: '아임웹 HTML 이전',  gig_url: null },
  { id: 'cafe24',       keywords: ['카페24', '수정', '기능추가'],                     category: '카페24 기능 추가',  gig_url: null },
  { id: 'maintenance',  keywords: ['월 유지보수', '유지보수'],                         category: '홈페이지 유지보수', gig_url: null },
  { id: 'portal-map',   keywords: ['포털', '지도', '트래픽'],                         category: '포털/지도 트래픽',  gig_url: null },
  { id: 'insta-atoz',   keywords: ['인스타그램', 'A to Z', 'AtoZ', 'a to z'],         category: '인스타그램 운영 A to Z', gig_url: null },
  { id: 'insta-core',   keywords: ['인스타그램', '핵심만', '쏙쏙'],                    category: '인스타그램 핵심 운영', gig_url: null },
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
 * 키워드 매칭 점수가 가장 높은 것을 반환.
 * @param {string} title - 크몽 서비스 제목
 * @returns {string|null} product_id 별칭 또는 null
 */
function matchProductId(title) {
  if (!title) return null;
  const normalized = title.trim();

  let bestMatch = null;
  let bestScore = 0;

  for (const product of PRODUCT_MAP) {
    let score = 0;
    for (const keyword of product.keywords) {
      if (normalized.includes(keyword)) {
        score += keyword.length; // 긴 키워드 매칭일수록 높은 점수
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = product.id;
    }
  }

  return bestMatch;
}

module.exports = { matchProductId, PRODUCT_MAP, getCategoryById, getGigUrlById };
