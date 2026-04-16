# HARNESS EXTENSION PACK v3
## Korean Top5 하네스 **확장팩 v3** — M5 Mobile Guard 추가

> 기본 하네스(`HARNESS_KR_TOP5.md`) + EXT_v2(M1~M4) 위에 덧붙이는 **5번째 모듈**.
> 홈페이지/랜딩/UIUX/반응형/모바일 작업 시 EXT_v2와 **항상 함께** 읽는다.
> v2 파이프라인은 그대로, M5만 추가된다 (Phase 5 검증 단계에 합류).

---

## 배경 — 왜 M5가 필요한가

기존 모바일 룰은 **단편적**으로만 존재했다:
- `HARNESS_KR_TOP5.md` 4-5: 모바일 히어로 75-85vh, `clamp(44px, 12vw, 80px)` 타이포
- `HARNESS_KR_TOP5.md` 5-6: "1440/768/390 가로 스크롤 없음" 한 줄

실제 사고 사례:
- **goldapple-renewal**: 자동 QA `errors=0` 통과 → 사용자 실측 "다 깨짐" 보고 (false-negative)
- **park-sunick-cool / webgl-orb-hero**: 미디어쿼리 0개로 출발 → 모바일에서 데스크톱 폭 그대로 노출
- 자동 검증이 **과로/과탐 모두**에 약함. M2 Vision 비평은 "감"으로 잡지만 **숫자 근거**가 없음

M5는 **숫자 측정 전담**이다. M2(Vision 감각 판정)와 분담:
- **M5**: scrollWidth, getBoundingClientRect, getComputedStyle로 **결정론적 측정**
- **M2**: 시각적 깨짐, 위계 무너짐, 가독성 등 **정성 판정**

---

## M5 — Mobile Guard 개요

| 항목 | 값 |
|---|---|
| **목표** | 모바일 5뷰포트(320·375·390·414·430)에서 가로 스크롤·터치 미스·확대 강제 등 모바일 결함 0건 |
| **실행 시점** | 기본 하네스 Phase 5 검증 루프 (5-6 반응형 검증 직후, M2 Vision 직전) |
| **트리거** | 홈페이지 / 랜딩 / UIUX / 반응형 / 모바일 / responsive / mobile / hero 키워드 — EXT_v2 트리거 합류 |
| **산출물** | `./research/mobile-audit.json`, `./mobile-audit/{slug}/{vp}.png` (옵션), `./report.md`의 "Mobile Audit" 섹션 |
| **의존** | `playwright` (이미 EXT_v2에서 사용중), 신규 npm 패키지 없음 |
| **모드** | `m5: full | lite | off` (pack.config.yaml) |
| **빌드 게이트** | FAIL 1건 이상 → 배포 차단. WARN은 리포트만 |

---

## 검증 항목 10개 (v3.1 — 2026-04-17 보강)

| # | 항목 | 측정 방법 | 통과 기준 | 실패 시 |
|---|---|---|---|---|
| 1 | **overflow-x 가드** | `document.documentElement.scrollWidth > clientWidth` | scrollWidth ≤ clientWidth | **FAIL** (배포 차단) |
| 2 | **터치 타겟 44×44px** | `button, a, input[type=button|submit], [role=button]` `getBoundingClientRect()` | 모든 요소 width ≥ 44 AND height ≥ 44 | **WARN** (개수 보고) |
| 3 | **모바일 폰트 16px+** | `input, textarea, select`의 `getComputedStyle().fontSize` | input/textarea/select ≥ 16px (iOS 자동 줌 방지) | input < 16: **FAIL** / 본문 < 14: **WARN** |
| 4 | **mobile-first 룰 강제** | 정적 HTML: `@media` 쿼리 정규식 카운트 / Tailwind: `sm:`, `md:`, `lg:` 클래스 prefix 카운트 | 정적 ≥ 1, Tailwind ≥ 5 | **FAIL** |
| 5 | **100vh 금지** | CSS 텍스트 정규식 `\b100vh\b` 매칭 | 0건 OR `100svh/100dvh/100lvh`로 대체 | **WARN** + 권장 |
| 6 | **img srcset 강제** | `<img>` 중 `naturalWidth * naturalHeight * 4 / 1024` ≥ 200KB 추정인데 `srcset` / `<picture>` 없음 | 200KB+ 이미지 100% srcset 보유 | **WARN** (개수) |
| 7 | **fixed/sticky 가림 측정** | `position: fixed|sticky` 요소 합산 height / viewport height | 합 ≤ 30% | **WARN** |
| 8 | **가로폭 100% 초과** | `img, table, pre, iframe, video` 각각 `scrollWidth > viewport.width` | 모든 요소 ≤ viewport | **FAIL** |
| 9 | **클립 트랩 감지** ⭐ | `html` 또는 `body`의 `overflow-x: hidden\|clip\|scroll` 적용 여부 | 메타데이터 (clipped 사이트는 항목 10 정밀 평가) | INFO (기록만) |
| 10 | **잠재 오버플로** ⭐ | 모든 `body *`의 `getBoundingClientRect().right > viewport.width`. root scrollWidth는 통과인데 자식이 viewport 밖 (clipped trap) | 0건 OR offender right - viewport ≤ 50px | +50px↑: **FAIL** / +1~50px: **WARN** |

