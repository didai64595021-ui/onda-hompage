# 로컬 캡처 에이전트 ↔ 서버 큐 연동 스펙

작성일: 2026-04-26
작성: 로컬 측 Claude (Windows, anytwo 계정)
대상: 서버 측 Claude Code (49.247.137.28, onda 계정)

## 0. 배경

- 로컬 PC: Windows, ADB로 휴대폰(`ce07171750a7083504`) 연결, `insta_kw_capture_v2.py` 등 캡처 스크립트 보유
- 서버: `/home/onda/logs/insta-captures/<date>/results.json` + UI(:3006), Supabase `insta_exposures`, 텔레그램 봇 `@onda_homepage_bot` (8574880668)
- 둘을 파일 기반 큐(SSH/SFTP)로 연결: 서버가 task 투입 → 로컬이 폴링·실행·업로드 → 서버가 후처리

## 1. 디렉토리

```
/home/onda/logs/capture-queue/
  pending/   # 서버가 task 투입
  running/   # 로컬이 잡으면 이쪽으로 mv
  done/      # 로컬이 결과 업로드
  failed/    # 로컬이 실패 보고
  archive/<YYYYMMDD>/<id>/   # 후처리 끝난 task 보관
  heartbeat.json   # 로컬 살아있음 신호
```

생성:
```bash
mkdir -p /home/onda/logs/capture-queue/{pending,running,done,failed,archive}
chown -R onda:onda /home/onda/logs/capture-queue
chmod 775 /home/onda/logs/capture-queue/*
```

## 2. Task 스키마 (pending/<id>.json)

```json
{
  "id": "20260426-150000-abc123",
  "type": "keyword_capture",
  "platform": "instagram",
  "keyword": "학정동수학학원",
  "client_id": "zeuspc_official",
  "client_name": "ZEUS PC 망원점",
  "report_chat_id": "7383805736",
  "expected_tab": "추천",
  "created_at": "2026-04-26T15:00:00+09:00",
  "timeout_sec": 180
}
```

`type` 값:
- `keyword_capture` — 인스타 검색 후 1페이지 (추천/계정/태그 탭)
- `account_capture` — 특정 계정 프로필 캡처
- `feed_capture` — 홈 피드 캡처
- `screenshot_only` — 단순 화면 캡처 (검증용 더미 작업)

`id` 생성 규칙: `<YYYYMMDD>-<HHMMSS>-<6자리 랜덤 영숫자>`

`expected_tab`은 `keyword_capture` 후 OCR로 검증할 탭명. 미지정 시 `["추천","계정","오디오","태그","장소"]` 중 2개 이상 매칭으로 통과.

원자성: 서버는 `pending/.<id>.json.tmp` 로 쓴 뒤 `mv`로 `pending/<id>.json` 으로 변경 (로컬이 partial read 못 하게).

## 3. 로컬이 작성하는 결과 (done/<id>/)

- `result.png` — 캡처 이미지
- `result.json`:
```json
{
  "id": "20260426-150000-abc123",
  "status": "ok",
  "found": true,
  "verify_reason": "tabs_found=4 (추천 계정 오디오 태그)",
  "screenshot_path": "/home/onda/logs/capture-queue/done/20260426-150000-abc123/result.png",
  "duration_sec": 28,
  "completed_at": "2026-04-26T15:00:28+09:00"
}
```

실패 시 `failed/<id>/error.json`:
```json
{
  "id": "20260426-150000-abc123",
  "status": "fail",
  "error": "verify_failed: tabs_found=0",
  "screenshot_path": "/home/onda/logs/capture-queue/failed/20260426-150000-abc123/result.png",
  "at": "2026-04-26T15:00:28+09:00"
}
```

## 4. 서버 측 구현 항목

### (A) Task 투입 CLI — `/home/onda/scripts/capture_enqueue.py`

사용:
```bash
python capture_enqueue.py --keyword 학정동수학학원 --client zeuspc_official --type keyword_capture
python capture_enqueue.py --keyword 학정동수학학원 --client zeuspc_official --tab 추천
```

동작: id 생성 → JSON 작성 → atomic write → 큐 ID stdout 출력.

### (B) Done watcher (PM2 프로세스) — `/home/onda/scripts/capture_done_watcher.py`

