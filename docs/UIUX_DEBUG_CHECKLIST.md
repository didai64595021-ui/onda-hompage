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

### K. CMS 이미지 / 캐시
1. CMS에서 이미지 교체 시 반드시 캐시 버스팅: `src += '?_t=' + Date.now()`
2. data: URL(base64)이면 캐시 버스팅 불필요 (indexOf('data:') !== 0 체크).
3. `aspect-ratio` 사용 시 반드시 IE/Edge 폴백: `@supports not (aspect-ratio: X/Y) { padding-top: 비율%; img { position: absolute; top:0; left:0; } }`
4. 모든 img에 `display: block` 필수 (인라인 이미지 하단 갭 방지).
5. 플로팅 버튼/고정바 있는 페이지: `body { padding-bottom: 충분한px }` — 콘텐츠 가림 방지.
6. 모바일에서 플로팅 버튼이 CTA와 겹치면 → 플로팅 숨김 or 위치 조정.
7. 비포/애프터 슬라이더: 두 이미지 동일 비율 필수 (크롭으로 맞춤).
8. **CMS 이미지 비율 자동 감지 필수** — `el.onload`에서 `naturalWidth/naturalHeight`와 `parent` 비율 비교, 차이 40%+ 시 `object-fit: contain` + 배경색 전환. 세로사진→가로컨테이너 잘림 방지.
9. 정사각형/세로형/가로형 혼재 이미지를 한 그리드에 넣을 때 → 비율 감지 로직 필수.
10. **파일 업로드 핸들러 2중 보장**: (1) initUploadZones()로 드래그앤드롭 존 생성 + (2) `data-upload-for` input에 직접 change 이벤트 리스너. 둘 중 하나라도 빠지면 파일 선택 안 먹힘.
11. **파일→base64→URL필드 연결 필수**: FileReader.readAsDataURL → 결과를 `data-key` input.value에 대입 → 저장 시 localStorage에 포함.
12. **기본 이미지 비율 감지**: CMS 교체 이미지뿐 아니라 **페이지 로드 시 모든 img**에 비율 감지 적용. `window.addEventListener('load', ...)` 에서 전체 순회.
13. **제작 후 반드시 테스트**: admin에서 파일 선택 → URL 필드에 base64 표시 → 저장 → 프론트에서 이미지 변경 확인. 이 플로우 1번이라도 안 되면 커밋 금지.
14. **Cloudflare KV 클라우드 저장 필수** — localStorage만으로는 PC↔모바일 동기화 안 됨. 모든 CMS 사이트에 KV Worker 연동 필수.
15. **CMS 데이터 로드 순서**: localStorage(즉시) → KV fetch(비동기) → KV 데이터 도착 시 localStorage 갱신 + UI 재적용.
16. **CMS Worker API**: `https://onda-cms-api.onda-workers.workers.dev/?site={사이트ID}` — GET(읽기, 인증없음), PUT(저장, X-CMS-Password 헤더 필수).
17. **새 사이트 추가 시**: KV에 `pw-{사이트ID}` 키로 SHA256 해시 저장 필요.

### K2. 카드 높이 / 그리드
1. display: flex + align-items: stretch 또는 display: grid로 카드 높이 균일.
2. 각 카드 min-height 통일.
3. 이미지 카드: aspect-ratio: 4/3 또는 16/9 필수.

### L. CMS 전체 커버리지 (최초 생성 시 필수)
1. **모든 텍스트 요소**(h1~h6, p, span, li, a, button)에 `data-cms` 속성 필수.
2. **모든 이미지**(<img>)에 `data-cms` 속성 필수 (SVG 아이콘 제외).
3. admin.html에 **모든 data-cms 키**에 대한 편집 필드 존재해야 함.
4. admin.html DEFAULTS 객체에 **모든 키** 등록 (텍스트=실제값, 이미지='').
5. 이미지 필드는 URL input + file upload(base64) 둘 다 지원.
6. 전화번호/카카오 일괄 교체 스크립트 포함.
7. CMS 로드 시 이미지 캐시 버스팅(`?_t=Date.now()`) 필수.
8. 검증: `grep -c 'data-cms=' *.html` → 텍스트/이미지 수와 일치해야 함.
9. **"CMS에서 수정 못 하는 텍스트/이미지 = 0개"가 목표.**

### L2. 다각화 검증 체계 (제작 완료 후 필수, 모든 방법 병행)

