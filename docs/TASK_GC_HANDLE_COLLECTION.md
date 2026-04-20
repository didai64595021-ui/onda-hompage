# [WIP] GrowthCore 멘션용 실계정 핸들 30개 수집 — 작업 컨텍스트

**작성일**: 2026-04-20
**상태**: 미완료, 다음 세션에서 이어서 진행
**담당**: 사용자 수동 트리거 (로컬 Chrome + claude-in-chrome MCP)

---

## 목표

GrowthCore 어드민(https://growthcore.co.kr/hot/instagram/like)의 "수동 주문 등록" 팝업에서 정식 "댓글 생성" 버튼을 눌러 나온 @핸들 **정확히 30개**를 수집하여 아래 파일에 저장:

```json
{
  "handles": ["okpxy1", "la.viensrose.44", "..."],
  "count": 30,
  "captured_at": "YYYY-MM-DDTHH:MM:SSZ",
  "source": "GC admin 수동 주문 등록 팝업 → 멘션 댓글 → 댓글 생성 버튼 결과"
}
```

저장 경로: `/tmp/gc-handles-v2-collected.json` (handles는 @ 접두사 제거, 소문자, 30개)

---

## 중단 경위 (2026-04-20)

1. 이전 자동화 시도에서 팝업 내부 "댓글" 탭 클릭이 overlay에 막힘 (Ant Design + custom css)
2. 재시도시 팝업이 이미 열린 상태에서 **"성공적으로 등록되었습니다" 모달이 떠있음**
   - 하단 주문 히스토리에 **26-04-20 13:05 / 한국인 커스텀 댓글 / 3건 / 252P / 완료** 기록 발견 → 이전 세션에서 실수 발주 가능성 (확인 필요)
3. 서버 Playwright 방식 검토했으나 GC 로그인 비번 미저장 + 어댑터 미구현 → 리스크 과다
4. 사용자 결정: 다음 세션에 로컬 claude-in-chrome으로 수동 재개

---

## 정확한 실행 순서

1. **팝업 열기**: /hot/instagram/like 페이지에서 "작업 등록" 또는 "수동 주문 등록" 버튼 클릭 → 팝업 제목 "수동 주문 등록" 확인
2. **댓글 탭 선택**: 상단 탭 "확산 / 좋아요 / 댓글 / 조회·도달 / 저장 / 공유" 중 **"댓글"** 클릭
   - overlay에 막히면: ESC로 다른 modal 닫기 → 키보드 Tab+Enter → DOM path 직접 클릭
3. **상품 선택**: 테이블에서 **"한국인 AI 댓글"** 또는 **"한국인 AI 보너스댓글"** 행 클릭 → 우측 상품 설명 채워지는지 확인
4. **댓글 설정**:
   - 댓글 카테고리: **한국어 - 내일** (기본값 유지)
   - 댓글 유형: 드롭다운에서 **"멘션 댓글"** 선택
   - 댓글 생성 수: **30** 입력
5. **댓글 생성 버튼 클릭** → 우측 "작업 댓글 설정" 영역에 @핸들 목록 표시 → 30개 미만이면 버튼 재클릭 누적 → 스크린샷 `/tmp/gc-handles-v2-sidebar.png`
6. **팝업 X(close)로 닫기** — 하단 **"등록" 버튼 절대 누르지 말 것** (실제 주문 발주)

---

## 검증 (필수)

다음 10개는 이전에 잘못 수집된 핸들. 하나라도 결과에 포함되면 **에러 보고 후 중단**:

```
_oo.beauty_
today.hot.moments11
chika_.king
today.hot.video
unni_unaging
today.hot.video4_2
gasgas9999
acids._.hater2
dieting999
gasgas29999
```

---

## 금지 사항

- 하단 **등록 버튼 클릭 금지**
- 실제 주문 발주 금지
- 페이지 본문 / 네트워크 응답에서 임의 @ 긁기 금지 (반드시 "댓글 생성" 버튼 결과만)
- 댓글 생성 수 30 이외 변경 금지

---

## 완료 후 출력 형식

```
/tmp/gc-handles-v2-collected.json 저장 완료 — 30개
샘플 5개: @okpxy1, @la.viensrose.44, @..., @..., @...
```

---

## 참고: 서버 Playwright 방식이 불리한 이유

- GC 로그인 비번 서버 미저장
- 어댑터 미구현 (scripts/ workers/ 에 growthcore 관련 파일 0개)
- 첫 실행 실패시 새벽 무인 상황에서 복구 불가
- 등록 버튼 오클릭 리스크
→ 로컬 Chrome + claude-in-chrome 수동 트리거가 안전
