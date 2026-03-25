# UIUX 디버깅 체크리스트 — 서브에이전트 프롬프트용

> 아래 전문을 서브에이전트 태스크 프롬프트에 복붙하여 사용.

---

## [프롬프트 시작]

너는 포트폴리오 웹사이트를 제작하는 코딩 에이전트다.
아래 12개 규칙을 **모든 파일에 반드시 적용**하라. 위반 시 커밋 금지.

---

### 규칙 1: 빈 공백 금지
- `min-height: 100vh` 이상 (200vh, 300vh 등) 절대 사용하지 마라. `auto` 또는 `fit-content`만 허용.
- `position: sticky` 부모에 과도한 높이 지정 금지. 콘텐츠 높이에 맞춰라.
- 모든 `<section>`은 `height: auto`. 고정 높이로 빈 공간 만들지 마라.
- parallax/scrub 섹션 → 모바일에서 반드시 `min-height: auto`로 오버라이드.

### 규칙 2: fade-in 요소는 JS 없이도 보여야 한다
- `opacity: 0`으로 시작하는 요소 → 기본값은 반드시 `opacity: 1`.
- JS의 `el.style.opacity = '0'` 인라인 스타일 사용 금지. CSS 클래스로만 제어.
- 적용 패턴:
```css
/* 기본: 항상 보임 */
.fade-in, .services__card, .process__step {
  opacity: 1;
  transform: none;
}
/* JS 로드 후에만 애니메이션 활성화 */
.js-scroll-reveal .fade-in,
.js-scroll-reveal .services__card,
.js-scroll-reveal .process__step {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
/* 스크롤로 뷰포트 진입 시 */
.js-scroll-reveal .revealed {
  opacity: 1;
  transform: none;
}
```
- JS에서: `document.body.classList.add('js-scroll-reveal')` 후 IntersectionObserver로 `.revealed` 클래스 추가.

### 규칙 3: 이미지 반드시 표시
- 모든 `<img>`: `display: block; object-fit: cover; width: 100%; height: 100%;`
- `<img>`에 `width`, `height` HTML 속성 필수 (CLS 방지). 예: `<img src="..." width="800" height="600">`
- 부모 컨테이너: `overflow: hidden` + `aspect-ratio: 4/3` 또는 명시적 높이.
- 히어로 외 이미지: `loading="lazy"` 필수.
- 세로 사진: `object-position: center center`.
- 이미지 경로 실존 여부 반드시 `ls`로 확인.

### 규칙 4: 사진-텍스트 매칭
- 사진 배치 전 실제 내용을 확인하라 (파일명만 보고 배치 금지).
- "배관 탐지" 옆에는 배관 사진, "방수" 옆에는 방수 사진. 의미가 일치해야 한다.
- `alt` 텍스트도 실제 사진 내용에 맞게 작성.
- 갤러리 라벨도 실제 사진과 일치.

### 규칙 5: 반응형 5개 뷰포트 필수
- **375px** (iPhone SE): 1열, font-size 축소, padding 12~16px
- **480px** (소형 모바일): 1열
- **768px** (태블릿): 2열 그리드, 햄버거 메뉴
- **1024px** (데스크톱): 3열 가능, 네비 펼침
- **1440px** (대형): max-width 1200px 컨테이너, 좌우 여백 균등

### 규칙 6: 모바일 필수 CSS (반드시 styles.css 상단에 포함)
```css
*, *::before, *::after { box-sizing: border-box; }
html, body { overflow-x: hidden; }
html { scroll-behavior: smooth; }
body { word-break: keep-all; overflow-wrap: break-word; }
img { max-width: 100%; height: auto; display: block; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; width: 100%; }
button, a, [role="button"] { min-height: 48px; min-width: 48px; }

@media (max-width: 768px) {
  .container { padding: 0 16px; }
  section { padding: 48px 0; }
}
@media (max-width: 480px) {
  section { padding: 32px 0; }
}
```

### 규칙 7: 한글 폰트 깨짐 방지
- 영문 전용 폰트(Playfair Display, Bricolage Grotesque 등)를 한글 텍스트에 적용하지 마라.
- 한글 텍스트: `'IBM Plex Sans KR', 'Pretendard', sans-serif` 등 한글 지원 폰트만.
- 모든 font-family에 `sans-serif` 또는 `serif` fallback 필수.
- 제작 후 `grep -n "Playfair\|Bricolage" *.html`로 한글 요소에 적용된 곳 없는지 확인.

### 규칙 8: 가로스크롤 방지
- `html, body { overflow-x: hidden; }` 필수.
- `100vw` 사용 주의 — 스크롤바 때문에 가로스크롤 발생. `100%` 사용.
- 고정 px 너비 요소 → `max-width: 100%` 제한.

### 규칙 9: 접근성 (prefers-reduced-motion)
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 규칙 10: 링크/기능 전수 검증
- `tel:` 전화번호 링크 정확성.
- 카카오톡/외부 링크 URL 정확성.
- 페이지 간 네비 링크 상호 연결 (index↔service 등).
- 앵커 링크(#hero, #services 등)의 실제 id 존재 확인.
- 사업자번호/주소/연락처 오타 없는지 확인.

### 규칙 11: 자체 스크린샷 검증 (제작 완료 후 필수 실행)
```bash
cd /path/to/site && python3 -m http.server 8765 &
sleep 2
npx playwright screenshot --viewport-size="375,900" --full-page "http://localhost:8765/index.html" "/tmp/check-375.png"
npx playwright screenshot --viewport-size="1440,900" --full-page "http://localhost:8765/index.html" "/tmp/check-1440.png"
kill %1
```
스크린샷 확인 항목:
- 빈 공백 영역 없음
- 이미지 전부 표시됨 (opacity:0으로 안 보이는 곳 없음)
- 텍스트 겹침/잘림 없음
- 카드/그리드 정상 배치
- CTA 버튼 눈에 띄게 보임
- 푸터 정상 표시

**문제 발견 시 자체 수정 후 재검증. 문제 0개여야 커밋 가능.**

### 규칙 12: 커밋 전 최종 검증
```bash
# HTML 문법
grep -c "images/photo" index.html   # 이미지 삽입 수 확인
grep -c "tel:" index.html           # 전화 링크 수 확인
grep -c "kakao\|카카오" index.html   # 카카오 링크 확인

# CSS 필수사항
grep -c "box-sizing" styles.css     # 1 이상
grep -c "overflow-x" styles.css     # 1 이상
grep -c "word-break" styles.css     # 1 이상
grep -c "sans-serif" styles.css     # 2 이상 (fallback)
```

## [프롬프트 끝]

---

## 메인 세션 사용법

서브에이전트 태스크에 아래 한 줄 추가:
```
제작 시 /home/onda/projects/onda-hompage/docs/UIUX_DEBUG_CHECKLIST.md 전 항목 준수. 완료 후 자체 스크린샷 검증.
```

또는 위 [프롬프트 시작]~[프롬프트 끝] 구간을 태스크 프롬프트에 직접 복붙.

---

*최종 갱신: 2026-03-26*
*근거: 마르다누수탐지 홈페이지 디버깅에서 발견된 실제 문제들*
*문제: 빈공백 70%, 이미지 90% 누락, 레이아웃 붕괴, fade-in opacity:0 인라인 스타일*
