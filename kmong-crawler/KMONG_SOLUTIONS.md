# 크몽 해결 로그 — 마스터 인덱스

**규칙**: 같은 문제로 두 번 헤매지 말 것. 크몽 관련 문제 해결 시 **반드시** 이 문서에 한 줄 추가.

**사용법**:
1. 새 에러/트랩 발생 시 **먼저 이 문서 Ctrl+F**로 과거 해결 확인
2. 해결 후 아래 포맷으로 1줄 append + 상세 링크 (메모리 또는 커밋 해시)
3. git `fix(kmong*)` 커밋은 `.git/hooks/post-commit`이 `KMONG_FIXES.jsonl`에 자동 기록

**포맷**: `| 카테고리 | 증상 키워드 | 근본원인 | 해결 | 레퍼런스 |`

---

## 📚 참조 문서

- `KMONG_CONTEXT.md` — 크몽 작업 진입 시 필독 (프로젝트 구조/RPA 파일/프로토콜)
- 메모리(`~/.claude/projects/-home-onda/memory/`):
  - `reference_kmong_session_running_notes.md` — 세션별 트랩/해결 살아있는 로그
  - `reference_kmong_gig_creation.md` — Step1/Step2 셀렉터, 카테고리 ID 분기
  - `reference_kmong_fullautoauto_protocol.md` — 5 PHASE 풀자동화 프로토콜
  - `reference_kmong_banned_keywords.md` — 금지키워드 매핑 + TipTap 편집 규칙
  - `reference_kmong_category_urls.md` — /category/{ID} 패턴 + 시장가 통계
  - `feedback_kmong_api_put_fallback.md` — **select persist 는 API PUT 만 작동** (가장 중요)
  - `feedback_kmong_finish_checklist.md` — 작업 마무리 체크리스트
  - `feedback_kmong_human_submit.md` — 임시저장까지만, 실 등록은 사람
  - `feedback_kmong_copy_niche.md` — 카피: 기술나열 X, 고객 니즈
  - `feedback_kmong_brand_positioning.md` — ONDA 브랜드 포지셔닝 (AI 출처 숨김)
  - `feedback_kmong_3axis_filter.md` — 4축 통과 필터 (수요·경쟁·단가·자동화)

---

## 🔴 CRITICAL — 반복 헤맸던 문제 (재실패 방지)

| # | 증상 | 근본원인 | 해결 | 레퍼런스 |
|---|---|---|---|---|
| C1 | 주요특징 select(업종/카테고리/개발스택 등) UI 클릭해도 persist 안 됨 | 커스텀 accordion UI, React state commit 미발동. fillReactSelect/fiber/playwright click/type 전부 silent fail | **네트워크 PUT 우회만 작동**. 편집페이지에서 임시저장 한번 클릭 → PUT body 캡처 → 빈 group에 `isSelected: true` 주입 → 같은 URL로 PUT | `feedback_kmong_api_put_fallback.md` · 커밋 `dc459c8`, `f46c920` |
| C2 | TipTap 에디터에 HTML 직접 입력 불가 (꺾쇠 `<` 금지어) | 크몽 ProseMirror가 `<` 특수문자 차단 | 툴바 버튼 클릭 또는 단축키(Ctrl+B, Shift+2 등). HTML innerHTML 주입 금지 | `reference_kmong_banned_keywords.md` · 세션노트 2026-04-14 |
| C3 | 55상품 중 일부 "다음" 버튼 클릭해도 /my-gigs/new에 머무름 | 3차 카테고리 조합 검증 거부 (특정 cat1×cat2 무효) | cat2를 대체 카테고리로 교체 (예: 전단지 → 명함, subCategoryId=107) | 세션노트 `reference_kmong_session_running_notes.md` 트랩 #2 |
| C4 | 이미지 글자 뭉개짐 (1024→1024 단순 리사이즈) | 저해상도 생성 후 다운샘플 시 Lanczos 필터 한계 | gpt-image-1 `size=1536x1024` `quality=high` → Sharp Lanczos3로 4:3 크롭 → **1304x976 (652x488 @2x Retina)** | `generate-55-images-hires.js` · 세션노트 트랩 #5 |
| C5 | run-55-parallel.js failed 리스트에서 재시도 성공 후에도 제거 안 됨 | `r.ok` 체크 후 filter 누락 | `processOne`에서 `if (r.ok) failed = failed.filter(f => f !== id)` | 세션노트 트랩 #3 · `run-55-parallel.js` |
| C6 | Claude Opus 4.7 `temperature` 파라미터 HTTP 400 | opus-4-7 API가 temperature 미지원 | 요청 바디에서 `temperature` 키 자동 제거 (try/catch로 감지) | 커밋 `fbad99a` |