⭐ = v3.1 신규 (2026-04-17 — goldapple/saeumdental/onda-mindmap에서 발견된 false-negative 패턴 대응)

### 9·10번 룰 배경
이전 자동 QA가 `errors=0`인데 사용자가 "다 깨짐" 보고한 패턴 = `body { overflow-x: hidden }` 으로 root scrollWidth는 막혔지만 **자식 요소(div.bg-mark width=694px, div.swiper-slide width=320px 등)가 viewport 밖**.
- iOS 모멘텀 스크롤·접근성 줌·디바이스 회전 시 노출되어 깨짐
- 5/5 검증 사이트에 `overflow-x:hidden` 트랩 존재, 3/5에서 +50px 이상 잠재 오버플로 발견

### 측정 정밀도
- 모든 측정은 `page.evaluate()` 내부 DOM API로 수행 (Playwright → 브라우저 → 실측)
- `waitUntil: 'networkidle'` + 추가 600ms `waitForTimeout`으로 폰트/이미지 로드 대기
- viewport 변경 후 200ms 대기 (CSS transition flush)
- 항목 10은 `position: fixed` 요소 제외 (항목 7과 중복 방지)

### 측정 정밀도
- 모든 측정은 `page.evaluate()` 내부 DOM API로 수행 (Playwright → 브라우저 → 실측)
- `waitUntil: 'networkidle'` + 추가 600ms `waitForTimeout`으로 폰트/이미지 로드 대기
- viewport 변경 후 200ms 대기 (CSS transition flush)

---

## 5뷰포트 매트릭스

| 슬롯 | width | height | 대상 디바이스 | 우선도 |
|---|---|---|---|---|
| `vp_320` | 320 | 568 | iPhone SE 1st (최소폭) | 필수 |
| `vp_375` | 375 | 667 | iPhone SE 2/3, Mini | 필수 |
| `vp_390` | 390 | 844 | iPhone 14/15 표준 | 필수 |
| `vp_414` | 414 | 896 | iPhone XR/Plus | 권장 |
| `vp_430` | 430 | 932 | iPhone 15 Pro Max | 권장 |

`m5: lite` → `vp_320, vp_375, vp_390` 3개만
`m5: full` → 5개 전부

`deviceScaleFactor: 2`, `isMobile: true`, `hasTouch: true` 강제 설정 (실제 모바일 환경 시뮬레이션).

---

## 빌드 게이트 (배포 차단 조건)

다음 중 1개라도 발생 시 `report.md`에 BLOCKER 표시 + CI exit 1:

1. 항목 1 (overflow-x) FAIL — 어느 뷰포트라도
2. 항목 3 (input 폰트 < 16px) FAIL
3. 항목 4 (미디어쿼리 0개) FAIL
4. 항목 8 (가로폭 100% 초과) FAIL
5. **항목 10 (잠재 오버플로 +50px↑) FAIL** ⭐ v3.1

WARN(2/5/6/7)은 누적 카운트만 리포트, 차단하지 않음. 단 `m5: full` + WARN 5개 이상이면 **soft-block**(M2 Vision 우선 검토 후 통과 가능).

---

## 적용 방식 — `pack.config.yaml`

```yaml
modules:
  M1: lite
  M2: lite
  M3: on
  M4: full
  M5: full          # off | lite | full          ← 신규

m5_options:
  viewports: [320, 375, 390, 414, 430]   # full 시 5개, lite 시 앞 3개
  screenshot: true                        # 뷰포트별 PNG 캡처
  screenshot_dir: ./mobile-audit
  block_on_warn_count: 5                  # full 모드: WARN 5개 이상 시 soft-block
  large_image_threshold_kb: 200           # 항목 6 임계
  fixed_overlay_max_pct: 30               # 항목 7 임계
```

### 프로젝트 타입별 기본값 (v2 매트릭스 확장)

| 프로젝트 | M1 | M2 | M3 | M4 | **M5** |
|---|---|---|---|---|---|
| 첫 테스트 (베이스라인) | - | - | - | - | **off** |
| 일반 Kmong 납품 (150~500k) | Lite | Lite | 자동 | Lite | **lite** |
| 프리미엄 납품 (500k~1.5M) | Lite | Full | 자동 | Full | **full** |
| 포트폴리오 자체 프로젝트 | Full | Full | 자동 | - | **full** |
| ONDA 서비스 표준 패키지 | Lite | Lite | 자동 | Full | **full** |

**Kmong/Wishket 납품은 모바일 발견율이 높으니 lite 이상 강력 권장.**

---

## M2 Vision 비평과의 분담

| 항목 | M5 (자동 측정) | M2 (Vision LLM) |
|---|---|---|
| 가로 스크롤 발생 | scrollWidth 비교 | 화면 잘림 인지 |
| 터치 타겟 크기 | rect 측정 | "버튼이 답답해 보임" |
| 폰트 가독성 | getComputedStyle | "글자가 깨져 보임" / "너무 작음" |
| 위계 무너짐 | 미감지 | **M2 전담** |
| 색상 부조화 | 미감지 | **M2 전담** |
| 줄바꿈 어색함 | 미감지 | **M2 전담** |

