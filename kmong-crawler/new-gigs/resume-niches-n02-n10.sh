#!/bin/bash
# 크몽 니치 N02~N10 임시저장 재개 (서버 멈춤으로 중단된 autopilot 이어가기)
# 전제: N01 draft 764200 이미 저장됨, 이미지 10장 생성 완료, N03 cat2 fallback 적용됨
# 주의: --mode save (임시저장만). 실 등록 submit 절대 안 함 (feedback_kmong_human_submit.md)

export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
cd /home/onda/projects/onda-hompage/kmong-crawler/new-gigs

LOG_DIR=/home/onda/logs/niches-resume
mkdir -p "$LOG_DIR"
MAIN_LOG="$LOG_DIR/main.log"
RESULT="$LOG_DIR/results.txt"

send_tg() { node /home/onda/scripts/telegram-sender.js "$1" >> "$MAIN_LOG" 2>&1; }

echo "[$(date '+%F %T')] N02~N10 임시저장 재개" > "$MAIN_LOG"
send_tg "🔄 [크몽 니치] N02~N10 재개 (N01 764200 유지). 로컬 종료 무관."

> "$RESULT"
# N01은 이미 완료됐으니 results 에 SUCCESS 로 선기록
echo "N01|SUCCESS|https://kmong.com/my-gigs/edit/764200|선행 완료|-" >> "$RESULT"

for id in N02 N03 N04 N05 N06 N07 N08 N09 N10; do
  echo "" >> "$MAIN_LOG"
  echo "===== $id at $(date '+%H:%M:%S') =====" >> "$MAIN_LOG"
  send_tg "📝 [크몽 니치] $id 시도 중..."

  # 200초 타임아웃 per gig (스텝1+스텝2 여유)
  url=$(GIG_DATA=./gig-data-niches timeout 240 node create-gig.js --product "$id" --mode save 2>&1 | tee -a "$MAIN_LOG" | grep -oE "https://kmong.com/my-gigs/edit/[0-9]+[^ ]*" | tail -1)
  if [ -n "$url" ]; then
    title=$(node -e "const {PRODUCTS}=require('./gig-data-niches'); const p=PRODUCTS.find(x=>x.id==='$id'); if(p) console.log(p.title);" 2>/dev/null)
    price=$(node -e "const {PRODUCTS}=require('./gig-data-niches'); const p=PRODUCTS.find(x=>x.id==='$id'); if(p) console.log(p.packages[0].price+'/'+p.packages[1].price+'/'+p.packages[2].price);" 2>/dev/null)
    echo "$id|SUCCESS|$url|$title|$price" >> "$RESULT"
    send_tg "✅ [크몽 니치] $id 성공 → $url"
  else
    echo "$id|FAIL|-|-|-" >> "$RESULT"
    send_tg "❌ [크몽 니치] $id 실패 — 다음 상품으로 진행"
  fi
  sleep 4
done

# 최종 보고
echo "" >> "$MAIN_LOG"
echo "[$(date '+%F %T')] 배치 종료. 결과: $RESULT" >> "$MAIN_LOG"

OK_COUNT=$(grep -c '|SUCCESS|' "$RESULT")
FAIL_COUNT=$(grep -c '|FAIL|' "$RESULT")

MSG="🎯 [크몽 니치 10상품 임시저장 완료]

성공: ${OK_COUNT}/10
실패: ${FAIL_COUNT}/10

--- 결과 ---
$(cat "$RESULT")

--- 다음 단계 ---
kmong.com/my-gigs 에서 직접 검토 후 실제 발행 (정책: 사람이 수동 발행)

상세 로그: $MAIN_LOG"

node /home/onda/scripts/telegram-sender.js "$MSG" >> "$MAIN_LOG" 2>&1
echo "DONE"
