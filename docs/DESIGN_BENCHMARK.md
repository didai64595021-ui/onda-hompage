# 🏆 프리미엄 웹사이트 벤치마크 데이터

> Awwwards SOTY 2019-2025, Webby Awards 2025, DesignRush 2026 수상작 + 대기업 사이트 분석 기반

---

## 1. 타이포그래피 시스템

### 수상작 폰트 사용 패턴
| 카테고리 | 1순위 | 2순위 | 3순위 |
|---------|-------|-------|-------|
| 디스플레이 (EN) | Space Grotesk | Aeonik | PP Neue Montreal |
| 디스플레이 (KR) | Pretendard Variable | Noto Sans KR | Spoqa Han Sans |
| 세리프 (EN) | Playfair Display | DM Serif Display | Instrument Serif |
| 모노 | JetBrains Mono | Space Mono | IBM Plex Mono |

### 2025-2026 트렌딩 폰트 페어링
1. **럭셔리**: Playfair Display (heading) + Pretendard (body)
2. **테크/B2B**: Space Grotesk (heading) + Inter (body)
3. **모던 에디토리얼**: DM Serif Display (heading) + DM Sans (body)
4. **미니멀 기업**: Aeonik (heading) + General Sans (body)
5. **스타트업**: Satoshi (heading) + Manrope (body)

### 타이포그래피 스케일 (Golden Ratio 1.618)
```
--text-xs:    12px / 0.75rem
--text-sm:    14px / 0.875rem  
--text-base:  16px / 1rem       ← body 기본
--text-lg:    18px / 1.125rem
--text-xl:    24px / 1.5rem
--text-2xl:   32px / 2rem
--text-3xl:   48px / 3rem
--text-4xl:   64px / 4rem       ← 섹션 타이틀
--text-5xl:   80px / 5rem
--text-hero:  120px / 7.5rem    ← 히어로 디스플레이
--text-mega:  160px+ / 10rem+   ← 배경 텍스트
```

### 라인하이트 규칙
- **body**: 1.6~1.7 (한글은 1.7~1.8 권장)
- **heading**: 1.1~1.2 (타이트)
- **hero 디스플레이**: 0.9~1.0 (초타이트, 시각적 임팩트)
- **caption**: 1.4~1.5

---

## 2. 컬러 시스템

### 수상작 컬러 팔레트 패턴
| 사이트 | 메인 | 액센트 | 배경 | 텍스트 |
|--------|------|--------|------|--------|
| Lando Norris (SOTY 2025) | #111112 | #D2FF00 (네온 옐로우) | #111112 | #F4F3F1 |
| Igloo Inc (SOTY 2024) | #383E4E | #B6BAC5 | #FFFFFF | #383E4E |
| Lusion v3 (SOTY 2023) | #0A0A0A | #FF6B35 | #0A0A0A | #FFFFFF |
| KPR (SOTY 2022) | #1A1A1A | #00FF88 | #F5F5F0 | #1A1A1A |
| Bruno Simon (SOTY 2019) | #1A1A2E | #FF6347 | #E1E1E1 | #333333 |

