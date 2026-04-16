# HARNESS: 한국 웹사이트 상위 5% 홈페이지 리뉴얼
## Autonomous Mode — Korean Top 5% Target

> **이 하네스는 "홈페이지 관련 작업" 시 기본 프로토콜이다.**
> 사용자가 홈페이지 제작/리뉴얼을 요청하면 이 문서를 처음부터 끝까지 자율 수행한다.
> 중간에 사용자에게 질문하지 않는다. 모든 판단은 본 문서의 결정 규칙을 따른다.
> 불확실하면 규칙 우선순위대로 스스로 결론 내리고, 근거를 `./report.md`에 기록한다.

**목표 수준**: 한국 웹사이트 상위 5% (감각적 개발자 + 주니어 아트디렉터 협업 수준). Awwwards SOTD는 타겟이 아니지만, "AI가 만든 티" 완전 제거가 Pass 조건이다.

---

## 0. 전역 원칙

1. **수치 기반**: 모든 디자인 결정은 추출 JSON에 근거. "감각적으로" 금지.
2. **축 분리**: 3개 레퍼런스 짬뽕 금지. 각 축은 단일 사이트 기준.
3. **컨셉 선행**: 구현 전 디자인 메타포 한 줄이 반드시 있어야 한다.
4. **재현성**: 모든 중간 산출물은 `./research/`에 JSON으로 저장.
5. **임의값 금지**: Tailwind arbitrary value 및 인라인 스타일 금지. 전부 토큰 참조.
6. **한글 타이포 규칙**: `wordBreak: 'keep-all'`, `overflow-wrap: break-word`, 본문 `letter-spacing: -0.01em`, 제목 `letter-spacing: -0.03em ~ -0.05em`, 한글 `line-height`는 라틴보다 0.1~0.2 높게.
7. **오픈 라이선스 폰트만**: 상용 폰트 감지 시 자동 대체.
8. **레퍼런스 에셋 복제 금지**: 구조·스케일·리듬만 참고. 이미지/카피/로고 사용 금지.
9. **보수적 선택 금지**: 두 선택지 중 고민되면 **더 과감한 쪽** 채택. "깔끔하고 안전한" 옵션이 바로 AI 티의 원천.
10. **실패 시 대응**: 네트워크 2회 재시도 후 실패하면 해당 사이트 제외하고 진행, `report.md`에 명시.

---

## 1. 입력

- 레퍼런스 A/B/C: 사용자가 지정한 URL (3개 권장)
- 리뉴얼 대상: 사용자가 지정한 URL
- HTTPS 인증서 문제는 `ignoreHTTPSErrors: true`로 우회

## 2. 스택 기본값 (Phase 3에서 승급 가능)

- Next.js 14 App Router + TypeScript + TailwindCSS
- 애니메이션: **GSAP + ScrollTrigger + Lenis** (Framer Motion은 UI 마이크로 인터랙션 한정)
- 폰트: Pretendard Variable (기본), 제목 악센트용 Noto Serif KR or Gmarket Sans (조건부)
- 이미지: `next/image`
- 커스텀 커서, 페이지 프리로더는 **기본 포함** (제거 금지)

---

## PHASE 1 — 추출 (Playwright)

`./scripts/extract.ts` 작성. 4개 사이트(A, B, C, current) × 3개 뷰포트(1440, 768, 390) 순회. `./research/{site}/{viewport}/`에 저장.

### 1-1. `styles.json` — Computed Style Dump

대상: `section, header, footer, main > *, nav, h1, h2, h3, h4, p, a, button, img, [class*="hero"], [class*="cta"]`

수집: `{tag, cls, rect(w,h,x,y), padding[4], margin[4], fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, color, bg, borderRadius, boxShadow, zIndex, position, display, transform, transition}`

### 1-2. `animations.json` — Scroll Timeline

스크롤 0/10/25/40/55/70/85/100% 8개 지점에서 viewport 내 요소의 `{selector, transform, opacity, filter, clip-path}` 스냅샷. 같은 요소 값 변화로 "fade-up 120px, 1000ms, stagger 150ms" 역산.