#### 검증 1: Playwright 기능 테스트
```python
# 최소 검증 항목:
# 1. 로그인(비밀번호 입력 → Enter → 오버레이 hidden)
# 2. 편집 필드 수 >= 예상 (data-key 셀렉터)
# 3. 패널 존재 확인 (document.getElementById)
# 4. 이미지 필드 + 파일 업로드 수 일치
# 5. 저장 → localStorage 반영
# 6. 프론트(index/service/contact) data-cms 수
# 7. 프론트 텍스트 반영 (저장값 = 프론트 표시값)
# 8. 초기화 → localStorage null
```

#### 검증 2: 비전 AI (admin 스크린샷)
```python
# admin.html 풀페이지 스크린샷 → 비전 AI 분석
# 확인: 사이드바 메뉴 전체 표시, 폼 레이아웃, 입력필드 정상, 다크테마 일관성
page.screenshot(path='/tmp/admin-vision.png', full_page=True)
```

#### 검증 3: 비전 AI (프론트 스크린샷 — PC + 모바일)
```python
# PC(1440px) + 모바일(375px) 풀페이지 → 비전 AI
# 확인: 빈 공백 없음, 이미지 전부 표시, 텍스트 겹침/잘림 없음, CTA 정상
for vp in [(1440,900), (375,812)]:
    page = browser.new_page(viewport={'width':vp[0],'height':vp[1]})
    page.screenshot(path=f'/tmp/front-{vp[0]}.png', full_page=True)
```

#### 검증 4: HTML 정적 분석
```bash
# CMS 커버리지
grep -c 'data-cms=' *.html
# 이미지 경로 실존
grep -oP 'src="([^"]+)"' index.html | while read src; do ls "$src" 2>/dev/null || echo "MISSING: $src"; done
# 한글 폰트 깨짐 방지
grep -n "Playfair\|Bricolage" *.html
# 가로스크롤 방지
grep -c "overflow-x" styles.css
```

#### 검증 5: 크로스 브라우저 (캐시/호환성)
- CMS 이미지 캐시 버스팅 (`?_t=Date.now()`) 확인
- `aspect-ratio` IE 폴백 (`@supports not`) 확인
- `img { display: block }` 확인

**5가지 검증 중 1개라도 FAIL → 수정 후 재검증. 전체 PASS 후에만 커밋.**

### L3. 자체 스크린샷 검증 (제작 완료 후 필수)
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
| 13 | CMS 이미지 브라우저별 다르게 표시 | 브라우저 캐시로 이전 이미지 로드 | 크롬/IE에서 서로 다른 이미지 보임 | CMS 로드 시 `?_t=Date.now()` 캐시 버스팅 |
| 14 | 이미지 카드 크기 브라우저 불일치 | IE/Edge 구버전 aspect-ratio 미지원 | 카드 이미지 높이 제각각 | `@supports not` 폴백 padding-top |
| 15 | img 하단 갭 | img가 inline 요소 기본값 | 이미지 아래 3~4px 빈 공간 | `img { display: block }` |
| 16 | 플로팅버튼↔CTA 겹침 | 모바일에서 position fixed 요소들 충돌 | 버튼 클릭 불가 | 모바일에서 플로팅 숨김 or 위치 조정 |
| 17 | 하단 고정바↔콘텐츠 겹침 | body padding-bottom 부족 | 마지막 콘텐츠가 고정바에 가려짐 | padding-bottom: 160px |
| 18 | 비포/애프터 이미지 손상 | 원본 파일 전송 중 깨짐(하단 회색) | After 사진이 회색으로 표시 | 손상 영역 자동 크롭 + 동일 비율 맞춤 |
| 19 | CMS 이미지 잘림 | 세로사진→가로컨테이너 object-fit:cover | 사진 중요 부분 잘림 | CMS 로드 시 비율 자동감지→contain 전환 |
| 20 | 파일 업로드 안 됨 | data-upload-for input에 이벤트 리스너 없음 | 파일 선택해도 이미지 안 바뀜 | 모든 data-upload-for에 change 이벤트+FileReader 연결 |
| 21 | preview 요소 없어서 업로드존 미생성 | initUploadZones()에서 preview-{key} 없으면 return | 드래그앤드롭 영역 안 나타남 | data-upload-for 방식 fallback 핸들러 추가 |
| 22 | 기본 이미지도 잘림 | CMS 비율감지가 CMS 교체 이미지에만 작동 | 원본 이미지도 세로/정사각이면 잘림 | 페이지 로드 시 모든 img에 비율 감지 적용 |
| 23 | CMS 데이터 기기간 미동기화 | localStorage는 브라우저별 독립 | PC 수정→모바일 미반영 | Cloudflare KV 클라우드 저장 필수 |

---

*최종 갱신: 2026-03-26 22:23*
*프로젝트: 마르다누수탐지 홈페이지 (leak-detection)*
*디버깅 라운드: 7회 (2/10 → 9/10 달성)*
