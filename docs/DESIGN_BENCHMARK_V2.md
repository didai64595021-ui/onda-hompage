# 🏆 프리미엄 웹사이트 벤치마크 데이터 V2

> V1 + 심층 기술 분석, 실제 수상작 역설계, 한국 대기업 패턴, 순수 CSS/JS 구현법

---

## 1. 수상작 역설계 — 기술 분석

### Lusion v3 (SOTY 2023) — WebGL 마스터클래스
- **기술**: Three.js + Houdini FX + Custom WebGL Shaders
- **핵심**: 천 시뮬레이션을 Houdini에서 사전 계산 → ArrayBuffer 저장 → 실시간 블렌딩
- **커서**: 커서 위치에 반응하는 천 변형 (실시간)
- **최적화**: 4,096 vertex에 11 keyframe만 사용, 16-bit 데이터로 바이트 절감
- **교훈**: 복잡한 효과도 사전계산 + 보간으로 가볍게 구현 가능

### Lando Norris (SOTY 2025) — 인터랙티브 히어로
- **팔레트**: #111112 + #D2FF00 (네온 옐로우)
- **커서 효과**: blob-like 오버레이가 히어로 이미지 위에서 커서를 따라 이동
- **스크롤**: 시네마틱 스크롤링, 속도 기반 트랜지션
- **핵심**: "Personality in Motion" — 정적 이미지를 반응형 표면으로 변환

### Igloo Inc (SOTY 2024) — 미니멀 이커머스
- **팔레트**: #B6BAC5 + #383E4E (2색만 사용)
- **레이아웃**: 원페이지, 무한스크롤
- **기술**: 3D, 애니메이션, 트랜지션의 조화
- **교훈**: 색상을 극도로 절제하되 모션으로 풍부함 부여

---

## 2. CSS-Only 고급 기법 (라이브러리 없이 Awwwards급)

### 2-1. CSS Scroll-Driven Animations (네이티브)
```css
/* 스크롤 기반 리빌 — JS 없이! */
.reveal {
  animation: fadeSlideUp linear forwards;
  animation-timeline: view();
  animation-range: entry 0% cover 40%;
}

@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(60px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 스크롤 프로그레스 바 — 순수 CSS */
.progress-bar {
  position: fixed; top: 0; left: 0;
  height: 2px; background: var(--accent);
  transform-origin: left;
  animation: growProgress linear;
  animation-timeline: scroll(root);
}
@keyframes growProgress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

/* CSS 패럴랙스 — 3레이어 */
.parallax-bg {
  animation: parallaxSlow linear;
  animation-timeline: scroll();
}
@keyframes parallaxSlow {
  from { transform: translateY(0); }
  to { transform: translateY(-200px); }
}
.parallax-mid {
  animation: parallaxMid linear;
  animation-timeline: scroll();
}
@keyframes parallaxMid {
  from { transform: translateY(0); }
  to { transform: translateY(-100px); }
}
```
**지원**: Chrome 115+, Edge 115+, Safari 26+ (2026년 기준 90%+ 커버)

### 2-2. 그레인/노이즈 텍스처 (순수 CSS)
```css
.grain-overlay::after {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 9990;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}
```

### 2-3. 글래스모피즘 카드
```css
.glass-card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
```

### 2-4. 벤토 그리드
```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: minmax(200px, auto);
  gap: 16px;
}
.bento-lg { grid-column: span 2; grid-row: span 2; }
.bento-wide { grid-column: span 2; }
.bento-tall { grid-row: span 2; }
@media (max-width: 768px) {
  .bento-grid { grid-template-columns: repeat(2, 1fr); }
  .bento-lg, .bento-wide { grid-column: span 2; }
}
```

### 2-5. 이미지 클립패스 리빌
```css
.img-reveal {
  clip-path: inset(0 100% 0 0);
  animation: clipReveal 1s var(--ease-out-expo) forwards;
  animation-timeline: view();
  animation-range: entry 0% cover 50%;
}
@keyframes clipReveal {
  to { clip-path: inset(0 0 0 0); }
}
```

### 2-6. 텍스트 스플릿 스태거 (CSS-only)
```css
.stagger-word { 
  display: inline-block; 
  opacity: 0; 
  transform: translateY(40px);
  animation: wordIn 0.6s var(--ease-out-expo) forwards;
  animation-timeline: view();
  animation-range: entry 0% cover 40%;
}
.stagger-word:nth-child(1) { animation-delay: 0ms; }
.stagger-word:nth-child(2) { animation-delay: 80ms; }
.stagger-word:nth-child(3) { animation-delay: 160ms; }
.stagger-word:nth-child(4) { animation-delay: 240ms; }
.stagger-word:nth-child(5) { animation-delay: 320ms; }
@keyframes wordIn {
  to { opacity: 1; transform: translateY(0); }
}
```

