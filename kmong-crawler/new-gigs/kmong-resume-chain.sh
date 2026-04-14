#!/usr/bin/env bash
# 크몽 55상품 재개 자율 체인 — 사용자 수면 중 실행
# 흐름: 1순위 완료 대기 → 2순위 가격 → 3순위 썸네일 검증 → 중복 정리 → 최종 QA
# 실발행(submit) 절대 호출하지 않음. 임시저장만.
set -u

TELEGRAM=/home/onda/scripts/telegram-sender.js
WORKDIR=/home/onda/projects/onda-hompage/kmong-crawler/new-gigs
STATE_DIR=/home/onda/shared/state/kmong-chain
LOG_DIR=/home/onda/logs/kmong-chain
mkdir -p "$STATE_DIR" "$LOG_DIR"

RUN_TS=$(date +%Y%m%d_%H%M%S)
CHAIN_LOG="$LOG_DIR/chain-$RUN_TS.log"
STATE_FILE="$STATE_DIR/current.json"
PROGRESS_FILE="$STATE_DIR/progress.jsonl"

tg() { node "$TELEGRAM" "$1" >/dev/null 2>&1 || true; }
log() { local m="[$(date '+%H:%M:%S')] $*"; echo "$m" | tee -a "$CHAIN_LOG"; }
state() {
  local phase="$1"; local status="$2"; local msg="$3"
  node -e "
    const fs=require('fs');
    const p='$STATE_FILE';
    const cur=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf-8')):{};
    cur.phase='$phase'; cur.status='$status'; cur.msg=\`$msg\`;
    cur.updated_at=new Date().toISOString();
    fs.writeFileSync(p,JSON.stringify(cur,null,2));
    fs.appendFileSync('$PROGRESS_FILE',JSON.stringify({at:cur.updated_at,phase:'$phase',status:'$status',msg:cur.msg})+'\\n');
  " 2>/dev/null || true
}
report_val() {
  # usage: report_val <file.json> <jq-like path>
  node -e "try{const r=require('$1');let v=r$2;console.log(v??'null');}catch{console.log('null');}" 2>/dev/null
}

cd "$WORKDIR" || { tg "⚠️ chain abort: WORKDIR 없음"; exit 1; }

# ─── Phase 0: 1순위 PID 대기 ───
BODY_PID=${1:-}
log "체인 시작 (RUN_TS=$RUN_TS)"
state "start" "running" "체인 시작"
tg "🌙 크몽 자율 체인 시작 (사용자 수면 중)"

if [[ -n "$BODY_PID" ]]; then
  log "1순위 update-body-v1 PID=$BODY_PID 대기"
  state "phase1_wait" "running" "1순위 PID $BODY_PID 대기"
  WAIT_START=$(date +%s)
  while kill -0 "$BODY_PID" 2>/dev/null; do
    # 90분 초과 시 강제 종료 후 진행
    NOW=$(date +%s); ELAPSED=$((NOW - WAIT_START))
    if [[ $ELAPSED -gt 5400 ]]; then
      log "1순위 90분 초과 — 강제 종료"
      kill "$BODY_PID" 2>/dev/null || true
      sleep 5
      break
    fi
    sleep 25
  done
  log "1순위 프로세스 종료 (경과 ${ELAPSED:-0}s)"
fi

# ─── Phase 1: update-body 결과 검증 ───
state "phase1_verify" "running" "update-body-report 검증"
OK1=$(report_val "$WORKDIR/update-body-report.json" ".ok")
NG1=$(report_val "$WORKDIR/update-body-report.json" ".ng")
PROC1=$(report_val "$WORKDIR/update-body-report.json" ".processed")
log "Phase 1 결과: OK=$OK1 NG=$NG1 Processed=$PROC1"
if [[ "$OK1" == "null" ]] || [[ "${OK1:-0}" -lt 40 ]]; then
  tg "⚠️ Phase 1 (update-body) 비정상 — OK=$OK1 NG=$NG1. 체인 중단. 수동 점검 필요"
  state "phase1_verify" "fail" "OK=$OK1 NG=$NG1"
  exit 2
fi
tg "✅ Phase 1 완료: update-body OK=$OK1 NG=$NG1"
state "phase1_verify" "done" "OK=$OK1 NG=$NG1"

# ─── Phase 2: fill-pricing-v1 실행 ───
state "phase2_pricing" "running" "fill-pricing-v1 실행"
tg "▶️ Phase 2 시작: fill-pricing (가격/기간/수정 주입)"
log "Phase 2: fill-pricing-v1.js 실행"
if ! timeout 5400 node fill-pricing-v1.js > "$LOG_DIR/fill-pricing-$RUN_TS.log" 2>&1; then
  RC=$?
  log "fill-pricing 실패 또는 타임아웃 (rc=$RC)"
  # 완료가 안 됐더라도 report 파일 있으면 진행
fi
OK2=$(report_val "$WORKDIR/fill-pricing-report.json" ".ok")
NG2=$(report_val "$WORKDIR/fill-pricing-report.json" ".ng")
log "Phase 2 결과: OK=$OK2 NG=$NG2"
if [[ "$OK2" == "null" ]] || [[ "${OK2:-0}" -lt 30 ]]; then
  tg "⚠️ Phase 2 (fill-pricing) 비정상 — OK=$OK2 NG=$NG2. 로그: $LOG_DIR/fill-pricing-$RUN_TS.log"
  state "phase2_pricing" "partial" "OK=$OK2 NG=$NG2"
else
  tg "✅ Phase 2 완료: fill-pricing OK=$OK2 NG=$NG2"
  state "phase2_pricing" "done" "OK=$OK2 NG=$NG2"
fi

# ─── Phase 3: 썸네일 검증 v2 (report only) ───
state "phase3_thumb" "running" "verify-thumbnails-v2"
tg "▶️ Phase 3 시작: verify-thumbnails-v2"
log "Phase 3: verify-thumbnails-v2.js 실행"
if ! timeout 3600 node verify-thumbnails-v2.js > "$LOG_DIR/verify-thumb-v2-$RUN_TS.log" 2>&1; then
  log "verify-thumbnails-v2 실패 또는 타임아웃"
fi
OK3=$(report_val "$WORKDIR/verify-thumbnails-v2-report.json" ".ok")
NG3=$(report_val "$WORKDIR/verify-thumbnails-v2-report.json" ".ng")
log "Phase 3 결과: OK=$OK3 NG=$NG3"
tg "🔎 Phase 3 완료: verify-thumbnails-v2 OK=$OK3 NG=$NG3"
state "phase3_thumb" "done" "OK=$OK3 NG=$NG3"

# ─── Phase 4: 중복 draft 정리 (사용자 명시 지시) ───
state "phase4_cleanup" "running" "cleanup-duplicates --execute"
tg "▶️ Phase 4 시작: 중복 draft 정리 (55개 완성본 외 삭제)"
log "Phase 4: cleanup-duplicates --execute"
if ! timeout 3600 node cleanup-duplicates.js --execute > "$LOG_DIR/cleanup-$RUN_TS.log" 2>&1; then
  log "cleanup-duplicates 실패 또는 타임아웃"
fi
DEL=$(report_val "$WORKDIR/cleanup-duplicates-report.json" ".deleted.length")
NOISE=$(report_val "$WORKDIR/cleanup-duplicates-report.json" ".remainingNonKeep.length")
log "Phase 4 결과: 삭제=$DEL 잔여noise=$NOISE"
tg "✅ Phase 4 완료: 중복 삭제 $DEL건, 잔여 노이즈 $NOISE건"
state "phase4_cleanup" "done" "deleted=$DEL noise=$NOISE"

# ─── Phase 5: 최종 QA 리포트 ───
state "phase5_qa" "running" "final-qa-report"
log "Phase 5: final-qa-report 생성"
QA_FILE="$LOG_DIR/final-qa-$RUN_TS.md"
node final-qa-report.js > "$QA_FILE" 2>&1
log "QA 리포트: $QA_FILE"

# 텔레그램 최종 보고 (요약 + 링크)
SUMMARY=$(head -20 "$QA_FILE")
tg "🏁 크몽 자율 체인 완료
$SUMMARY

전체 QA: $QA_FILE
체인 로그: $CHAIN_LOG
상태: $STATE_FILE

실 발행은 각 draft의 edit 링크 접속 → 제출하기 직접 클릭."
state "phase5_qa" "done" "QA=$QA_FILE"
state "complete" "done" "chain finished"
log "CHAIN COMPLETE"

# git auto-commit
cd "$WORKDIR/.." && git add new-gigs/*-report.json new-gigs/kmong-resume-chain.sh new-gigs/cleanup-duplicates.js new-gigs/verify-thumbnails-v2.js new-gigs/final-qa-report.js 2>/dev/null
cd "$WORKDIR/../.." && git commit -m "chore(kmong): 자율 체인 실행 완료 ($RUN_TS) — 가격/썸네일 검증 + 중복 정리 + QA

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>/dev/null || true
