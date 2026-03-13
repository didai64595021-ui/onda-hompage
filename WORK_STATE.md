# onda-hompage 작업 상태

> 자동 업데이트: 2026-03-13 KST

## 현재 작업
블루밍커피 PWA 전체 기능 검증 + localStorage 데이터 연동

## 진행 상황
- [ ] Step 1: shared.js 공통 데이터 레이어 생성
- [ ] Step 2: cart.html — localStorage 연동 (동적 렌더링)
- [ ] Step 3: menu.html — addToCart + detail 데이터 전달
- [ ] Step 4: detail.html — URL 파라미터 읽기 + 옵션 저장
- [ ] Step 5: order.html — 장바구니 데이터 표시 + 주문 완료 처리
- [ ] Step 6: mypage.html — 주문내역/포인트/스탬프 연동
- [ ] Step 7: index.html — 장바구니 뱃지 + 빠른주문 + 즐겨찾기
- [ ] Step 8: service-worker.js 업데이트 + 최종 QA

## 발견된 문제점
- localStorage 사용 0건 — 모든 데이터 하드코딩
- 페이지 간 데이터 연동 없음
- 메뉴→상세 아이템 정보 전달 없음
- 주문 완료 시 장바구니 미삭제, 주문내역 미저장
- 장바구니 뱃지 하드코딩 "3"

## 기술 요구사항
- 순수 HTML/CSS/JS (프레임워크 없음)
- localStorage로 데이터 관리
- shared.js 공통 파일 생성하여 중복 최소화
- 한글 폰트: Pretendard

## Git 상태 (자동)
- **브랜치**: main
