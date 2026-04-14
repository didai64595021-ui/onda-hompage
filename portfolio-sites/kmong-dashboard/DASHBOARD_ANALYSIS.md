# kmong-dashboard 분석 + 개선안 (2026-04-14 23:20 KST)

Agent 탐색 결과. 4/15 01:30 KST 배치에서 이 문서 기반 개선 적용.

## 파일 구조
- `index.html` (3,382줄) — 프로덕션, Supabase 연결
- `index-demo.html` (4,168줄) — 데모, 정적 데이터

## 데이터 소스
- **Supabase 우선** (kmong_products / kmong_cpc_daily / kmong_inquiries / kmong_orders / kmong_profits_summary 등 13개 테이블)
- **localStorage 폴백** (upsertSetting 함수)
- **Crawler 연동**: kmong-crawler/crawl-*.js 주기적 적재

## 55-run-log.json 통계
- 총 310회 실행 기록
- 성공: 61건 / 실패: 249건 (재시도 누적)

## 10개 탭
CPC · Funnel · Inquiry · ROI · Sales · Content · ABTest · Inbox · AdControl · AutoReply

## 불일치/갭
| 문제 | 영향 |
|------|------|
| 55 신규 등록 상품이 kmong_products에 동기됐는지 불명확 | 높음 |
| CPC 월 예산 80만원 소진률 시각화 없음 | 높음 |
| 월별·일별 매출 정산 vs 대시보드 값 불일치 가능성 | 중간 |
| 발행/대기/실패 서비스 카운트 사이드바 없음 | 중간 |
| 키워드별 CPC 입찰가 UI 없음 | 높음 |
| 모바일에서 55개 리스트 스크롤 불편 | 낮음 |

## 개선 우선순위
1. **서비스 관리 탭 신설** — Supabase: kmong_products + kmong_gig_status + kmong_cpc_daily + kmong_inquiries JOIN
2. **CPC 월 예산 위젯** (80만원 소진률 진행바, 일 소진 속도, 임계 경고) — 사이드바 상단
3. **서비스 상태 카운트 요약** (발행 N / 대기 N / 실패 N)
4. **데이터 동기 상태 표시기** (최종 갱신 N분 전, 1시간+ 경과시 경고)
5. **키워드별 CPC 입찰가 테이블** (AdControl 탭 내, kmong_cpc_keywords 테이블 신설)

## CPC 집행 계획
- 월 예산 80만원, 55 서비스 분산
- 소스: `https://kmong.com/seller/click-up?open_click_up_edit_modal={gigId}` 추천 키워드 모달
- 자동화: 각 서비스의 추천 키워드 + CPC 제안값 Playwright 수집 → kmong_cpc_keywords 저장
- 매출 발생 시 추가 집행 (ROI 기준 입찰가 상향)

## 01:30 배치 단계
`/home/onda/scripts/kmong-0130-batch.sh` 순차 실행:
1. cron-health-check (기존 크론 전체 + 재개)
2. 대시보드 v2 반영 (apply-v2.sh, 미작성 시 텔레그램 안내)
3. CPC 키워드 수집 Playwright (collect-cpc-keywords.js, 미작성 시 텔레그램 안내)
4. 통합 텔레그램 보고

## 본문 편집 가능성 확인
replace-image-v2의 쿠키 우회 플로우(listing → 편집하기 클릭)에서 이미지만 아니라 **#DESCRIPTION .ProseMirror 본문 TipTap도 편집 가능**. Ctrl+A → type → 임시 저장하기.
→ 용어 풀어쓰기·브랜드 포지셔닝 반영한 **신규 본문을 기존 55 draft에 직접 적용 가능** (재등록 불필요).