→ **M5는 0/1 결정론, M2는 감각 판정**. 둘 다 통과해야 배포.

---

## 트리거 키워드 (EXT_v2 합류)

다음 키워드가 사용자 요청 또는 작업 메타에 등장하면 M5 자동 활성화:

```
홈페이지 / 랜딩 / UIUX / 반응형 / 모바일 / mobile / responsive
hero / landing / homepage / website / site / web / page
viewport / breakpoint / 미디어쿼리 / @media
```

EXT_v2와 동시 트리거. 즉, 모바일 키워드가 보이면 **M1~M5 전부 활성화**.

---

## 호출 인터페이스 — `mobile-guard.js`

```js
const { auditMobile, auditMobileBatch, formatReport } = require('/home/onda/shared/lib/mobile-guard');

// 단일 URL
const result = await auditMobile('https://example.com', {
  viewports: ['vp_320', 'vp_375', 'vp_390', 'vp_414', 'vp_430'],
  screenshot: true,
  screenshotDir: './mobile-audit',
  largeImageKb: 200,
  fixedOverlayMaxPct: 30,
});

console.log(formatReport(result));

// 배치
const results = await auditMobileBatch([
  'https://goldapple-renewal.pages.dev',
  'https://park-sunick-cool.pages.dev',
]);
```

### 결과 객체 형식

```json
{
  "url": "https://...",
  "timestamp": "2026-04-15T...",
  "viewports": {
    "vp_375": {
      "pass": false,
      "fail": ["overflow_x", "media_queries"],
      "warn": ["touch_target:3", "font_small:2"],
      "metrics": {
        "scrollWidth": 412,
        "clientWidth": 375,
        "touchTargets": { "total": 18, "fail": 3, "failSelectors": ["a.btn-x", ...] },
        "fontSizes": { "min": 12, "inputMin": 14 },
        "mediaQueries": 0,
        "tailwindBreakpoints": { "sm": 0, "md": 0, "lg": 2 },
        "has100vh": true,
        "vh100Count": 4,
        "largeImagesNoSrcset": 2,
        "fixedOverlayPct": 12,
        "overflowElements": [
          { "tag": "iframe", "selector": "iframe.youtube", "scrollWidth": 560 }
        ]
      }
    }
  },
  "summary": {
    "totalFails": 4,
    "totalWarns": 12,
    "blockers": ["overflow_x@vp_320", "overflow_x@vp_375", "media_queries@vp_320", "..."],
    "passViewports": ["vp_414", "vp_430"]
  }
}
```

---

## report.md 추가 섹션 (M5 활성 시)

```
## Mobile Audit (M5)

| Viewport | Pass | Fails | Warns | scrollWidth | Touch fail | Font min |
|----------|------|-------|-------|-------------|------------|----------|
| vp_320   | ❌   | overflow_x, media_queries | touch_target:5 | 412 | 5 | 11 |
| vp_375   | ❌   | overflow_x | touch_target:3 | 412 | 3 | 12 |
| ...

### Blockers (배포 차단)
- overflow_x @ vp_320, vp_375, vp_390 — body scrollWidth 412 > 375
- media_queries — @media 쿼리 0개 (Tailwind sm/md/lg prefix도 0)

### 권장 조치
- iframe.youtube → max-width: 100% + height: auto 적용
- 미디어쿼리 추가 또는 Tailwind 반응형 클래스 추가
```

---

## v2에서 변경된 것

- M1~M4: **변경 없음** (그대로 사용)
- M5 신규 추가
- pack.config.yaml에 `M5`, `m5_options` 키 추가
- 프로젝트 타입 매트릭스에 M5 컬럼 추가
- 트리거 키워드 풀 확장 (모바일/반응형 추가)

---

## 중요 원칙 (v3 추가)

1. **자동 검증의 false-negative 방지가 v3 핵심 동기**: errors=0이라도 사용자 실측이 깨지면 자동 검증이 부족한 것. M5는 그 갭을 메운다.
2. **숫자와 감각의 분담**: M5 = 결정론, M2 = 정성. 두 모듈 결과를 OR가 아닌 AND로 묶는다 (둘 다 통과해야 배포).
3. **모바일 우선 비용**: M5 lite는 5뷰포트 × 8체크 ≈ 40초/URL. CI 부담 적음. full도 1분 미만.
4. **신규 의존성 0**: playwright는 이미 있음. node 표준 라이브러리만으로 작동.

---

## 다음 단계 (M5 운영 후 검토)

- 운영 4주 후 통계: WARN/FAIL 빈도 Top 항목 → 임계 재조정
- 빈번 FAIL 항목은 SITE_GENERATOR_RULES.md에 사전 방지 규칙으로 승격
- M6 후보: **Web Vitals Guard** (LCP/CLS/INP 자동 측정) — 우선순위 보고 결정