### 2-7. 무한 마키 (순수 CSS)
```css
.marquee { overflow: hidden; white-space: nowrap; }
.marquee-track {
  display: inline-flex;
  animation: marquee 20s linear infinite;
}
@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
/* HTML: track 내용을 2번 복제해서 무한 반복 효과 */
```

### 2-8. 수평 스크롤 섹션 (CSS scroll-snap)
```css
.horizontal-section {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}
.horizontal-section::-webkit-scrollbar { display: none; }
.horizontal-panel {
  flex: 0 0 80vw;
  scroll-snap-align: start;
  padding: 0 5vw;
}
```

---

## 3. 바닐라 JS 인터랙션 패턴

### 3-1. 커스텀 커서 (섹션별 테마 전환)
```javascript
const cursor = { dot: null, ring: null };
let currentTheme = 'light';

function updateCursorTheme(theme) {
  if (theme === currentTheme) return;
  currentTheme = theme;
  const color = theme === 'dark' ? '#F5F4F2' : '#1A1816';
  cursor.dot.style.background = color;
  cursor.ring.style.borderColor = color;
}

// IntersectionObserver로 다크/라이트 섹션 감지
const sections = document.querySelectorAll('[data-theme]');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting && e.intersectionRatio > 0.5) {
      updateCursorTheme(e.target.dataset.theme);
    }
  });
}, { threshold: 0.5 });
sections.forEach(s => sectionObserver.observe(s));
```

### 3-2. 마그네틱 버튼
```javascript
document.querySelectorAll('.magnetic').forEach(btn => {
  const strength = 0.25;
  btn.addEventListener('mousemove', e => {
    const rect = btn.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * strength;
    const y = (e.clientY - rect.top - rect.height / 2) * strength;
    btn.style.transform = `translate(${x}px, ${y}px)`;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translate(0, 0)';
    btn.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.transition = 'transform 0.1s';
  });
});
```

### 3-3. 카운터 + Breathing
```javascript
function animateCounter(el) {
  const target = parseInt(el.dataset.target);
  const suffix = el.dataset.suffix || '';
  const duration = 2000;
  const start = performance.now();
  
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4); // ease-out-quart
    el.textContent = Math.floor(eased * target) + suffix;
    if (progress < 1) requestAnimationFrame(update);
    else {
      // Breathing effect after reaching target
      el.style.animation = 'breathe 3s ease-in-out infinite';
    }
  }
  requestAnimationFrame(update);
}
```

### 3-4. 3D 틸트 카드
```javascript
document.querySelectorAll('.tilt').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -12;
    card.style.transform = `perspective(800px) rotateX(${y}deg) rotateY(${x}deg) scale(1.02)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
  });
});
```

### 3-5. 스크롤 방향 감지 헤더
```javascript
let lastScroll = 0;
const header = document.querySelector('header');

