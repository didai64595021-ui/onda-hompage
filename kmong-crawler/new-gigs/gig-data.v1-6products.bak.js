/**
 * 크몽 신규 등록 6개 상품 데이터 — create-gig.js 가 소비
 *
 * 스펙(02-product-specs/) 마크다운에서 핵심만 추출 + 크몽 폼 한도에 맞게 가공
 *  - 제목: ≤30자
 *  - 패키지 제목: ≤20자
 *  - 패키지 설명: ≤60자
 *  - 서비스 설명 본문: ≥100자, ≤20000자
 *  - 서비스 제공 절차: ≥50자
 *  - 의뢰인 준비사항: ≥50자
 *
 * 카테고리 (정찰 v2 결과 확정):
 *  - IT·프로그래밍 > 봇·챗봇
 *  - IT·프로그래밍 > 업무 자동화
 *  - IT·프로그래밍 > 맞춤형 챗봇·GPT
 */

const PRODUCTS = [
  // ─────────────────────────────────────────
  // 01. 텔레그램 카톡 알림봇 (저가 진입)
  // ─────────────────────────────────────────
  {
    id: '01',
    cat1: 'IT·프로그래밍',
    cat2: '봇·챗봇',
    image: '01-openai.png',
    title: '텔레그램 카톡 24시간 시세 뉴스 키워드 알림봇 제작',

    description: `내가 잘 때 PC가 일합니다. 시세 1초, 뉴스 1분, 매물 5분 — 텔레그램·카톡·디스코드로 즉시 알려드립니다.

✅ 5,000건+ 자동화 작업 경험 (광고·데이터 파이프라인 다년간 운영)
✅ 1년 무상 디버깅 — 사이트 구조가 바뀌어도 무료 패치 (Standard 포함)
✅ 소스코드 100% 양도 옵션
✅ 다중 채널 — 단일 봇으로 텔레그램·카톡·디스코드·슬랙 동시 발송
✅ 환각 0% — 사이트 원본 그대로 전달, 가공 X

[작업 가능 영역]
• 주식·코인·환율·금시세 (Yahoo Finance, 업비트 공개 API)
• 네이버·다음·구글 뉴스 키워드 감시
• 정부 R&D 공고, 나라장터 입찰
• 부동산 직방·다방·네이버부동산 신규 매물
• 본인 스마트스토어/쿠팡 리뷰·Q&A 알림
• 사내 시스템(자체 API/엑셀/구글시트) 알림

[작업 불가 — 정책 안전]
× 게임 매크로/오토, 자동매매(매수/매도), 어뷰징, 폐쇄 사이트 우회

[기술 스택] Python (asyncio) 또는 Node.js · Telegram Bot API · Kakao Channel · Discord Webhook · SQLite · Render/Railway/Cloudflare Workers`,

    progress: `1단계: 무료 30분 화상 상담 — 감시 대상·조건 정리
2단계: 견적서 + 작업 범위 확정
3단계: 안전결제 + 착수
4단계: 1차 데모(50%) — 알림 1건 시연
5단계: 피드백 → 수정
6단계: 최종 인도 + 사용 가이드 PDF
7단계: A/S (패키지별 14일~1년 무상 디버깅)`,

    preparation: `• 감시 대상 사이트 URL 또는 RSS 주소
• 알림 채널 (텔레그램 봇 토큰 또는 카톡 사업자 채널)
• 알림 조건 (가격 이상/이하, 키워드 포함, 시간대 등)
• 알림 받을 사용자 ID
• 본인 계정 한정 사이트면 로그인 정보 (NDA 가능)`,

    features: { tech: '고급', team: '1인', onsite: '상주 불가능', messenger: '텔레그램', botField: '알림' },

    packages: [
      { name: 'STANDARD', title: '감시 1종 + 알림 1채널',     desc: '감시 대상 1개, 알림 채널 1개, 5~30분 폴링, 1년 무상 디버깅 포함', price: 50000,  days: 3,  revisions: 2 },
      { name: 'DELUXE',   title: '감시 5종 + 멀티채널',       desc: '감시 5개까지, 알림 2채널, 1분 실시간 폴링, 무료 호스팅 1개월', price: 150000, days: 7,  revisions: 3 },
      { name: 'PREMIUM',  title: '무제한 + 관리자 페이지',    desc: '무제한 감시, 3채널, 자체 관리자 페이지, GPT 자연어 필터, 1개월 호스팅', price: 350000, days: 14, revisions: '제한없음' },
    ],
  },

  // ─────────────────────────────────────────
  // 02. 스마트스토어/쿠팡 모니터링 (셀러 도구)
  // ─────────────────────────────────────────
  {
    id: '02',
    cat1: 'IT·프로그래밍',
    cat2: '업무 자동화',
    image: '02-openai.png',
    title: '스마트스토어 쿠팡 가격 재고 24시간 자동 모니터링',

    description: `경쟁사가 가격 내리기 5분 전, 알아채세요. 1인 셀러를 위한 24시간 자동 가격·재고·리뷰 감시 도구입니다.

[자동 감시 항목]
• 본인 상품: 가격, 재고, 리뷰 신규/평점 변동, Q&A 신규
• 경쟁사 상품: 가격, 리뷰 수, 베스트 순위, 신상 등록
• 알림 채널: 텔레그램, 카톡(사업자 채널), 디스코드, 슬랙, 이메일
• 리포트: 일/주 단위 엑셀, 구글시트, 노션 자동 입력
• 그래프: 30일 가격 추세, 리뷰 평점 변화

[차별화]
✅ 셀러 본인 도구 — 정책 100% 안전 (어뷰징/매크로 아님)
✅ 다년간 자동화 노하우 — 광고 자동화·데이터 파이프라인 5종 운영 중
✅ 1년 무상 디버깅 — 스마트스토어/쿠팡 UI 변경 시 무료 패치
✅ API 미공개 영역도 Playwright 우회로 처리 가능
✅ 소스코드 100% 양도 (Premium 무료, Add-on 가능)

[작업 가능] 본인 상품 데이터 수집, 공개 상품 가격/리뷰 수집, 다나와·에누리 연동, 베스트 순위 추적
[작업 불가] 자동 가격 변경(약관 위반), 가짜 리뷰, 타인 셀러센터 무단 접근

[기술 스택] Python + Playwright · Supabase PostgreSQL · Google Sheets API · Telegram Bot · GPT-4 리뷰 감성 분석`,

    progress: `1단계: 무료 30분 화상 상담 (운영 상품 카테고리·경쟁사 리스트 수집)
2단계: 견적서 + 작업 범위 확정
3단계: 안전결제 + 착수
4단계: 1차 데모 — 본인 상품 알림 시연
5단계: 2차 데모 — 경쟁사 + 리포트
6단계: 최종 인도 + 1시간 화상 교육 + 가이드 PDF
7단계: A/S (Standard 14일, Deluxe 21일, Premium 30일 무상)`,

    preparation: `• 모니터링 대상 상품 URL 목록 (본인 + 경쟁사)
• 셀러센터 로그인 정보 (본인 상품 모니터링 시, NDA 가능)
• 알림 채널 (텔레그램 봇 또는 카톡 채널)
• 알림 조건 (가격 변동 % 이상, 재고 0 등)
• 리포트 받을 이메일/구글시트 주소`,

    features: { tech: '고급', team: '1인', onsite: '상주 불가능', messenger: '텔레그램', botField: '알림' },

    packages: [
      { name: 'STANDARD', title: '본인 상품 10개 1시간 감시', desc: '플랫폼 1개, 본인 상품 10개, 가격/재고/리뷰 알림, 1년 디버깅', price: 150000, days: 5,  revisions: 2 },
      { name: 'DELUXE',   title: '4개 플랫폼 + 경쟁사 추적',   desc: '4개 플랫폼, 본인 50개+경쟁사 30개, 5분 폴링, 일일 엑셀 리포트', price: 350000, days: 10, revisions: 3 },
      { name: 'PREMIUM',  title: '무제한 + 관리자 대시보드',   desc: '무제한 플랫폼·상품, 자체 대시보드, 리뷰 감성 분석, 화상 교육', price: 700000, days: 14, revisions: '제한없음' },
    ],
  },

  // ─────────────────────────────────────────
  // 03. 사내문서 + GPT 노코드 자동화
  // ─────────────────────────────────────────
  {
    id: '03',
    cat1: 'IT·프로그래밍',
    cat2: '업무 자동화',
    image: '03-openai.png',
    title: '사내문서 엑셀 PDF + GPT 업무자동화 노코드',

    description: `직원 1명이 하루 3시간 절약 = 월 150만 원 인건비 절감. 엑셀·PDF·사내문서 반복 업무를 GPT + 노코드로 완전 자동화합니다.

[자동화 가능 업무 (Before → After)]
• 송장 처리: PDF 열기 → 엑셀 입력 (5분) → PDF 업로드 → GPT 추출 → 자동 입력 (3초)
• 주간 보고서: 데이터 수집 → 분석 → 작성 (3시간) → 자동 수집 → GPT 요약 → 생성 (0분)
• 이메일 분류: 메일 확인 → 담당자 전달 (2분) → 수신 즉시 → GPT 분류 → 자동 전달
• 견적서 생성: 단가 조회 → 계산 → 포맷 (30분) → 이메일 → GPT 파싱 → 자동 생성 (30초)

[차별화]
✅ 노코드 + AI — Make/n8n 드래그앤드롭 → 비개발자도 직접 수정 가능
✅ 다년간 자동화 실전 경험 — 광고·데이터·AI 챗봇 5종 운영 중
✅ GPT + Claude 이중 활용 — 한국어는 Claude, 범용은 GPT-4
✅ 100% 소스 양도 — 모든 패키지 워크플로우 완전 양도
✅ n8n 자체호스팅 → 월 0원 운영 가능 (SaaS 구독료 없음)
✅ 비즈니스 API 사용 — 데이터를 모델 학습에 사용 안 함, 보안 안전

[지원 도구] Make · n8n · Zapier · Apps Script · GPT-4o · Claude 3.5 · 엑셀/구글시트/PDF/노션/에어테이블 · Slack/Telegram/이메일/카카오워크 · 구글드라이브/원드라이브/Dropbox/NAS`,

    progress: `1단계: 무료 30분 화상 상담 (업무 흐름 분석 + 자동화 대상 선정)
2단계: 워크플로우 설계서 제출 (플로우차트 + 예상 효과)
3단계: 안전결제 + 착수
4단계: 1차 데모 — 핵심 워크플로우 1개 시연
5단계: 피드백 → 수정 + 추가 워크플로우
6단계: 최종 인도 + 교육 (텍스트/영상/화상)
7단계: A/S (Standard 14일, Deluxe 21일, Premium 30일)`,

    preparation: `• 자동화하고 싶은 업무 설명 (예: 송장 PDF 처리, 주간 리포트)
• 사용 중인 도구 (엑셀/구글시트/노션/슬랙/이메일 등)
• 데이터 샘플 (PDF 1~3개, 엑셀 양식 등)
• Make/n8n 사용 의향 + 무료 vs 자체호스팅 선호
• OpenAI 또는 Anthropic API 키 (없으면 안내 제공)`,

    features: { tech: '고급', team: '1인', onsite: '상주 불가능', messenger: '텔레그램', botField: '알림' },

    packages: [
      { name: 'STANDARD', title: '워크플로우 1개 노코드',     desc: '워크플로우 1개, 데이터 소스 1개, GPT 1개, Make 또는 n8n 택1', price: 200000,  days: 5,  revisions: 2 },
      { name: 'DELUXE',   title: '워크플로우 3개 + 스케줄',   desc: '워크플로우 3개, 소스 5개, 스케줄 자동 실행, 영상 매뉴얼, 호스팅 1개월', price: 600000,  days: 10, revisions: 3 },
      { name: 'PREMIUM',  title: '풀스택 + 관리자 대시보드',  desc: '워크플로우 무제한, 풀 커스텀 GPT, 자체 대시보드, 화상 교육 1시간', price: 1500000, days: 14, revisions: '제한없음' },
    ],
  },

  // ─────────────────────────────────────────
  // 04. PDF 1개 AI 상담봇 (저가 미끼)
  // ─────────────────────────────────────────
  {
    id: '04',
    cat1: 'IT·프로그래밍',
    cat2: '맞춤형 챗봇·GPT',
    image: '04-openai.png',
    title: 'PDF 1개로 만드는 24시간 AI 상담봇 5분 답변',

    description: `PDF 1개만 주세요. 3일 후, 24시간 응답하는 AI 직원이 생깁니다. 5.9만 원부터, 코딩 0, 설치 1분.

[작동 원리]
1. PDF 업로드 → 회사소개서, FAQ, 상품 카탈로그, 매뉴얼
2. AI 학습 → Claude가 문서를 이해하고 벡터 임베딩 저장 (RAG 기술)
3. 답변 시작 → 고객 질문에 문서 기반으로만 정확하게 답변 (환각 차단)

[Before vs After]
• 응답 시간: 1~24시간 → 3초
• 운영 시간: 평일 9~18시 → 24시간 365일
• 월 CS 비용: 상담원 인건비 200만+ → API 비용 1~3만
• 놓치는 문의: 영업시간 외 100% → 0건

[차별화 — 한국어 최강 Claude 3.5 Sonnet]
✅ 5.9만 원 — 업계 최저 진입가 (타사 평균 30만+)
✅ 3일 완성 — PDF만 보내면 끝, 회의·기획 불필요
✅ 한국어 최적화 (GPT 대비 자연스러운 한국어)
✅ HTML 1줄 설치 — 어떤 홈페이지든 1분 만에 챗봇 추가
✅ 환각 0% 설계 — 문서 기반 답변 + 출처 표시 + 모름 안내

[설치 가능] HTML/WordPress/카페24/그누보드/Wix/Squarespace/아임웹/노션/카카오톡 채널(Premium)
[기술 스택] Anthropic Claude 3.5 Sonnet · 한국어 임베딩 · Cloudflare Workers/Pages`,

    progress: `1단계: PDF/URL 전달 + 챗봇 톤·디자인 요청 확인
2단계: 안전결제 + 착수
3단계: AI 학습 (문서 임베딩 + 프롬프트 최적화)
4단계: 1차 데모 (20개 질문 테스트)
5단계: 피드백 → 수정
6단계: 설치 + 사용법 가이드 (HTML 1줄 또는 위젯 설치)
7단계: A/S (Standard 7일, Deluxe 7일, Premium 14일 무상 유지보수)`,

    preparation: `• 학습할 PDF 파일 (회사소개서, FAQ, 카탈로그 등)
• 챗봇 톤 요청 (존댓말/친근/전문 등)
• 브랜드 컬러 (1색)
• 설치할 홈페이지 주소 (HTML 코드 1줄 추가 가능 사이트)
• Anthropic 또는 OpenAI API 키 (없으면 안내)`,

    features: { tech: '고급', team: '1인', onsite: '상주 불가능', messenger: '텔레그램', botField: '알림' },

    packages: [
      { name: 'STANDARD', title: 'PDF 1개 웹 위젯 챗봇',      desc: 'PDF 1개(50p), 웹 위젯, Claude 3.5, 출처 표시, 기본 UI', price: 59000,  days: 3, revisions: 2 },
      { name: 'DELUXE',   title: 'PDF 3개 + URL 5개 + 로그',  desc: 'PDF 3개+URL 5개, UI 커스텀, 대화 로그, 미답변 목록, 7일 유지보수', price: 99000,  days: 5, revisions: 3 },
      { name: 'PREMIUM',  title: 'PDF 10개 + 카톡 + 관리자',  desc: 'PDF 10개+URL 무제한, 카톡 채널, 관리자 패널, GPT-4o 선택', price: 149000, days: 7, revisions: 5 },
    ],
  },

  // ─────────────────────────────────────────
  // 05. 사내문서 RAG 챗봇 (B2B 메인)
  // ─────────────────────────────────────────
  {
    id: '05',
    cat1: 'IT·프로그래밍',
    cat2: '맞춤형 챗봇·GPT',
    image: '05-openai.png',
    title: '사내문서 노션 구글드라이브 통합 RAG 챗봇 (B2B)',

    description: `사내 문서 검색에 하루 30분? AI가 3초에 찾아드립니다. 출처 인용 필수, 환각 0% 설계, B2B 전문 RAG 챗봇.

[핵심 차별화 — 출처 인용 시스템]
✅ AI가 답변할 때 반드시 출처(문서명+페이지)를 표시
✅ 환각 0% — 문서에 없으면 "해당 정보가 없습니다" 안내
✅ 한국어 임베딩 (BGE-M3 / multilingual-e5) — 한국어 검색 정확도↑
✅ 노션/드라이브 자동 동기화 (Deluxe+) — 문서 변경 시 자동 재학습
✅ 온프레미스 옵션 — 사내 서버 배포 → 데이터 외부 전송 0

[데이터 소스 연동]
• PDF/워드/엑셀 (Standard 10개 / Deluxe 50개 / Premium 무제한)
• 웹 URL 크롤링 (5/30/무제한)
• 노션 자동 동기화 (Deluxe+)
• 구글드라이브 (Premium)
• 슬랙 채널 (Premium)

[관리자 패널 (Deluxe+)]
• 대화 로그 전체 조회/검색/내보내기 (CSV)
• 미답변 질문 목록 — 문서 보완 포인트 자동 추출
• 일일/주간 사용 통계 (질문 수, 인기 주제, 미답변률)
• 사용자 관리 / 부서별 권한 분리 (Premium)

[기술 스택] Anthropic Claude 3.5 Sonnet · GPT-4o · Supabase pgvector · Next.js · Cloudflare Workers · Docker (온프레미스)`,

    progress: `1단계: 요구사항 미팅 (문서 범위, 사용자 규모, 보안 요건)
2단계: 데이터 수집 — PDF/URL/노션 등 학습 문서 전달
3단계: 임베딩 + RAG 파이프라인 구축 (청킹→벡터화→검색 최적화)
4단계: 챗봇 UI + 관리자 패널 개발
5단계: 프롬프트 튜닝 (정확도/톤/출처 인용 최적화)
6단계: 테스트 (50개 이상 질문) + 납품 + 교육
7단계: A/S (Standard 7일, Deluxe 14일, Premium 30일)`,

    preparation: `• 학습할 문서 (PDF/워드/엑셀 또는 노션/드라이브 링크)
• 사용자 규모 (예상 동시 접속자, 부서별 권한 필요 여부)
• 보안 요건 (일반 클라우드 vs 온프레미스)
• 챗봇 톤·디자인 요청 (브랜드 로고·컬러)
• Anthropic 또는 OpenAI API 키 (없으면 안내)`,

    features: { tech: '고급', team: '1인', onsite: '상주 불가능', messenger: '텔레그램', botField: '알림' },

    packages: [
      { name: 'STANDARD', title: 'PDF 10개 + URL 5개 RAG',    desc: 'PDF 10개+URL 5개, 출처 인용, 환각 차단, 기본 관리자, Claude 3.5', price: 290000, days: 7,  revisions: 3 },
      { name: 'DELUXE',   title: 'PDF 50개 + 노션 동기화',     desc: 'PDF 50개+URL 30개, 노션 자동 동기화, 관리자 패널, 사용자 인증', price: 490000, days: 10, revisions: 5 },
      { name: 'PREMIUM',  title: '무제한 + 드라이브 + 분석',   desc: '무제한 학습, 노션+드라이브+슬랙, 부서별 권한, 분석 대시보드, 화상 교육', price: 790000, days: 14, revisions: '제한없음' },
    ],
  },

  // ─────────────────────────────────────────
  // 06. AI 풀스택 (챗봇+카카오+자동화) - 프리미엄
  // ─────────────────────────────────────────
  {
    id: '06',
    cat1: 'IT·프로그래밍',
    cat2: '맞춤형 챗봇·GPT',
    image: '06-openai.png',
    title: 'AI 챗봇 + 카카오 채널 + 업무자동화 풀스택 구축',

    description: `AI 챗봇 + 카카오 채널 + 업무 자동화 — 따로 구축하면 1,000만 원, 여기서는 99만 원. 고객 상담부터 사내 업무까지 하나의 시스템으로.

[시스템 구성]
고객 → [카카오채널 / 웹챗봇 / 슬랙] → AI 챗봇 엔진(RAG)
  → 즉시 답변 (문서 기반 + 출처 인용)
  → 상담원 연결 (미답변/복잡 문의)
  → 자동화 워크플로우 (접수→알림, 예약→캘린더, 문의→CRM, 주간 리포트)

[포함 기능]
• AI 챗봇: RAG 문서 기반 답변, 출처 인용, 대화 맥락 유지, 프롬프트 커스텀
• 멀티채널: 카카오 채널, 웹 위젯, 슬랙, 디스코드, 이메일 (패키지별)
• 관리자 패널: 대화 로그, 미답변 관리, 사용 통계, 사용자/부서 관리
• 자동화: 문의→알림, 예약→캘린더, 리포트 자동 생성, 리드→CRM
• 분석: 인기 질문 TOP 10, 응답 시간, 시간대별 문의량, 미답변률

[왜 이 상품인가? — 가격 비교]
• 타사 개별 구축: AI 챗봇 200~500만 + 카카오 100~300만 + 자동화 200~500만 = 500~1,300만
• 본 상품 풀스택: 99~199만 (5~13배 저렴)
• 유지보수: 14~30일 무상 포함
• 납기: 14~30일 (타사 2~3개월 대비)

[기술 스택] Claude 3.5 Sonnet · GPT-4o · 로컬 sLLM · Supabase pgvector · Next.js · 카카오 i 오픈빌더 스킬서버 · n8n/Make · Cloudflare Pages+Workers`,

    progress: `1단계: 킥오프 미팅 — 비즈니스 요구사항, 채널, 자동화 범위 확정
2단계: 설계서 제출 — 시스템 아키텍처 + 워크플로우 (승인 후 개발)
3단계: AI 챗봇 개발 — RAG 파이프라인 + 프롬프트 + UI
4단계: 채널 연동 — 카카오 i 빌더 + 웹 위젯 + 슬랙 등
5단계: 자동화 구축 — 워크플로우 + 외부 시스템 연동
6단계: 통합 테스트 — 전 채널 100+ 시나리오 E2E
7단계: 인수인계 + 화상 교육 + 유지보수 시작`,

    preparation: `• 카카오 비즈니스 채널 (없으면 개설 안내, 무료)
• 학습할 사내 문서 (PDF/노션/드라이브 등)
• 자동화 대상 업무 (예: 문의 분류, 예약, 리포트)
• CRM 연동 필요 시 계정 (HubSpot/Salesforce/구글시트)
• 보안 요건 (일반 클라우드 vs 온프레미스)
• Anthropic/OpenAI API 키 (없으면 안내)`,

    features: { tech: '고급', team: '1인', onsite: '상주 불가능', messenger: '텔레그램', botField: '알림' },

    packages: [
      { name: 'STANDARD', title: '웹+카카오 챗봇 풀스택',      desc: '웹+카톡, PDF/URL 30개, 관리자 패널, 자동화 1개, 14일 유지보수', price: 990000,  days: 14, revisions: 5 },
      { name: 'DELUXE',   title: '멀티채널 + 노션 동기화',     desc: '웹+카톡+슬랙, 문서 무제한, 자동화 3개, 부서별 권한, 화상 교육', price: 1490000, days: 21, revisions: '제한없음' },
      { name: 'PREMIUM',  title: '풀채널 + 분석 + CRM 연동',   desc: '풀채널, 자동화 무제한, 풀 대시보드, CRM 연동, 30일 유지보수', price: 1990000, days: 30, revisions: '제한없음' },
    ],
  },
];

