# onda-hompage 작업 상태

> 자동 업데이트: 2026-04-07 KST

## 현재 작업
객실/시설/관광/사진 카드 동적 추가-삭제 리팩토링 (히어로 슬라이더 방식 확장)
**3-에이전트 루프 (Planner→Generator→Evaluator) 풀코스 진행 중**

## 작업 배경
사용자 지시: 현재 객실 미리보기/시설 카드/관광 명소 등은 고정 슬롯 수(예: 시설 카드 6개, 관광 8개)로 하드코딩되어 있음. 히어로 슬라이더처럼 동적 추가/삭제가 가능하도록 리팩토링.

## 리팩토링 대상 (6개 영역)
| 영역 | 현재 슬롯 | 새 배열 키 | 컨테이너 ID | HTML 파일 |
|---|---|---|---|---|
| 객실 미리보기 (메인) | 3개 고정 | `room-previews` | `roomPreviewList` | index.html |
| 시설 스크롤 (메인) | 5개 고정 | `fac-scroll-cards` | `facScrollList` | index.html |
| 시설 카드 (그리드) | 6개 고정 | `fac-cards` | `facCardList` | facilities.html |
| 관광 명소 | 8개 고정 | `attr-spots` | `attrSpotList` | attractions.html |
| 제휴 할인 업체 | 4개 고정 | `attr-partners` | `attrPartnerList` | attractions.html |
| 패키지 갤러리 (사진) | 6개 고정 | `pkg-galleries` | `pkgGalleryList` | package.html |

## 단계별 계획 (Step 1~10) — **전 단계 완료**
- [x] **Step 1**: WORK_STATE.md 단계 계획 작성
- [x] **Step 2**: cms.js — 범용 `renderDynamicGroups()` + 6개 카드 빌더 (217줄 추가)
- [x] **Step 3**: cms-data.json — 6개 새 배열 키 추가 (154줄, 레거시 키 유지)
- [x] **Step 4**: index.html — `#roomPreviewList`, `#facScrollList`
- [x] **Step 5**: facilities.html — `#facCardList`
- [x] **Step 6**: attractions.html — `#attrSpotList`, `#attrPartnerList`
- [x] **Step 7**: package.html — `#pkgGalleryList`
- [x] **Step 8**: admin.html — `DYN_GROUPS` + `loadDynamicGroup` + `renderDynamicGroupAdmin` + `createDynamicCard` + 폼 분기 + doSave 동기화 (355줄 추가)
- [x] **Step 9**: Playwright 통합 테스트 23/23 (100%) — 디버깅 루프 0 에러 (legacy hero slider 충돌 수정)
- [x] **Step 10**: Cloudflare Pages 배포 완료 — `threeway-pension` 프로젝트 → threeway1.com 검증 15/15 통과

## 배포 결과
- **미리보기**: https://e3d0a40f.threeway-pension.pages.dev
- **본 사이트**: https://threeway1.com (검증 완료)
- **검증**: 6개 동적 그룹 모두 정상 렌더 + 콘솔 에러 0건

## 참조 패턴 (히어로 슬라이더)
이미 `hero-slides[]` 배열로 동적 구현 완료됨:
- **cms.js:59-124** — `renderHeroSlides()` (배열 우선, 레거시 폴백)
- **cms.js:646-1652** — `doSave()` 배열↔레거시 양방향 동기화
- **admin.html:1483-1502** — `loadHeroSlides()` 배열 로드 + 레거시 마이그레이션
- **admin.html:1504-1528** — `renderHeroSlidesAdmin()` 카드 그리드 + 추가 버튼
- **admin.html:1530-1634** — `createHeroSlideCard()` 개별 카드 + 삭제 + 이미지 업로드
- **admin.html:395** — `'🎠 히어로 슬라이더': '__DYNAMIC_HERO_SLIDES__'`

## 호환성 원칙
- 기존 `hero-slide-1-img`, `room-preview-1-img`, `fac-card-1-img` 등 개별 키는 모두 유지
- 새 배열 데이터가 있으면 우선 사용, 없으면 개별 키로 폴백
- 저장 시 양쪽 다 동기화 (이전 admin/페이지가 깨지지 않도록)

## 리팩토링 위험 요소 (건드리지 않을 것)
- Supabase `threeway_cms` 테이블 스키마
- rooms.html 7개 객실 상세 (다른 페이지에서 URL 앵커로 참조됨 — 별도 작업)
- about.html `why-1~9-*` 9개 카드 (사용자 명시 안 함)
- 요금/패키지 메뉴/FAQ 등 다른 패턴 영역

## Git 상태 (자동)
- **브랜치**: main
- **최근 커밋**: 0ce13a0 [auto-snapshot] 2026-04-07 12:00
- **미커밋 변경**: portfolio-sites/threeway-pension/admin.html (수정), _headers (신규)

## 알려진 이슈
- (없음)
