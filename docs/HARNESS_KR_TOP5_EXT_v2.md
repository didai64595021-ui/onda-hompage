# HARNESS EXTENSION PACK v2 (Optimized)
## Korean Top5 하네스 **확장팩** — 4개 모듈

> 기본 하네스(`HARNESS_KR_TOP5.md`) 위에 덧붙이는 모듈 4종.
> 홈페이지/웹 작업 시 기본 하네스와 **항상 함께** 읽는다.
> v1의 6개 모듈 → 4개로 축소, 중복 제거, ROI 순 재정렬.

## 설계 원칙

1. **직교성 대신 계층화**: 상위 모듈 결정이 하위 제약이 된다. 충돌 시 상위가 우선.
2. **규칙 추가 < 자가 비평**: 규칙 추가보다 M2 Adversarial Review가 ROI 크다.
3. **승현 비즈니스 반영**: Kmong/Wishket 납품 워크플로우에 맞춰 "클라이언트 인도"를 1급 모듈로.
4. **Lite/Full 2단계**: 컨텍스트 여유 따라 선택. 전부 Full은 과적합.

## 우선순위 규칙 (모듈 충돌)

```
1순위: brief-override.yaml  (사용자 수동 입력)
2순위: M1 Auto Brief        (자동 추론)
3순위: M2 Concept Generator (컨셉)
4순위: 기본 하네스 Phase 3.5-A 금지 패턴
5순위: M3 Boldness Enforcer
```

예: M1이 "B2B 전문성" 톤으로 추론해도 `concept: "브루탈리즘"` 오버라이드면 그대로. M3 "비대칭 강제"도 M2 concept "정렬된 그리드의 미학"이면 M2가 이김.

---

## M1 — Auto Brief + Concept Candidate (통합)

v1의 M0.5 + M2.5 통합. 같은 데이터 소스를 쓰니 한 번에.

**실행 시점**: 기본 하네스 Phase 1 이전
**산출물**: `./research/brief.json`

### M1-Lite (기본 권장)

1. Target Shallow Crawl: 랜딩 + About만 (2~3페이지, meta/og/헤더/푸터 카피/사업자번호)
2. Industry Quick Resolution:
   ```json
   { "industry": "...", "tone_hint": "editorial|minimal|industrial|playful", "existing_logo": "url|null", "core_copy": "..." }
   ```
   confidence 표기 생략. 낮으면 `editorial` fallback.
3. Concept Candidates **3개만**: Material Metaphor / Typographic Stance / Anti-Category 각 1개
   ```json
   { "axis": "...", "one_liner": "...", "visual_vocabulary": ["3개 키워드"], "risk": "..." }
   ```
4. Self-Pick: "가장 진부하지 않으면서 업종 맥락에 맞는 것". 금지 문구("모던한"·"세련된"·"신뢰의" 등 10개) 회피. 선택 근거 기록.
5. User Override: `./brief-override.yaml` 있으면 덮어씀.

### M1-Full (추가)

6. Competitor Scan 5개: 네이버 상위 5개 스크린샷 → Vision 톤 태깅 → 빈도 높은 컬러/레이아웃 3개 자동 금지
7. Reference Vision Tagging: A/B/C 각 `strongest_aspect` 한 줄 → Phase 3.2 축별 근거
8. Concept Candidates 5개: Process/Temporal 메타포 축 추가

**Full 쓰는 때**: 경쟁사 차별화 명시 요구 또는 포트폴리오용 자체 프로젝트

---

## M2 — Adversarial Review Loop

**ROI 최고 모듈**. Vision 기반 페르소나 비평.

**실행 시점**: 기본 하네스 Phase 5 직후
**산출물**: `./research/review.json`, `./report.md`의 Review 섹션

### M2-Lite (기본 권장)

3개 뷰포트 풀페이지 스크린샷 → Claude Vision에 넘겨 **2 페르소나** 비평:

**Persona A — 아트 디렉터** (10점 만점, 7점 미만 시 개선점 3개)
- 타이포 · 여백 · 컬러 조화 · 인터랙션 완성도

**Persona B — AI 탐지 전문가** (10점 만점, 8점 이상 필수)
- 균등 그리드 · 진부한 카피 · 안전한 컬러 · 템플릿 레이아웃

**실패 처리**:
- A < 7 → 지적 섹션만 재작업 (최대 1회)
- B < 8 → M3 Boldness Enforcer 재실행
- 1회 후에도 미달 → 그대로 진행 + `report.md`에 "Known Weakness" 명시

### M2-Full (추가)

**Persona C — 타겟 고객** (10점 만점)
- "3초 안에 뭐 하는 회사인지 알겠는가? 연락하고 싶은가?"
- 명확성 · CTA 효과 · 신뢰감
- 7점 미만 시 Hero/CTA 카피 재작성

**Full 쓰는 때**: 실제 비즈니스 전환이 중요한 프로젝트

---

## M3 — Boldness Enforcer (축소판)

v1의 M3.8에서 실효성 낮은 체크 제거. **6 → 3**.

**실행 시점**: 기본 하네스 Phase 4 각 섹션 구현 직후
**산출물**: `./report.md`의 Boldness Audit 표

### 3개 체크만 유지

