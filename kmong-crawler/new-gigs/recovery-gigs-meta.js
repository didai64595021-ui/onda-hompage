/**
 * 복구 7개 + 신규 2개 = 9개 gig 메타 (Phase 8B)
 *  - 현재 판매중 8개와 제목/범위 겹치지 않게 설계
 *  - 각 항목의 description/progress/preparation 은 Opus 4.7 이 실적 후킹 공식 기반으로 생성
 *  - #747186 (onepage) 은 debug-4gigs-detail.json 에서 전체 복구 가능
 */

// 현재 판매중 8개 (겹침 회피 참고):
//   1. 홈페이지 검색 등록 및 SEO 최적화 세팅 (10만)
//   2. PC전용 홈페이지를 모바일 반응형으로 48시간 완성 (7만)
//   3. 홈페이지 없는 사장님 전용 - 3일 완성+수정 (12만)
//   4. 기업 홈페이지 리뉴얼 디자인부터 SEO까지 원스톱 해결 (55만)
//   5. 홈페이지 반응형 전환 PC사이트를 모바일 최적화 (10만)
//   6. 홈페이지 모바일 깨짐 24시간 안에 해결 (5만)
//   7. 포털 지도 / 무지성 트래픽 (1.1만)
//   8. 인스타그램 A to Z, 대행X 실행O (5천)