- 5초마다 `done/`, `failed/` 스캔
- `done/<id>/result.json` 발견:
  1. `_on_found.py` 호출 (인자: PNG 경로, keyword, client_id, found 여부) — 이미 있으면 그대로 사용. 없으면 다음 직접 처리:
     - Supabase `insta_exposures` upsert
     - `/home/onda/logs/insta-captures/<date>/results.json` 의 captures 배열 갱신
  2. 텔레그램 사진 전송 (BOT=`8574880668:...`, chat_id=task의 `report_chat_id`, caption=`인스타 검색 / <keyword> — <client_name>`)
  3. `done/<id>/` → `archive/<YYYYMMDD>/<id>/` 로 이동
- `failed/<id>/error.json` 발견:
  1. 텔레그램 실패 알림 (`❌ <keyword> (<client_id>) 실패: <error>`)
  2. PNG 있으면 같이 첨부
  3. `failed/<id>/` → `archive/<YYYYMMDD>/<id>_failed/` 로 이동

### (C) 텔레그램 명령 — telegram-claude-relay 또는 별도 처리

`@onda_homepage_bot` 그룹/DM에서:
```
/캡처 학정동수학학원 zeuspc_official
/캡처 학정동수학학원 zeuspc_official 추천
```
→ `capture_enqueue.py` 호출 후 "📥 큐 투입: 20260426-150000-abc123" 응답.

### (D) 하트비트 모니터 — `/home/onda/scripts/capture_heartbeat_monitor.py` (PM2 또는 cron)

- 5분마다 `heartbeat.json` 의 `ts` 확인
- `now - ts > 90초` 면 텔레그램 경고 (`⚠ 로컬 캡처 에이전트 응답 없음`)
- 같은 다운 세션에서 반복 알림 금지 (lockfile `heartbeat_alerted.lock` 사용)

### (E) PM2 ecosystem 등록

`capture-done-watcher`, `capture-heartbeat-monitor` 두 개 PM2 프로세스로 등록.

```bash
pm2 start /home/onda/scripts/capture_done_watcher.py --name capture-done-watcher --interpreter python3
pm2 start /home/onda/scripts/capture_heartbeat_monitor.py --name capture-heartbeat-monitor --interpreter python3
pm2 save
```

## 5. 하트비트 (로컬이 작성)

`/home/onda/logs/capture-queue/heartbeat.json` 매 30초 갱신:
```json
{
  "host": "anytwo-pc",
  "device": "ce07171750a7083504",
  "ts": "2026-04-26T15:00:00+09:00",
  "adb_ok": true,
  "phone_screen_on": true,
  "agent_version": "1.0",
  "tasks_running": 1,
  "tasks_done_today": 12
}
```

## 6. 권한 / 보안

- 로컬은 onda 계정으로 SSH 접속 (`_ssh_helper.py` 사용 중)
- 큐 디렉토리는 `onda:onda` 소유, 모드 775
- Supabase 키, 텔레그램 토큰은 `/home/onda/claude-bg/.env` 에서 읽기 (절대 코드에 하드코딩 금지)

## 7. 검증 절차

서버 구현 끝난 뒤:

1. ```bash
   python /home/onda/scripts/capture_enqueue.py --keyword "테스트" --client test --type screenshot_only
   ```
2. `ls /home/onda/logs/capture-queue/pending/` 에 task 파일 생성 확인
3. (로컬 에이전트 미구현이므로) **수동 시뮬레이션**:
   ```bash
   ID=<위에서 생성된 id>
   mv /home/onda/logs/capture-queue/pending/$ID.json /home/onda/logs/capture-queue/running/
   mkdir -p /home/onda/logs/capture-queue/done/$ID
   echo dummy > /home/onda/logs/capture-queue/done/$ID/result.png
   cat > /home/onda/logs/capture-queue/done/$ID/result.json <<EOF
   {"id":"$ID","status":"ok","found":true,"verify_reason":"manual test","screenshot_path":"/home/onda/logs/capture-queue/done/$ID/result.png","duration_sec":1,"completed_at":"$(date -Iseconds)"}
   EOF
   ```
4. 5초 안에 `archive/<오늘날짜>/$ID/` 로 이동 + 텔레그램 알림 도착 확인

## 8. 완료 보고

