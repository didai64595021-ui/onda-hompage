#!/bin/bash
# 크몽 신규 6개 상품 등록 작업 자동 재개 트리거
# 호출: PM2 cron_restart '0 23 8 4 *' (2026-04-08 23:00 KST 1회)
#
# 동작:
#  1. 텔레그램으로 재개 알림 발송 (시작/완료/실패 모두)
#  2. STATE.md 읽고 Claude Code 헤드리스로 작업 진행
#  3. 결과 텔레그램 보고
#
# 작업 디렉토리: /home/onda/projects/onda-hompage/kmong-crawler/new-gigs/

set -uo pipefail

WORK_DIR="/home/onda/projects/onda-hompage/kmong-crawler/new-gigs"
STATE_FILE="${WORK_DIR}/STATE.md"
LOG_FILE="${WORK_DIR}/resume-trigger.log"
TS() { TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST'; }
log() { echo "[$(TS)] $*" | tee -a "$LOG_FILE"; }

# ── 텔레그램 환경변수 로드 (kmong-crawler/.env 재사용)
if [ -f "/home/onda/projects/onda-hompage/kmong-crawler/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "/home/onda/projects/onda-hompage/kmong-crawler/.env"
  set +a
fi

# 텔레그램 채팅 ID — 크몽 그룹 (kmong-crawler/telegram-bot.js GROUPS.KMONG와 동일)
TG_CHAT_ID="${KMONG_TG_CHAT_ID:--1003753252286}"

tg_send() {
  local msg="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
    log "TELEGRAM_BOT_TOKEN 미설정, 메시지 스킵: $msg"
    return 1
  fi
  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_CHAT_ID}" \
    --data-urlencode "text=${msg}" \
    --data-urlencode "parse_mode=Markdown" \
    >> "$LOG_FILE" 2>&1 || log "텔레그램 발송 실패"
}

# ─── 시작 알림
log "========================================"
log "크몽 신규 6개 상품 등록 — 자동 재개 트리거 시작"
log "========================================"
tg_send "🤖 *크몽 신규 6개 상품 등록 — 23시 자동 재개*

\`${WORK_DIR}\`

📋 시장조사 완료 (Step 1/8)
다음: 02-product-specs.md 작성부터

Claude Code 헤드리스 호출 시도 중..."

cd "$WORK_DIR" || { log "디렉토리 진입 실패"; exit 1; }

# ─── 시간 가드: 23:00 KST 이전이면 즉시 종료 (PM2 등록 직후 즉시 실행 방지)
NOW_HM=$(TZ=Asia/Seoul date '+%H%M')
if [ "$NOW_HM" -lt "2255" ]; then
  log "현재 ${NOW_HM} (KST) — 23:00 이전, 트리거 종료 (cron 시각 대기)"
  tg_send "⏸ kmong-newgigs-resume 시간 가드: 현재 ${NOW_HM} KST. 23:00 이후 실제 트리거 동작."
  exit 0
fi
log "시간 가드 통과: ${NOW_HM} KST"

# ─── Claude Code 헤드리스 호출
# 헤드리스로 STATE.md 읽고 작업 진행. 단일 응답이라 멀티 스텝은 어려울 수 있으니
# 가장 가치 있는 다음 스텝 1~2개를 진행하도록 프롬프트.
PROMPT="너는 크몽 신규 6개 상품 등록 작업을 이어받았다.

작업 디렉토리: ${WORK_DIR}

먼저 STATE.md를 읽고 현재 상태를 파악해라. 그 안에 '확정된 6개 상품' 표가 있다.
01-market-research-1-macro.md, 01-market-research-2-aibot.md 두 시장조사 보고서도 함께 읽어라.

다음 단계는 Step 2: 02-product-specs.md 작성이다.
6개 상품 각각에 대해:
- 크몽 제목 (60자 이내, 한글, 키워드 강조)
- 태그 5개 (크몽 입력 형식)
- 패키지 3단 (Standard/Deluxe/Premium)별 가격·납기·작업범위·수정횟수
- 옵션(Add-on) 항목
- 상세설명 (8~12개 섹션, 마크다운)
- FAQ 8~12개
- 썸네일 이미지 프롬프트 (한국어 카피 + 시각 컨셉)

작성 후 git commit (단일 단계 단일 커밋 원칙).

이후 Step 3 (이미지 생성), Step 4 (선정), Step 5 (create-gig.js), Step 6 (등록), Step 7 (검수), Step 8 (보고)까지
가능한 데까지 자동 진행해라. 각 단계마다 git commit 필수.
실제 크몽 등록은 사용자 검수 권고가 있는 경우 dry-run으로 두고 텔레그램에 보고만 해라.

진행 상황은 단계마다 STATE.md 체크박스 갱신 + git commit으로 보존해라.
완료 또는 막히면 텔레그램 봇 토큰으로 사용자에게 보고해라.
"

# claude CLI 헤드리스 모드 시도. --print 또는 --output-format 지원 여부에 따라 분기.
CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
if [ -z "$CLAUDE_BIN" ]; then
  log "claude CLI 미설치 — 헤드리스 호출 불가. 텔레그램 알림만 전송"
  tg_send "⚠️ claude CLI 미설치. 사용자가 직접 \`/home/onda\`에서 새 세션 시작 후 STATE.md 읽고 진행 부탁."
  exit 0
fi

log "claude CLI 헤드리스 호출 시작 (timeout 1800s)"
RESULT_FILE="${WORK_DIR}/resume-trigger-output.log"
{
  echo "=== Claude 호출 시작 $(TS) ==="
  echo "$PROMPT" | timeout 1800 "$CLAUDE_BIN" --print --dangerously-skip-permissions 2>&1
  RC=$?
  echo ""
  echo "=== 종료 코드: $RC ($(TS)) ==="
} > "$RESULT_FILE" 2>&1

RC=$(tail -1 "$RESULT_FILE" | grep -oP '종료 코드: \K[0-9]+' || echo "?")
log "claude 헤드리스 종료 코드: $RC"

# ─── 완료 알림
TAIL_OUTPUT="$(tail -30 "$RESULT_FILE" 2>/dev/null | head -1500 || echo "")"
tg_send "✅ *크몽 신규 6개 상품 등록 — 23시 자동 재개 완료*

종료코드: \`$RC\`
로그: \`${RESULT_FILE}\`

마지막 출력 30줄:
\`\`\`
${TAIL_OUTPUT:0:1500}
\`\`\`

상세 확인: \`tail -100 ${RESULT_FILE}\`"

log "트리거 종료 ($(TS))"
exit 0
