# onda-hompage 작업 상태

> 자동 업데이트: 2026-04-02 KST

## 현재 작업
시간대별 광고 스케줄러 + 예산 기반 테스트 모드 + 성과 히트맵 — 완료 (2026-04-02)

### Phase 7: 시간대별 광고 스케줄러 — 완료 (2026-04-02)
- [x] Step 1: Supabase 테이블 생성 (kmong_ad_schedule 168슬롯, kmong_hourly_performance)
- [x] Step 2: ad-scheduler.js 신규 생성 (30분마다 시간대/요일별 광고 ON/OFF + 예산 연동 + 자동최적화)
- [x] Step 3: budget-monitor.js 수정 (테스트 모드 자동 전환: 잔여>50%+하반기→ON, <10%→OFF)
- [x] Step 4: 대시보드 시간대 스케줄 UI (7x24 그리드 토글, 프리셋 3종, CTR 히트맵, 자동최적화 토글)
- [x] Step 5: PM2 ecosystem 업데이트 (kmong-ad-scheduler */30 추가)

월간 광고 지출 한도 + 독립 명령 처리기 + 전체 크롤러 통합 검증 — 완료 (2026-04-02)

### Phase 6: 예산 모니터 + 명령 처리기 + 크롤러 검증 — 완료 (2026-04-02)
- [x] Step 1: Supabase `kmong_settings` 테이블 생성 (monthly_budget, budget_alert_threshold, auto_stop_on_budget)
- [x] Step 2: `budget-monitor.js` 신규 생성 (월간 지출 합산 → 90% 경고, 100% 자동정지)
- [x] Step 3: `command-processor.js` 신규 생성 (대시보드 → kmong_ad_commands → toggle-ad.js 독립 실행)
- [x] Step 4: 대시보드 광고 제어/설정 탭 추가 (예산 프로그레스바, 설정 UI, 광고 토글, 명령 이력)
- [x] Step 5: PM2 ecosystem 업데이트 (budget-monitor 2시간, command-processor 5분)
- [x] Step 6: 전체 크롤러 통합 테스트 (CPC 14건, 주문 2건, 매출 월별3+거래5건, 서비스상태 1건 — 전부 정상)

크몽 텔레그램 광고제어봇 + 대시보드 UI토글 + AI 자동응답 강화 — 완료 (2026-04-02)

### Phase 5: 텔레그램 봇 + 광고제어 + 자동응답 강화 — 완료 (2026-04-02)
- [x] Step 1: Supabase `kmong_ad_commands` 테이블 생성 (RLS + anon 정책)
- [x] Step 2: `telegram-bot.js` 신규 생성 (광고on/off, 매출, 서비스상태, 대시보드 큐 폴링)
- [x] Step 3: `lib/reply-generator.js` 강화 (복수질문 대응, 점수기반 서비스감지, 거래데이터 참조, 품질점수)
- [x] Step 4: `auto-reply.js` 강화 (거래통계 참조, 품질점수 산정, needs_review 상태)
- [x] Step 5: 대시보드 v3.1 (광고제어탭 + 자동응답탭 + 사이드바 서비스상태 위젯)
- [x] Step 6: PM2 ecosystem 업데이트 (kmong-telegram-bot 상시구동)

크몽 주문+광고토글+심사상태+일자별매출 통합 구현 — 완료 (2026-04-02)

### 크몽 주문+광고토글+심사상태+매출분석 — 완료 (2026-04-02)
- [x] Step 1: Supabase 스키마 변경 (buyer_name, service_name, ad_enabled 칼럼 + kmong_gig_status 테이블)
- [x] Step 2: crawl-orders.js 개선 (buyer_name, service_name 추출 추가)
- [x] Step 3: crawl-cpc.js 개선 (ad_enabled ON/OFF 상태 수집)
- [x] Step 4: toggle-ad.js 신규 생성 (광고 ON/OFF 토글 제어, 모듈화)
- [x] Step 5: crawl-gig-status.js 신규 생성 (서비스 심사 상태 크롤러 + 텔레그램 경고)
- [x] Step 6: 대시보드 매출 분석 탭 추가 (일자별 바차트, 서비스별 도넛, 수익금 차트, 주문내역 테이블)
- [x] Step 7: PM2 ecosystem + package.json 업데이트
- [x] Step 8: 디버그 파일 정리 + Git commit + push

