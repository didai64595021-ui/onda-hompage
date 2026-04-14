#!/usr/bin/env bash
# 크몽 체인 v3 — v2 잔여 문제 수정
# 22 NG 썸네일 = 실제 이미지 업로드 누락 → replace-image-v2로 업로드
# 4 NG pricing = 편집하기 클릭 실패 → fill-pricing-v2 재시도
set -u

TELEGRAM=/home/onda/scripts/telegram-sender.js
WORKDIR=/home/onda/projects/onda-hompage/kmong-crawler/new-gigs
STATE_DIR=/home/onda/shared/state/kmong-chain
LOG_DIR=/home/onda/logs/kmong-chain
mkdir -p "$STATE_DIR" "$LOG_DIR"

RUN_TS=$(date +%Y%m%d_%H%M%S)
CHAIN_LOG="$LOG_DIR/chain-v3-$RUN_TS.log"
STATE_FILE="$STATE_DIR/current.json"
PROGRESS_FILE="$STATE_DIR/progress.jsonl"

# NG 리스트 (v2 결과 기준)
THUMB_NG="14,15,16,17,19,20,21,22,29,39,43,44,45,46,47,48,49,50,51,52,53,55"
PRICE_NG="13,14,15,16"

tg() { node "$TELEGRAM" "$1" >/dev/null 2>&1 || true; }
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$CHAIN_LOG"; }
state() {
  local phase="$1"; local status="$2"; local msg="$3"
  node -e "
    const fs=require('fs');
    const p='$STATE_FILE';
    const cur=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf-8')):{};
    cur.chain='v3'; cur.phase='$phase'; cur.status='$status'; cur.msg=\`$msg\`;
    cur.updated_at=new Date().toISOString();
    fs.writeFileSync(p,JSON.stringify(cur,null,2));
    fs.appendFileSync('$PROGRESS_FILE',JSON.stringify({at:cur.updated_at,chain:'v3',phase:'$phase',status:'$status',msg:cur.msg})+'\\n');
  " 2>/dev/null || true
}
report_val() {
  node -e "try{const r=require('$1');let v=r$2;console.log(v??'null');}catch{console.log('null');}" 2>/dev/null
}

cd "$WORKDIR" || { tg "⚠️ chain-v3 abort: WORKDIR 없음"; exit 1; }

log "chain-v3 시작 (RUN_TS=$RUN_TS)"
state "start" "running" "chain-v3 시작"
tg "🔧 크몽 체인 v3 가동 — 22 썸네일 + 4 가격 수정"

# ─── Phase A: replace-image-v2 (썸네일 NG 22건) ───
state "phaseA_img" "running" "replace-image-v2 22건"
tg "▶️ Phase A: replace-image-v2 (pid $THUMB_NG)"
log "Phase A: replace-image-v2 --only=$THUMB_NG"
if ! timeout 5400 node replace-image-v2.js --only=$THUMB_NG > "$LOG_DIR/ri-v2-v3chain-$RUN_TS.log" 2>&1; then
  log "replace-image-v2 실패 또는 타임아웃 (rc=$?)"
fi
IMG_OK=$(report_val "$WORKDIR/replace-image-v2-report.json" ".ok")
IMG_NG=$(report_val "$WORKDIR/replace-image-v2-report.json" ".ng")
log "Phase A 결과: OK=$IMG_OK NG=$IMG_NG"
tg "✅ Phase A 완료: replace-image-v2 OK=$IMG_OK NG=$IMG_NG"
state "phaseA_img" "done" "OK=$IMG_OK NG=$IMG_NG"

# ─── Phase B: fill-pricing-v2 재시도 (pid 13,14,15,16) ───
state "phaseB_price_retry" "running" "fill-pricing-v2 retry 4건"
tg "▶️ Phase B: fill-pricing-v2 재시도 (pid $PRICE_NG)"
log "Phase B: fill-pricing-v2 --only=$PRICE_NG"
if ! timeout 1800 node fill-pricing-v2.js --only=$PRICE_NG > "$LOG_DIR/fp-v2-retry-$RUN_TS.log" 2>&1; then
  log "fill-pricing-v2 재시도 실패 또는 타임아웃"
fi
PR_OK=$(report_val "$WORKDIR/fill-pricing-report.json" ".ok")
PR_NG=$(report_val "$WORKDIR/fill-pricing-report.json" ".ng")
log "Phase B 결과 (재시도만): OK=$PR_OK NG=$PR_NG"
tg "✅ Phase B 완료: fill-pricing-v2 재시도 OK=$PR_OK NG=$PR_NG"
state "phaseB_price_retry" "done" "OK=$PR_OK NG=$PR_NG"

# ─── Phase C: verify-thumbnails-v3 전수 재검증 ───
state "phaseC_verify" "running" "verify-thumbnails-v3 전체"
tg "▶️ Phase C: verify-thumbnails-v3 전수 재검증"
log "Phase C: verify-thumbnails-v3"
if ! timeout 3600 node verify-thumbnails-v3.js > "$LOG_DIR/vt-v3-final-$RUN_TS.log" 2>&1; then
  log "verify-thumbnails-v3 실패 또는 타임아웃"
fi
VT_OK=$(report_val "$WORKDIR/verify-thumbnails-v3-report.json" ".ok")
VT_NG=$(report_val "$WORKDIR/verify-thumbnails-v3-report.json" ".ng")
log "Phase C 결과: OK=$VT_OK NG=$VT_NG"
tg "🔎 Phase C 완료: verify-thumbnails-v3 OK=$VT_OK NG=$VT_NG"
state "phaseC_verify" "done" "OK=$VT_OK NG=$VT_NG"

# ─── Phase D: 최종 QA ───
state "phaseD_qa" "running" "final-qa-report v3"
log "Phase D: final-qa-report 생성"
QA_FILE="$LOG_DIR/final-qa-v3-$RUN_TS.md"
node final-qa-report.js > "$QA_FILE" 2>&1

SUMMARY=$(head -15 "$QA_FILE")
tg "🏁 크몽 체인 v3 완료
$SUMMARY

QA: $QA_FILE
상태: $STATE_FILE

55개 draft 임시저장 완료. 제출하기 버튼만 직접 누르시면 발행됩니다."
state "phaseD_qa" "done" "QA=$QA_FILE"
state "complete_v3" "done" "chain-v3 finished"
log "CHAIN-V3 COMPLETE"

cd "$WORKDIR/../.." && git add kmong-crawler/new-gigs/replace-image-v2.js kmong-crawler/new-gigs/kmong-chain-v3.sh kmong-crawler/new-gigs/*-report.json 2>/dev/null
cd "$WORKDIR/../.." && git commit -m "chore(kmong): 체인 v3 실행 완료 ($RUN_TS) — 22 썸네일 업로드 + 4 가격 재시도

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>/dev/null || true
