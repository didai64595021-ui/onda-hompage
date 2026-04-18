#!/bin/bash
# check-known-fixes.sh — 크몽 문제 해결 전에 과거 해결 사례 검색
# 사용:
#   ./check-known-fixes.sh                       # 전체 목록 (최근 20)
#   ./check-known-fixes.sh <키워드>              # 키워드 매칭 (grep -i)
#   ./check-known-fixes.sh --critical            # CRITICAL 섹션만
#   ./check-known-fixes.sh --refresh             # KMONG_FIXES.jsonl 재빌드

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$(cd "$DIR/.." && pwd)"
SOL="$DIR/KMONG_SOLUTIONS.md"
LOG="$DIR/KMONG_FIXES.jsonl"

if [ "$1" = "--refresh" ]; then
  echo "🔄 KMONG_FIXES.jsonl rebuild ..."
  cd "$PROJECT"
  git log --pretty=format:'%H|%at|%s' | awk -F'|' '
  tolower($3) ~ /(^fix|^feat|^refactor|^debug).*\(kmong|(^fix|^feat|^refactor|^debug): kmong|(^fix|^feat|^refactor|^debug): 크몽/ {
    ts=strftime("%Y-%m-%dT%H:%M:%SZ", $2);
    ts_local=strftime("%Y-%m-%d %H:%M:%S", $2);
    hash=substr($1, 1, 7);
    subj=$3;
    gsub(/\\/, "\\\\", subj);
    gsub(/"/, "\\\"", subj);
    printf "{\"ts\":\"%s\",\"ts_local\":\"%s\",\"hash\":\"%s\",\"subject\":\"%s\"}\n", ts, ts_local, hash, subj
  }' > "$LOG"
  echo "  → $(wc -l < "$LOG") 건 기록"
  exit 0
fi

if [ "$1" = "--critical" ]; then
  echo "🔴 CRITICAL — 반복 헤맸던 문제"
  echo ""
  sed -n '/## 🔴 CRITICAL/,/## 🟡/p' "$SOL" | grep -E "^\| C[0-9]" | head -20
  exit 0
fi

if [ -z "$1" ]; then
  echo "📚 크몽 해결 인덱스 — 최근 20건 (키워드 검색: $0 <키워드>)"
  echo ""
  if [ -f "$LOG" ]; then
    tail -20 "$LOG" | python3 -c "
import json, sys
for line in sys.stdin:
  try:
    d = json.loads(line)
    print(f\"  {d['ts_local']}  {d['hash']}  {d['subject'][:110]}\")
  except: pass
"
  fi
  echo ""
  echo "  📖 상세: cat $SOL"
  echo "  🔍 검색: $0 <키워드>  (예: $0 select persist)"
  exit 0
fi

# 키워드 검색 모드
QUERY="$*"
echo "🔍 '$QUERY' 매칭 결과"
echo ""
echo "=== KMONG_SOLUTIONS.md ==="
grep -n -i -C 1 "$QUERY" "$SOL" 2>/dev/null | head -30 || echo "  매칭 없음"
echo ""
echo "=== KMONG_FIXES.jsonl (커밋) ==="
if [ -f "$LOG" ]; then
  grep -i "$QUERY" "$LOG" 2>/dev/null | python3 -c "
import json, sys
lines = list(sys.stdin)
if not lines: print('  매칭 없음')
for line in lines[:15]:
  try:
    d = json.loads(line)
    print(f\"  {d['ts_local']}  {d['hash']}  {d['subject'][:120]}\")
  except: pass
"
fi
echo ""
echo "  📖 상세 보기: cat $SOL | less"
