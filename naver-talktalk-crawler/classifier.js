// 콜드메시지 4대 타겟 기준
//
// 1. 홈페이지O + 구글/네이버 검색 노출X → SEO최적화 (10만)
// 2. 리뷰 적음 (방문자<30 or 블로그<10) → 리뷰관리
// 3. 홈페이지O + 반응형X → 반응형전환 (7만)
// 4. 홈페이지X → 랜딩제작 (12만)
// ※ 한 업체가 여러 기준 해당 가능 (복합타겟)

const VISITOR_REVIEW_THRESHOLD = 30;
const BLOG_REVIEW_THRESHOLD = 10;

function classify(biz) {
  const hasTalktalk = biz.talktalk_active === 'O';
  const hasHomepage = biz.homepage_exists === 'O';
  const isResponsive = biz.responsive === 'O';
  const seoVisible = biz.seo_visible === 'O';
  const visitorReviews = biz.visitor_review_count || 0;
  const blogReviews = biz.blog_review_count || 0;

  if (!hasTalktalk) return { grade: null, target_menu: '해당없음', target_menus: [] };

  const menus = [];

  // 기준1: SEO 노출 안 됨 (홈페이지O + 검색 노출X)
  if (hasHomepage && !seoVisible) {
    menus.push('SEO최적화');
  }

  // 기준2: 리뷰 적음
  if (visitorReviews < VISITOR_REVIEW_THRESHOLD || blogReviews < BLOG_REVIEW_THRESHOLD) {
    menus.push('리뷰관리');
  }

  // 기준3: 반응형 아님 (홈페이지O + 반응형X)
  if (hasHomepage && !isResponsive) {
    menus.push('반응형전환');
  }

  // 기준4: 홈페이지 없음
  if (!hasHomepage) {
    menus.push('랜딩제작');
  }

  // 등급: 해당 메뉴 수 기준 (많을수록 높은 등급)
  let grade;
  if (menus.length >= 3) {
    grade = 'S';  // 3개 이상 해당 = 최고 타겟
  } else if (menus.length === 2) {
    grade = 'A';  // 2개 해당
  } else if (menus.length === 1) {
    grade = 'B';  // 1개 해당
  } else {
    grade = 'D';  // 해당 없음
  }

  return {
    grade,
    target_menu: menus[0] || '해당없음',
    target_menus: menus
  };
}

module.exports = { classify, VISITOR_REVIEW_THRESHOLD, BLOG_REVIEW_THRESHOLD };
