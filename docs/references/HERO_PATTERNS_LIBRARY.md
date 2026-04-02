# HERO_PATTERNS_LIBRARY.md — 히어로 섹션 패턴 라이브러리

> 모든 포트폴리오 제작 시 히어로 섹션 레퍼런스로 활용
> 출처: 아뜰리에 온 (jolly-unicorn-ddbc7c.netlify.app) + Awwwards/FWA 수상작 분석

---

## 패턴 1: Scroll-Driven Frame Sequence (스크롤 연동 프레임 시퀀스)
**난이도**: ★★★★★ | **임팩트**: 최상 | **업종**: 인테리어, 분양, 자동차, 럭셔리

### 핵심 구조
```html
<section class="hero-scroll" style="height: 500vh;">
  <div class="sticky top-0 h-[100dvh] overflow-hidden">
    <!-- Canvas에 이미지 프레임 시퀀스 렌더링 -->
    <canvas id="heroCanvas" class="w-full h-full" style="object-fit: cover;"></canvas>
    <!-- 스크롤 진행도에 따라 오버레이 투명도 변경 -->
    <div id="heroOverlay" class="absolute inset-0 bg-dark/0"></div>
    <!-- 텍스트도 스크롤 진행도에 따라 fade in/out -->
    <div id="heroText" style="opacity:0; transform:translateY(-3rem); filter:blur(6px);"></div>
  </div>
</section>
```

### JS 로직
```javascript
// 스크롤 위치 → 프레임 번호 매핑
const frameCount = 120;
const scrollFraction = scrollTop / (scrollHeight - viewportHeight);
const frameIndex = Math.min(frameCount - 1, Math.floor(scrollFraction * frameCount));
// canvas에 해당 프레임 이미지 그리기
ctx.drawImage(images[frameIndex], 0, 0, canvas.width, canvas.height);
// 오버레이 투명도 조절
overlay.style.backgroundColor = `rgba(26,20,16, ${scrollFraction * 0.8})`;
// 텍스트 페이드인 (20~60% 구간)
if (scrollFraction > 0.2 && scrollFraction < 0.6) {
  text.style.opacity = 1;
  text.style.transform = 'translateY(0)';
  text.style.filter = 'blur(0)';
}
```

### 적용 포인트
- height: 500vh로 스크롤 공간 확보 (sticky 핀)
- 이미지 시퀀스 대신 단일 이미지 parallax로 간소화 가능
- 텍스트 blur(6px) → blur(0) 전환이 고급스러움
- Scroll Indicator 하단 배치 (SCROLL + 수직 라인 애니메이션)

---

## 패턴 2: Full-Screen Video Background + Overlay Text
**난이도**: ★★★☆☆ | **임팩트**: 상 | **업종**: 카페, 호텔, 펜션, 뷰티

### 핵심 구조
```html
<section class="relative h-[100dvh] overflow-hidden">
  <video autoplay muted loop playsinline class="absolute inset-0 w-full h-full object-cover">
    <source src="hero.mp4" type="video/mp4">
  </video>
  <div class="absolute inset-0 bg-black/40"></div>
  <div class="relative z-10 flex items-center h-full">
    <h1 class="text-5xl text-white font-light">타이틀</h1>
  </div>
</section>
```

### 변형
- **A) 그라데이션 오버레이**: `bg-gradient-to-t from-black/80 via-transparent to-transparent`
- **B) 컬러 틴트**: `bg-blue-900/30 mix-blend-multiply`
- **C) 텍스트 마스킹**: 텍스트에 `background-clip: text`로 비디오 보이게

---

## 패턴 3: Split Hero (좌우 분할)
**난이도**: ★★☆☆☆ | **임팩트**: 중상 | **업종**: 법률, 클리닉, 마케팅, 교육

### 핵심 구조
```html
<section class="h-[100dvh] grid grid-cols-1 md:grid-cols-2">
  <!-- 좌: 텍스트 -->
  <div class="flex flex-col justify-center px-12">
    <span class="badge">Premium Interior</span>
    <h1 class="text-6xl font-light">공간이<br><strong>삶을 바꾸는</strong> 순간</h1>
    <p class="text-lg text-gray-600">설명 텍스트</p>
    <div class="flex gap-4 mt-8">
      <a class="btn-primary">상담 신청</a>
      <a class="btn-outline">포트폴리오</a>
    </div>
  </div>
  <!-- 우: 이미지 -->
  <div class="relative overflow-hidden">
    <img src="hero.jpg" class="w-full h-full object-cover" />
  </div>
</section>
```

### 변형
- **A) 비대칭 분할**: 좌 40% + 우 60%
- **B) 오버랩**: 텍스트가 이미지 위로 살짝 겹침 (negative margin)
- **C) 듀얼 이미지**: 우측에 이미지 2개 (큰 것 + 작은 것 float)

---

## 패턴 4: Parallax Layers (다중 레이어 패럴랙스)
**난이도**: ★★★★☆ | **임팩트**: 상 | **업종**: 분양, 리조트, 럭셔리, 건축