크몽 Phase 3-4: AI 콘텐츠 생성 + A/B 테스트 + 학습 루프 + 인박스 AI — 완료 (2026-04-02)

### 크몽 Phase 3-4 — 완료 (2026-04-02)
- [x] Step 1: setup-phase3-db.js — Supabase 스키마 확장 (kmong_patterns, kmong_ab_tests, kmong_content_generated, kmong_inbox_classification + 시드 6건)
- [x] Step 2: lib/content-generator.js — AI 콘텐츠 생성 엔진 (저성과 서비스 식별, 패턴 기반 타이틀/설명 생성)
- [x] Step 3: lib/ab-test-manager.js — A/B 테스트 프레임워크 (생성, 지표 업데이트, Z-test 유의성 판정)
- [x] Step 4: lib/learning-loop.js — Phase 4 학습 루프 (A/B 결과 → 패턴 DB 반영 + 답변 학습 + 저신뢰 패턴 정리)
- [x] Step 5: lib/inbox-optimizer.js — 인박스 AI (메시지 분류/우선순위/감정분석/의도파악/AI 답변 생성)
- [x] Step 6: 대시보드 v3.0 — 7탭 (기존 4탭 + AI 콘텐츠 관리 + A/B 테스트 + 인박스 AI)
- [x] Step 7: PM2 ecosystem + package.json v3.0 업데이트 (크론 3개 추가)
- [x] Step 8: 구문 검증 + Git commit + push

크몽 Phase 2: 자동 분석 엔진 + 자동 답장 시스템 — 완료 (2026-04-02)

### 크몽 Phase 2 — 완료 (2026-04-02)
- [x] Step 1: setup-db.js — Supabase 스키마 마이그레이션 (5테이블 + 시드 3건)
- [x] Step 2: lib/analyzer.js — 퍼널분석, 병목진단, ROI, 이상감지, 비즈머니예측
- [x] Step 3: analyze-daily.js — 매일 9시 일간 리포트 텔레그램 발송
- [x] Step 4: lib/reply-generator.js — 문의분석, 템플릿선택, 견적생성
- [x] Step 5: auto-reply.js — 신규문의 자동답변 + 텔레그램 미리보기
- [x] Step 6: auto-quote.js — 고객답변 기반 자동견적 + 텔레그램 미리보기
- [x] Step 7: send-reply.js — 승인된 답변 크몽 Playwright 자동발송
- [x] Step 8: lib/reply-optimizer.js — 답변 학습엔진 (전환율 추적/랭킹)
- [x] Step 9: PM2 ecosystem + package.json 업데이트
- [x] Step 10: 구문검증 + Git commit + push

크몽 Playwright 자동 크롤러 Phase 1 — 완료 (2026-04-02)

### 크몽 자동 크롤러 Phase 1 — 완료 (2026-04-02)
- [x] Step 1: 프로젝트 초기 설정 (package.json, npm install, 디렉토리 구조)
- [x] Step 2: 공통 모듈 (supabase.js, product-map.js, telegram.js)
- [x] Step 3: 로그인 헬퍼 (login.js — 모달 로그인 + 쿠키 캐싱)
- [x] Step 4: crawl-cpc.js (클릭업 CPC 광고 데이터 14건 수집 성공)
- [x] Step 5: crawl-inbox.js (메시지함 문의 데이터 수집 성공)
- [x] Step 6: crawl-orders.js (판매관리 주문 데이터 수집 성공)
- [x] Step 7: PM2 ecosystem config 생성
- [x] Step 8: 테스트 + Git commit + push

크몽 CPC 대시보드 결제전환율+ROI 추적 업그레이드 — 완료 (2026-04-02)

