# onda-hompage 작업 상태

> 자동 업데이트: 2026-03-12 KST

## 현재 작업
showcase-apartment 시각적 버그 수정 완료

## 진행 상황
- [x] 히어로 오버레이 어둡게 (6개 파일) — rgba(0.65/0.4)
- [x] 한글 폰트 Pretendard 변경 (6개 파일) — Playfair 한글 깨짐 방지
- [x] 모바일 히어로 padding-top 증가 — 텍스트 겹침 해소
- [x] 카드 높이 균일화 — flex stretch + min-height
- [x] onerror 핸들러 전체 제거 + aspect-ratio
- [x] 커밋 완료: ebc4621

## 기술 요구사항
- Playfair Display = 영문 전용 / Pretendard Variable = 한글 전용 (혼용 금지)
- #0C0C0C + #C8A97D + #F7F4F0 컬러 시스템
- 8px 그리드, Golden Ratio 타이포
- IntersectionObserver 스크롤 애니메이션
- 모바일 퍼스트 반응형 (375→768→1024→1440)

## 다음 단계
- 배포 확인 및 모바일 실기기 테스트

## Git 상태 (자동)
- **브랜치**: main