### 1-3. `stack.json` — Library Detection

`{gsap, ScrollTrigger, Lenis, Locomotive, Swiper, AOS, framerMotion, threeJS, r3f, barbaJS, scripts[]}`

### 1-4. `fonts.json` — Font Audit

`document.fonts` 전수. 각 폰트에 라이선스 태그: `opensource | commercial | unknown`. 상용 감지 시 `./research/font-license-alerts.md`에 기록.

### 1-5. `outline.json` — Semantic Outline

`[{role: "hero|about|service|feature|portfolio|cta|contact|footer", h1h2, childCount, layoutHint: "centered|left-aligned|asymmetric|split|grid-N|stacked", dominantElement: "typography|image|video|3d"}]`

### 1-6. `screenshot-{full|hero|section-N}.png`

`fullPage: true` 전체 + 히어로만 + 주요 섹션별 개별.

### 1-7. `interaction.json`

`{hasCustomCursor, hasPreloader, hasPageTransition, hasHorizontalScroll, hasStickyPin, hasMarquee, hasNoiseTexture, hasHoverVideo, hasCustomSelect}`

추출 검증: 각 JSON 비어있으면 1회 재시도. 3회 연속 실패 시 해당 뷰포트 제외.

---

## PHASE 2 — 토큰 도출

각 레퍼런스에 대해 `./research/tokens-{X}.json` 생성:

- **spacing**: padding/margin px값 수집 → 반올림 → 빈도 Top 12 → `{2,4,8,12,16,24,32,48,64,96,128,160,200,280}` 스케일에 매핑
- **typography**: `{fontSize, lineHeight, fontWeight, letterSpacing}` 조합 Top 10 → `display-xl, display, h1, h2, h3, h4, body-lg, body, caption, mono`에 매핑
- **palette**: hex 빈도 Top 10 + 각 대비비(WCAG) 계산 + 역할 추정(`bg, surface, text-primary, text-secondary, border, accent, signal`)
- **radius**: 고유값 목록 + 지배값 (0 / small / large / full 중 하나로 수렴)
- **shadow**: 고유값 목록
- **section_rhythm**: 섹션 간 세로 간격 평균/중앙값/최대/최소, 리듬 패턴 (일정 / 변주)
- **aspect_ratios**: 이미지/카드 주요 비율 Top 5
- **density_score**: 화면당 텍스트 글자 수 / 이미지 수 / 여백 면적 비율

current는 `./research/current-tokens.json`로 동일 추출.

---

## PHASE 3 — 자율 디렉션 결정

### 3-1. 브랜드 추론 → `direction.json`

```json
{
  "industry": "...",
  "tone": "luxury | premium | minimal | trust-forward | industrial | editorial | playful",
  "audience": "B2B | B2C | mixed",
  "product_type": "service | product | saas | portfolio"
}
```

불명확 시 기본값: `{industry: "professional service", tone: "editorial", audience: "B2B", product_type: "service"}`.
**"corporate"나 "generic"은 절대 채택하지 않는다.**

### 3-2. 축별 기준 사이트 선정

| 축 | 결정 규칙 |
|---|---|
| **spacing** | `section_rhythm.median` 최대값 사이트. tone이 industrial이면 중위값 사이트 |
| **typography** | `display/body` 폰트크기 비율 최대 사이트. 비율 < 4배면 자동 상향(최소 5배 강제) |
| **palette** | current 유지 + WCAG AA 미달 색만 보정 + 레퍼런스에서 `accent` 1색 차용 |
| **animation** | `animations.json`에서 transform 변화량 최대 사이트 |
| **hero** | outline.json hero 높이 최대 사이트. 최소 90vh 강제 |
| **density** | `density_score` 기준 가장 낮은(여백 많은) 사이트. B2B도 예외 없음 |

### 3-3. 디자인 메타포 한 줄 (필수)

- 타이포그래피 주도형 / 그리드 주도형 / 에디토리얼형 / 모션 주도형 / 미니멀 임팩트형 중 1개 이상 채택
- **"trust-forward", "modern", "clean" 같은 무색무취 컨셉 금지**

---

