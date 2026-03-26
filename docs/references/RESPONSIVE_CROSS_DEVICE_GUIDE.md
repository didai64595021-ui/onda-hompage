# 반응형 & 디바이스 크로스체킹 완전 가이드
> 수집일: 2026-03-26 | 포트폴리오 제작 시 필수 참조
> 모든 서브에이전트 태스크에 이 가이드 준수 지시 필수

---

## 📱 2025-2026 디바이스별 CSS 뷰포트 사이즈

### iPhone (CSS 픽셀 / DPR)
| 디바이스 | 뷰포트(px) | 물리(px) | DPR |
|----------|-----------|----------|-----|
| iPhone SE 3 | 375×667 | 750×1334 | 2x |
| iPhone 13 mini | 375×812 | 1080×2340 | 3x |
| iPhone 14 | 390×844 | 1170×2532 | 3x |
| iPhone 14 Pro | 393×852 | 1179×2556 | 3x |
| iPhone 14 Pro Max | 430×932 | 1290×2796 | 3x |
| iPhone 15 | 393×852 | 1179×2556 | 3x |
| iPhone 15 Pro Max | 430×932 | 1290×2796 | 3x |
| **iPhone 16** | **393×852** | 1179×2556 | 3x |
| **iPhone 16 Plus** | **430×932** | 1290×2796 | 3x |
| **iPhone 16 Pro** | **402×874** | 1206×2622 | 3x |
| **iPhone 16 Pro Max** | **440×956** | 1320×2868 | 3x |

### Samsung Galaxy (물리 픽셀, Android DPR 가변)
| 디바이스 | 해상도 | 일반 뷰포트 | DPR |
|----------|--------|------------|-----|
| Galaxy S23 | 1080×2340 | 360×780 | 3x |
| Galaxy S24 | 1080×2340 | 360×780 | 3x |
| Galaxy S24 Ultra | 1440×3120 | 360×780 | 4x |
| **Galaxy S25** | **1080×2340** | 360×780 | 3x |
| **Galaxy S25+** | **1440×3120** | 384×832 | 3.75x |
| **Galaxy S25 Ultra** | **1440×3120** | 384×832 | 3.75x |
| Galaxy Z Fold 5 | 1812×2176 (열림) | 362×672 | 2.625x |
| Galaxy Z Flip 5 | 1080×2640 | 360×880 | 3x |

### iPad (CSS 픽셀 / DPR)
| 디바이스 | 뷰포트(px) | 물리(px) | DPR |
|----------|-----------|----------|-----|
| iPad 10세대 | 820×1180 | 1640×2360 | 2x |
| iPad Air M2 | 820×1180 | 1640×2360 | 2x |
| **iPad Air 11 M3 (2025)** | **820×1180** | 1640×2360 | 2x |
| **iPad Air 13 M3 (2025)** | **1024×1366** | 2048×2732 | 2x |
| iPad Pro 11 M4 | 834×1210 | 1668×2420 | 2x |
| **iPad Pro 13 M4** | **1032×1376** | 2064×2752 | 2x |
| iPad mini 6 | 744×1133 | 1488×2266 | 2x |

### 데스크톱 모니터
| 해상도 | 비율 | 사용률(2025) |
|--------|------|------------|
| 1366×768 | 16:9 | ~15% |
| **1920×1080** | 16:9 | **~35% (1위)** |
| 1440×900 | 16:10 | ~8% |
| **2560×1440** | 16:9 | **~12%** |
| 3840×2160 (4K) | 16:9 | ~5% |
| 1536×864 | 16:9 | ~7% |

---

## 🎯 권장 브레이크포인트 시스템

### 5단계 (온다 포트폴리오 표준)
```css
/* Mobile First 접근 — 기본 스타일이 모바일 */

/* 1. 모바일 (기본) — 0~479px */
/* 기본 스타일 작성 */

/* 2. 모바일 대형 — 480px+ */
@media (min-width: 480px) { }

/* 3. 태블릿 — 768px+ */
@media (min-width: 768px) { }

/* 4. 데스크톱 — 1024px+ */
@media (min-width: 1024px) { }

/* 5. 와이드 데스크톱 — 1440px+ */
@media (min-width: 1440px) { }
```