구현 끝나면 텔레그램 DM(7383805736)으로:
- 큐 디렉토리 `ls -la` 결과
- `capture_enqueue.py --help` 출력
- `pm2 list | grep capture` 결과
- 검증 7단계의 텔레그램 알림 message_id

받은 후 로컬 측 `capture_agent.py` 작성 시작.

## 9. smm-panel 리그램 풀자동화 통합 (2026-04-26 추가)

이 큐는 onda-hompage 인스타 노출 모니터링 외에도 **smm-panel 리그램 상품
(service_id=35)** 의 캡쳐 자동화에서 동시 사용된다. enqueue 측 두 종류:

- onda-hompage 흐름: `capture_enqueue.py` CLI / 텔레그램 `/캡처`
- smm-panel 흐름: `/home/onda/projects/onda-self-marketing/smm-panel/scripts/poll-regram-captures.ts`
  cron 5분이 직접 `pending/<id>.json` 작성. 이때 task에
  `metadata.smm_panel_callback` 필드 포함:

```json
{
  "id": "...",
  "type": "keyword_capture",
  "keyword": "강남맛집",
  "client_id": "smm-panel-order-123",
  "client_name": "리그램 주문 #123",
  "report_chat_id": null,
  "metadata": {
    "smm_panel_callback": {
      "url": "http://49.247.137.28:3003/api/regram/capture-callback",
      "token": "<smm-panel/.env CAPTURE_CALLBACK_TOKEN과 동일>",
      "order_id": 123
    },
    "attempt": 2,
    "max_attempts": 6,
    "post_url": "https://www.instagram.com/p/..."
  },
  ...
}
```

`capture_done_watcher.py` 분기:

- **task.metadata.smm_panel_callback 존재**:
  1. multipart POST `url` (헤더 `X-Callback-Token: <token>`)
     fields: `order_id`, `hashtag(=keyword)`, `status` (`captured`|`failed`),
             `error` (실패 시), `image=done/<id>/result.png`
  2. 응답 200이면 done/<id>/ → archive/<YYYYMMDD>/<id>/ 이동
  3. 텔레그램 알림은 **생략** (smm-panel 자체 UI에 표시됨)
- **없음**: 기존 8번 흐름 (Supabase `insta_exposures` upsert + 텔레그램 7383805736)

CAPTURE_CALLBACK_TOKEN 값은 `/home/onda/projects/onda-self-marketing/smm-panel/.env`
의 `CAPTURE_CALLBACK_TOKEN` 키에서 읽어서 `/home/onda/claude-bg/.env` 에 같은
이름으로 복사 (코드에 하드코딩 X).

## 10. 인스타 캡쳐 멀티 계정 로테이션 (2026-04-26 추가)

봇 차단 회피 + 알고리즘 학습 활용을 위해 핸드폰에 여러 인스타 계정이 로그인된 상태로
운용. enqueue 측이 task에 `insta_account` 필드를 박아 보냄:

```json
{
  "id": "...",
  "keyword": "...",
  "insta_account": "ondamkt_a",   // 핸드폰에 로그인된 계정 중 1개. null이면 현재 활성 계정 그대로
  ...
}
```

smm-panel 워커는 `INSTA_CAPTURE_ACCOUNTS` env (콤마/공백 분리)에서 `orderId+attempts`
해시 인덱스로 결정적 라운드 로빈하여 채움. 재시도 시 다른 계정 선택.

`capture_agent.py` (로컬) 처리:

1. task 가져오면 `insta_account` 확인
2. null/빈 값 → 현재 계정 그대로
3. 값 있고 현재 활성 계정과 다름 → 인스타 앱: 프로필 탭 → 상단 사용자명 → 계정 목록에서
   해당 계정 선택 (uiautomator dump로 동적 좌표 검출 권장). 전환 후 1.5초 대기
4. 그 후 검색 시퀀스 진행

`heartbeat.json` 에 `current_account` 필드 추가 권장:
```json
{
  "host": "anytwo-pc",
  "device": "ce07171750a7083504",
  "current_account": "ondamkt_a",
  "available_accounts": ["ondamkt_a", "ondamkt_b", "ondamkt_c"],
  ...
}
```

## 11. 변경 이력

- 2026-04-26 v1.0 초안 (로컬 측 작성)
- 2026-04-26 v1.1 §9 smm-panel 통합 + §10 멀티 계정 로테이션 추가 (서버 측)
