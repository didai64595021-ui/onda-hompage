# onda-hompage 작업 상태

> 자동 업데이트: 2026-04-03 KST

## 현재 작업
크몽 RPA 전체 복구+강화 (3단계 에이전트 루프)

### Sprint 1: 크몽 로그인 수정 + 크롤러 복구
- [ ] Step 1-1: login.js 수정 (/biz 리다이렉트 + 모달 처리 + 셀렉터 강화)
- [ ] Step 1-2: 로그인 테스트 실행 + 쿠키 갱신
- [ ] Step 1-3: PM2 전체 프로세스 재가동 + 검증

### Sprint 2: 기술부채 전수 해소
- [ ] Step 2-1: ad-scheduler.js KST 타임존 수정
- [ ] Step 2-2: analyzer.js 결제율 계산 수정 (진행중 제외)
- [ ] Step 2-3: crawl-gig-status.js 중복 방지 (upsert)
- [ ] Step 2-4: content-generator.js 패턴 테이블 시드 데이터
- [ ] Step 2-5: command-processor.js 동시성 제어 + 타임아웃
- [ ] Step 2-6: telegram.js 에러 핸들링 강화
- [ ] Step 2-7: supabase.js URL 환경변수화
- [ ] Step 2-8: 크롤러 전체 에러핸들링 강화

### Sprint 3: AI 자동관리 + 예산 관리 실동작 구현
- [ ] Step 3-1: 예산 설정 Supabase 저장/로드 (RLS 우회)
- [ ] Step 3-2: AI 자동관리 ON/OFF 실동작 (서비스별 모드 관리)
- [ ] Step 3-3: CTR/ROI 기반 입찰 자동조정 로직 강화
- [ ] Step 3-4: 주/월 단위 예산 분배 + 서비스별 최적 배분
- [ ] Step 3-5: 대시보드 예산 UI 연동 (저장/로드/표시)

### Sprint 4: OpenClaw 연동 + adlog 업체 정리
- [ ] Step 4-1: OpenClaw로 adlog.kr 접속 + 그룹 "기본" 아닌 업체 추출
- [ ] Step 4-2: 추출된 업체 목록 하드코딩 + 대시보드 매칭
- [ ] Step 4-3: 8080 대시보드 비매칭 업체 제외 처리

### Sprint 5: 크몽 전 기능 RPA + 통합 테스트
- [ ] Step 5-1: 소재 변경 RPA (타이틀/썸네일 자동 교체)
- [ ] Step 5-2: 상세페이지 관리 RPA
- [ ] Step 5-3: 포트폴리오 관리 RPA
- [ ] Step 5-4: ROI/CTR 통합 최적화 루프
- [ ] Step 5-5: 전체 E2E 테스트 + 평가

## 이전 완료 작업
(Phase 1~8 전부 완료 — 2026-04-02)

## Git 상태 (자동)
- **브랜치**: main