### LEX & PARTNERS 법률사무소 — 완료 (2026-03-30)
- [x] Step 1: index.html Part 1 (Head + CSS 전체 — 변수, 베이스, 컴포넌트, 인터랙션, 반응형, 1502줄)
- [x] Step 2: index.html Part 2 (HTML: 헤더 + 히어로 + 섹션2 소개)
- [x] Step 3: index.html Part 3 (HTML: 섹션3 전문분야 사이드스크롤 + 섹션4 변호사팀)
- [x] Step 4: index.html Part 4 (HTML: 섹션5 타임라인 + 섹션6 실적 + 섹션7 상담/푸터)
- [x] Step 5: index.html Part 5 (JavaScript 전체 — 17개 인터랙션 함수)
- [x] Step 6: 검증 (이미지 4개 200OK, 앵커6개 매칭, 한글폰트 안전) + Git commit + push

### LÚMINE 뷰티클리닉 포트폴리오 — 완료 (2026-03-30)
- [x] Step 1: index.html Part 1 (Head + CSS 전체 — 뉴모피즘, 에디토리얼, 반응형)
- [x] Step 2: index.html Part 2 (HTML: 프리로더 + 헤더 + 네비 + 히어로 + 이벤트)
- [x] Step 3: index.html Part 3 (HTML: 시술탭 + B/A슬라이더 + 의료진)
- [x] Step 4: index.html Part 4 (HTML: 시설 + 오시는길/연락처 + 푸터 + 플로팅)
- [x] Step 5: index.html Part 5 (JavaScript 전체 — 타이핑, 탭, 슬라이더, SVG, 스크롤)
- [x] Step 6: 검증 (이미지 URL 15개 200 확인, 404 2개 교체 완료)
- [x] Step 7: Git commit + push

### LÚMINE 세부 디자인 요소 업그레이드 — 완료 (2026-03-30)
- [x] Step 1: CSS 추가 (Great Vibes 폰트, 필기체/워터마크/곡선/그라데이션/광원/마커/프로그레스 스타일)
- [x] Step 2: HTML 장식 요소 배치 (6개 필기체 디바이더, 4개 워터마크, 4개 SVG 곡선, 그라데이션 텍스트, 하이라이트 마커)
- [x] Step 3: JavaScript 인터랙션 (스크롤 프로그레스, 앰비언트 라이트, 워터마크 패럴랙스, 하이라이트 마커 옵저버)
- [x] Step 4: 검증 + Git commit + push

### GLOW 더마 클리닉 포트폴리오 — 진행 중 (2026-03-30)
- [x] Step 1: index.html Part 1 (Head + CSS + Hero + Treatment + B/A 섹션)
- [x] Step 2: index.html Part 2 (Skin Map + Doctor + Space/Review + Reserve/Footer)
- [x] Step 3: index.html Part 3 (JavaScript 전체 — 슬라이더, 스크롤, 맵, 카운터)
- [x] Step 4: 검증 (이미지 URL 19개 200 확인, 404 교체 완료)
- [x] Step 5: Git commit + push

### 경락당 한의원 포트폴리오 — 완료 (2026-03-30)
- [x] Step 1: styles.css (CSS 변수, 리셋, 타이포, 전체 섹션 스타일, 애니메이션, 반응형, 1768줄)
- [x] Step 2: index.html (7섹션 + 인라인 CSS/JS, 2747줄)
- [x] Step 3: script.js (패럴랙스, 아코디언, 스티키, 스크롤 리빌, 프로그레스 서클, 261줄)
- [x] Step 4: 검증 (12개 이미지 200 확인, 앵커링크 확인, 반응형 4단계)
- [x] Step 5: Git commit + push

### NOIR 칵테일 바 포트폴리오 — 완료 (2026-03-29)
- [x] Step 1: styles.css (CSS 변수, 리셋, 타이포, 커스텀 커서, 섹션 스타일, 애니메이션, 1463줄)
- [x] Step 2: index.html (7섹션 + 풀스크린 오버레이 내비 + 로더, 415줄)
- [x] Step 3: script.js (커서 글로우, 블롭 모핑, 텍스트 스크램블, 플로팅, 스냅 스크롤, 379줄)
- [x] Step 4: 반응형 CSS 미디어쿼리 (375/768/1024/1440px, 클립서클 모바일 폴백)
- [x] Step 5: 검증 (3뷰포트 스크린샷, 이미지 URL 200 확인, 가로스크롤 없음)
- [x] Step 6: Git commit + push

