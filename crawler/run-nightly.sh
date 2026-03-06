#!/bin/bash
# 매일 22:00~23:59 실행 — 블로그 크롤러 API 시간 외에 남은 할당량 소진
# cron: 0 22 * * * /home/onda/projects/onda-hompage/crawler/run-nightly.sh

HOUR=$(date +%H)
if [ "$HOUR" -lt 22 ]; then
  echo "22시 이전 — 블로그 크롤러 우선. 스킵."
  exit 0
fi

cd /home/onda/projects/onda-hompage/crawler
node crawl.js 2>&1 | tee output/crawl-$(date +%Y%m%d).log

echo "✅ $(date) 크롤링 완료"