### 추가 세분화 (필요시)
```css
@media (min-width: 375px) { }  /* iPhone SE+ */
@media (min-width: 640px) { }  /* 가로 모바일 */
@media (min-width: 1280px) { } /* 노트북 */
@media (min-width: 1920px) { } /* FHD 모니터 */
```

### max-width도 필요한 경우
```css
/* 모바일에서만 적용 */
@media (max-width: 767px) { }

/* 태블릿에서만 적용 */
@media (min-width: 768px) and (max-width: 1023px) { }
```

---

## 🐛 반응형 버그 TOP 10 & 해결법

### 1. 가로스크롤 (overflow-x)
```css
/* ❌ 문제 */
.element { width: 500px; } /* 모바일에서 뷰포트 초과 */
img { width: 100vw; }       /* 스크롤바 있으면 100vw > 화면 */

/* ✅ 해결 */
html, body {
  overflow-x: hidden;  /* 전역 방지 (최후 수단) */
}
/* 더 정밀한 방법 */
html {
  overflow-x: clip;    /* hidden보다 안전 — 스크롤바 생성 방지 */
}
.element {
  max-width: 100%;     /* 뷰포트 초과 방지 */
  width: min(500px, 100%);
}
img {
  max-width: 100%;
  height: auto;
}
```

**디버깅 방법:**
```js
// 콘솔에서 가로스크롤 원인 요소 찾기
document.querySelectorAll('*').forEach(el => {
  if (el.scrollWidth > document.documentElement.clientWidth) {
    console.log('Overflow:', el.tagName, el.className, el.scrollWidth);
  }
});
```

### 2. iOS 100vh 주소창 문제
```css
/* ❌ 문제: iOS Safari에서 100vh = 주소창 접힌 상태 기준 → 하단 잘림 */
.hero { height: 100vh; }

/* ✅ 해결: 2025 신규 뷰포트 단위 */
.hero {
  height: 100svh;  /* Small viewport = 주소창 펼쳐진 상태 (안전) */
  /* 또는 */
  height: 100dvh;  /* Dynamic = 주소창 상태에 따라 동적 변경 */
}

/* 폴백 (구형 브라우저) */
.hero {
  height: 100vh;
  height: 100svh;
}
```

| 단위 | 의미 | 용도 |
|------|------|------|
| `svh` | 주소창 펼친 상태 높이 | 히어로/풀스크린 (안전) |
| `lvh` | 주소창 접힌 상태 높이 | = 기존 100vh |
| `dvh` | 동적 (실시간 변경) | 채팅 UI 등 |

### 3. iOS Safe Area (노치/홈인디케이터)
```css
/* 전체 페이지에 safe area 패딩 */
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* 고정 하단바에 safe area 적용 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

/* 히어로에 노치 대응 */
.hero {
  padding-top: calc(80px + env(safe-area-inset-top));
}

/* HTML meta 필수 */
/* <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"> */
```

### 4. 터치타겟 크기 부족
```css
/* WCAG 2.5.8 (AA): 최소 24×24px */
/* WCAG 2.5.5 (AAA): 최소 44×44px — 권장 48×48px */

/* ❌ 문제 */
.small-btn { width: 20px; height: 20px; }

/* ✅ 해결 */
.btn, a, button, input, select, textarea {
  min-height: 48px;
  min-width: 48px;
}

/* 시각적 크기는 작게, 터치 영역은 크게 */
.icon-btn {
  width: 24px;
  height: 24px;
  padding: 12px;  /* 총 48×48px 터치 영역 */
  margin: -12px;  /* 시각적 위치 보정 */
}

/* 버튼 간 최소 간격 */
.btn-group > * + * {
  margin-left: 8px; /* 최소 8px 간격 */
}
```

### 5. 폰트 크기 & 가독성
```css
/* ❌ 문제 */
body { font-size: 12px; }    /* 너무 작음 */
input { font-size: 14px; }   /* iOS에서 자동 줌 발생 */

/* ✅ 해결 */
:root {
  /* 유동적 폰트 크기 (clamp) */
  --fs-body: clamp(0.9375rem, 0.875rem + 0.25vw, 1.125rem);  /* 15~18px */
  --fs-h1: clamp(2rem, 1.5rem + 2.5vw, 4rem);                /* 32~64px */
  --fs-h2: clamp(1.5rem, 1.25rem + 1.5vw, 2.5rem);           /* 24~40px */
  --fs-h3: clamp(1.25rem, 1.125rem + 0.75vw, 1.75rem);       /* 20~28px */
  --fs-small: clamp(0.8125rem, 0.75rem + 0.25vw, 0.9375rem); /* 13~15px */
}
body {
  font-size: var(--fs-body);
  line-height: 1.6;  /* 최소 1.5 */
}

/* iOS 자동줌 방지 */
input, select, textarea {
  font-size: 16px;  /* 16px 이상이면 iOS 줌 안 함 */
}
```

