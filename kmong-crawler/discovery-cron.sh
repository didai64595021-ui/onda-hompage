#!/bin/bash
# 크몽 4축 통과 카테고리 발굴 cron wrapper
# 매일 새벽 4시 실행 → 미조사 30개 키워드 평가 + 텔레그램 보고
LOG="/home/onda/logs/kmong-discovery-cron.log"
mkdir -p "$(dirname "$LOG")"
cd /home/onda/projects/onda-hompage/kmong-crawler || exit 1
TS=$(date '+%F %T')
{
  echo ""
  echo "===== $TS discovery 시작 ====="
  timeout 1800 node discovery-cron.js 2>&1
  echo "===== $TS discovery 종료 (exit=$?) ====="
} >> "$LOG" 2>&1