const GIGS = [
  // ─── 복구 #747186 (onepage) — debug에서 전체 복구 가능 ─────
  {
    slug: 'onepage-recovery',
    recovery_from: '747186',
    title: '소상공인 원페이지 랜딩페이지 제작해드립니다',
    cat1: 'IT·프로그래밍',
    cat2: '랜딩페이지',
    hook_angle: 'CTR 1위 공식: 타겟(소상공인) + 형식(원페이지) + 겸손 어조',
    packages: [
      { name: 'STANDARD', price: 150000, days: 3, revisions: 99, description: '1P + 전화버튼 + SSL 기본 세팅' },
      { name: 'DELUXE', price: 250000, days: 5, revisions: 99, description: '1P + 하위 2P + SEO 기본 등록' },
      { name: 'PREMIUM', price: 400000, days: 7, revisions: 99, description: '1P + 하위 5P + SEO + 유지보수 1개월' },
    ],
    // description/progress/preparation 은 Opus 가 생성
    use_debug_recovery: true,  // debug-4gigs-detail.json 의 기존 본문 사용
  },

  // ─── 복구 #752477 (corp-renew) — 제목 차별화 ─────
  {
    slug: 'old-site-renew',
    recovery_from: '752477',
    // 기존 판매중 #747195 "기업 홈페이지 리뉴얼 디자인부터 SEO까지"와 겹침 회피 위해 제목 차별화
    title: '오래된 홈페이지 7일 안에 최신형 리뉴얼',
    cat1: 'IT·프로그래밍',
    cat2: '홈페이지 신규 제작',
    hook_angle: '후킹: 노후 pain point + 시간 보증(7일). 범위: 디자인+모바일+SEO 원스톱',
    packages: [
      { name: 'STANDARD', price: 450000, days: 7, revisions: 5, description: '메인 디자인 리뉴얼 + 모바일 반응형' },
      { name: 'DELUXE', price: 750000, days: 10, revisions: 10, description: '메인+서브 5P + SEO 심화 + CMS' },
      { name: 'PREMIUM', price: 1200000, days: 14, revisions: 999, description: '풀 리뉴얼 + SEO + 유지보수 3개월' },
    ],
  },

  // ─── 복구 #752484 (cafe24) ─────
  {
    slug: 'cafe24-fix',
    recovery_from: '752484',
    title: '카페24 홈페이지 부분 수정 및 기능 추가 당일 완료',
    cat1: 'IT·프로그래밍',
    cat2: '카페24',
    hook_angle: '후킹: 플랫폼 명시(카페24) + 범위(부분) + 시간(당일). CTR 5.97% 실적',
    packages: [
      { name: 'STANDARD', price: 50000, days: 1, revisions: 3, description: '단순 수정 5건 (문구/이미지 교체)' },
      { name: 'DELUXE', price: 120000, days: 2, revisions: 5, description: '섹션 추가 + 디자인 수정 + 반응형 보정' },
      { name: 'PREMIUM', price: 250000, days: 3, revisions: 10, description: '기능 추가 + 결제/배송 커스터마이징' },
    ],
  },

  // ─── 복구 #747202 (imweb-html) ─────
  {
    slug: 'imweb-to-html',
    recovery_from: '747202',
    title: '아임웹 홈페이지 HTML 이전 월 호스팅비 0원',
    cat1: 'IT·프로그래밍',
    cat2: '홈페이지 수정·유지보수',
    hook_angle: '후킹: 플랫폼 명시(아임웹) + 혜택(월 호스팅비 0원). Pain point: 월 구독료',
    packages: [
      { name: 'STANDARD', price: 200000, days: 5, revisions: 3, description: '현재 페이지 HTML 이전 (메인 1P)' },
      { name: 'DELUXE', price: 350000, days: 7, revisions: 5, description: '메인+서브 이전 + SEO 기본' },
      { name: 'PREMIUM', price: 500000, days: 10, revisions: 999, description: '전체 이전 + 디자인 리뉴얼 + CMS 관리' },
    ],
  },

  // ─── 복구 #752450 (design-html) ─────
  {
    slug: 'design-to-html',
    recovery_from: '752450',
    title: '디자인 시안 그대로 HTML 코드 이전',
    cat1: 'IT·프로그래밍',
    cat2: '홈페이지 수정·유지보수',
    hook_angle: '후킹: 디자인 에셋 보유 타겟 + 결과물 명시(HTML)',
    packages: [
      { name: 'STANDARD', price: 150000, days: 3, revisions: 3, description: '1P 디자인 → HTML 변환 (반응형)' },
      { name: 'DELUXE', price: 280000, days: 5, revisions: 5, description: '메인+서브 2P + 애니메이션 효과' },
      { name: 'PREMIUM', price: 500000, days: 7, revisions: 999, description: '풀 사이트 + 관리자 CMS 포함' },
    ],
  },

  // ─── 복구 #752497 (maintenance) ─────
  {
    slug: 'monthly-maintenance',
    recovery_from: '752497',
    title: '홈페이지 월 유지보수 관리 (월 5만~)',
    cat1: 'IT·프로그래밍',
    cat2: '홈페이지 수정·유지보수',
    hook_angle: '후킹: 구독형 가격 명시 + 안심 보장',
    packages: [
      { name: 'STANDARD', price: 50000, days: 30, revisions: 3, description: '월 수정 3건 + 보안 패치' },
      { name: 'DELUXE', price: 100000, days: 30, revisions: 10, description: '월 수정 10건 + 트래픽 모니터링 + 백업' },
      { name: 'PREMIUM', price: 200000, days: 30, revisions: 999, description: '무제한 수정 + SEO 리포트 + 긴급 대응' },
    ],
  },

  // ─── 복구 #662105 (insta-active) ─────
  {
    slug: 'insta-account-active',
    recovery_from: '662105',
    title: '인스타그램 계정 활성화 실계정 진짜 소통',
    cat1: '마케팅',
    cat2: '인스타그램 관리',
    hook_angle: '후킹: 진짜 소통 + 실계정 차별화 (봇/가짜 팔로워 기피 타겟)',
    packages: [
      { name: 'STANDARD', price: 5000, days: 7, revisions: 3, description: '게시물 10개 좋아요 + 댓글 3개' },
      { name: 'DELUXE', price: 30000, days: 14, revisions: 5, description: '게시물 30개 + 댓글 15개 + 팔로우 10명' },
      { name: 'PREMIUM', price: 100000, days: 30, revisions: 999, description: '한달 집중 케어 + 성장 리포트' },
    ],
  },

  // ─── 신규 A: 홈페이지 속도 최적화 ─────
  {
    slug: 'speed-optimize',
    recovery_from: null,  // 신규
    title: '홈페이지 속도 2배 빠르게 구글 PageSpeed 90점 세팅',
    cat1: 'IT·프로그래밍',
    cat2: '홈페이지 수정·유지보수',
    hook_angle: '후킹: 구체 수치(2배, 90점) + 전문성. CTR+CVR 상승 기대',
    packages: [
      { name: 'STANDARD', price: 100000, days: 3, revisions: 3, description: '메인 페이지 1개 최적화 (이미지/JS/CSS)' },
      { name: 'DELUXE', price: 200000, days: 5, revisions: 5, description: '메인+서브 3P 최적화 + CDN 세팅' },
      { name: 'PREMIUM', price: 400000, days: 7, revisions: 999, description: '풀사이트 + 서버 튜닝 + SEO 기초 연계' },
    ],
  },

  // ─── 신규 B: 다국어 홈페이지 (해외 진출) ─────
  {
    slug: 'multilingual',
    recovery_from: null,
    title: '영문·중문 다국어 홈페이지 세팅 해외 진출 대응',
    cat1: 'IT·프로그래밍',
    cat2: '홈페이지 수정·유지보수',
    hook_angle: '후킹: 타겟 명시(해외 진출 B2B) + 언어 구체화',
    packages: [
      { name: 'STANDARD', price: 200000, days: 5, revisions: 3, description: '영문 페이지 1개 추가 (번역 + 구조)' },
      { name: 'DELUXE', price: 400000, days: 7, revisions: 5, description: '영문·중문 2개 언어 + 메뉴 전환 UI' },
      { name: 'PREMIUM', price: 700000, days: 10, revisions: 999, description: '3개 언어 + 현지 SEO + 이메일 템플릿' },
    ],
  },
];

module.exports = { GIGS };
