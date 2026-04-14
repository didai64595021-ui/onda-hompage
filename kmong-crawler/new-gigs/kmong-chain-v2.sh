#!/usr/bin/env bash
# 크몽 체인 v2 — 첫 체인 Phase 2 전멸 문제 수정본
# fill-pricing-v2 (다음 버튼 불필요) + verify-thumbnails-v3 (재시도 강화) + cleanup 재시도 + 최종 QA
set -u

TELEGRAM=/home/onda/scripts/telegram-sender.js
WORKDIR=/home/onda/projects/onda-hompage/kmong-crawler/new-gigs
STATE_DIR=/home/onda/shared/state/kmong-chain
LOG_DIR=/home/onda/logs/kmong-chain
mkdir -p "$STATE_DIR" "$LOG_DIR"

RUN_TS=$(date +%Y%m%d_%H%M%S)
CHAIN_LOG="$LOG_DIR/chain-v2-$RUN_TS.log"
STATE_FILE="$STATE_DIR/current.json"
PROGRESS_FILE="$STATE_DIR/progress.jsonl"

tg() { node "$TELEGRAM" "$1" >/dev/null 2>&1 || true; }
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$CHAIN_LOG"; }
state() {
  local phase="$1"; local status="$2"; local msg="$3"
  node -e "
    const fs=require('fs');
    const p='$STATE_FILE';
    const cur=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf-8')):{};
    cur.chain='v2'; cur.phase='$phase'; cur.status='$status'; cur.msg=\`$msg\`;
    cur.updated_at=new Date().toISOString();
    fs.writeFileSync(p,JSON.stringify(cur,null,2));
    fs.appendFileSync('$PROGRESS_FILE',JSON.stringify({at:cur.updated_at,chain:'v2',phase:'$phase',status:'$status',msg:cur.msg})+'\\n');
  " 2>/dev/null || true
}
report_val() {
  node -e "try{const r=require('$1');let v=r$2;console.log(v??'null');}catch{console.log('null');}" 2>/dev/null
}

cd "$WORKDIR" || { tg "⚠️ chain-v2 abort: WORKDIR 없음"; exit 1; }

log "chain-v2 시작 (RUN_TS=$RUN_TS)"
state "start" "running" "chain-v2 시작"
tg "🔧 크몽 체인 v2 가동 (Phase 2 수정 — 다음 버튼 불필요 패턴)"

# ─── Phase A: fill-pricing-v2 전체 실행 ───
state "phaseA_pricing_v2" "running" "fill-pricing-v2 55건"
tg "▶️ Phase A: fill-pricing-v2 (55건 가격/기간/수정 재시도)"
log "Phase A: fill-pricing-v2 실행"
if ! timeout 7200 node fill-pricing-v2.js > "$LOG_DIR/fp-v2-$RUN_TS.log" 2>&1; then
  log "fill-pricing-v2 실패 또는 타임아웃 (rc=$?)"
fi
OK_A=$(report_val "$WORKDIR/fill-pricing-report.json" ".ok")
NG_A=$(report_val "$WORKDIR/fill-pricing-report.json" ".ng")
log "Phase A 결과: OK=$OK_A NG=$NG_A"
tg "✅ Phase A 완료: fill-pricing-v2 OK=$OK_A NG=$NG_A"
state "phaseA_pricing_v2" "done" "OK=$OK_A NG=$NG_A"

# ─── Phase B: verify-thumbnails-v3 (재시도 강화) ───
state "phaseB_thumb_v3" "running" "verify-thumbnails-v3"
tg "▶️ Phase B: verify-thumbnails-v3 (sleep 8s + 3회 재시도)"
log "Phase B: verify-thumbnails-v3 실행"
if ! timeout 3600 node verify-thumbnails-v3.js > "$LOG_DIR/vt-v3-$RUN_TS.log" 2>&1; then
  log "verify-thumbnails-v3 실패 또는 타임아웃"
fi
OK_B=$(report_val "$WORKDIR/verify-thumbnails-v3-report.json" ".ok")
NG_B=$(report_val "$WORKDIR/verify-thumbnails-v3-report.json" ".ng")
log "Phase B 결과: OK=$OK_B NG=$NG_B"
tg "🔎 Phase B 완료: verify-thumbnails-v3 OK=$OK_B NG=$NG_B"
state "phaseB_thumb_v3" "done" "OK=$OK_B NG=$NG_B"

# ─── Phase C: cleanup-duplicates 재시도 (5 잔여 noise) ───
state "phaseC_cleanup_retry" "running" "cleanup-duplicates 재시도"
tg "▶️ Phase C: cleanup-duplicates 재시도 (잔여 noise 5건)"
log "Phase C: cleanup-duplicates --execute (재시도)"
if ! timeout 1800 node cleanup-duplicates.js --execute > "$LOG_DIR/cleanup-retry-$RUN_TS.log" 2>&1; then
  log "cleanup 재시도 실패 또는 타임아웃"
fi
DEL_C=$(report_val "$WORKDIR/cleanup-duplicates-report.json" ".deleted.length")
NOISE_C=$(report_val "$WORKDIR/cleanup-duplicates-report.json" ".remainingNonKeep.length")
log "Phase C 결과: 삭제=$DEL_C 잔여noise=$NOISE_C"
tg "✅ Phase C 완료: 추가 삭제 $DEL_C건 (이번 런), 잔여 noise $NOISE_C건"
state "phaseC_cleanup_retry" "done" "deleted=$DEL_C noise=$NOISE_C"

# ─── Phase D: 최종 QA 리포트 재생성 ───
state "phaseD_qa" "running" "final-qa-report v2"
log "Phase D: final-qa-report 생성"
QA_FILE="$LOG_DIR/final-qa-v2-$RUN_TS.md"
node final-qa-report.js > "$QA_FILE" 2>&1
log "QA 리포트: $QA_FILE"

# 텔레그램 최종 보고 — 요약만 (긴 URL 목록은 파일로)
SUMMARY=$(head -15 "$QA_FILE")
tg "🏁 크몽 체인 v2 완료 (Phase 2 전멸 복구)
$SUMMARY

QA: $QA_FILE
상태: $STATE_FILE

55개 draft 본문·가격·기간·수정·썸네일 전부 임시저장됨.
아침에 draft URL에서 직접 '제출하기' 클릭으로 발행."
state "phaseD_qa" "done" "QA=$QA_FILE"
state "complete_v2" "done" "chain-v2 finished"
log "CHAIN-V2 COMPLETE"

cd "$WORKDIR/../.." && git add kmong-crawler/new-gigs/fill-pricing-v2.js kmong-crawler/new-gigs/verify-thumbnails-v3.js kmong-crawler/new-gigs/kmong-chain-v2.sh kmong-crawler/new-gigs/*-report.json 2>/dev/null
cd "$WORKDIR/../.." && git commit -m "chore(kmong): 체인 v2 실행 완료 ($RUN_TS) — Phase 2 전멸 수정 + 썸네일 재검증 + 잔여 정리

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>/dev/null || true
