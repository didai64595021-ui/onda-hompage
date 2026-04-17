/**
 * Phase 9 — 크몽발굴방 4축 통과 니치에서 업종별 2개씩 선정, 총 10개 신규 gig 기획
 *  - 근거: discovery-passed.json (18개 니치, 2026-04-15~16)
 *  - 원칙: 현 판매중 8개 + 복구 draft 9개와 모두 겹치지 않는 영역 선정
 *  - 실적 후킹 공식 반영: 타겟 호명 + pain point + 시간 보증 + 원스톱
 */

const GIGS = [
  // ─── 1. 개발·앱 (IT·프로그래밍 > 하이브리드/앱 제작) ───
  {
    slug: 'hybrid-app',
    niche: 'hybrid_app',
    title: '하이브리드 앱 5일 완성 (iOS·Android 동시)',
    cat1: 'IT·프로그래밍',
    cat2: '모바일 앱 개발',
    hook_angle: '후킹: 시간(5일) + 범위(iOS·Android 동시). 발굴 중앙가 50만, top3 점유 26%',
    packages: [
      { name: 'STANDARD', price: 300000, days: 5, revisions: 3, description: '3화면 하이브리드앱 (React Native/WebView)' },
      { name: 'DELUXE', price: 600000, days: 7, revisions: 5, description: '7화면 + 푸시알림 + 로그인 연동' },
      { name: 'PREMIUM', price: 1200000, days: 14, revisions: 999, description: '풀 기능 + 결제 + 배포(스토어) + 1개월 유지보수' },
    ],
  },
  {
    slug: 'telegram-bot',
    niche: 'telegram_bot',
    title: '텔레그램 봇 자동화 3일 완성 (맞춤 명령)',
    cat1: 'IT·프로그래밍',
    cat2: '맞춤형 챗봇·GPT',
    hook_angle: '후킹: 타겟(자동화 필요자) + 시간(3일). 중앙가 20만, top3 36%',
    packages: [
      { name: 'STANDARD', price: 80000, days: 2, revisions: 3, description: '명령 5개 + 기본 응답 봇' },
      { name: 'DELUXE', price: 200000, days: 4, revisions: 5, description: '명령 15개 + DB 연동 + 관리자 기능' },
      { name: 'PREMIUM', price: 500000, days: 7, revisions: 999, description: '풀스택 봇 + API 연동 + 24시간 모니터링' },
    ],
  },

  // ─── 2. 데이터·자동화 (IT·프로그래밍 > 업무 자동화 / 웹 프로그램) ───
  {
    slug: 'dashboard-build',
    niche: 'dashboard',
    title: '실시간 대시보드 제작 5일 (지표 시각화)',
    cat1: 'IT·프로그래밍',
    cat2: '업무 자동화',
    hook_angle: '후킹: 결과 명시(실시간) + 범위(지표 시각화). 중앙가 11만, top3 29.5%',
    packages: [
      { name: 'STANDARD', price: 110000, days: 3, revisions: 3, description: '지표 5개 차트 + 기본 필터' },
      { name: 'DELUXE', price: 250000, days: 5, revisions: 5, description: '지표 15개 + 실시간 갱신 + 관리자 CMS' },
      { name: 'PREMIUM', price: 500000, days: 7, revisions: 999, description: '풀 대시보드 + 사용자 권한 + 자동 리포트' },
    ],
  },
  {
    slug: 'make-automation',
    niche: 'make_setup',
    title: 'Make(Integromat) 업무 자동화 세팅 3일',
    cat1: 'IT·프로그래밍',
    cat2: '업무 자동화',
    hook_angle: '후킹: 툴 명시(Make) + 시간(3일). 중앙가 20만, top3 33%',
    packages: [
      { name: 'STANDARD', price: 150000, days: 2, revisions: 3, description: '시나리오 3개 세팅 (예: 구글폼→슬랙)' },
      { name: 'DELUXE', price: 300000, days: 4, revisions: 5, description: '시나리오 8개 + 오류 모니터 + 문서화' },
      { name: 'PREMIUM', price: 600000, days: 7, revisions: 999, description: '풀 자동화 + 대시보드 + 1개월 유지보수' },
    ],
  },

  // ─── 3. 디자인 (디자인 > PPT·인포그래픽 / 인쇄·홍보물) ───
  {
    slug: 'catalog-design',
    niche: 'catalog_design',
    title: '기업 제품 카탈로그 3일 완성 (인쇄·PDF)',
    cat1: '디자인',
    cat2: '전단지·포스터·인쇄물',
    hook_angle: '후킹: 타겟(기업) + 산출물(인쇄·PDF) + 시간(3일). 중앙가 16만',
    packages: [
      { name: 'STANDARD', price: 120000, days: 3, revisions: 3, description: '8P 카탈로그 (표지+제품 6p+연락)' },
      { name: 'DELUXE', price: 250000, days: 5, revisions: 5, description: '16P + 인쇄 납품 가이드 + 영문판 초안' },
      { name: 'PREMIUM', price: 500000, days: 7, revisions: 999, description: '32P 풀컬러 + 인쇄처 연결 + 온라인 PDF 다운로드' },
    ],
  },
  {
    slug: 'infographic',
    niche: 'infographic',
    title: '인포그래픽 2일 완성 (데이터 시각화)',
    cat1: '디자인',
    cat2: 'PPT·인포그래픽',
    hook_angle: '후킹: 결과(데이터 시각화) + 시간(2일). 중앙가 40만',
    packages: [
      { name: 'STANDARD', price: 80000, days: 2, revisions: 3, description: '1컷 인포그래픽 (A4 세로 1p)' },
      { name: 'DELUXE', price: 200000, days: 3, revisions: 5, description: '3컷 시리즈 + 데이터 정리 + 블로그용 가로버전' },
      { name: 'PREMIUM', price: 500000, days: 5, revisions: 999, description: '10컷 풀 시리즈 + 움직이는 gif + 원본 ai 파일' },
    ],
  },

  // ─── 4. 마케팅·SEO (마케팅 > 유튜브 / 네이버 플레이스) ───
  {
    slug: 'youtube-seo',
    niche: 'yt_seo',
    title: '유튜브 SEO 최적화 3일 (조회수 2배 목표)',
    cat1: '마케팅',
    cat2: '유튜브 마케팅',
    hook_angle: '후킹: 타겟(유튜버) + 수치 목표(2배). 중앙가 16.5만, 대규모 리뷰 6280',
    packages: [
      { name: 'STANDARD', price: 60000, days: 2, revisions: 3, description: '영상 1개 SEO 세팅 (제목·설명·태그·썸네일 가이드)' },
      { name: 'DELUXE', price: 150000, days: 3, revisions: 5, description: '영상 3개 + 채널 키워드 전략 + 경쟁 채널 분석' },
      { name: 'PREMIUM', price: 350000, days: 7, revisions: 999, description: '채널 전면 최적화 + 월간 리포트 + 1개월 컨설팅' },
    ],
  },
  {
    slug: 'naver-place-seo',
    niche: 'naver_seo',
    title: '네이버 플레이스 3일 상위노출 세팅 (지역 타겟)',
    cat1: '마케팅',
    cat2: '지도 최적화노출',
    hook_angle: '후킹: 플랫폼(네이버 플레이스) + 시간(3일) + 타겟(지역). 판매중 #741342 포털지도와 구분 — 플레이스 특화',
    packages: [
      { name: 'STANDARD', price: 90000, days: 3, revisions: 3, description: '업체 1곳 플레이스 기본 등록 + 키워드 3개' },
      { name: 'DELUXE', price: 200000, days: 5, revisions: 5, description: '키워드 10개 + 리뷰 관리 가이드 + 포토존 진단' },
      { name: 'PREMIUM', price: 400000, days: 7, revisions: 999, description: '지역 상위노출 설계 + 경쟁업체 분석 + 1개월 모니터링' },
    ],
  },

  // ─── 5. AI 콘텐츠 (콘텐츠·레슨 / 마케팅 > AI) ───
  {
    slug: 'ai-writing',
    niche: 'smart_writing',
    title: 'AI 글쓰기 맞춤 시스템 3일 (블로그·SNS 10배속)',
    cat1: 'IT·프로그래밍',
    cat2: '맞춤형 챗봇·GPT',
    hook_angle: '후킹: 도구(AI) + 결과(10배속) + 채널(블로그/SNS). 중앙가 49만',
    packages: [
      { name: 'STANDARD', price: 150000, days: 3, revisions: 3, description: '브랜드 톤 학습 + 블로그 글 10편 자동화 템플릿' },
      { name: 'DELUXE', price: 350000, days: 5, revisions: 5, description: '블로그+인스타+유튜브 스크립트 + 30편 배치' },
      { name: 'PREMIUM', price: 700000, days: 7, revisions: 999, description: '풀 콘텐츠 엔진 + CMS 연동 + 1개월 운영 지원' },
    ],
  },
  {
    slug: 'ai-avatar-video',
    niche: 'ai_avatar_video',
    title: 'AI 가상인물 영상 2일 완성 (나레이션 + 립싱크)',
    cat1: '영상·사진·음향',
    cat2: '영상편집',
    hook_angle: '후킹: 기술(AI 가상인물) + 결과물(나레이션+립싱크) + 시간(2일). 중앙가 10.9만, top3 54%',
    packages: [
      { name: 'STANDARD', price: 100000, days: 2, revisions: 3, description: '가상인물 1명 + 1분 영상 (나레이션 + 립싱크)' },
      { name: 'DELUXE', price: 250000, days: 4, revisions: 5, description: '가상인물 2명 + 3분 영상 + 자막 + BGM' },
      { name: 'PREMIUM', price: 500000, days: 7, revisions: 999, description: '시리즈 5편 + 맞춤 의상/배경 + 썸네일 제작' },
    ],
  },
];

module.exports = { GIGS };