// ─── 자가검증 ───
function validate() {
  const errs = [];
  for (const p of PRODUCTS) {
    if (p.title.length > 30) errs.push(`${p.id} 제목 ${p.title.length}자 (>30)`);
    if (p.description.length < 100) errs.push(`${p.id} description ${p.description.length}자 (<100)`);
    if (p.description.length > 20000) errs.push(`${p.id} description ${p.description.length}자 (>20000)`);
    if (p.progress.length < 50) errs.push(`${p.id} progress ${p.progress.length}자 (<50)`);
    if (p.preparation.length < 50) errs.push(`${p.id} preparation ${p.preparation.length}자 (<50)`);
    p.packages.forEach((pk, i) => {
      if (pk.title.length > 20) errs.push(`${p.id} pkg${i} 제목 ${pk.title.length}자 (>20)`);
      if (pk.desc.length > 60) errs.push(`${p.id} pkg${i} 설명 ${pk.desc.length}자 (>60)`);
      if (typeof pk.price !== 'number' || pk.price < 1000) errs.push(`${p.id} pkg${i} 가격 이상: ${pk.price}`);
      if (typeof pk.days !== 'number') errs.push(`${p.id} pkg${i} 작업기간 이상: ${pk.days}`);
    });
  }
  return errs;
}

if (require.main === module) {
  const errs = validate();
  if (errs.length === 0) {
    console.log(`✓ 6개 상품 데이터 검증 OK`);
    PRODUCTS.forEach(p => {
      console.log(`  ${p.id}: ${p.title} (${p.title.length}자) — desc ${p.description.length}자, prog ${p.progress.length}자, prep ${p.preparation.length}자`);
      p.packages.forEach((pk, i) => console.log(`     [${pk.name}] ${pk.title} | ₩${pk.price.toLocaleString()} | ${pk.days}일 | 수정 ${pk.revisions}`));
    });
  } else {
    console.error(`✗ 검증 실패 ${errs.length}건:`);
    errs.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }
}

module.exports = { PRODUCTS, validate };
