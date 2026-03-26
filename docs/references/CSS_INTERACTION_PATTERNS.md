# CSS 인터랙션 패턴 라이브러리
> 포트폴리오 제작 시 복사해서 바로 사용 가능한 CSS 패턴 모음
> JS 최소화, Pure CSS 우선

---

## 1. 스크롤 Reveal 애니메이션

### IntersectionObserver 기반 (JS 최소)
```css
.fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.fade-in.visible {
  opacity: 1;
  transform: translateY(0);
}
.fade-in-left { transform: translateX(-30px); }
.fade-in-right { transform: translateX(30px); }
.fade-in-scale { transform: scale(0.95); }
.fade-in-left.visible,
.fade-in-right.visible,
.fade-in-scale.visible { transform: none; }
```
```js
// 최소 JS (전 사이트 공통)
const obs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }});
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in,.fade-in-left,.fade-in-right,.fade-in-scale').forEach(el => obs.observe(el));
```

### 딜레이 스태거
```css
.fade-in[data-delay="1"] { transition-delay: 0.15s; }
.fade-in[data-delay="2"] { transition-delay: 0.3s; }
.fade-in[data-delay="3"] { transition-delay: 0.45s; }
.fade-in[data-delay="4"] { transition-delay: 0.6s; }
```

---

## 2. 숫자 카운터 애니메이션

```css
@property --num {
  syntax: "<integer>";
  initial-value: 0;
  inherits: false;
}
.counter {
  --num: 0;
  animation: countUp 2s ease-out forwards;
  counter-reset: num var(--num);
  font-variant-numeric: tabular-nums;
}
.counter::after {
  content: counter(num);
}
@keyframes countUp {
  to { --num: var(--target); }
}
```

---

## 3. 버튼 마이크로 인터랙션

### 기본 Hover + Active
```css
.btn {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.15);
}
.btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
```

### Ripple Effect (CSS + 최소 JS)
```css
.btn-ripple {
  position: relative;
  overflow: hidden;
}
.btn-ripple::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0; left: 0;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 10%, transparent 10%);
  transform: scale(10);
  opacity: 0;
  transition: transform 0.5s, opacity 1s;
}
.btn-ripple:active::after {
  transform: scale(0);
  opacity: 0.3;
  transition: 0s;
}
```

### 화살표 슬라이드
```css
.btn-arrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.btn-arrow svg {
  transition: transform 0.3s ease;
}
.btn-arrow:hover svg {
  transform: translateX(4px);
}
```

---

## 4. 카드 인터랙션

### Hover Lift
```css
.card {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.card:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
}
```

### 이미지 Zoom + Overlay
```css
.card-img-wrap {
  overflow: hidden;
  border-radius: 12px;
}
.card-img-wrap img {
  transition: transform 0.5s ease;
}
.card-img-wrap:hover img {
  transform: scale(1.08);
}
.card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.card-img-wrap:hover .card-overlay {
  opacity: 1;
}
```

### 3D Tilt (경량)
```css
.card-3d:hover {
  transform: perspective(1000px) rotateY(3deg) rotateX(-2deg);
  transition: transform 0.4s ease;
}
```

---

## 5. 네비게이션 패턴

### 스크롤 시 배경 변경
```css
.nav {
  position: fixed;
  top: 0;
  width: 100%;
  background: transparent;
  transition: background 0.3s ease, box-shadow 0.3s ease;
  z-index: 1000;
}
.nav.scrolled {
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0,0,0,0.08);
}
```

### 햄버거 → X 모핑
```css
.hamburger span {
  display: block;
  width: 24px;
  height: 2px;
  background: currentColor;
  transition: all 0.3s ease;
  transform-origin: center;
}
.hamburger.active span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.hamburger.active span:nth-child(2) {
  opacity: 0;
}
.hamburger.active span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}
```

---

## 6. 텍스트 인터랙션

### 그라데이션 텍스트
```css
.gradient-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### 텍스트 밑줄 hover
```css
.text-underline {
  position: relative;
}
.text-underline::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 2px;
  background: currentColor;
  transition: width 0.3s ease;
}
.text-underline:hover::after {
  width: 100%;
}
```

### 텍스트 스크럽 (한 글자씩 reveal)
```css
.text-scrub span {
  display: inline-block;
  opacity: 0;
  transform: translateY(100%);
  transition: all 0.6s cubic-bezier(0.5, 0, 0, 1);
}
.text-scrub.visible span {
  opacity: 1;
  transform: translateY(0);
}
/* JS에서 각 span에 transition-delay 부여 */
```

---

## 7. 배경 패턴

### 미세 그리드 패턴
```css
.bg-grid {
  background-image: 
    linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

### 노이즈 텍스처
```css
.bg-noise::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none;
}
```

### 그라데이션 블러 오브
```css
.bg-orb {
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%);
  filter: blur(60px);
  pointer-events: none;
}
```

---

## 8. 반응형 패턴

### 컨테이너 쿼리 (2025)
```css
.card-container {
  container-type: inline-size;
}
@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

### Clamp 유틸리티
```css
:root {
  --fs-h1: clamp(2rem, 5vw, 4rem);
  --fs-h2: clamp(1.5rem, 3.5vw, 2.5rem);
  --fs-h3: clamp(1.25rem, 2.5vw, 1.75rem);
  --fs-body: clamp(0.9rem, 1.5vw, 1.125rem);
  --space-section: clamp(48px, 8vw, 120px);
}
```

### 접근성
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. 이징 커브 프리셋

```css
:root {
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 10. 플로팅 요소

### 부유 애니메이션
```css
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.floating {
  animation: float 3s ease-in-out infinite;
}
```

### 펄스 효과 (CTA 강조)
```css
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
  70% { box-shadow: 0 0 0 15px rgba(59,130,246,0); }
  100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
}
.pulse {
  animation: pulse 2s infinite;
}
```