window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (currentScroll > 100) {
    header.classList.add('visible');
    if (currentScroll > lastScroll) {
      header.classList.add('hidden'); // 아래로 스크롤 → 숨김
    } else {
      header.classList.remove('hidden'); // 위로 스크롤 → 표시
    }
  } else {
    header.classList.remove('visible');
  }
  lastScroll = currentScroll;
}, { passive: true });
```

---

## 4. 한국 대기업 웹사이트 패턴 (2025)

### 공통 특징
- **AI 개인화**: 사용자 행동 기반 맞춤 콘텐츠
- **몰입형 인터페이스**: 3D + 마이크로 인터랙션
- **모바일 퍼스트**: 반드시 모바일부터 설계
- **에코 UI**: 다크 테마로 에너지 절약
- **감성 타이포**: 한글의 아름다움을 살린 폰트 활용

### 삼성 디자인 웹사이트 (2025.12 리뉴얼)
- 디자인 프로세스를 보여주는 스토리텔링
- 인간의 감성/호기심을 강조하는 컨셉
- 제품이 아닌 "과정"을 중심으로 한 콘텐츠

### 현대자동차
- 인터랙티브 3D 차량 모델
- 미래 모빌리티 비전을 시각적으로 전달
- 풀스크린 비디오 히어로

### LG
- 'LG ThinQ ON' AI 홈 경험을 웹에서 시뮬레이션
- 투명 OLED 같은 혁신 기술을 인터랙티브로 체험
- 초프리미엄 'LG 시그니처' 브랜드 차별화

---

## 5. 프로젝트 레이아웃 — 진짜 다른 4가지

### 레이아웃 A: "The Overlap"
```
┌──────────────────────────────┐
│                              │
│  [IMAGE 60%] ┐               │
│              │ TITLE         │
│              │ 텍스트 카드    │ ← 이미지와 40px 겹침
│              └───────────    │
│                              │
└──────────────────────────────┘
```
- 이미지 위에 텍스트 카드가 겹침 (absolute positioning)
- 카드에 그림자 + 배경색으로 분리
- 호버: 카드 8px 상승

### 레이아웃 B: "The Bleed"
```
┌──────────────────────────────┐
│ TITLE                        │
│ Description        ┌────────┤
│ ────               │ IMAGE  │
│                    │ bleeds │ ← 이미지가 우측 뷰포트 끝까지
│                    │ right  │
│                    └────────┤
└──────────────────────────────┘
```
- 이미지가 컨테이너를 벗어나 뷰포트 끝까지
- `margin-right: calc(-50vw + 50%)` 또는 `width: 50vw`
- 텍스트와 이미지 사이에 수평선 연결

### 레이아웃 C: "The Fullbleed"
```
┌──────────────────────────────────┐
│          100vw IMAGE             │
│          70vh height             │
│                                  │
│   TEXT OVERLAID ────── STATS     │ ← 하단 어두운 그래디언트
└──────────────────────────────────┘
```
- 이미지 100vw × 70vh, object-fit: cover
- 하단 gradient 위에 텍스트
- 패럴랙스: 이미지 스크롤 속도 0.7x

### 레이아웃 D: "The Data"
```
┌──────────────────────────────┐
│                              │
│   340%     [small image]     │
│   ↑ 120px mono              │
│   매출 증가율                 │
│                              │
└──────────────────────────────┘
```
- 거대한 숫자가 주인공
- JetBrains Mono 120px, accent color
- 작은 이미지는 보조 역할

---

## 6. "와우" 모먼트 레시피

### 레시피 1: Word Constellation
- 단어들이 뷰포트에 랜덤 위치로 흩어져 있음
- 스크롤하면 각 단어가 제자리로 모여 문장 형성
- `animation-timeline: view()` + 각 단어별 다른 keyframe

### 레시피 2: Color Inversion Section
- 100vh 섹션이 갑자기 라이트↔다크 전환
- 배경색이 스크롤 기반으로 그라데이션 변화
- 전환 구간에 위치한 텍스트는 `mix-blend-mode: difference`

### 레시피 3: Pinned Horizontal Gallery
- 섹션이 화면에 고정(sticky)
- 내부 콘텐츠가 수평으로 스크롤
- `position: sticky` + overflow + scroll-snap

### 레시피 4: Text Mask
- 거대한 텍스트(200px+)가 배경 이미지의 마스크 역할
- `background-clip: text` + `-webkit-text-fill-color: transparent`
- 스크롤에 따라 배경 이미지가 이동

---

## 7. 애니메이션 타이밍 사전

```css
/* 수상작에서 가장 많이 사용되는 커브 */
--ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1);
--ease-out-quart:  cubic-bezier(0.25, 1, 0.5, 1);
--ease-in-out:     cubic-bezier(0.65, 0, 0.35, 1);
--spring:          cubic-bezier(0.34, 1.56, 0.64, 1);
--smooth:          cubic-bezier(0.4, 0, 0.2, 1);

/* 듀레이션 가이드 */
--dur-micro:    150ms;   /* hover, toggle */
--dur-fast:     300ms;   /* 작은 리빌, 메뉴 */
--dur-normal:   600ms;   /* 섹션 리빌, 카운터 */
--dur-slow:     1000ms;  /* 이미지 리빌, 히어로 */
--dur-epic:     1500ms;  /* 프리로더, 페이지 전환 */
--dur-cinematic: 2500ms; /* 히어로 시퀀스 */

/* 스태거 딜레이 */
--stagger-tight:  40ms;  /* 글자 단위 */
--stagger-normal: 80ms;  /* 단어 단위 */
--stagger-loose:  150ms; /* 요소 단위 */
```

---

## 8. 반응형 단절점 + 한글 특화

### 단절점
```css
/* Mobile First */
@media (min-width: 640px)  { /* sm: 태블릿 세로 */ }
@media (min-width: 768px)  { /* md: 태블릿 가로 */ }
@media (min-width: 1024px) { /* lg: 노트북 */ }
@media (min-width: 1280px) { /* xl: 데스크톱 */ }
@media (min-width: 1536px) { /* 2xl: 대형 모니터 */ }
```

### 한글 특화 CSS
```css
* {
  word-break: keep-all;
  overflow-wrap: break-word;
}
body {
  font-feature-settings: 'liga' 1, 'calt' 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
/* 한글 본문: line-height 1.7~1.8 (영문보다 높게) */
/* 한글 제목: letter-spacing -0.02em (자간 미세 줄임) */
```

---

*V2 Last updated: 2026-03-11*
*Sources: Awwwards SOTY 역설계, CSS-Tricks, Smashing Magazine, Codrops, 한국 대기업 분석*