## PHASE 3.5 — Anti-Generic Layer

### A. 금지 패턴 (grep 검사 자동 검증)

| 금지 | 대체 |
|---|---|
| 중앙 정렬 히어로 + 버튼 2개 | 좌측 정렬 + 비대칭 |
| 3단 균등 그리드 카드 | 불균등 (`col-span-7/5`, `col-span-8/4`) |
| `rounded-lg|xl|2xl|3xl` | `rounded-none` OR `rounded-full` 통일 |
| `shadow-sm|md|lg|xl` | 그림자 없음 OR 커스텀 오버사이즈 |
| Tailwind 기본 `gray-*` | 커스텀 중성색 (`warm-*`, `cool-*`, `off-white`, `ink`) |
| `blue-500`, `indigo-*`, `violet-*` primary | 브랜드 고유색만 |
| 모든 섹션 동일 `py-20` | 섹션별 변주 (`py-32 / py-16 / py-48 / py-24`) |
| 단일 버튼 스타일 | primary/secondary/ghost 3종 뚜렷 차이 |
| `text-base leading-normal` 본문 | 본문 17~19px + `leading-[1.7]` + `tracking-[-0.01em]` |
| 히어로 h1 `text-5xl` (48px) | 최소 `clamp(72px, 10vw, 180px)` |

### B. Signature Moves — 최소 6개 필수

1. 극단적 타이포 대비 (히어로 h1 ≥ 80px, body 17~19px, 대비 5배 이상)
2. 타이포그래피 히어로 (히어로 60%+가 텍스트)
3. 비대칭 레이아웃 (최소 2개 섹션이 한쪽 여백 2배 이상)
4. 오버사이즈 요소 (1개 요소가 viewport 넘거나 의도적 잘림)
5. 스크롤 기반 고급 인터랙션 (horizontal / sticky / text reveal / parallax 중 택 1 이상)
6. 커스텀 커서 (데스크톱 필수, hover 변형)
7. 페이지 프리로더 or 초기 reveal (마스크 리빌 / 숫자 카운트업)
8. 노이즈/그레인 오버레이 (body::after SVG, opacity 0.03~0.05)
9. 모노스페이스 혼용 (숫자/라벨/메타)
10. 의도된 마퀴 (무한 스크롤 텍스트 최소 1개)
11. CountUp 숫자 섹션 (text-8xl 이상)
12. 하드 컬러 블록 섹션 (full-bleed, 흰/회색 아님)
13. 스크롤 진행 인디케이터 (상단 프로그레스 or 섹션 번호)
14. 커스텀 링크 hover (underline slide / letter shift / color wipe 중 택 1)
15. 세로 텍스트 or 회전 텍스트 (side label, rotate-90)

`direction.json.signature_moves`에 배열로 기록. **6개 미만이면 Phase 4 진입 금지.**

### C. 애니메이션 스펙 (최소치)

- **이동거리**: 최소 80px, 기본 120px
- **duration**: 최소 900ms, 기본 1000~1200ms
- **easing**: `cubic-bezier(0.19, 1, 0.22, 1)` (expo-out) 또는 `cubic-bezier(0.76, 0, 0.24, 1)` (power4)
- **stagger**: 최소 100ms, 기본 120~180ms
- **secondary axis**: translateY 단독 금지. scale/rotate/clip-path 중 1개 이상 동반
- **텍스트 리빌**: 제목은 char-by-char 또는 line-by-line mask reveal

### D. 기술 스택 강제 승급

- signature_moves에 5, 7, 11 중 2개 이상 → **GSAP ScrollTrigger + Lenis 필수**
- concept에 "모션", "스크롤", "reveal", "pin" 포함 → **GSAP 필수**
- "3D" 또는 "WebGL" 추가 시 → `@react-three/fiber + @react-three/drei`

---

## PHASE 3.7 — Top 5% Booster

### 3.7-1. 추가 디자인 원리

