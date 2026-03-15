# Task: Recreate portfolio-list Next.js project

## 목표
portfolio-list-pi.vercel.app 사이트를 Next.js 프로젝트로 재구성

## 디자인 스펙 (기존 사이트 분석 결과)
- 다크 배경: #0F1218
- 골드 액센트: #C9A96E
- 폰트: Cormorant (serif), system sans-serif
- 그리드 배경 + noise 텍스처
- 각 업종별 카드: 둥근 모서리, 유리 효과 border, 2컬럼(Type A / Type B)

## 데이터 (portfolioData)
아래 데이터를 `lib/data.ts`에 정확히 넣을 것:

```typescript
export const portfolioData = [
  {
    id: "translation",
    category: "🌐 다국어 포트폴리오 (한국어/繁體中文)",
    icon: "🌏",
    type1: { label: "치과 — 한/繁中 전환", url: "https://clinic-type2-tw.vercel.app", color: "#2C3E50", features: "한국어↔繁體中文 실시간 전환, 증상 네비게이션, 비용 시뮬레이터, 가상 투어" },
    type2: { label: "피부과 — 한/繁中 전환", url: "https://derma-type2-tw.vercel.app", color: "#2C3E50", features: "한국어↔繁體中文 실시간 전환, AI 피부 진단, 시술 비교, 스킨케어 루틴 빌더" }
  },
  {
    id: "pet-shop",
    category: "반려동물 (강아지 분양)",
    icon: "🐾",
    type1: { label: "Type A — 럭셔리 부티크", url: "https://beamish-crisp-2621e0.netlify.app/", color: "#C08B6E", features: "견종 갤러리, 분양 상태 필터, 5단계 프로세스, 메디컬 서비스, 후기" },
    type2: { label: "Type B — 모던 인터랙티브", url: "https://pet-type2.vercel.app", color: "#1A2F23", features: "퍼피 매칭 퀴즈, 레이더 차트 견종 탐색, 라이브 피드, 양육비 계산기, 채팅 상담" }
  },
  {
    id: "apartment",
    category: "아파트 분양",
    icon: "🏢",
    type1: { label: "Type A — 프리미엄 레지던스", url: "https://apartment-v2-six.vercel.app", color: "#2A6049", features: "그린+골드, 평면도, 커뮤니티, 입주 안내" },
    type2: { label: "Type B — 시네마틱 럭셔리", url: "https://apartment-type2.vercel.app", color: "#0D1B2A", features: "시네마틱 스크롤, 인터랙티브 평면도, 뷰 시뮬레이터, 생활 타임라인" }
  },
  {
    id: "interior",
    category: "인테리어/리모델링",
    icon: "🪑",
    type1: { label: "Type A — 공간 내비게이터", url: "https://interior-gamma-beige.vercel.app", color: "#2D2D2D", features: "아이소메트릭 내비, 스타일 퀴즈, 견적 빌더, 소재 라이브러리" },
    type2: { label: "Type B — 에디토리얼 포트폴리오", url: "https://interior-type2.vercel.app", color: "#1A1A1A", features: "스플릿 히어로, 매거진 레이아웃, 비포/애프터 슬라이더, 무드보드 빌더" }
  },
  {
    id: "farm-shop",
    category: "자체몰 (농산물)",
    icon: "🌿",
    type1: { label: "Type A — 내추럴 팜", url: "https://farm-shop-v2.vercel.app", color: "#2D7D46", features: "상품 그리드, 카테고리 필터, 장바구니, 농장 소개" },
    type2: { label: "Type B — 에디토리얼 마켓", url: "https://farm-type2.vercel.app", color: "#3D5A3E", features: "벤토 그리드, 시즌 캘린더, 레시피 번들, 원산지 추적, 구독 박스" }
  },
  {
    id: "clinic",
    category: "병의원 (치과)",
    icon: "🦷",
    type1: { label: "Type A — 클린 모던", url: "https://clinic-blog-v2.vercel.app", color: "#20B2AA", features: "블로그형 레이아웃, 진료과목 카드, 의료진 소개" },
    type2: { label: "Type B — 프리미엄 웰니스", url: "https://clinic-type2.vercel.app", color: "#2C3E50", features: "증상 기반 네비게이션, 벤토 그리드, 비용 시뮬레이터, 가상 투어" }
  },
  {
    id: "used-car",
    category: "중고차 매매",
    icon: "🚗",
    type1: { label: "Type A — 딜러십 모던", url: "https://used-car-ten.vercel.app", color: "#1E3A5F", features: "비디오 히어로, AI 시세, 할부 계산기, 차량 비교, 수직 타임라인" },
    type2: { label: "Type B — 핀테크 스타일", url: "https://car-type2.vercel.app", color: "#111827", features: "검색 중심 히어로, 360° 갤러리, 내차 팔기, 사전 승인, 스마트 필터" }
  },
  {
    id: "marketing",
    category: "★ 마케팅 에이전시 (자사)",
    icon: "🚀",
    type1: { label: "Type A — 라이트 그린", url: "https://onda-marketing.vercel.app", color: "#00C853", features: "파티클 히어로, 벤토 서비스, 타임라인, Before/After 포트폴리오, 카운터 애니메이션" },
    type2: { label: "Type B — 다크 사이버펑크", url: "https://onda-marketing-dark.vercel.app", color: "#00FF88", features: "매트릭스 터미널 히어로, 네온 글라스모피즘, ROI 계산기, 케이스 타임라인, 테크스택" }
  },
  {
    id: "pet-velydog",
    category: "반려동물 (강아지 분양) — 2nd",
    icon: "🐕",
    type1: { label: "Type A — Velvet Cloud (오가닉 럭셔리)", url: "https://pet-velydog.vercel.app", color: "#8B6F5C", features: "오가닉 타이포, 카드 캐러셀, 어댑션 저니, 비주얼 매칭, 가족 스토리" },
    type2: { label: "Type B — Puppy Paradise (파스텔 큐트)", url: "https://pet-velydog-type2.vercel.app", color: "#F5A9B8", features: "바운시 발자국 히어로, 품종 캐러셀, 하트 갤러리, 스테핑스톤 프로세스, 버블 통계, 러브레터 후기" }
  },
  {
    id: "ad-agency",
    category: "광고대행사",
    icon: "📢",
    type1: { label: "Type A — 크리에이티브 에이전시", url: "https://ad-agency-v2.vercel.app", color: "#6366F1", features: "마퀴 텍스트, 수평 스크롤, 포트폴리오 그리드" },
    type2: { label: "Type B — 브루탈리스트 테크", url: "https://ad-agency-type2.vercel.app", color: "#0F0F0F", features: "키네틱 타이포, 벤토 대시보드, ROI 계산기, 케이스 스터디" }
  },
  {
    id: "law-firm",
    category: "법률사무소",
    icon: "⚖️",
    type1: { label: "Type A — 클래식 법률", url: "https://law-firm-v3-three.vercel.app", color: "#4A6FA5", features: "네이비+골드, 업무분야, 변호사 소개, FAQ" },
    type2: { label: "Type B — 모던 신뢰", url: "https://law-firm-type2.vercel.app", color: "#1A1A2E", features: "페르소나 네비, 사건 평가 도구, 지식 허브, 지능형 접수" }
  },
  {
    id: "dermatology",
    category: "병의원 (피부과)",
    icon: "✨",
    type1: { label: "Type A — 로즈골드 클리닉", url: "https://dermatology-alpha.vercel.app", color: "#C48B6C", features: "비포/애프터, 시술 안내, 의료진, 예약" },
    type2: { label: "Type B — 메디컬 스파", url: "https://derma-type2.vercel.app", color: "#2C3E50", features: "AI 피부 진단 퀴즈, 시술 비교, 드래그 슬라이더, 스킨케어 루틴 빌더" }
  },
  {
    id: "pension",
    category: "펜션/숙박",
    icon: "🏡",
    type1: { label: "Type A — 다이나믹 스테이", url: "https://pension-five.vercel.app", color: "#5B3A29", features: "시간대별 히어로, 스크롤텔링, 체험 퀴즈, 포토 모자이크" },
    type2: { label: "Type B — 트래블 매거진", url: "https://pension-type2.vercel.app", color: "#1B4332", features: "예약 위젯, 객실 비교표, 인터랙티브 액티비티 맵, 게스트 스토리" }
  },
  {
    id: "fitness",
    category: "피트니스/헬스장",
    icon: "💪",
    type1: { label: "Type A — 프리미엄 웰니스 클럽", url: "https://fitness-type2.vercel.app", color: "#1B3A2D", features: "세리프 타이포, 골드 액센트, 코치 프로필, 멤버십 비교표, 웰니스 철학" },
    type2: { label: "Type B — 다크 네온 에너지", url: "https://fitness-psi-seven.vercel.app", color: "#0A0A0A", features: "네온 그래디언트, 에너지 히어로, 프로그램 카드, 트레이너 소개, 멤버십" }
  },
  {
    id: "cafe",
    category: "카페/베이커리",
    icon: "☕",
    type1: { label: "Type A — 웜 아티즌", url: "https://cafe-five-lime.vercel.app", color: "#5C3D2E", features: "아티즌 히어로, 메뉴 카테고리 필터, 바리스타 프로필, 매거진 갤러리, 이벤트 캘린더" },
    type2: { label: "Type B — 노르딕 미니멀", url: "https://cafe-type2.vercel.app", color: "#7A8B6F", features: "스플릿 히어로, 에디토리얼 메뉴, 미니멀 공간 투어, 클린 갤러리, 바리스타 팀" }
  }
];
```

## 기능
1. localStorage에서 `onda-portfolio-settings` 읽어서 순서/숨김 적용
2. 반응형 (모바일/데스크톱)
3. 각 카드 hover 시 "사이트 보기" 표시
4. 헤더: 업종 수, 사이트 수(업종x2), 2026 연도 표시
5. 푸터: 업종 수 x 2타입 = N개 사이트, Last updated: 2026-02-21

## 기술 스택
- Next.js 14 (App Router)
- Tailwind CSS
- TypeScript
- Google Fonts: Cormorant Garamond

## 배포
- `npx vercel link --yes --token $VERCEL_TOKEN --project portfolio-list`
- `npx vercel --yes --token $VERCEL_TOKEN --prod`
- 배포 후 반드시 `npx vercel link --yes --token $VERCEL_TOKEN --project onda-logic-monitor`로 원복

## 주의
- 기존 사이트와 100% 동일하게 만들 것
- CSS: bg-grid, bg-noise, glow-radial, gold-line 커스텀 클래스 구현
- 빌드 에러 0 확인 후 배포
