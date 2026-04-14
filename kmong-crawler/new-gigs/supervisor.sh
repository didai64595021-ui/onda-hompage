#!/bin/bash
# 크몽 자동등록 supervisor — 죽으면 재시작 + 매 10분 텔레그램 진행보고
#
# 동작:
#  1. 분당 체크: run-55-parallel.js 살아있나?
#  2. 죽었는데 진행 < 55 이면 재시작
#  3. 10분마다 진행상황 텔레그램
#  4. 55/55 완료 시 최종 보고 후 종료
set -u
cd /home/onda/projects/onda-hompage/kmong-crawler/new-gigs

LOG="/tmp/kmong-supervisor.log"
RUNNER_LOG="/tmp/kmong-supervisor-runner.log"
TG="/home/onda/scripts/telegram-sender.js"
PROGRESS="55-progress.json"
TARGET=55
RESTART_COUNT=0
MAX_RESTARTS=20
LAST_REPORT_AT=0

echo "[$(date)] supervisor 시작" > "$LOG"
node "$TG" send "👁️ 크몽 supervisor 가동
- 1분 간격 헬스체크
- 죽으면 자동 재시작 (최대 ${MAX_RESTARTS}회)
- 10분마다 진행보고
- 디버그 발견 시 텔레그램 즉시 보고
서버: didai21-302200, PC 종료 무관" kmong >> "$LOG" 2>&1

start_runner() {
    nohup node run-55-parallel.js --concurrency 2 >> "$RUNNER_LOG" 2>&1 &
    echo $!
}

get_done_count() {
    node -e "try{console.log(JSON.parse(require('fs').readFileSync('$PROGRESS','utf-8')).done.length)}catch(e){console.log(0)}"
}
get_failed_count() {
    node -e "try{console.log(JSON.parse(require('fs').readFileSync('$PROGRESS','utf-8')).failed.length)}catch(e){console.log(0)}"
}

# 초기 가동
RUNNER_PID=$(start_runner)
echo "[$(date)] 초기 PID=$RUNNER_PID" >> "$LOG"

while true; do
    DONE=$(get_done_count)
    FAILED=$(get_failed_count)

    # 완료 체크
    if [ "$DONE" -ge "$TARGET" ]; then
        echo "[$(date)] ✅ 55개 모두 완료 — supervisor 종료" >> "$LOG"
        node "$TG" send "🎉 크몽 자동등록 완전 완료
✅ 성공: $DONE/$TARGET
❌ 실패: $FAILED
재시작 횟수: $RESTART_COUNT" kmong >> "$LOG" 2>&1
        exit 0
    fi

    # 프로세스 살아있나
    if ! ps -p "$RUNNER_PID" > /dev/null 2>&1; then
        # 죽음 — 재시작
        if [ "$RESTART_COUNT" -ge "$MAX_RESTARTS" ]; then
            echo "[$(date)] ⚠️ 최대 재시작($MAX_RESTARTS) 도달 — supervisor 종료" >> "$LOG"
            node "$TG" send "⚠️ 크몽 supervisor 한계 도달
재시작: $MAX_RESTARTS회
완료: $DONE/$TARGET
실패: $FAILED
수동 점검 필요" kmong >> "$LOG" 2>&1
            exit 1
        fi
        RESTART_COUNT=$((RESTART_COUNT + 1))
        echo "[$(date)] runner 죽음 → 재시작 #$RESTART_COUNT (DONE=$DONE/$TARGET)" >> "$LOG"
        node "$TG" send "🔄 크몽 runner 죽어서 재시작 #$RESTART_COUNT
- 진행: $DONE/$TARGET
- 실패: $FAILED
- 다음 사이클 picking up 가능 상품" kmong >> "$LOG" 2>&1

        # 마지막 30줄 로그 첨부
        TAIL=$(tail -30 "$RUNNER_LOG" 2>/dev/null | grep -iE "✗|error|fail|예외|throw" | head -5)
        if [ -n "$TAIL" ]; then
            node "$TG" send "🐛 supervisor 최근 오류
\`\`\`
$TAIL
\`\`\`" kmong >> "$LOG" 2>&1
        fi

        sleep 5
        RUNNER_PID=$(start_runner)
        echo "[$(date)] 새 PID=$RUNNER_PID" >> "$LOG"
    fi

    # 10분마다 진행보고
    NOW=$(date +%s)
    if [ $((NOW - LAST_REPORT_AT)) -ge 600 ]; then
        node "$TG" send "📊 크몽 진행 보고 (10분 cycle)
✅ 완료: $DONE/$TARGET
❌ 실패: $FAILED
🔄 재시작: $RESTART_COUNT
가동 상태: 정상" kmong >> "$LOG" 2>&1
        LAST_REPORT_AT=$NOW
    fi

    sleep 60
done
