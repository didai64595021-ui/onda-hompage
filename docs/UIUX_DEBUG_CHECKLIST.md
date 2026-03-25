# UIUX 오류 디버깅 체크리스트 (프롬프트용)

> 모든 포트폴리오 사이트 서브에이전트 태스크에 이 체크리스트를 포함할 것.
> 제작 완료 후 반드시 전 항목 통과해야 커밋 가능.

---

## 1. 빈 공백 / 레이아웃 붕괴 방지

- [ ] `min-height: 100vh` 이상 (200vh, 300vh 등) 사용 금지 — `min-height: auto` 또는 `fit-content`
- [ ] `position: sticky` 부모에 과도한 높이 지정 금지 — sticky 컨테이너는 콘텐츠 높이에 맞출 것
- [ ] 모든 `<section>`에 `height: auto` 확인 — 고정 높이로 빈 공간 생성 방지
- [ ] 스크롤 트리거 섹션 (parallax, scrub 등) → 모바일에서 `min-height: auto`로 오버라이드

## 2. fade-in / 애니메이션 요소 가시성

- [ ] `opacity: 0`으로 시작하는 요소 → **JS 없이도 보여야 함** (기본 `opacity: 1`)
- [ ] IntersectionObserver 미지원/미실행 시에도 콘텐츠 보이게 fallback
- [ ] 패턴:
  ```css
  .fade-in { opacity: 1; transform: none; }  /* 기본 보임 */
  .js-loaded .fade-in { opacity: 0; transform: translateY(20px); transition: ... }
  .js-loaded .fade-in.is-visible { opacity: 1; transform: none; }
  ```
- [ ] `<body>` 또는 JS에서 `document.body.classList.add('js-loaded')` 추가

## 3. 이미지 표시 보장

- [ ] 모든 `<img>`에 `display: block` (인라인 갭 방지)
- [ ] `object-fit: cover` + `width: 100%` + `height: 100%` (또는 `aspect-ratio`)
- [ ] 부모 컨테이너에 `overflow: hidden` + 명시적 높이/aspect-ratio
- [ ] `<img>`에 `width`, `height` HTML 속성 추가 (CLS 방지)
- [ ] `loading="lazy"` (히어로 제외 — 히어로는 즉시 로드)
- [ ] 이미지 경로 실존 여부 확인 (`ls` 또는 `curl -I`)
- [ ] 세로 사진 → `object-position: center center`로 중심 잡기

## 4. 사진-텍스트 매칭

- [ ] 사진 실제 내용 확인 (비전 모델로 분석) 후 배치
- [ ] "배관 탐지" 텍스트 옆에 배관 사진, "방수" 옆에 방수 사진 등 의미 일치
- [ ] alt 텍스트도 실제 사진 내용에 맞게 작성
- [ ] 갤러리 라벨도 사진 실제 내용과 일치

## 5. 반응형 브레이크포인트 (5개 필수)

- [ ] **375px** (iPhone SE): 1열 레이아웃, font-size 축소, padding 12~16px
- [ ] **480px** (소형 모바일): 1열, 약간 넓은 여백
- [ ] **768px** (태블릿): 2열 그리드, 네비 햄버거 유지
- [ ] **1024px** (소형 데스크톱): 3열 가능, 네비 펼침
- [ ] **1440px** (대형 데스크톱): max-width 1200px 컨테이너, 좌우 여백 균등

## 6. 모바일 필수 CSS

```css
/* 리셋 */
*, *::before, *::after { box-sizing: border-box; }
html, body { overflow-x: hidden; }
body { word-break: keep-all; overflow-wrap: break-word; }
html { scroll-behavior: smooth; }
img { max-width: 100%; height: auto; display: block; }

/* 컨테이너 */
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; width: 100%; }

/* 터치타겟 */
button, a, [role="button"] { min-height: 48px; min-width: 48px; }

/* 모바일 오버라이드 */
@media (max-width: 768px) {
  .container { padding: 0 16px; }
  section { padding: 48px 0; }
}
@media (max-width: 480px) {
  section { padding: 32px 0; }
}
```

## 7. 한글 폰트 깨짐 방지

- [ ] 영문 폰트(Playfair Display, Bricolage Grotesque 등)를 한글 텍스트에 직접 적용 금지
- [ ] 한글 → `'IBM Plex Sans KR', 'Pretendard', sans-serif` 등 한글 지원 폰트
- [ ] font-family 체인에 반드시 `sans-serif` 또는 `serif` fallback 포함
- [ ] `grep -n "Playfair\|Bricolage" *.html`로 한글 요소에 적용된 것 없는지 확인

## 8. 가로스크롤 방지

- [ ] `overflow-x: hidden` (html, body)
- [ ] 100vw 사용 주의 — 스크롤바 포함하면 가로스크롤 발생
- [ ] 고정 px 너비 요소 → `max-width: 100%`로 제한
- [ ] 테이블/코드블록 → `overflow-x: auto`로 개별 처리

## 9. prefers-reduced-motion

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

## 10. 링크/기능 검증

- [ ] `tel:` 전화번호 링크 동작 확인
- [ ] 카카오톡 오픈채팅 링크 URL 정확성
- [ ] 페이지 간 네비 링크 상호 연결 (index↔service)
- [ ] 앵커 링크 (#hero, #services 등) 실제 id 존재 확인
- [ ] 사업자번호/주소/연락처 정확성 (오타 없는지)

## 11. 스크린샷 검증 절차

```bash
# 로컬 서버 실행
cd /path/to/site && python3 -m http.server 8765 &

# 5개 뷰포트 스크린샷
for W in 375 480 768 1024 1440; do
  npx playwright screenshot --viewport-size="${W},900" --full-page \
    "http://localhost:8765/index.html" "/tmp/site-${W}.png"
done

kill %1
```

스크린샷 비전 검증 항목:
- [ ] 빈 공백 영역 없음
- [ ] 이미지 전부 표시됨
- [ ] 텍스트 겹침/잘림 없음
- [ ] 카드/그리드 정상 배치
- [ ] CTA 버튼 눈에 띄게 보임
- [ ] 푸터 정상 표시

## 12. 서브에이전트 태스크 필수 포함 문구

```
## 제작 후 자체 검증 (필수)
1. python3 -m http.server 8765로 로컬 서버 띄우기
2. npx playwright screenshot --viewport-size="375,900" --full-page "http://localhost:8765/index.html" "/tmp/check-375.png"
3. npx playwright screenshot --viewport-size="1440,900" --full-page "http://localhost:8765/index.html" "/tmp/check-1440.png"
4. 빈 공백, 이미지 누락, 레이아웃 깨짐 확인 → 있으면 자체 수정
5. opacity:0 요소가 JS 없이도 보이는지 확인
6. kill %1 (서버 종료)
```

---

## 사용법

서브에이전트 태스크 프롬프트에 아래 추가:
```
제작 시 /home/onda/projects/onda-hompage/docs/UIUX_DEBUG_CHECKLIST.md 의 전 항목을 준수하라.
완료 후 자체 스크린샷 검증(섹션 11~12)을 실행하고 문제 있으면 자체 수정하라.
```

---

*최종 갱신: 2026-03-26*
*근거: 마르다누수탐지 홈페이지 디버깅에서 발견된 실제 문제들 기반*
