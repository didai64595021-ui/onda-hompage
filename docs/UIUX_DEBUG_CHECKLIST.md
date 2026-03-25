# UIUX 사전 디버깅 프롬프트 (서브에이전트용)

> 모든 UIUX 포트폴리오 서브에이전트 태스크에 이 프롬프트를 포함할 것.
> 이 문서는 마르다누수탐지 프로젝트에서 발견된 실제 오류 + 파생 오류 전체를 기반으로 작성됨.

---

## [프롬프트 — 복사해서 태스크에 붙여넣기]

```
## 필수 준수: UIUX 사전 디버깅 규칙 (위반 시 커밋 금지)

### A. 빈 공백 / 높이 제어
1. min-height: 100vh 이상(200vh, 300vh 등) 절대 사용 금지. auto 또는 fit-content만.
2. position: sticky 부모 → 과도한 높이 금지. 콘텐츠 높이에 맞춰라.
3. 모든 <section>은 height: auto. 고정 높이로 빈 공간 만들지 마라.
4. parallax/scrub/스크롤 트리거 섹션 → 모바일에서 min-height: auto 오버라이드 필수.
5. 섹션 padding: 최대 64px 0. 96px 이상 금지.

### B. 스크롤 애니메이션 / fade-in
1. opacity: 0으로 시작하는 요소 → 기본값 반드시 opacity: 1.
2. JS에서 el.style.opacity = '0' 인라인 스타일 절대 금지. CSS 클래스로만 제어.
3. 패턴:
   - CSS 기본: .fade-in { opacity: 1; transform: none; }
   - JS 로드 후: .js-scroll-reveal .fade-in:not(.revealed) { opacity: 0; transform: translateY(30px); }
   - 나타남: .js-scroll-reveal .revealed { opacity: 1; transform: none; }
   - JS: document.body.classList.add('js-scroll-reveal') + IntersectionObserver로 .revealed 추가.
4. above-fold 요소는 IntersectionObserver가 즉시 트리거 → 바로 revealed.
5. JS 미실행/미지원 시에도 모든 콘텐츠 보여야 함 (opacity:1 기본).

### C. 이미지
1. 모든 <img>: display: block; object-fit: cover; width: 100%; height: 100%;
2. <img>에 width, height HTML 속성 필수 (CLS 방지). 예: <img src="..." width="800" height="600">
3. 부모 컨테이너: overflow: hidden + aspect-ratio: 4/3 또는 명시적 높이.
4. loading="lazy" 사용 금지 — 이미지 15장 미만이면 전부 즉시 로드.
   (lazy-loading은 뷰포트 밖 이미지를 안 로드해서 빈 박스 원인됨)
5. filter: grayscale(100%) 사용 금지 — 현장 사진은 컬러로 보여야 의미 있음.
   호버 효과 원하면 brightness(1.05) 정도만.
6. 세로 사진: object-position: center center.
7. 이미지 경로 반드시 ls로 실존 확인.
8. onerror="this.style.display='none'" 사용 금지 — 빈 공간 발생.
   대신 aspect-ratio + background-color로 placeholder.

### D. 사진-텍스트 매칭
1. 사진 배치 전 실제 내용 확인 (파일명만 보고 배치 금지).
2. "배관 탐지" 옆에는 배관 사진, "방수" 옆에는 방수 사진. 의미 일치 필수.
3. alt 텍스트 = 실제 사진 내용. "시공 현장 1" 같은 generic 금지.
4. 갤러리 라벨도 실제 사진과 일치.

### E. 반응형 5개 뷰포트
1. 375px (iPhone SE): 1열, font-size 축소, padding 12~16px
2. 480px (소형 모바일): 1열
3. 768px (태블릿): 2열 그리드, 햄버거 메뉴
4. 1024px (데스크톱): 3열 가능, 네비 펼침
5. 1440px (대형): max-width 1200px, 좌우 여백 균등

### F. 모바일 필수 CSS (styles.css 최상단에 포함)
*, *::before, *::after { box-sizing: border-box; }
html, body { overflow-x: hidden; }
html { scroll-behavior: smooth; }
body { word-break: keep-all; overflow-wrap: break-word; }
img { max-width: 100%; height: auto; display: block; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; width: 100%; }
button, a, [role="button"] { min-height: 48px; min-width: 48px; }

@media (max-width: 768px) { .container { padding: 0 16px; } section { padding: 48px 0; } }
@media (max-width: 480px) { section { padding: 32px 0; } }

### G. 한글 폰트
1. 영문 전용 폰트(Playfair Display, Bricolage Grotesque 등) → 한글 텍스트에 적용 금지.
   한글에 적용하면 "평면안내" → "경ㄴ ㄴ ㅐ" 같이 깨짐.
2. 한글: 'IBM Plex Sans KR', 'Pretendard', sans-serif 등 한글 지원 폰트만.
3. 모든 font-family에 sans-serif 또는 serif fallback 필수.
4. 제작 후: grep -n "Playfair\|Bricolage" *.html 으로 한글 요소 적용 여부 확인.

### H. 가로스크롤 방지
1. html, body { overflow-x: hidden; } 필수.
2. 100vw 사용 금지 — 스크롤바 때문에 가로스크롤 발생. 100% 사용.
3. 고정 px 너비 → max-width: 100% 제한.

### I. 접근성
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

### J. 링크/기능 검증
1. tel: 전화번호 링크 정확성.
2. 카카오톡/외부 링크 URL 정확성.
3. 페이지 간 네비 링크 상호 연결 (index↔service).
4. 앵커 링크(#hero 등) 실제 id 존재 확인.
5. 사업자번호/주소/연락처 오타 확인.

### K. 카드 높이 / 그리드
1. display: flex + align-items: stretch 또는 display: grid로 카드 높이 균일.
2. 각 카드 min-height 통일.
3. 이미지 카드: aspect-ratio: 4/3 또는 16/9 필수.

### L. 자체 스크린샷 검증 (제작 완료 후 필수)
cd /path/to/site && python3 -m http.server 8765 &
sleep 2
npx playwright screenshot --viewport-size="375,900" --full-page "http://localhost:8765/index.html" "/tmp/check-375.png"
npx playwright screenshot --viewport-size="1440,900" --full-page "http://localhost:8765/index.html" "/tmp/check-1440.png"
kill %1

확인 항목:
- 빈 공백 영역 없음 (흰색 영역 30% 이하)
- 이미지 전부 표시됨 (회색 빈 박스 0개)
- 텍스트 겹침/잘림 없음
- 카드/그리드 정상 배치
- CTA 버튼 눈에 띄게 보임
- 푸터 정상 표시

**문제 발견 시 자체 수정 후 재검증. 빈 공백 30% 이상이면 커밋 금지.**

### M. 커밋 전 최종 확인
grep -c "images/" index.html      # 이미지 수 확인
grep -c "tel:" index.html          # 전화 링크 확인
grep -c "box-sizing" styles.css    # 1 이상
grep -c "overflow-x" styles.css    # 1 이상
grep -c "word-break" styles.css    # 1 이상
grep -c "sans-serif" styles.css    # 2 이상
```

