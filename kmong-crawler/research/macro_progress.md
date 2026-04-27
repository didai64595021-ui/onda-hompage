# 매크로 신상품 풀코스 진행 노트 — 2026-04-27

> 사용자 지시: "다 ㅇㅋ" (단가/카테고리/풀코스 모두 승인)

## 확정 사항
- **상품**: "카톡 알림봇 + 엑셀/구글시트 자동연동" (Zapier/Make 대체)
- **단가**: STANDARD 198,000 / DELUXE 398,000 / PREMIUM 798,000
- **카테고리**: rootCategoryId=6 (IT·프로그래밍) / subCategoryId=663 (업무 자동화)
- **썸네일 모델**: GEMINI_API_KEY 미보유 → gpt-image-1 폴백 (한국인 페르소나 컷은 키 발급 후 재생성 권장)

## 단계별 진행 상태
- [x] **Step 1**: 환경 점검 — Gemini 키 NO 확정 / 비즈머니 토글 재시도 (백그라운드)
- [ ] **Step 2**: 본문 7단계 + FAQ 작성 (KMONG_CONTEXT.md PHASE 2 준수)
- [ ] **Step 3**: 썸네일 4컷 생성 (메인 1 + 서브 3, 1304×976)
- [ ] **Step 4**: 크몽 draft 등록 (Step1 카테고리/패키지 + Step2 본문 + 썸네일)
- [ ] **Step 5**: PRODUCT_MAP에 신상품 추가 + auto-reply 매핑
- [ ] **Step 6**: 검증 + 텔레그램 최종 보고

## 트랩 / 주의사항 (KMONG_CONTEXT.md 인용)
- TipTap 에디터: HTML 직접 입력 불가, 키보드 + 단축키만 (Ctrl+B, Ctrl+Shift+2 H2 등)
- Step1 카테고리 확정 후 변경 어려움 → 663 (업무 자동화) 정확히 선택
- 썸네일 652×488 미만 거부 → 1304×976 고화질 필수
- 금지어: 가격/순위/보장/최저가/베스트/1위 등 (`reference_kmong_banned_keywords.md`)
- 실 등록(submit) 금지, 항상 임시저장(save)까지만
- 100자 미만 본문 → 제출 거부

## 다음 단계 진입 트리거
- 토글 재시도 결과 알림 도착 → Step 2 본문 작성 착수