### KURO 오마카세 포트폴리오 — 완료 (2026-03-29)
- [x] Step 1: styles.css (CSS 변수, 리셋, 타이포, 전체 섹션 스타일, 1543줄)
- [x] Step 2: index.html (전체 7섹션 + 로더 + pill nav, 422줄)
- [x] Step 3: script.js (12개 인터랙션 함수, 487줄)
- [x] Step 4: 반응형 CSS 미디어쿼리 (480/768/1024/1440px)
- [x] Step 5: 검증 (4개 뷰포트 스크린샷, 11개 이미지 URL 200 확인, 가로스크롤 없음)
- [x] Step 6: Git commit + push

### 클린파트너 세탁공장 홈페이지 — 완료 (2026-03-28)
- [x] Step 1: styles.css (CSS 변수, 반응형 5단계, 전체 컴포넌트)
- [x] Step 2: script.js (히어로 슬라이더, 탭, 아코디언, 카운터, 스크롤 리빌, 모달, CMS)
- [x] Step 3: index.html (히어로+탭+카운터+타임라인+마키+CTA)
- [x] Step 4: service.html (서브히어로+아코디언+스플릿+CTA배너)
- [x] Step 5: contact.html (서브히어로+견적폼+연락처+지도+FAQ)
- [x] Step 6: admin.html (CMS 8패널, 비밀번호, KV 연동)
- [x] Step 7: Playwright 스크린샷 검증 (375/1440px × 3페이지)

### 시그니처펍스 CMS — 진행 중 (2026-03-26)
- [ ] Step 1: cms.html Head + CSS + Admin Bar + HTML 섹션 구조 (data-cms 속성 포함)
- [ ] Step 2: CMS JavaScript 엔진 (저장/로드, 인라인편집, 섹션컨트롤, 테마, SEO, 내보내기)
- [ ] Step 3: 펫샵 특화 CMS 기능 (강아지/후기 관리, 연락처 편집)
- [ ] Step 4: 검증 + 커밋 + 푸시

### 마르다누수탐지 피드백 18개 항목 수정 + contact.html — 완료 (2026-03-26)
- [x] 누수 유형 카드 4개에 실제 사진 삽입 (photo-1, 18, 14, 11)
- [x] 서비스 카드 좌우 여백 통일 (padding 20px/32px)
- [x] 장비 카드 4개에 실제 사진 삽입 + 컴팩트 레이아웃 (photo-15, 20, 24, 18)
- [x] 전화번호 줄바꿈 방지 (white-space: nowrap)
- [x] 히어로 정확히 100vh + 상단 여유 padding
- [x] 스크롤 인디케이터/카카오 버튼 겹침 방지 (bottom 조정)
- [x] 증상 카드 모바일 폰트 축소 (0.85rem)
- [x] 서비스 아코디언 사진 교체 (photo-20, 22, 17, 19)
- [x] 햄버거 메뉴 3개로 정리 (홈/서비스 안내/상담 문의)
- [x] 메뉴 오버레이 불투명도 강화 (rgba(10,22,40,0.95))
- [x] contact.html 제작 (폼 + 원클릭콜 + 카카오 + 지도 + 사업자정보)
- [x] body padding-bottom 80px (모바일 CTA 바 가림 방지)
- [x] service.html lazy-loading 제거

### 마르다누수탐지 scroll-reveal 빈공백 수정 — 완료 (2026-03-26)
- [x] initScrollReveal() 인라인 opacity → CSS 클래스 방식(.js-scroll-reveal + .revealed) 전환
- [x] above-fold 요소 즉시 revealed (동기적), below-fold만 IntersectionObserver
- [x] CSS: 기본 opacity:1, .js-scroll-reveal로 숨김→.revealed로 표시
- [x] 스크린샷 검증 (375/768/1440px) 빈공백 해결 확인