- **Editorial grid**: 12 컬럼 중 7~8만 사용, 나머지 의도적 여백
- **Typographic hierarchy**: 제목/본문 비율 6배 이상
- **Anti-center gravity**: 주요 요소를 중앙에서 20%+ 오프셋
- **Line break control**: 한글 제목 수동 `<br/>` or max-width로 시적 리듬 (3~5단어 단위)
- **Micro label system**: 모든 섹션 번호/카테고리 라벨 (`01 — Services`, `A/ About`)

### 3.7-2. Korean 웹타이포 특화

- Pretendard Variable weight 4단계만: **400 / 500 / 600 / 800** (700 금지)
- 한글 본문: `17px / 1.75 / -0.01em`
- 한글 제목 (h1/h2): `-0.04em / 1.15 / 800`
- 모노 라벨: `12~13px / 0.08em / uppercase / JetBrains Mono`
- 숫자: `font-variant-numeric: tabular-nums`
- 영/한 혼용 제목: 영문만 다른 폰트 (Space Grotesk 권장)

### 3.7-3. 인터랙션 Depth — 3개 필수

1. **Cursor follower**: hover 대상 감지 시 스케일/텍스트 변형
2. **Magnetic button**: CTA 버튼 mousemove 10~20px 이동
3. **Scroll progress & section indicator**: 우측/상단 고정, 현재 섹션 하이라이트

### 3.7-4. 금지 이미지 패턴

- Unsplash 스톡 "비즈니스 맨 악수", "노트북 위 손", "회의실 팀원" 전면 금지
- 플레이스홀더: (a) 추상 그라디언트 메시, (b) 단색 블록 + 번호, (c) 타이포 카드

### 3.7-5. 자가 비평 루프 (필수)

Phase 4 완료 후 Phase 5 진입 전, 아트 디렉터 시점 5개 질문에 `./report.md` 답변:

1. 컨셉 한 줄을 다시 말할 수 있는가? 구현 반영?
2. 히어로 3초 안에 회사가 뭘 하는지 감?
3. "AI 제작" 인상 요소 있는가?
4. 레퍼런스 3개 중 어느 하나와도 구별?
5. 모바일에서 데스크톱 "느낌" 유지?

하나라도 미흡 → 재작업 + 루프 재실행 (최대 2회).

---

## PHASE 4 — 구현

### 4-1. `tailwind.config.ts`

- `spacing`: 선택된 기준 사이트 토큰
- `fontSize`: `[size, {lineHeight, letterSpacing, fontWeight}]` 튜플
- `colors.brand`: 팔레트 + `ink`, `paper`, `line`
- `fontFamily`: `sans: Pretendard Variable`, `mono: JetBrains Mono`, 조건부 serif
- `transitionTimingFunction`: `expo`, `power4`
- `container`: `max-width: 1440px`, `padding: clamp(24px, 5vw, 80px)`

### 4-2. `app/layout.tsx`

- Pretendard Variable + JetBrains Mono (`display: swap`)
- `globals.css`: `body { word-break: keep-all; overflow-wrap: break-word; }`
- `body::after` SVG noise (fixed, pointer-events: none, z-9999, mix-blend-mode: overlay, opacity 0.04)
- 커스텀 커서 + Lenis provider 주입

### 4-3. 공통 컴포넌트

`Cursor / Preloader / ScrollProgress / MagneticButton / SplitText / Marquee / SectionLabel`

### 4-4. 섹션 구현 순서

1. Header (sticky, 초기 투명 → 스크롤 시 blur bg + 축소)
2. Hero (concept 직접 반영, 최소 90vh, 비대칭, 타이포 주도)
3. 본문 섹션들 (outline 순서)
4. CTA (풀블리드 하드 컬러)
5. Footer (대형 타이포 브랜드명 + 세로 분할)

각 섹션: `<SectionLabel />` 상단 + 진입 애니메이션(3.5-C 준수) + 여백 변주

### 4-5. 반응형

브레이크포인트: `sm 480 / md 768 / lg 1024 / xl 1280 / 2xl 1536`

- 모바일 히어로 75~85vh
- 모바일 타이포: 제목 `clamp(44px, 12vw, 80px)`, 본문 16px
- 모바일 유지: 프리로더/마퀴/컬러블록
- 모바일 제외: 커스텀 커서, 마그네틱
- 3단 그리드 모바일에서 세로 스택 but 불균등 유지

