# MEMORY.md — 장기 기억

## 온다마케팅 사업 핵심 (영구)
- 네이버 플레이스 상위노출 실행사. 5위 이내 보장.
- N2가 핵심 순위 지표. N1=저품질판별, N3=무시.
- 매체: 말차/퍼플페퍼신규/뭉치 (리워드사, 1타당 과금)
- 블로그: 크림/피카소/원픽(실계1,3)
- 2주 로테이션 필수 (동일매체 지속 시 작업 감지)
- 업종별 로직 다름 (맛집/술집/카페는 완전 별개)
- 결제: 30일 단위 25일 보장, 미달 시 연장
- 팀: 관리자+직원1 = 2명, 업체 40개 미만
- AdLog: 외부 스크래핑 서비스 (순위/N1/N2/N3)
- 상세: /home/onda/projects/onda-logic-monitor/BUSINESS_CONTEXT.md 참조

## 매체 타수 규칙 (영구)
- 기본: 100타 단위 (말차, 뭉치, 블루 등)
- 퍼플페퍼: 50타 단위 가능
- 퍼플페퍼신규: 주문 100타, 미션유형별 50타 분할 (길찾기/메뉴유입/영업시간유입)
- 길찾기 = 별도 트래픽, 유입(메뉴/영업시간) = 별도 트래픽
- 퍼플페퍼신규만 미션유형 세분화 가능

## 상태 판단 로직 (2026-03-02 변경)
- 🟢 안정: rank ≤ 5 + N2 유지/상승
- 🟡 정상: rank > 5이지만 N2·순위 안정적 상승 추세
- 🟠 주의: rank > 5 + N2 정체
- 🔴 위기: N2 4일 연속 하락 또는 rank > 10
- **순위 낮아도 추세 상승이면 위기가 아님**

## onda-youtube-investment 영구 규칙
- **팩트체크 100% 정확도 필수** — 정보성 투자 영상에서 틀린 데이터 0건이 목표. 영상 제작 전 반드시 팩트체크 완료 후 제작.
- **파이프라인 순서**: 사전조사(Yahoo Finance+웹검색) → 스크립트 생성(검증 데이터 주입) → 사후 팩트체크(수치 1:1 비교, 불일치 시 자동수정 루프 3회) → TTS → 렌더 → 업로드
- **데이터 소싱**: Yahoo Finance API (핀란드 서버에서 KRX/Naver 접근 차단됨)
- **미상장 종목**: 매수 권유 절대 금지, "IPO 추진 중"으로만 표기
- **YouTube 공개 설정**: 항상 public (비공개/일부공개 금지)
- **텔레그램 보고**: 그룹 -1003855690620으로 파이프라인 단계별 보고
- **제작 가이드**: docs/YOUTUBE_PRODUCTION_GUIDE.md 준수

## 관리자 영구 규칙
0. **이해 안 되는 건 항상 질문** — 추측하지 말고 물어볼 것
1. **할 수 있는 건 직접 해** — Supabase, 빌드, 배포 등 가능한 건 먼저 시도. 안 되면 그때 요청.
2. **억지로 개선하지 마** — 개선사항은 제안만. 대체제 함께 제시.
3. **정말 관리자만 가능한 것만 요청** — SSH 키 등록, 결제, 외부 서비스 인증 등.
2. **요청 전부 기록** — 한 번 말한 건 다시 안 물어보게 md + git + 메모리 저장.
3. **백그라운드 → 서버로** — 개발/대화 외 백그라운드 작업은 Vercel Cron 등 서버에서 구동. 토큰 절약.
4. **코딩은 Claude Opus 4.6에 위임** — 직접 코딩 X, coding-agent 스킬로 위임.
5. **작업완료 = 테스트+디버깅 완전 완료** — 코드 작성만으로 끝이 아님. 반드시 테스트→디버깅→재테스트 무한 반복 후 완전히 동작 확인된 것만 작업완료. 사용자에게 테스트 떠넘기지 말 것.

## 프로젝트 현황 (2026-02-28)

### onda-logic-monitor
- GitHub: didai64595021-ui/onda-logic-monitor
- Vercel: https://onda-logic-monitor.vercel.app
- Supabase: byaipfmwicukyzruqtsj
- PM2: onda-crawler-scheduler (크롤링 16시/20시, AI분석 08시)
- Vercel Cron: crawl-next (매2분 7-11시), daily-analysis, community-crawl (06시)
- 커뮤니티 크롤러: 아이보스 + 셀클럽 → community_signals 테이블 → 기존 데이터에 통합
- 클라이언트 포털 버그: 경쟁사 쿼리 snapshot_date=today → 최근 날짜로 수정 필요

### onda-hompage
- GitHub: didai64595021-ui/onda-hompage
- 현재 브랜치: feature/gumibear012_20250514_detail_responsive
- draft-1~10 폴더 submodule 경고 → 정리 필요

### onda-coldmail
- GitHub: didai64595021-ui/onda-coldmail
- UIUX 타겟 크롤링 완료

### onda-youtube-investment
- GitHub: didai64595021-ui/onda-youtube-investment
- PM2 구동 중, tsup 빌드로 OOM 해결

### onda-youtube-automation / onda-test
- 초기 상태

## 서버 환경
- 호스트: ubuntu-4gb-hel1-3 (핀란드 Hetzner)
- IP: 핀란드 — 한국 커뮤니티 크롤링 시 차단 가능성 있음
- 유저: onda (sudo 권한 없음, no-new-privileges 컨테이너 제한)
- 관리자가 권한 열어주기로 함

## 관리자 정보
- 텔레그램 ID: 7383805736
- 이름: 000 (@gumibear012)
- 성격: 시원시원, "알아서" 하는 걸 좋아함
- 한 번 말한 거 반복 싫어함

## 🎯 최종 목적 (절대 불변)
- **네이버 플레이스 순위 상승 로직을 발견하고, 관리업체의 순위를 올리는 것**
- 모든 기능(크롤링, 특이사항 감지, 상관관계 분석, 자동학습)은 이 목적을 위한 수단
- 데이터 수집 → 패턴 발견 → 로직 추론 → 실행 → 검증 → 순위 상승
- "로직 발견 + 순위 상승 가능 상태 유지"가 본질

## 작업 완료 보고서 규칙 (영구, 전 프로젝트)
- 모든 작업 완료 시 반드시: 보고서(작업/상태/소요/파일/커밋/빌드/배포) + 개선점 제안(최소 1개)
- "개선점 없음" 불가, 구체적으로 (파일명, 방법, 효과)
- "완료했습니다"만 보내기 금지
- Claude Code 서브에이전트에도 동일 적용
- 2026-03-02 관리자 지시로 전 프로젝트 AGENTS.md에 추가 완료

## 컴팩션 자동복구 시스템 (2026-03-02, 영구)
- 스크립트: `/home/onda/scripts/compaction-recovery.sh`
- 작업 상태 저장: `/home/onda/logs/active-tasks/<project>.json`
- Claude Code 투입 시 반드시 register → 완료 시 complete
- 컴팩션/세션 재시작 시 check → 미완료 있으면 자동 재개
- 전 프로젝트 AGENTS.md + HEARTBEAT.md에 규칙 추가 완료
