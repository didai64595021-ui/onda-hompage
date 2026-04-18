#!/bin/bash
# 니치 10상품 순차 임시저장 (N02~N10)
# N01은 먼저 테스트 완료됨
cd /home/onda/projects/onda-hompage/kmong-crawler/new-gigs

LOG=/tmp/niches-batch.log
RESULT=/tmp/niches-batch-results.txt
> "$RESULT"

for id in N02 N03 N04 N05 N06 N07 N08 N09 N10; do
  echo "========================================" >> "$LOG"
  echo "[$(date +%H:%M:%S)] Running $id" >> "$LOG"
  echo "========================================" >> "$LOG"
  url=$(GIG_DATA=./gig-data-niches timeout 180 node create-gig.js --product "$id" --mode save 2>&1 | tee -a "$LOG" | grep -oE "https://kmong.com/my-gigs/edit/[0-9]+[^ ]*" | tail -1)
  if [ -n "$url" ]; then
    echo "$id SUCCESS $url" >> "$RESULT"
  else
    echo "$id FAIL -" >> "$RESULT"
  fi
  sleep 3
done

# 텔레그램 최종 보고
MSG="🎯 니치 10상품 임시저장 배치 완료

[N01 선행 완료]
https://kmong.com/my-gigs/edit/764200?rootCategoryId=6&subCategoryId=639

[N02~N10 결과]
$(cat $RESULT)

상세 로그: $LOG
draft 목록: kmong.com/my-gigs
"
node /home/onda/scripts/telegram-sender.js "$MSG"
