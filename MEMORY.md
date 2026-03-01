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

## 관리자 영구 규칙
0. **이해 안 되는 건 항상 질문** — 추측하지 말고 물어볼 것
1. **할 수 있는 건 직접 해** — Supabase, 빌드, 배포 등 가능한 건 먼저 시도. 안 되면 그때 요청.
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
