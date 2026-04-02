/**
 * 크몽 서비스 제목 → product_id 별칭 매핑
 * fuzzy matching: 제목에 키워드가 포함되면 매칭
 */

const PRODUCT_MAP = [
  { id: 'no-homepage',  keywords: ['홈페이지 없는', '사장님', '3일완성', '3일 완성'] },
  { id: 'onepage',      keywords: ['원페이지', '소상공인', '랜딩'] },
  { id: 'corp-seo',     keywords: ['기업', '리뉴얼', 'SEO', 'seo', '원스톱'] },
  { id: 'corp-renew',   keywords: ['10년', '기업', '리뉴얼', '최신형'] },
  { id: 'mobile-fix',   keywords: ['모바일 깨짐', '24시간 해결', '24시간'] },
  { id: 'pc-mobile',    keywords: ['PC', '모바일 반응형', '48시간'] },
  { id: 'responsive',   keywords: ['반응형 전환'] },
  { id: 'design-html',  keywords: ['디자인 그대로', 'HTML 이전', '디자인그대로'] },
  { id: 'imweb-html',   keywords: ['아임웹', 'HTML 이전'] },
  { id: 'cafe24',       keywords: ['카페24', '수정', '기능추가'] },
  { id: 'maintenance',  keywords: ['월 유지보수', '유지보수'] },
  { id: 'portal-map',   keywords: ['포털', '지도', '트래픽'] },
  { id: 'insta-atoz',   keywords: ['인스타그램', 'A to Z', 'AtoZ', 'a to z'] },
  { id: 'insta-core',   keywords: ['인스타그램', '핵심만', '쏙쏙'] },
];

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

module.exports = { matchProductId, PRODUCT_MAP };