### 핵심 구조
```html
<section class="relative h-[100dvh] overflow-hidden">
  <!-- 배경 레이어 (느리게 이동) -->
  <div class="absolute inset-0" style="transform: translateY(calc(var(--scroll) * -0.3))">
    <img src="bg.jpg" class="w-full h-[120%] object-cover" />
  </div>
  <!-- 중간 레이어 (중간 속도) -->
  <div class="absolute bottom-0" style="transform: translateY(calc(var(--scroll) * -0.15))">
    <img src="foreground.png" />
  </div>
  <!-- 전면 텍스트 (빠르게 이동) -->
  <div class="relative z-10" style="transform: translateY(calc(var(--scroll) * 0.1))">
    <h1>타이틀</h1>
  </div>
</section>
```

### JS
```javascript
window.addEventListener('scroll', () => {
  document.documentElement.style.setProperty('--scroll', window.scrollY + 'px');
});
```

---

## 패턴 5: Text-First Minimal (텍스트 중심 미니멀)
**난이도**: ★☆☆☆☆ | **임팩트**: 중 | **업종**: 마케팅, SaaS, 컨설팅, 에이전시

### 핵심 구조
```html
<section class="h-[100dvh] flex items-center justify-center bg-cream">
  <div class="text-center max-w-4xl px-6">
    <span class="text-xs uppercase tracking-widest text-gray-400 mb-6">Since 2012</span>
    <h1 class="text-7xl font-display font-extralight tracking-tight mb-8">
      공간을 설계하는<br><strong class="font-bold">사람들</strong>
    </h1>
    <p class="text-xl text-gray-500 mb-12 max-w-2xl mx-auto">설명 텍스트</p>
    <a class="btn-primary">시작하기</a>
  </div>
</section>
```

### 변형
- **A) 카운팅 애니메이션**: 큰 숫자 (847+) 카운트업
- **B) 타이핑 효과**: h1이 한 글자씩 타이핑
- **C) 마우스 커서 트레일**: 커스텀 커서 + 잔상 효과

---

## 패턴 6: Image Grid Mosaic (이미지 그리드 모자이크)
**난이도**: ★★★☆☆ | **임팩트**: 상 | **업종**: 포트폴리오, 갤러리, 부동산, 웨딩

### 핵심 구조
```html
<section class="h-[100dvh] grid grid-cols-4 grid-rows-3 gap-2 p-2">
  <div class="col-span-2 row-span-2 overflow-hidden">
    <img src="1.jpg" class="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
  </div>
  <div class="overflow-hidden">
    <img src="2.jpg" class="w-full h-full object-cover" />
  </div>
  <div class="overflow-hidden">
    <img src="3.jpg" class="w-full h-full object-cover" />
  </div>
  <!-- ... 나머지 그리드 -->
  <!-- 중앙에 오버레이 텍스트 -->
  <div class="absolute inset-0 flex items-center justify-center">
    <h1 class="text-white text-6xl font-bold drop-shadow-xl">PORTFOLIO</h1>
  </div>
</section>
```

---

## 패턴 7: Horizontal Scroll Reveal (가로 스크롤 공개)
**난이도**: ★★★★☆ | **임팩트**: 상 | **업종**: 크리에이티브, 에이전시, 패션

### 핵심 구조
```html
<section class="hero-horizontal" style="height: 300vh;">
  <div class="sticky top-0 h-[100dvh] overflow-hidden">
    <div class="flex h-full" style="transform: translateX(calc(var(--scroll-progress) * -200vw));">
      <div class="min-w-[100vw] h-full flex items-center justify-center">
        <h1>첫 번째 슬라이드</h1>
      </div>
      <div class="min-w-[100vw] h-full relative">
        <img src="hero1.jpg" class="w-full h-full object-cover" />
      </div>
      <div class="min-w-[100vw] h-full flex items-center justify-center">
        <h1>CTA</h1>
      </div>
    </div>
  </div>
</section>
```

---

## 패턴 8: Clip-Path Reveal (클립패스 공개)
**난이도**: ★★★★☆ | **임팩트**: 최상 | **업종**: 럭셔리, 건축, 아트

### 핵심 구조
```html
<section class="relative h-[100dvh]">
  <!-- 배경 이미지 (처음에 작은 원으로 클립) -->
  <div class="absolute inset-0" style="clip-path: circle(0% at 50% 50%); transition: clip-path 1.5s cubic-bezier(0.16, 1, 0.3, 1);" id="heroClip">
    <img src="hero.jpg" class="w-full h-full object-cover" />
  </div>
  <div class="relative z-10 flex items-center justify-center h-full">
    <h1 class="text-6xl text-white mix-blend-difference">타이틀</h1>
  </div>
</section>
```

### JS (로딩 완료 시 expand)
```javascript
window.addEventListener('load', () => {
  document.getElementById('heroClip').style.clipPath = 'circle(100% at 50% 50%)';
});
```

---