**M3-1. Hero Boldness**
- h1 실측 fontSize ≥ 80px (데스크톱)
- 비대칭 (중앙 정렬 금지)
- 아래 3개 중 2개 이상 통과: 섹션 높이 ≥ 90vh / 배경 이미지·영상 없음 / 수동 줄바꿈

**M3-2. Typography Ratio**
- 실측 최대 fontSize / 본문 fontSize ≥ 5배
- 미달 시 h1 자동 상향

**M3-3. Animation Distance**
- 진입 애니메이션 평균 이동거리 ≥ 100px
- 미달 시 120px로 상향

**충돌 방지**: M2 Concept이 "미니멀" 또는 "차분한 에디토리얼"이면 M3-1 "배경 없음" + M3-3 "100px"을 각 -20% 완화.

---

## M4 — Delivery Kit

승현 비즈니스에 직접 수익화 가능한 유일한 모듈.

**실행 시점**: 모든 Phase 완료 후
**산출물**: `./deliverables/`

### M4-Lite (기본 권장)

1. **Asset Handling**: M1에서 수집된 기존 자산 → `./public/`. 부족분은 기본 하네스 placeholder 전략. `./deliverables/ASSET-GAPS.md` (부족 에셋 + 실제 에셋 위치 + 추가 제작 견적 = 업셀용)
2. **Client Handoff README**: `./deliverables/HANDOFF.md` (한글, setup·배포·텍스트·이미지 교체·유지보수)
3. **Simple Report**: `./deliverables/REPORT.md` (한글, 일반인 이해 가능. 컨셉·채택 근거 3~5줄·반응형 스크린샷 3개)

### M4-Full (추가)

4. **PDF Report**: REPORT.md → 한글 PDF (표지·컨셉 스토리·근거·스크린샷·다음 단계). Puppeteer 자동.
5. **Upsell Proposal**: `./deliverables/UPSELL.md` (실제 에셋 제작·CMS·블로그·다국어 옵션 + ONDA Naver Place/CPC 광고 연계 통합 마케팅 패키지)
6. **Loom Walkthrough Script**: `./deliverables/WALKTHROUGH.md` (3분 내외 영상 녹화 스크립트, 섹션별 디자인 의도 + 사용법 시연)

**Full 쓰는 때**: 프리미엄 패키지 (500k+) 납품 건

---

## 통합 실행 파이프라인 (단일 순서)

```
M1-Lite/Full       → brief.json
  ↓
기본 하네스 Phase 1~4 (M3는 Phase 4 각 섹션 완료 시 자동)
  ↓
기본 하네스 Phase 5 검증 루프
  ↓
M2-Lite/Full       → 실패 섹션 1회 재작업
  ↓
M4-Lite/Full       → deliverables 생성
```

### 세션 분리 권장 (컨텍스트 보호)
- 세션 1: M1 + Phase 1~2 (데이터 추출)
- 세션 2: Phase 3 + 3.5 + 3.7 (의사결정)
- 세션 3: Phase 4 + M3 (구현)
- 세션 4: Phase 5 + M2 + M4 (검증 + 인도)

`./research/` 폴더가 세션 간 상태 공유.

---

## 프로젝트 타입별 기본 설정

| 프로젝트 | M1 | M2 | M3 | M4 |
|---|---|---|---|---|
| 첫 테스트 (베이스라인) | - | - | - | - |
| 일반 Kmong 납품 (150~500k) | Lite | Lite | 자동 | Lite |
| 프리미엄 납품 (500k~1.5M) | Lite | Full | 자동 | Full |
| 포트폴리오 자체 프로젝트 | Full | Full | 자동 | - |
| ONDA 서비스 표준 패키지 | Lite | Lite | 자동 | Full |

M3는 항상 자동. M1/M2/M4는 Lite/Full 선택.

---

## 설정 파일 `./pack.config.yaml`

```yaml
modules:
  M1: lite          # off | lite | full
  M2: lite          # off | lite | full
  M3: on            # on | off
  M4: full          # off | lite | full

override_file: ./brief-override.yaml
conflict_resolution:
  verbose: true
```

---

## v1에서 제거된 것과 이유

- M0.5-3 Competitor 10개 → 5개 (Full에서만)
- M2.5 독립 → M1에 흡수
- M3.8 Spacing Variance / Color Narrowness → 기본 하네스 중복
- M3.8 Grid Asymmetry Audit → M2 Persona B가 대신 잡음
- M4.5 Asset Harvester → M4에 흡수
- M5.5 Persona 3명 → 2명 (Full만 C 추가)
- M6 Loom → M4-Full로 이동

---

## 중요 원칙 (v2 업데이트)

1. **컨셉이 규칙을 이긴다**: M2 Concept "미니멀"이면 M3 강제 규칙 완화. 규칙은 컨셉의 하인.
2. **자가 비평 > 규칙 추가**: 미심쩍으면 체크 규칙 박는 대신 M2 Adversarial Review로 사후 감지.
3. **납품 품질 = 디자인 + 인도**: 같은 디자인도 M4 Full로 포장하면 단가 2배. 승현 비즈니스에서 M4 = M2 만큼 중요.
4. **한 번에 다 켜지 말 것**: 프로젝트 타입 매트릭스 따르고 베이스라인부터. 모두 Full은 과적합.