---

## 🟡 MAJOR — 업무 흐름에 자주 부딪히는 문제

### [A] 등록/편집 RPA
| # | 증상 | 해결 | 커밋 |
|---|---|---|---|
| A1 | Step1 카테고리 매칭 실패 ("상세페이지·이미지편집", "로고·브랜딩" 등 통합명) | `selectCategory` 정규화 매칭 + 크몽 실제 이름 사용 | 세션노트 트랩 #1 |
| A2 | REVISION textarea 내용 persist 안 됨 | API PUT으로 textarea 내용 일괄 주입 | `f46c920` |
| A3 | label 탐지 버그 (discoverSelects) | LABEL 태그 우선, P 폴백 | `6303c05` |
| A4 | 올바른 draft에 본문/갤러리 재적용 실패 (잘못된 draft ID 타겟) | draft ID 재검증 후 본문+갤러리+extras 재적용 | `a65c8c5` |

### [B] API 스키마 조사
| # | 증상 | 해결 | 파일/커밋 |
|---|---|---|---|
| B1 | FAQ/SEARCH_KEYWORD/GIG_INSTRUCTION PUT schema 불명 | UI에서 실제 추가 버튼 클릭 시 body 캡처 → ui-captured-body.json 레퍼런스 | `cc0d21c` · `new-gigs/capture-ui-faq-add.js` |
| B2 | 판매 핵심 정보 body 포맷 불명 | probe-sales-core-body.js로 body 캡처 | `new-gigs/probe-sales-core-body.json` |

### [C] 텔레그램 자동답변 봇
| # | 증상 | 해결 | 커밋 |
|---|---|---|---|
| C1 | 'ㅎㅇ' 반복 인사 오탐 (텍스트 기반 중복 판정) | 메시지 텍스트 → MID 기반 중복 판정으로 교체 | `fd0a1d0` |
| C2 | 이전 고객 여러 gig 문의 시 최신 gig 매칭 실패 | `button.gigs[0]` → 마지막 원소 + `message.extra_data`로 gig_id 오버라이드 | `1882a20`, `b323113` |
| C3 | 인스타 문의에 홈페이지 답변 나가는 맥락 오염 | `conversation_thread`를 현재 gig 스코프로 필터링 + 답변생성 무조건 Claude 경유 | `df96abc`, `648ef1f` |
| C4 | 텔레그램 카드 ETIMEDOUT 재발 | IPv4 강제 + request timeout 15s + 에러 로깅 + 카드 발송 병렬화 | `3e7001c`, `dc24dee` |
| C5 | sendCard HTML 파싱 실패 / 4000바이트 초과 | plain text fallback + 자동 절단 | `f0bac50` |
| C6 | send-reply modal 차단 | 학습로직 + 새 봇/그룹 | `d9b1b00` |
| C7 | spawn된 auto-reply 로그 파일 저장 안 됨 (카드 발송 실패 추적 불가) | stdout/stderr 파일 저장 | `46ee2da` |

