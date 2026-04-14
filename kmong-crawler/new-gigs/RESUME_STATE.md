# 크몽 55상품 재개 상태 (2026-04-15 02:00 KST)

> 트리거: 사용자가 "크몽스"라고 입력하면 이 문서 + `KMONG_CONTEXT.md` 읽고 즉시 이어서 진행.

## 사용자 누적 지시 (이전 세션)
1. **이미지 재생성 금지** — 이미 제작된 55개 썸네일(1304x976) 그대로 사용
2. **본문·소제목·볼드를 썸네일 텍스트에 맞춤** — API 비용 0, 정렬만
3. **임시저장까지만 자동** — 실제 발행은 사용자 수동
4. **묻지 말고 알아서 처리** — 최종 완료 후 텔레그램 보고
5. **CPC 키워드 직접관리** — 니치 매칭만 유지, 광범위 버림
6. **업종 월 5개 신규 확장** — 검증 실패 20% 즉시 교체
7. **2인 실무 팀 체제** (사용자 + 관리자급, 마케팅·사업 경험)
8. **Claude Code 자동화로 공수 해결** — 공급 캡 무제한 가정

## 완료 (이번 세션, 2026-04-15 01:30~02:00 KST)
- [x] 실측 기반 6개월 매출 예측 v1~v6 (메모리: `project_kmong_6m_strategy.md`)
- [x] 크몽 시장 규모 현실성 판정 (IT카테 월 37억, 상위 0.3%까지 도달 가능)
- [x] 55상품 하네스 전수 점검 (글자수 한도/구 AI모델/썸네일 규격 모두 통과)
- [x] **금지키워드 일괄 치환 73건**:
  - 네이버 52건 → 포털/오픈마켓/지도 등 문맥별
  - 보장 11건 → 관리/처리/목표
  - 상위·상단 4건 → 최적화
  - 진입 5건 → 도달
  - 자연스러운 1건 → 꼼꼼한
  - 재검증: 전부 0건 clean
- [x] 백업: `gig-data-55.js.bak-0159`

## 블로커 (이어서 처리)
### 1순위 — 금지키워드 치환본 draft 재푸시
- 현재: `gig-data-55.js` 파일만 치환됨. 크몽 55 draft는 구 내용 (네이버/보장 등 48건+11건 그대로)
- 실행: `node update-body-v1.js` (Playwright로 55건 본문/절차/준비사항 덮어쓰기)
- 예상: 50~90분, 중간 실패 시 재시도 로직 내장
- 로그: `update-body-report.json` 갱신

### 2순위 — 필드 NG 0/55 수정 (검증 리포트 실측)
- `verify-fields-report.json` 기준 전 상품 실패 필드:
  - `priceInputs` 0/0 filled (55건) — 가격 주입 안 됨
  - `workPeriod` (55건) — 작업기간
  - `revise` (55건) — 수정횟수
  - `packageTextareas` 5/6 (13건) — 일부 패키지 설명 비어있음
- 필요: `fill-pricing-v1.js` 신규 작성 (`recon-full-fields.json` 셀렉터 활용)
  - 각 상품 `packages[].price`, `packages[].days`, `packages[].revisions` 주입
  - Step2 페이지 셀렉터: `input[name="package_price_STD"]`, `input[name="package_days_STD"]` 등 (정찰 파일 재확인)

### 3순위 — 썸네일 visible 0/55 원인 수정
- `verify-thumbnails.js` 셀렉터가 실제 업로드된 이미지 탐지 실패
- 실제 파일(55-01~55.png, 1304x976)은 업로드 완료됨 → 검증 로직만 수정
- 셀렉터 후보: `.uploaded-image img`, `img[src*="cloudfront"]`, `.gig-main-image`
- 1건 수동 확인 후 셀렉터 픽스

### 4순위 — 썸네일↔본문 카피 정렬 (API 0원, 사용자 핵심 지시)
- 썸네일 베이크된 텍스트(실측):
  - 헤드라인 = `55-products.json` 의 `name` 첫부분 (`extractHeadline` 로직)
  - 서브 = `selling_point` 첫 조각
  - 타겟 배지 = `target` 첫 단어
  - 가격 = min price "만원부터"
- `gig-data-55.js`의 `title`이 위 헤드라인과 일치하는지 diff 스크립트 → 불일치 시 본문 상단/첫 볼드 교체
- 신규: `align-body-to-thumb.js` (dry-run → diff 보고 → 푸시)

### 5순위 — 최종 QA + 수동 발행 가이드
- 각 상품 draft URL 리스트 (`55-run-log.json` 내 draftId 참조)
- 체크리스트: 금지어 0 / 썸네일 렌더 / 가격 채움 / 작업기간 / 패키지 / FAQ / 카테고리 ID
- 텔레그램에 통합 리포트 + draft URL 55건 전달 → 사용자가 직접 발행 버튼 클릭

## 이어갈 때 첫 액션
1. `git log -5 --oneline` 로 이 커밋 확인
2. 1순위 실행: `cd /home/onda/projects/onda-hompage/kmong-crawler/new-gigs && nohup node update-body-v1.js > /tmp/kmong-body-rerun.log 2>&1 &`
3. 진행 중 2순위 스크립트 작성 (`fill-pricing-v1.js`) 병행
4. 완료 후 verify 재실행 → 100% 통과 확인 → 텔레그램 통합 보고

## 참조 파일
- 하네스: `../KMONG_CONTEXT.md`
- 메모리: `project_kmong_6m_strategy.md`, `reference_kmong_banned_keywords.md`, `reference_kmong_gig_creation.md`, `feedback_kmong_finish_checklist.md`
- 실측 리포트: `verify-fields-report.json`, `verify-thumbnails-report.json`, `update-body-report.json`, `55-progress.json`, `cleanup-all-drafts-report.json`