## [프롬프트 끝]

---

## 발견된 실제 오류 기록 (근거)

| # | 오류 | 원인 | 파생 문제 | 해결 |
|---|------|------|----------|------|
| 1 | 빈 공백 70% | min-height: 300vh | 페이지 대부분 빈 흰색 | auto로 변경 |
| 2 | 이미지 90% 누락 | loading="lazy" + 뷰포트 밖 | 회색 빈 박스 | lazy 제거 |
| 3 | fade-in 안보임 | JS el.style.opacity='0' 인라인 | 모든 below-fold 투명 | CSS 클래스 방식 |
| 4 | 이미지 회색 | filter: grayscale(100%) | 사진이 회색 박스처럼 보임 | grayscale 제거 |
| 5 | 사진 불일치 | 파일명만 보고 배치 | "방수" 옆에 배관 수리 사진 | 비전 분석 후 재배치 |
| 6 | 한글 깨짐 | 영문폰트 한글 적용 | 글자 깨짐 | 한글폰트로 교체 |
| 7 | 가로스크롤 | overflow-x 미설정 | 모바일 가로 스크롤 | hidden 추가 |
| 8 | CLS | img width/height 없음 | 레이아웃 이동 | HTML 속성 추가 |
| 9 | 카드 높이 불균일 | flex/grid 미적용 | 들쭉날쭉 카드 | stretch 적용 |
| 10 | 섹션 과도한 여백 | padding: 96px | 빈 공간 느낌 | 64px로 축소 |
| 11 | sticky 빈 공간 | sticky 부모 height:100vh | 스크롤 시 빈 영역 | auto로 변경 |
| 12 | 텍스트 겹침 | header fixed + padding 부족 | 히어로 텍스트 가림 | padding-top 확보 |

---

*최종 갱신: 2026-03-26*
*프로젝트: 마르다누수탐지 홈페이지 (leak-detection)*
*디버깅 라운드: 7회 (2/10 → 9/10 달성)*