### 마르다누수탐지 반응형 대규모 수정 — 완료 (2026-03-26)
- [x] text-scrub 300vh → auto (빈 공백 제거, sticky → relative)
- [x] fade-in 기본 visible 처리 (JS 인라인 애니메이션으로 변경, 뷰포트 아래만 숨김)
- [x] 반응형 미디어쿼리 강화 (768px/480px/375px)
- [x] 인라인 padding:96px 모바일 오버라이드 (!important)
- [x] container/trust/process max-width 확대 (960→1080)
- [x] text-scrub JS: 스크롤 기반 → IntersectionObserver 기반 애니메이션
- [x] 스크린샷 검증 (375px, 768px, 1440px)

### 마르다누수탐지 사진-텍스트 매칭 수정 — 완료 (2026-03-25)
- [x] 히어로 배경: photo-11 → photo-15 (전문 장비 세트)
- [x] 서비스 카드 3개 사진 교체 (photo-20, photo-10, photo-19)
- [x] 비포/애프터: Before photo-10 → photo-17 (지하 배관 누수)
- [x] 시공사례 갤러리: photo-17→photo-18, photo-20→photo-24
- [x] CSS: aspect-ratio 4/3 + min-height 250px + object-position center
- [x] service.html 갤러리 라벨 7개 실제 사진 내용으로 수정
- [x] 모든 img alt 텍스트 실제 사진 내용에 맞게 수정

### 마르다누수탐지 QA 디버깅 패치 — 완료 (2026-03-25)
- [x] CSS: overflow-wrap: break-word 추가
- [x] CSS: prefers-reduced-motion 미디어쿼리 추가
- [x] index.html: img 8개 width/height 속성 추가 (CLS 방지)
- [x] service.html: img 11개 width/height 속성 추가 (CLS 방지)
- [x] 검증: tel 링크, 카카오톡 링크, 네비 상호 링크, 가로스크롤 방지 확인
- 기존 적용 확인: box-sizing, overflow-x, word-break, font-fallback, scroll-behavior

## 진행 상황

### 마르다누수탐지 메인 페이지 — 완료
- [x] Step 1: 디렉토리 구조 생성
- [x] Step 2: styles.css (베이스 스타일, 변수, 반응형)
- [x] Step 3: js/main.js (인터랙션)
- [x] Step 4: index.html - Head + Hero + 텍스트 스크러빙
- [x] Step 5: index.html - 서비스 + 시공 과정
- [x] Step 6: index.html - 비포/애프터 + 신뢰 + CTA + 푸터
- [x] Step 7: 최종 검증 + 커밋 + 푸시

### 이전 완료
- 마르다누수탐지 서비스 페이지 (service.html 1252줄) — 완료
- 마르다누수탐지 메인 페이지 (index.html 1501줄) — 완료
- 마드모아젤헤어 제안서 PPT 초안 + 고도화 + 페이지번호/목차 — 완료
- car-type2 보험/할부 기능 추가 — 완료
- car-type2 정상화 — 완료
- used-car 정상화 — 완료

### 마르다누수탐지 서비스 페이지 — 완료
- [x] Step 1: service.html Part 1 (Head + Nav + Sub Hero + 서비스 아코디언)
- [x] Step 2: service.html Part 2 (보유 장비 + 시공 갤러리 + CTA + 푸터 + JS)
- [x] Step 3: Git commit + push

### 크몽 CPC 대시보드 업그레이드 — 완료 (2026-04-02)
- [x] CPC탭: 결제수/문의→결제%/CPA/ROI 컬럼 추가
- [x] CPC탭 KPI: 결제 전환율 추가
- [x] 퍼널탭: 6단계 퍼널 (노출→클릭→문의→견적→결제→매출)
- [x] 퍼널탭: 서비스별 전환율 테이블 (매출/CPA/ROI 포함)
- [x] ROI 분석 탭 신규 (광고비vs매출 차트, CPA랭킹, 월간추이, 비즈머니잔액)
- [x] 데이터 초기화 버튼 (3월 CPC 14서비스 + 문의 12건 + 주문 3건)
- [x] Git commit + push

## 다음 단계
PM2 재등록 필요: `pm2 start kmong-cron-ecosystem.config.js`
시간대별 성과 데이터 축적 후 자동최적화 기능 효과 검증

## Git 상태 (자동)
- **브랜치**: main