### 공통 패턴
- **80%+** 다크 테마 사용 (2022-2025)
- **단일 네온/비비드 액센트** — 전체 컬러의 5-10%만 차지
- **배경색은 순수 검정(#000) 거의 안 씀** — #0A0A0A ~ #1A1A1A 사용
- **텍스트는 순수 흰색(#FFF) 거의 안 씀** — #F0F0F0 ~ #E8E8E8 사용
- **그레이 텍스트**: #888 이상 (WCAG AA 준수)

### 업종별 추천 팔레트
**럭셔리 부동산:**
- Primary: #0C0C0C (딥 블랙)
- Accent: #C8A97D (웜 골드) 또는 #B8977E (로즈 골드)
- Surface: #F7F4F0 (아이보리) 
- Text: #E8E4DF (라이트) / #2A2A2A (다크)

**B2B 테크/로봇:**
- Primary: #0A0A0F (나이트 블랙)
- Accent: #00D4FF (일렉트릭 시안) 또는 #6C5CE7 (바이올렛)
- Surface: #12121A (다크 서피스)
- Text: #E0E0E8 (라이트) / #1A1A2E (다크)

---

## 3. 스페이싱 시스템 (8px Grid)

### 스페이싱 토큰
```
--space-1:   4px    (하프스텝)
--space-2:   8px    
--space-3:   12px   
--space-4:   16px   ← 카드 내부 패딩
--space-5:   24px   
--space-6:   32px   ← 요소 간 갭
--space-8:   48px   
--space-10:  64px   ← 모바일 섹션 간격
--space-12:  80px   
--space-16:  128px  ← 데스크톱 섹션 간격
--space-20:  160px  ← 대형 섹션 간격
```

### 섹션 간격 (수상작 평균)
| 뷰포트 | 섹션 간격 | 컨테이너 패딩 | 카드 갭 |
|--------|----------|-------------|---------|
| Mobile (375px) | 64~80px | 20~24px | 12~16px |
| Tablet (768px) | 96~120px | 32~48px | 20~24px |
| Desktop (1440px) | 120~160px | 48~80px | 24~32px |

### 컨테이너 맥스 너비
- 텍스트 컨텐츠: 680~720px (최적 가독성)
- 일반 컨텐츠: 1200~1280px
- 풀 와이드: 100vw (히어로, 갤러리)

---

## 4. 인터랙션 패턴

### 수상작 필수 인터랙션 (출현율 90%+)
1. **스무스 스크롤** — Lenis/Locomotive Scroll (자연스러운 관성)
2. **스크롤 리빌 애니메이션** — translateY(40px) + opacity:0 → visible
3. **커스텀 커서** — 도트+링, 호버 시 확대/변형
4. **마그네틱 버튼** — 마우스 근접 시 버튼이 따라옴
5. **패럴랙스** — 레이어별 다른 속도 스크롤

### 수상작 고급 인터랙션 (출현율 50~80%)
6. **텍스트 스플릿 애니메이션** — 글자/단어 단위 시차 리빌
7. **이미지 리빌** — clip-path 또는 scale 애니메이션으로 이미지 등장
8. **수평 스크롤 섹션** — 특정 영역에서 세로→가로 전환
9. **프리로더** — 브랜디드 로딩 화면 (진입 경험)
10. **스크롤 프로그레스** — 상단 진행 바

### 수상작 시그니처 인터랙션 (출현율 30~50%)
11. **글리치/노이즈** — 텍스트/이미지 글리치 효과 (테크 사이트)
12. **3D 틸트** — 카드/이미지 마우스 추적 회전
13. **모핑 SVG** — 배경 블롭/셰이프 변형
14. **무한 마키** — 로고/텍스트 무한 수평 스크롤
15. **마우스 트레일** — 커서 움직임에 반응하는 파티클/리플

### 애니메이션 타이밍 함수
```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);     /* 가장 많이 사용 */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);    
--ease-in-out-cubic: cubic-bezier(0.65, 0, 0.35, 1);
--spring: cubic-bezier(0.34, 1.56, 0.64, 1);        /* 바운스 느낌 */
```

### 애니메이션 듀레이션 가이드
- 마이크로: 150~200ms (호버, 토글)
- 미디엄: 400~600ms (리빌, 전환)
- 매크로: 800~1200ms (페이지 전환, 히어로 리빌)
- 시네마틱: 1500~2500ms (프리로더, 히어로 시퀀스)

---

## 5. 레이아웃 패턴

### 수상작 히어로 패턴 TOP 5
1. **풀스크린 비디오/이미지 + 오버레이 텍스트** (40%)
2. **스플릿 스크린** (이미지 + 텍스트) (25%)
3. **타이포그래피 온리** (대형 텍스트 중심) (15%)
4. **3D/WebGL 인터랙티브** (15%)
5. **수평 마키 텍스트** (5%)

### 비대칭 레이아웃 기법
- 이미지와 텍스트를 60:40 또는 70:30으로 배치
- 텍스트 블록을 의도적으로 그리드 밖에 배치
- z-index로 요소 겹침 (이미지 위에 텍스트 카드)
- 음수 마진으로 섹션 경계 흐리기

### 그리드 시스템
- 12컬럼 그리드 (데스크톱)
- 4컬럼 그리드 (모바일)
- 갭: 24px (데스크톱) / 16px (모바일)
- **벤토 그리드**: 다양한 크기의 카드를 비정형 배치

---

## 6. 모바일 최적화 (수상작 기준)

### 필수 규격
- 최소 폰트: 14px (한글 본문)
- 최소 터치 타겟: 44×44px
- 최소 요소 간격: 8px
- 뷰포트: `width=device-width, initial-scale=1, viewport-fit=cover`
- `word-break: keep-all` (한글 필수)

### 모바일 네비게이션 트렌드
1. **풀스크린 오버레이** — 메뉴가 전체 화면 차지 (70%)
2. **슬라이드인 패널** — 우측에서 슬라이드 (20%)
3. **바텀 시트** — iOS 스타일 하단 시트 (10%)

---

## 7. 성능 기준

### Core Web Vitals 타겟
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1

### 이미지 최적화
- WebP 포맷 우선
- `loading="lazy"` (뷰포트 밖 이미지)
- `fetchpriority="high"` (히어로 이미지)
- `sizes` 속성으로 반응형 이미지
- Unsplash: `?w=800&q=80` 파라미터 활용

---

*Last updated: 2026-03-11*
*Sources: Awwwards SOTY 2019-2025, Typewolf, Google Web Fundamentals, WCAG 2.1*
