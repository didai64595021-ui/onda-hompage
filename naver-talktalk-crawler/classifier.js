// 콜드메시지 3대 메뉴 기반 타겟 분류
//
// 메뉴1: 반응형 전환 (7만원) — 홈페이지O + 반응형X
// 메뉴2: 소상공인 랜딩 (12만원) — 홈페이지X
// 메뉴3: SEO 최적화 (10만원) — 홈페이지O + 검색 안 뜸 (추후)

const REVIEW_THRESHOLD = 50; // A/B급 구분 기준

function classify(biz) {
  const hasTalktalk = biz.talktalk_active === 'O';
  const hasHomepage = biz.homepage_exists === 'O';
  const isResponsive = biz.responsive === 'O';
  const hasKakao = biz.kakao_button === 'O';
  const visitorReviews = biz.visitor_review_count || 0;

  if (!hasTalktalk) return { grade: null, target_menu: '해당없음' };

  // S급: 톡톡O + 홈페이지O + 반응형X → 반응형전환 (최고 전환율)
  if (hasHomepage && !isResponsive) {
    return { grade: 'S', target_menu: '반응형전환' };
  }

  // A급: 톡톡O + 홈페이지X + 리뷰 적음 → 랜딩제작
  if (!hasHomepage && visitorReviews < REVIEW_THRESHOLD) {
    return { grade: 'A', target_menu: '랜딩제작' };
  }

  // B급: 톡톡O + 홈페이지X + 리뷰 많음 → 랜딩제작 (전환 낮을 수 있음)
  if (!hasHomepage && visitorReviews >= REVIEW_THRESHOLD) {
    return { grade: 'B', target_menu: '랜딩제작' };
  }

  // C급: 톡톡O + 홈페이지O + 반응형O + 카톡X → 부가서비스
  if (hasHomepage && isResponsive && !hasKakao) {
    return { grade: 'C', target_menu: '해당없음' };
  }

  // D급: 톡톡O + 홈페이지O + 반응형O + 카톡O → 현재 타겟 아님
  if (hasHomepage && isResponsive && hasKakao) {
    return { grade: 'D', target_menu: '해당없음' };
  }

  return { grade: null, target_menu: '해당없음' };
}

module.exports = { classify, REVIEW_THRESHOLD };