### 4-6. 접근성 & 성능

- 키보드 포커스 링 커스텀
- `alt` 필수, 장식용 `alt=""`
- WCAG AA 이상
- `prefers-reduced-motion`: duration 300ms, 이동거리 20px
- LCP 이미지 `priority`
- 폰트 `display: swap`
- Lenis 자동 disable (prefers-reduced-motion)

---

## PHASE 5 — 검증 루프 (최대 3회)

### 5-1. 토큰 준수도
- 구현물 재추출 → 기준 사이트 spacing/typography 매칭률
- < 85% → 자동 수정 재검증

### 5-2. Anti-Generic 감사
```bash
grep -rn "rounded-lg\|rounded-xl\|rounded-2xl\|rounded-3xl" app components
grep -rn "shadow-sm\|shadow-md\|shadow-lg\|shadow-xl" app components
grep -rn "bg-gray-\|text-gray-\|border-gray-" app components
grep -rn "blue-500\|indigo-\|violet-" app components
grep -rn "py-20" app components | wc -l   # 5회 이상 반복 → 실패
```

### 5-3. Signature Moves 전수 확인
- 선언 항목 실제 구현 DOM/스크린샷 검증
- 누락 → 추가 구현

### 5-4. 애니메이션 실측
- 이동거리/duration/stagger가 3.5-C 최소치 충족

### 5-5. 자가 비평 (3.7-5)
- 5개 질문 답변

### 5-6. 반응형 & 성능
- 1440/768/390 가로 스크롤 없음
- 모바일 signature moves 유지
- Lighthouse: Performance ≥ 80, Accessibility ≥ 95, Best Practices ≥ 90

### 5-7. 시각 diff
- 원본 vs built pixelmatch (참고용)

### 5-8. 코드 위생
- ESLint/TS 오류 0
- arbitrary value 0 (`grep -rn "\[[0-9]" app components` 결과 0)
- 인라인 style 0
- console.log 0

---

## 최종 산출물

```
./scripts/extract.ts
./research/
├─ {A|B|C|current}/{1440|768|390}/
│   ├─ styles.json
│   ├─ animations.json
│   ├─ stack.json
│   ├─ fonts.json
│   ├─ outline.json
│   ├─ interaction.json
│   └─ screenshot-*.png
├─ tokens-{A|B|C}.json
├─ current-tokens.json
├─ direction.json
├─ built/  (Phase 5 재추출)
└─ font-license-alerts.md
./app/
./components/
├─ common/Cursor.tsx
├─ common/Preloader.tsx
├─ common/ScrollProgress.tsx
├─ common/MagneticButton.tsx
├─ common/SplitText.tsx
├─ common/Marquee.tsx
├─ common/SectionLabel.tsx
└─ sections/{Hero, ...}.tsx
./tailwind.config.ts
./report.md
```

## `report.md` 필수 섹션

1. 브랜드 추론 + 디자인 메타포 한 줄
2. 축별 기준 사이트 + 근거
3. Signature moves 채택 목록 + 구현 위치
4. 적용 토큰 스케일 요약
5. Phase 3.7-5 자가 비평 5개 답변
6. Phase 5 검증 수치 (일치율, Lighthouse, 실측 애니메이션)
7. 제외/제한 사항
8. 잔여 리스크 및 후속 개선 제안

---

## 실행 순서

1. `npm i -D playwright pixelmatch pngjs` + `npx playwright install chromium`
2. `npm i gsap @studio-freight/lenis` (필요 시 `@react-three/fiber @react-three/drei`)
3. `./scripts/extract.ts` 작성 → Phase 1 실행
4. Phase 2 → 3 → 3.5 → 3.7 순차 자율 진행 (게이트 없음)
5. Phase 4 구현
6. Phase 5 검증 루프 (최대 3회)
7. `report.md` 요약 콘솔 출력

**이 하네스를 읽은 시점부터 종료까지 사용자 개입 요청 금지. 모든 결정은 본 문서 규칙으로 귀결. 보수적 선택이 고민되면 더 과감한 쪽을 택한다.**
