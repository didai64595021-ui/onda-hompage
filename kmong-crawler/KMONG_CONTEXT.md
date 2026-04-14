# 크몽 작업 진입 시 필독 컨텍스트

**규칙**: 크몽(kmong) 관련 작업을 시작하기 전, 이 파일을 **반드시 먼저** 읽고 착수하라.
보강 시점: 2026-04-14 (55상품 등록 세션)

---

## 1. 프로젝트 개요
- 대상: 크몽 셀러 계정 **ondadaad** (cookie: `kmong-crawler/cookies/kmong-session.json`, 12시간 TTL)
- 작업 디렉토리: `/home/onda/projects/onda-hompage/kmong-crawler/`
- 핵심 파일:
  - `new-gigs/create-gig.js` — 등록 RPA (Step1+Step2)
  - `new-gigs/run-55-parallel.js` — 55상품 병렬 오케스트레이터
  - `new-gigs/gig-data-55.js` — 55상품 데이터 (cat1/cat2/title/description/packages)
  - `new-gigs/gig-data-extra.js` — 카테고리 ID/select 매핑
  - `new-gigs/generate-55-images.js` (legacy 1024x1024) / `generate-55-images-hires.js` (신 1304x976)
  - `new-gigs/replace-image.js` — 메인 이미지 교체
  - `new-gigs/cleanup-all-drafts.js` / `cleanup-orphans.js` — WAITING 탭 정리
  - `new-gigs/supervisor.sh` — 프로세스 감시/재시작
  - `lib/login.js` — 로그인 (절대 수정 금지 주석 있음)
  - `lib/modal-handler.js` — closeModals

## 2. 2026-04-14 세션 누적 규칙

### 풀자동화 5 PHASE 프로토콜
상세: `reference_kmong_fullautoauto_protocol.md` (메모리)
- PHASE 1: 시장조사 → `/research/kmong_market_analysis_{cat}_{date}.md`
- PHASE 2: 7단계 플로우 (후킹→자격증명→B/A사례→프로세스→패키지→FAQ→CTA). 순서 변경 금지
- PHASE 3: 크몽 에디터 포맷팅 — **HTML 직접 입력 불가** (꺾쇠 `<` 금지어), TipTap 클릭/단축키 방식
- PHASE 4: 크몽 FAQ 탭 (행정/환불/계산서 — 본문 FAQ와 중복 금지)
- PHASE 5: 썸네일 (가로형 4:3, 모바일 가독성)

### Before/After 사례는 **현재 자동 생성 제외** (승현 직접 투입)
- `[IMAGE: 설명]`, `[수치 입력 필요]` 마커만 남기기

### 썸네일 파이프라인 (고화질 필수)
- 목표 크기: **1304x976 (= 652x488 Retina 2x)** — 메모리에 652x488 권장 명시
- 파이프라인:
  1. `gpt-image-1` `size=1536x1024` `quality=high` (landscape 3:2)
  2. Sharp Lanczos3 → 4:3 가로 크롭 (1366x1024)
  3. Lanczos3 → 1304x976
  4. PNG 저장
- 스크립트: `generate-55-images-hires.js`
- **기존 1024x768 단순 리사이즈는 글자 뭉개짐으로 사용 금지**

### 전문용어 일반인 해석 필수
- 크몽 고객은 일반인 수준 → 약어는 괄호로 풀어쓰기
- 예: LTV(고객생애가치), CRM(고객관리), ROI(투자수익률), ROAS(광고수익률), UI/UX(사용자경험), KPI(성과지표), CTA(행동유도버튼), SaaS(구독형 서비스), B2B(기업간 거래), SEO(검색최적화), CTR(클릭률), IR(투자자료)

### 판매핵심정보/모달/드롭다운 풀필
- 사용자 지시: **Playwright로 모든 모달·드롭다운 열어 채울 수 있는 건 전부 채우기**
- 검색 키워드, 태그, 경력/자격, 추가옵션 등 포함
- 기존 금지어 규칙 준수 (reference_kmong_banned_keywords.md)

## 3. 크몽 카테고리 매핑 핵심