### [D] 금지키워드 / 법적 안전
| # | 증상 | 해결 | 커밋/메모리 |
|---|---|---|---|
| D1 | 금지키워드 73건 이상 포함된 draft | 일괄 치환 + "크몽스" 재개 트리거 | `5e3b905`, `e87ad3b` |
| D2 | 'N사' 금지키워드 | "N사" → 일반 표현 (예: "대형 포털") | `00e2d72` |
| D3 | 공정위/면책 문구 부재 | 전면 교정 + 공정위 문구 삽입 | `e324618` |
| D4 | 금지어 매핑 전면 | `reference_kmong_banned_keywords.md` 참조 | 메모리 |

### [E] 이미지/썸네일
| # | 증상 | 해결 | 커밋 |
|---|---|---|---|
| E1 | 기본 1024x1024 리사이즈 글자 뭉개짐 | 1536x1024 생성 → Lanczos3 → 1304x976 Retina | `generate-55-images-hires.js` (C4 참조) |
| E2 | 메인 이미지 교체 불가 | `replace-image.js` 전용 스크립트 | `new-gigs/replace-image.js` |
| E3 | 55상품 이미지/소재 전면 교체 | 리뷰 단가 2000원/건 반영 | `0b0a3ae` |

### [F] 대시보드 / kmong-service UI
| # | 증상 | 해결 | 커밋 |
|---|---|---|---|
| F1 | 세금계산서 다운로드 100건 자동 판별 부재 | 자동 판별 로직 추가 | `b6473bb` |
| F2 | CPC 수치 비현실 (1000~3000원 기본값) | 실제 경쟁가 반영 + 사이드바 매출 동기화 | `9915808` |
| F3 | 서비스 20개 변경 요청 | 촬영/디자인 카테고리로 교체 + 현실적 수치 | `e306a44` |
| F4 | 수익금 파싱 버그 + 비즈머니 간소화 | 파싱 교정 + 대시보드 footer 정리 | `bc4087d` |
| F5 | 리디자인 후 서브페이지 15개 스타일 깨짐 | 통일 CSS 토큰 적용 | `48efd5b` |
| F6 | 개별 페이지 대비(contrast) 부족 — 라이트 배경 다크 토큰 치환 | price-list / banned-biz / capture-site / account-seo 각각 팔레트 정렬 | `9179350`, `db4c9d0`, `1986630`, `479f3fb` |
| F7 | CF 이미지 404 | 로컬 복사 후 `../img/` 경로 치환 | `511a809` |
| F8 | 상세페이지 스타일 깨짐 (sp-*, checklist, guide-image) | legacy 클래스 일괄 정의 | `e00e2ff` |
| F9 | 노션 원본 토글 사진 누락 (post-exposure.html) | 누락 사진 보강 | `cfc72f0` |

### [G] 패키지 / 필드
| # | 증상 | 해결 | 커밋 |
|---|---|---|---|
| G1 | 패키지 STD 제목 빈칸 | 필드 검증 통과 | `6ca57f4` |

---

## 🟢 자동 기록 (post-commit hook)

- `.git/hooks/post-commit`이 `fix(kmong*)` 커밋 감지 시 `KMONG_FIXES.jsonl` 파일에 한 줄 기록
- 포맷: `{ "ts": "...", "hash": "...", "subject": "fix(kmong-...): ..." }`
- 주기적으로(또는 새 카테고리 발견 시) 이 문서에 수동 승격

---

## ✍️ 엔트리 추가 템플릿

새 해결 추가 시:
```markdown
| # | 증상 키워드 | 근본원인 | 해결 | 커밋/메모리 |
|---|---|---|---|---|
| X | ... | ... | ... | `<hash>` 또는 `feedback_*.md` |
```

**필수**:
1. 증상 = grep-able 키워드 (에러 메시지 일부, 함수명 등)
2. 근본원인 = "왜 발생했는가" (증상의 아래층)
3. 해결 = 다음 세션이 바로 쓸 수 있는 구체 지시
4. 레퍼런스 = 커밋 해시 **또는** 상세 메모리 파일명
