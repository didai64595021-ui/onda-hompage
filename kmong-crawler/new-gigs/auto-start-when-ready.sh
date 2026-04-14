#!/bin/bash
# 크몽 55개 자동등록 — 사전 데이터 준비 완료 시 자동 시작
#
# 조건:
#  1. gig-data-55.js의 PRODUCTS.length === 55
#  2. 03-images/55-NN.png 파일이 ≥50개 존재 (95% 이상)
#
# 두 조건 모두 만족하면 run-55-parallel.js를 nohup 백그라운드로 시작.
# 시작 후 자동 종료. 진행상황은 텔레그램(-1003738825402)으로 전송.

set -u
cd /home/onda/projects/onda-hompage/kmong-crawler/new-gigs

LOG="/tmp/kmong-auto-start.log"
TG="/home/onda/scripts/telegram-sender.js"
RUNNER_LOG="/tmp/kmong-runner.log"
RUNNER_PID="/tmp/kmong-runner.pid"

echo "[$(date)] auto-start-when-ready 시작" > "$LOG"
node "$TG" send "🟡 크몽 자동등록 대기 시작
- gig-data-55.js: 55개 완료 + 이미지 ≥50개 도달 시 자동 실행
- 5분 간격으로 상태 확인" kmong >> "$LOG" 2>&1

CHECK_INTERVAL=300  # 5분
MAX_WAIT=14400      # 4시간 안전장치
ELAPSED=0

while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
    # 상품 수 확인
    PRODUCT_COUNT=$(node -e "try{console.log(require('./gig-data-55.js').PRODUCTS.length)}catch(e){console.log(0)}" 2>/dev/null)
    IMAGE_COUNT=$(ls 03-images/55-*.png 2>/dev/null | wc -l)

    echo "[$(date)] 체크: 상품=$PRODUCT_COUNT/55, 이미지=$IMAGE_COUNT/55" >> "$LOG"

    if [ "$PRODUCT_COUNT" -ge 55 ] && [ "$IMAGE_COUNT" -ge 50 ]; then
        echo "[$(date)] ✅ 조건 충족 — 오케스트레이터 시작" >> "$LOG"
        node "$TG" send "🚀 크몽 오케스트레이터 시작 조건 충족
- 상품 데이터: $PRODUCT_COUNT/55
- 이미지: $IMAGE_COUNT/55
- 모드: 임시저장 (save) — 제출은 사용자가 직접
- 병렬: 2 워커
- 1 임시저장 완료마다 링크 전송" kmong >> "$LOG" 2>&1

        # 오케스트레이터 nohup 시작
        nohup node run-55-parallel.js > "$RUNNER_LOG" 2>&1 &
        RUNNER_PROC_PID=$!
        echo "$RUNNER_PROC_PID" > "$RUNNER_PID"
        echo "[$(date)] 오케스트레이터 PID=$RUNNER_PROC_PID" >> "$LOG"
        node "$TG" send "✅ 오케스트레이터 백그라운드 가동 (PID=$RUNNER_PROC_PID)
서버에서 계속 실행됩니다. PC 종료 무관." kmong >> "$LOG" 2>&1
        exit 0
    fi

    # 부분 진행 알림 (매 30분마다)
    if [ $((ELAPSED % 1800)) -eq 0 ] && [ "$ELAPSED" -gt 0 ]; then
        node "$TG" send "⏳ 크몽 준비 진행중
- 상품 데이터: $PRODUCT_COUNT/55
- 이미지: $IMAGE_COUNT/55
- 대기 시간: ${ELAPSED}s" kmong >> "$LOG" 2>&1
    fi

    sleep "$CHECK_INTERVAL"
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

# 4시간 초과 시 강제 시작 + 경고
node "$TG" send "⚠️ 크몽 준비 4시간 초과 — 강제 시작
- 상품 데이터: $PRODUCT_COUNT/55 (불완전 가능)
- 이미지: $IMAGE_COUNT/55 (불완전 가능)
- 사용 가능한 데이터로 진행" kmong >> "$LOG" 2>&1

if [ "$PRODUCT_COUNT" -gt 0 ]; then
    nohup node run-55-parallel.js > "$RUNNER_LOG" 2>&1 &
    echo "$!" > "$RUNNER_PID"
fi
exit 0