### 디자인 1차(rootCategoryId=1) 2차 옵션 — 크몽 실제 텍스트
**gig-data에 쓰면 안 되는 이름 → 올바른 이름**:
- `로고·브랜딩` → **`로고 디자인`** 또는 `브랜드 디자인·가이드`
- `인쇄·홍보물` → `메뉴판` / `전단지·포스터·인쇄물` / `홍보물 인쇄·출력` / `종합 인쇄물`
- `상세페이지·이미지편집` → **`상세페이지`** (통합 이름 없음, 세분 필요)
- 유튜브 썸네일/SNS → `SNS·광고소재·썸네일`
- PPT → `PPT·인포그래픽`
- 웹디자인 → `웹 UI·UX` / `앱·모바일 UI·UX`
- 명함 → `명함` (단독)

### subCategoryId 매핑 (확정)
- 113 상세페이지 / 107 명함 / 134 메뉴판 / 101 전단지·포스터·인쇄물 / 로고 디자인 등은 draft URL에서 확인 필요

### IT·프로그래밍 2차 (rootCategoryId=6)
- 상세: `reference_kmong_gig_creation.md` 참조 (봇·챗봇 617, 업무 자동화 663, 맞춤형 챗봇·GPT 667, 일반 프로그램 605, 크롤링·스크래핑 645)

## 4. TipTap 에디터 트랩 (PHASE 3 관련)
- `#DESCRIPTION` 본문 / `#DESCRIPTION_PROGRESS` 절차 / `#DESCRIPTION_PREPARATION` 준비사항
- **innerHTML 직접 조작 금지** (ProseMirror 내부 상태 동기화 안 됨, 저장 시 무시)
- **올바른 입력**: 키보드 (Ctrl+A → Delete → keyboard.type)
- **꺾쇠 `<` 금지** — HTML 태그 입력 불가. 서식은 툴바 버튼 클릭 또는 단축키(Ctrl+B, Ctrl+Shift+2 for H2 등)
- 100자 미만 → 제출 거부(임시저장은 허용)
- 카테고리별 필드 차이:
  - 지도/블로그 체험단/바이럴: DESCRIPTION + PROGRESS만 (PREPARATION 없음)
  - IT·프로그래밍: 3개 모두

## 5. 실행 정책
- **실 등록(`submit`)은 금지** — 항상 `save`(임시저장)까지만. 발행은 사용자가 직접
- **운영 광고(SELLING 탭) 절대 손대지 말 것** — 실매출 발생 중
- **cleanup은 WAITING 탭 한정** + 제목 패턴 화이트리스트
- **세션 중복 실행 방지**: supervisor.sh, resume-trigger.sh, auto-start-when-ready.sh가 재시작 트리거 → 내가 메인이면 kill 후 진행
- **중복 draft 정리**: 재시도로 draft가 중복 생성될 수 있음. 제목 기준 dedup 후 가장 최신/완전한 것만 유지

## 6. 자동화 스크립트 관계도
```
supervisor.sh (감시자, 죽으면 재시작)
  ├─ run-55-parallel.js (오케스트레이터, concurrency 2)
  │    └─ create-gig.js (상품당 1회)
  │          ├─ lib/login.js (쿠키 복원 + 재로그인)
  │          ├─ selectCategory (정규화 매칭 fallback)
  │          ├─ discoverSelects (react-select 라벨 매칭)
  │          └─ fillTipTap (키보드 입력)
  │
  ├─ replace-image.js (이미지만 교체)
  ├─ cleanup-all-drafts.js (WAITING 일괄 삭제, --execute)
  └─ cleanup-orphans.js (패턴 매칭 삭제)

auto-start-when-ready.sh (대기 → 조건 충족 시 run-55-parallel 시작)
resume-trigger.sh (cron 1회 트리거)
```

## 7. 현재 진행 상태 (2026-04-14 22:15 KST)
- done: 55/55 임시저장 완료 (전 건 draft 존재)
- 카테고리 문제: 29/43-46/48-53은 "상세페이지" fallback으로 저장됨 → 실제 최적 카테고리와 불일치 (예: 유튜브 썸네일=SNS·광고소재·썸네일이 맞음). 카테고리 수정은 Step1 확정 후 변경 어려움 → **삭제 후 재생성** 필요할 수 있음
- 다음 작업:
  1. 중복 draft 정리
  2. 에디터/필드 풀 정찰
  3. 고화질 썸네일 재생성 + 일괄 교체
  4. 7단계 플로우 본문 재작성 + 일괄 반영
  5. 판매핵심정보/키워드 풀필
  6. WAITING 검증 봇 (썸네일/빈 필드 체크)