### 6. 이미지 반응형 깨짐
```css
/* ✅ 전역 리셋 */
img, video, svg {
  max-width: 100%;
  height: auto;
  display: block;
}

/* 비율 유지 + 채우기 */
.img-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

/* 반응형 이미지 (srcset) */
/* <img srcset="img-400.webp 400w, img-800.webp 800w, img-1200.webp 1200w"
       sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw"
       src="img-800.webp" alt="설명"> */

/* aspect-ratio로 CLS 방지 */
.card-img {
  aspect-ratio: 16 / 9;
  object-fit: cover;
  width: 100%;
}
```

### 7. Flexbox/Grid 모바일 깨짐
```css
/* ❌ 문제: 데스크톱 3열이 모바일에서 찌그러짐 */
.grid { display: grid; grid-template-columns: repeat(3, 1fr); }

/* ✅ 해결: auto-fill/auto-fit */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 24px;
}

/* Flex 래핑 */
.flex-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.flex-wrap > * {
  flex: 1 1 min(100%, 300px);
}
```

### 8. 한글 줄바꿈 깨짐
```css
/* ✅ 한글 필수 */
body {
  word-break: keep-all;      /* 한글 단어 단위 줄바꿈 */
  overflow-wrap: break-word;  /* 긴 영문 URL 등 강제 줄바꿈 */
  word-wrap: break-word;      /* 구형 브라우저 폴백 */
}

/* 제목에서 줄바꿈 방지 (필요시) */
.no-wrap {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
```

### 9. box-sizing 불일치
```css
/* ✅ 전역 필수 (모든 사이트 첫 줄) */
*, *::before, *::after {
  box-sizing: border-box;
}
```

### 10. 가로모드 (Landscape) 대응
```css
/* 가로모드 감지 */
@media (orientation: landscape) and (max-height: 500px) {
  /* 가로모드 모바일에서 히어로 높이 조정 */
  .hero {
    min-height: auto;
    padding: 40px 0;
  }
}
```

---

## 🧪 크로스디바이스 테스트 방법

### 방법 1: Chrome DevTools (가장 빠름)
1. F12 → 디바이스 토글 (Ctrl+Shift+M)
2. 상단 디바이스 드롭다운에서 선택
3. "Edit" → 커스텀 디바이스 추가 가능
4. 뷰포트 직접 드래그하여 모든 크기 테스트

### 방법 2: Playwright 자동 스크린샷 (서버에서)
```bash
# 설치 (이미 설치됨)
npx playwright install chromium
```
```js
// responsive-test.js
const { chromium } = require('playwright');

const viewports = [
  { width: 375, height: 812, name: 'mobile-375' },
  { width: 480, height: 854, name: 'mobile-480' },
  { width: 768, height: 1024, name: 'tablet-768' },
  { width: 1024, height: 768, name: 'desktop-1024' },
  { width: 1440, height: 900, name: 'desktop-1440' },
];

(async () => {
  const browser = await chromium.launch();
  const url = process.argv[2] || 'http://localhost:3000';
  const outDir = process.argv[3] || './screenshots';
  
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/${vp.name}.png`, fullPage: true });
    await page.close();
    console.log(`✅ ${vp.name} (${vp.width}x${vp.height})`);
  }
  
  await browser.close();
})();
```
```bash
node responsive-test.js https://example.com ./screenshots
```

### 방법 3: 셸 스크립트 (간편 래퍼)
```bash
#!/bin/bash
# responsive-check.sh <url> [output-dir]
URL="${1:?URL required}"
DIR="${2:-./screenshots}"
mkdir -p "$DIR"

VIEWPORTS="375x812 480x854 768x1024 1024x768 1440x900"

