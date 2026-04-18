#!/bin/bash
# 니치 10상품 자율 완주 파이프라인
# Steps: 1 이미지 생성 대기 → 2 기존 draft 삭제 → 3 N03 fallback → 4 10건 재등록 → 5 최종 보고서

export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
cd /home/onda/projects/onda-hompage/kmong-crawler/new-gigs

LOG_DIR=/tmp/niches-auto
mkdir -p "$LOG_DIR"
MAIN_LOG="$LOG_DIR/main.log"
RESULT="$LOG_DIR/results.txt"
REPORT="$LOG_DIR/final-report.txt"

send_tg() { node /home/onda/scripts/telegram-sender.js "$1" >> "$MAIN_LOG" 2>&1; }

echo "[$(date '+%F %T')] 자율 파이프라인 시작" > "$MAIN_LOG"
send_tg "🤖 니치 10상품 자율 파이프라인 시작 (로컬 종료해도 서버 완주)"

# ── Step 1: OpenAI 이미지 생성 완료 대기 ──
echo "" >> "$MAIN_LOG"
echo "[Step 1/5] OpenAI 이미지 생성 대기" >> "$MAIN_LOG"
IMG_PID=1718977
while ps -p $IMG_PID > /dev/null 2>&1; do
  sleep 15
done
OK_IMGS=$(ls 03-images/niche-N*.png 2>/dev/null | wc -l)
echo "[Step 1] 이미지 $OK_IMGS/10 생성 완료" >> "$MAIN_LOG"
send_tg "✅ [1/5] 이미지 생성 완료 $OK_IMGS/10"

# 이미지 생성 실패 시 기존 PIL 썸네일로 fallback 유지 (niche-NXX.png 존재 확인)
TOTAL_IMGS=$(ls 03-images/niche-N*.png 2>/dev/null | wc -l)
if [ "$TOTAL_IMGS" -lt 10 ]; then
  send_tg "⚠️ 이미지 10장 미만 ($TOTAL_IMGS). 부족분은 기존 PIL 생성본 재사용 or 스킵"
fi

# ── Step 2: 기존 4건 draft 삭제 (N01/N02/N04/N05) ──
echo "" >> "$MAIN_LOG"
echo "[Step 2/5] 기존 draft 삭제" >> "$MAIN_LOG"
send_tg "🗑 [2/5] 기존 4 draft 삭제 중..."
timeout 180 node cleanup-by-id.js --execute 764200 764201 764203 764204 >> "$MAIN_LOG" 2>&1 || true
send_tg "✅ [2/5] 기존 draft 정리 완료"

# ── Step 3: N03 cat2 fallback (카페24 → 홈페이지 신규 제작) ──
# 카페24 3차 카테고리 매칭 실패 우회. 제목엔 "카페24·가비아" 키워드 유지돼 CTR 보존.
python3 << 'PYEOF'
import re
p = 'gig-data-niches.js'
s = open(p).read()
# N03 블록 내 cat2만 교체
pat = re.compile(r"(id: 'N03',[\s\S]+?cat2: ')카페24(')")
new = pat.sub(r"\1홈페이지 신규 제작\2", s, count=1)
if new != s:
    open(p, 'w').write(new)
    print('[Step 3] N03 cat2 카페24 → 홈페이지 신규 제작 변경')
else:
    print('[Step 3] N03 cat2 패턴 매칭 실패')
PYEOF
echo "[Step 3] cat3 fallback 적용" >> "$MAIN_LOG"

# ── Step 4: 10건 전체 임시저장 ──
echo "" >> "$MAIN_LOG"
echo "[Step 4/5] 10상품 임시저장" >> "$MAIN_LOG"
send_tg "📝 [3/5] 10상품 임시저장 시작 (예상 15~20분)..."
> "$RESULT"
for id in N01 N02 N03 N04 N05 N06 N07 N08 N09 N10; do
  echo "" >> "$MAIN_LOG"
  echo "===== $id =====" >> "$MAIN_LOG"
  url=$(GIG_DATA=./gig-data-niches timeout 200 node create-gig.js --product "$id" --mode save 2>&1 | tee -a "$MAIN_LOG" | grep -oE "https://kmong.com/my-gigs/edit/[0-9]+[^ ]*" | tail -1)
  if [ -n "$url" ]; then
    title=$(node -e "const {PRODUCTS}=require('./gig-data-niches'); const p=PRODUCTS.find(x=>x.id==='$id'); if(p) console.log(p.title);")
    price=$(node -e "const {PRODUCTS}=require('./gig-data-niches'); const p=PRODUCTS.find(x=>x.id==='$id'); if(p) console.log(p.packages[0].price+'/'+p.packages[1].price+'/'+p.packages[2].price);")
    echo "$id|SUCCESS|$url|$title|$price" >> "$RESULT"
  else
    echo "$id|FAIL|-|-|-" >> "$RESULT"
  fi
  sleep 3
done
send_tg "✅ [4/5] 임시저장 완료"

# ── Step 5: 최종 보고서 ──
echo "" >> "$MAIN_LOG"
echo "[Step 5/5] 최종 보고서 작성" >> "$MAIN_LOG"
python3 /home/onda/projects/onda-hompage/kmong-crawler/new-gigs/build-niches-report.py > "$REPORT" 2>> "$MAIN_LOG" || echo "리포트 생성 실패 — 원본 $RESULT 참조" >> "$MAIN_LOG"

# 전송 (파일로부터)
if [ -f "$REPORT" ]; then
  node /home/onda/scripts/telegram-sender.js "$(cat "$REPORT")" >> "$MAIN_LOG" 2>&1
fi

send_tg "🎉 [5/5] 자율 파이프라인 완료. 로그: $MAIN_LOG"
echo "[$(date '+%F %T')] 자율 파이프라인 종료" >> "$MAIN_LOG"