## 8-A. 크몽 URL 접근 정책 (2026-04-14 세션 확인 — 핵심 발견)
**크몽은 direct navigation을 차단** — Referer 없으면 /my-gigs 계열 전부 로그인 모달로 리다이렉트:

| URL | 접근 | 비고 |
|-----|------|------|
| `/my-gigs/new` | ✅ 쿠키만 있으면 OK | 유일한 direct 접근 가능 셀러 페이지 |
| `/my-gigs?statusType=WAITING` | ❌ 리다이렉트 | 대시보드 목록 |
| `/my-gigs/edit/{id}` direct | ❌ 리다이렉트 | Referer 없음 |
| `/my-gigs/edit/{id}` (서버 302) | ✅ | Step1 "다음" 클릭 후 자동 진입 |

### 우회 필수 패턴
```js
// 1. /my-gigs/new 먼저 진입 (warm-up + 쿠키 보강)
await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded' });
await sleep(5000);

// 2. 클라이언트 사이드 navigation으로 edit URL 이동 (Referer 세팅됨)
await page.evaluate((url) => { window.location.href = url; }, DRAFT_URL);
await page.waitForLoadState('networkidle');
```

또는 `page.setExtraHTTPHeaders({ Referer: 'https://kmong.com/my-gigs/new' })`.

**영향받는 기존 스크립트**: cleanup-*.js, replace-image.js, recon-full-fields.js, update-drafts-*.js → 모두 이 우회 패턴 적용 필요.

## 8. 트랩 모음 (재발 방지)
1. **draft URL에 categoryId 빠뜨리면 /my-gigs로 리다이렉트** — 편집 URL은 `rootCategoryId + subCategoryId` 필수
2. **react-select-N-input ID는 카테고리별로 다름** — 하드코딩 금지. label discovery 사용
3. **react-select 메뉴 닫기**: 다음 select 전 ESC + body click + sleep(300)
4. **상주 여부**: "상주 불가능" (X "비상주")
5. **수정 횟수**: "제한없음" (X "무제한")
6. **이미지 652x488 미만 거부**. 고화질 2x = 1304x976 권장
7. **이미지 1024x1024 정사각을 1024x768로 단순 리사이즈 시 글자 뭉개짐** — Lanczos3 + 적절한 크롭 필수
8. **55상품 4번 실패(39/47/55)**: 크몽 디자인 2차 옵션이 세분화되어 "로고·브랜딩"/"인쇄·홍보물" 같은 통합명 없음 — 정확 이름 사용
9. **55번 "다음" 클릭 미이동**: cat2 "전단지·포스터·인쇄물" → "명함"으로 변경 시 통과

## 9. 작업 마무리 체크리스트 (필수)
자세히: `feedback_kmong_finish_checklist.md` (메모리)
1. 중복·불필요 draft 정리 (run-log 기반 dedup)
2. **썸네일 규격 실측 검증** (추측 금지 — 테스트 draft로 먼저 업로드)
3. 본문/필드 완성도 + 금지어 검사
4. 상태 스냅샷 커밋
5. 텔레그램 최종 보고서 (done/failed, 규격, 중복, 정책, 개선점, 후속 작업)
6. 자동화 스크립트 영속 체크

## 10. 메모리 연결
- [풀자동화 프로토콜](reference_kmong_fullautoauto_protocol.md)
- [폼 구조/셀렉터](reference_kmong_gig_creation.md)
- [금지키워드/TipTap](reference_kmong_banned_keywords.md)
- [임시저장까지만](feedback_kmong_human_submit.md)
- [카피: 니즈/니치](feedback_kmong_copy_niche.md)
- [AI 모델 최신 유지](feedback_latest_ai_models.md)
- [55상품 재기획](project_kmong_8gigs.md)