for VP in $VIEWPORTS; do
  W="${VP%x*}"
  H="${VP#*x}"
  node -e "
    const {chromium}=require('playwright');
    (async()=>{
      const b=await chromium.launch();
      const p=await b.newPage({viewport:{width:$W,height:$H}});
      await p.goto('$URL',{waitUntil:'networkidle'});
      await p.waitForTimeout(1000);
      await p.screenshot({path:'$DIR/${W}px.png',fullPage:true});
      await b.close();
      console.log('Done: ${W}x${H}');
    })();
  "
done
echo "📁 Screenshots saved to $DIR"
```

### 방법 4: 비전 AI 검증 (최종)
```bash
# 스크린샷 찍은 후 AI에게 검증 요청
# (서브에이전트 태스크에 포함)
# 검증 포인트:
# - 가로스크롤 없는지
# - 텍스트 잘림/겹침 없는지
# - 이미지 깨짐/빈공간 없는지
# - 버튼/링크 크기 적절한지
# - 전체 레이아웃 균형 맞는지
```

---

## ✅ 배포 전 필수 체크리스트

### HTML/CSS 기본
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1">`
- [ ] `*, *::before, *::after { box-sizing: border-box; }`
- [ ] `html { overflow-x: clip; }`
- [ ] `body { word-break: keep-all; overflow-wrap: break-word; }`
- [ ] `img { max-width: 100%; height: auto; }`

### 반응형 레이아웃
- [ ] 375px에서 가로스크롤 없음
- [ ] 480px에서 레이아웃 정상
- [ ] 768px에서 태블릿 전환 정상
- [ ] 1024px에서 데스크톱 전환 정상
- [ ] 1440px에서 max-width 컨테이너 동작
- [ ] 1920px+에서 레이아웃 늘어나지 않음

### 텍스트/폰트
- [ ] 본문 최소 15px (0.9375rem)
- [ ] 한글에 영문전용 폰트 미사용
- [ ] input/select 16px 이상 (iOS 줌 방지)
- [ ] line-height 1.5 이상
- [ ] 긴 텍스트 overflow 처리

### 이미지/미디어
- [ ] 모든 img에 width/height 속성 (CLS 방지)
- [ ] object-fit: cover 적용
- [ ] 이미지 URL 404 체크
- [ ] 비어보이는 이미지 → placeholder 처리

### 접근성
- [ ] 터치타겟 최소 48px
- [ ] 색상 대비 4.5:1 이상
- [ ] 키보드 네비게이션 가능
- [ ] focus 표시 visible
- [ ] alt 텍스트 존재

### iOS 대응
- [ ] 100vh → svh/dvh 사용 (또는 폴백)
- [ ] safe-area-inset 적용 (노치 디바이스)
- [ ] -webkit-overflow-scrolling: touch (필요시)
- [ ] viewport-fit=cover (필요시)

### 성능
- [ ] 이미지 WebP/AVIF 사용 (가능하면)
- [ ] lazy loading 적용 (fold 아래 이미지)
- [ ] CSS/JS 최소화
- [ ] font-display: swap

### 최종 스크린샷 검증
- [ ] 375px 스크린샷 → 비전 AI 검증
- [ ] 768px 스크린샷 → 비전 AI 검증
- [ ] 1440px 스크린샷 → 비전 AI 검증

---

## 🔧 유틸리티 CSS (복사용)

### 전역 리셋 (모든 사이트 공통)
```css
/* === 전역 리셋 === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { overflow-x: clip; scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body { 
  word-break: keep-all; 
  overflow-wrap: break-word;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
img, video, svg { max-width: 100%; height: auto; display: block; }
a { text-decoration: none; color: inherit; }
button { cursor: pointer; border: none; background: none; font: inherit; }
input, select, textarea { font-size: 16px; font: inherit; }

/* === 접근성 === */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* === 컨테이너 === */
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 clamp(16px, 4vw, 40px);
}
```

### 반응형 유틸리티
```css
/* 모바일에서만 보이기/숨기기 */
.mobile-only { display: none; }
.desktop-only { display: block; }
@media (max-width: 767px) {
  .mobile-only { display: block; }
  .desktop-only { display: none; }
}

/* 안전 영역 패딩 */
.safe-padding {
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
}
.safe-bottom {
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
```
