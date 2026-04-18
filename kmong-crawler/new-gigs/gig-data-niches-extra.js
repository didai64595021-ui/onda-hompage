/**
 * 크몽 니치 10상품 Phase E — 빈 필드 보강
 *
 * gig-data-niches.js (기본 Step2) 가 채우는 필드 외에 추가로 채울 것:
 *   - revision: 수정 및 재진행 안내 textarea
 *   - gallery: 상세 이미지 갤러리 9슬롯 (3장만 채움)
 *   - extraSelects: 카테고리별 추가 select (아임웹은 업종/카테고리/플러그인)
 *
 * 정책: feedback_kmong_copy_niche.md (쉬운 말), feedback_kmong_human_submit.md (임시저장까지)
 */

// 공통 수정 및 재진행 안내 — 50대 자영업자도 이해 가능한 언어
const COMMON_REVISION = `[무료로 고쳐드리는 것]
✓ 글자, 오타, 색깔, 글꼴, 배치
✓ 처음에 말씀하신 범위 안에서의 수정
✓ 넘겨드린 후 24시간 안에 발견된 오류
✓ 일정 변경 (서로 협의)
✓ 외부 변경으로 생긴 문제 (A/S 기간 안)

[추가 요금 받는 것]
✗ 처음 말씀 안 하신 새 기능 추가
✗ 사이트 구조 크게 바꾸기 (전체 재디자인)
✗ 새로운 외부 서비스 연동 (결제·배송·문자 등)
✗ 중간에 마음 바뀌어서 전부 다시 작업
✗ A/S 기간 끝난 후 정기 유지보수

[수정 몇 번 해드려요?]
- STANDARD 25만원: 2번
- DELUXE 40만원: 3번
- PREMIUM 60만원: 5번

[환불 기준]
- 시작 전: 100% 환불 가능
- 초안 만들기 전 (작업 절반 전): 부분 환불
- 초안 이후: 진행한 만큼 계산해서 나머지 환불
- 단순 변심 환불: 진행도에 따라 다름

[A/S 기간 — 패키지별]
- STANDARD: 인도 후 7일
- DELUXE: 인도 후 14일
- PREMIUM: 인도 후 30일
A/S 기간 안에는 사이트 구조 바뀌거나 외부 문제로 생긴 오류도 무료로 고쳐드립니다.

[연락 방법]
채팅·전화·화상 모두 가능합니다.
평일 오전 9시~저녁 9시, 24시간 안에 답변 드립니다.
급한 문제는 주말·야간에도 연락 가능합니다.`;

// 공통 갤러리 (N01 ROI 타임라인 + 7단계 프로세스 — 이전 관련 모든 니치에 공통 적용)
const COMMON_GALLERY = ['niche-N01-gallery-2.png', 'niche-N01-gallery-3.png'];

const EXTRA = {
  // N01 — 아임웹 구독료 탈출
  // draftId 이력: 764200 (2026-04-18 초기, 이후 삭제됨) → 764206 (현재 유효)
  'N01': {
    draftId: '764206',
    subCategoryId: '639',  // 아임웹 = rootCategoryId=6, subCategoryId=639, thirdCategoryId=63901
    thirdCategoryId: '63901',
    revision: COMMON_REVISION,
    // 갤러리 3장 — Before/After, 구독료 비교, ROI 타임라인
    gallery: ['niche-N01-gallery-1.png', 'niche-N01-gallery-2.png', 'niche-N01-gallery-3.png'],
    // 아임웹 카테고리 전용 select 필드 (recon-select-options-764200.json 실측)
    extraSelects: [
      { label: '업종', value: '서비스업' },
      { label: '카테고리', value: '기업 홈페이지' },
      { label: '플러그인 설치', value: '0개', nth: 0 },
      { label: '플러그인 설치', value: '2개', nth: 1 },
      { label: '플러그인 설치', value: '5개', nth: 2 },
    ],
  },

  // N02 — 식스샵 구독료 탈출 포트폴리오 이사
  'N02': {
    draftId: '764211',
    subCategoryId: '601',
    thirdCategoryId: '60113',
    revision: COMMON_REVISION,
    gallery: COMMON_GALLERY,
    extraSelects: [
      { label: '업종', value: '서비스업' },
      { label: '카테고리', value: '포트폴리오 홈페이지' },
    ],
  },

  // N04 — 노션 홈페이지 → 진짜 홈페이지 전환
  'N04': {
    draftId: '764212',
    subCategoryId: '660',
    thirdCategoryId: '66001',
    revision: COMMON_REVISION,
    gallery: COMMON_GALLERY,
    extraSelects: [
      { label: '업종', value: '서비스업' },
    ],
  },

  // N05 — Wix Squarespace Framer 한국이전 특화
  'N05': {
    draftId: '764213',
    subCategoryId: '601',
    thirdCategoryId: '60113',
    revision: COMMON_REVISION,
    gallery: COMMON_GALLERY,
    extraSelects: [
      { label: '업종', value: '서비스업' },
      { label: '카테고리', value: '기업 홈페이지' },
    ],
  },

  // N08 — 온라인예약 시스템 B2B 컨설팅 레슨
  'N08': {
    draftId: '764215',
    subCategoryId: '601',
    thirdCategoryId: '60113',
    revision: COMMON_REVISION,
    gallery: COMMON_GALLERY,
    extraSelects: [
      { label: '업종', value: '서비스업' },
      { label: '카테고리', value: '기업 홈페이지' },
    ],
  },

  // N09 — 다국어홈페이지 + 상세페이지 이미지 번역
  'N09': {
    draftId: '764216',
    subCategoryId: '601',
    thirdCategoryId: '60113',
    revision: COMMON_REVISION,
    gallery: COMMON_GALLERY,
    extraSelects: [
      { label: '업종', value: '서비스업' },
      { label: '카테고리', value: '다국어 홈페이지' },
    ],
  },

  // N10 — 리뉴얼 후 검색순위 유지 (301)
  'N10': {
    draftId: '764217',
    subCategoryId: '634',
    thirdCategoryId: '',
    revision: COMMON_REVISION,
    gallery: COMMON_GALLERY,
    extraSelects: [
      { label: '업종', value: '서비스업' },
    ],
  },
};

module.exports = { EXTRA, COMMON_REVISION };