## 패턴 9: Glassmorphism Card Hero (글래스모피즘 카드)
**난이도**: ★★★☆☆ | **임팩트**: 중상 | **업종**: 클리닉, 뷰티, SaaS, 테크

### 핵심 구조
```html
<section class="relative h-[100dvh] bg-gradient-to-br from-blue-50 to-purple-50">
  <!-- 배경 블롭 -->
  <div class="absolute top-20 left-20 w-96 h-96 bg-blue-300/30 rounded-full blur-[120px]"></div>
  <div class="absolute bottom-20 right-20 w-96 h-96 bg-purple-300/30 rounded-full blur-[120px]"></div>
  <!-- 글래스 카드 -->
  <div class="relative z-10 flex items-center justify-center h-full">
    <div class="backdrop-blur-xl bg-white/40 border border-white/50 rounded-3xl p-16 max-w-2xl shadow-xl">
      <h1 class="text-5xl font-light mb-6">타이틀</h1>
      <p class="text-lg text-gray-600 mb-8">설명</p>
      <a class="btn-primary">CTA</a>
    </div>
  </div>
</section>
```

---

## 패턴 10: Noise + Grain Texture (노이즈 텍스처)
**난이도**: ★★☆☆☆ | **임팩트**: 중 | **업종**: 카페, 빈티지, 공방, 베이커리

### 적용 방법 (어떤 히어로에든 추가 가능)
```css
.noise-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

---

## 공통 디테일 (모든 히어로에 적용)

### 1. 뱃지/태그
```html
<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em] font-medium bg-white/20 backdrop-blur-md text-white border border-white/10">
  <iconify-icon icon="solar:home-angle-linear" width="13"></iconify-icon>
  Premium Interior Studio
</span>
```

### 2. CTA 버튼 (프리미엄)
```html
<a class="inline-flex items-center gap-3 bg-white text-dark rounded-full px-8 py-4 text-base font-medium shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-transform">
  무료 상담 신청하기
  <span class="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
    <iconify-icon icon="solar:arrow-right-linear" width="16"></iconify-icon>
  </span>
</a>
```

### 3. 스크롤 인디케이터
```html
<div class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/60">
  <span class="text-[11px] uppercase tracking-[0.2em] font-medium">Scroll</span>
  <div class="w-[1px] h-8 bg-gradient-to-b from-white/60 to-transparent animate-pulse"></div>
</div>
```

### 4. Scroll Reveal 애니메이션
```css
.reveal {
  opacity: 0;
  transform: translateY(2rem);
  filter: blur(4px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
  filter: blur(0);
}
```

### 5. 이미지 줌 호버
```css
.img-zoom img {
  transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.img-zoom:hover img {
  transform: scale(1.05);
}
```

### 6. Floating Navigation (글래스 필 NAV)
```html
<nav class="fixed top-0 left-0 right-0 z-40 px-4 pt-5">
  <div class="max-w-6xl mx-auto">
    <div class="backdrop-blur-xl bg-white/70 border border-warm-200/50 shadow-[0_4px_30px_rgba(0,0,0,0.04)] rounded-full px-6 py-3 flex items-center justify-between">
      <!-- 로고 + 메뉴 -->
    </div>
  </div>
</nav>
```

---

## 업종별 추천 히어로 패턴

| 업종 | 1순위 | 2순위 | 금지 |
|------|-------|-------|------|
| 인테리어/건축 | 패턴1 (Frame Sequence) | 패턴4 (Parallax) | 패턴5 (너무 심플) |
| 카페/음식 | 패턴2 (Video BG) | 패턴3 (Split) | 패턴7 (과함) |
| 클리닉/병원 | 패턴3 (Split) | 패턴9 (Glass) | 패턴8 (과함) |
| 법률 | 패턴5 (Text-First) | 패턴3 (Split) | 패턴1 (과함) |
| 분양/부동산 | 패턴1 (Frame Sequence) | 패턴4 (Parallax) | 패턴5 (약함) |
| 펜션/호텔 | 패턴2 (Video BG) | 패턴6 (Grid) | 패턴5 (약함) |
| 마케팅/에이전시 | 패턴7 (Horizontal) | 패턴8 (Clip-Path) | 패턴3 (평범) |
| 반려동물 | 패턴3 (Split) | 패턴6 (Grid) | 패턴1 (과함) |
| 피트니스 | 패턴2 (Video BG) | 패턴8 (Clip-Path) | 패턴9 (약함) |
| 럭셔리/주얼리 | 패턴8 (Clip-Path) | 패턴1 (Frame) | 패턴5 (약함) |
| 교육/학원 | 패턴9 (Glass) | 패턴3 (Split) | 패턴1 (과함) |
| 웨딩 | 패턴6 (Grid) | 패턴2 (Video) | 패턴5 (약함) |

---

## 사용법

서브에이전트 태스크에 아래 삽입:
```
히어로 섹션은 docs/references/HERO_PATTERNS_LIBRARY.md 패턴 X를 기반으로 제작.
```

> 마지막 업데이트: 2026-04-02
> 출처: 아뜰리에 온 + Awwwards/FWA 수상작 분석
