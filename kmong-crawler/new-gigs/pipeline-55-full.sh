#!/bin/bash
# 크몽 55상품 풀 파이프라인 (서버 영속 실행)
# Claude 세션이 꺼져도 서버가 자율 진행, 완료 시 텔레그램 보고
#
# 시작: nohup bash pipeline-55-full.sh > /tmp/kmong-pipeline-full.log 2>&1 &
#
# 단계:
#  1. hires 썸네일 재생성 완료 대기 (generate-55-images-hires.js)
#  2. draft 썸네일 일괄 교체 (replace-image.js)
#  3. 중복 draft 5건 정리 (cleanup-by-id.js)
#  4. 판매핵심정보/필드 정찰 (recon-full-fields.js)
#  5. 본문/필드 일괄 업데이트 (update-all-full.js, 존재 시)
#  6. 최종 보고서 텔레그램

set -u
cd "$(dirname "$0")"

TG="/home/onda/scripts/telegram-sender.js"
LOG="/tmp/kmong-pipeline-full.log"
STATE="/tmp/kmong-pipeline-state.json"

step() {
  local msg="$*"
  echo "[$(date '+%H:%M:%S')] ➜ $msg" | tee -a "$LOG"
  node "$TG" send "🔧 크몽 파이프라인: $msg" kmong >/dev/null 2>&1 || true
}

fail() {
  step "❌ 실패: $*"
  echo '{"status":"failed","last":"'"$*"'"}' > "$STATE"
  exit 1
}

wait_for() {
  local pattern="$1"
  local timeout="${2:-900}"
  local t=0
  while pgrep -f "$pattern" >/dev/null 2>&1 && [ "$t" -lt "$timeout" ]; do
    sleep 10
    t=$((t+10))
  done
  if [ "$t" -ge "$timeout" ]; then
    fail "timeout waiting for $pattern"
  fi
}

echo '{"status":"running","step":0}' > "$STATE"
step "🚀 크몽 55 파이프라인 시작 (서버 영속)"

# STEP 1 — hires 썸네일 대기
step "STEP 1/6 — 고화질 썸네일 재생성 대기"
echo '{"status":"running","step":1}' > "$STATE"
wait_for "generate-55-images-hires" 1800
step "STEP 1 완료 — 썸네일 재생성 종료 확인"

# 생성 결과 집계
SUCCESS=$(node -e "try{const j=require('./03-images/55-hires-log.json');console.log(j.success||0)}catch(e){console.log(0)}" 2>/dev/null)
FAILED=$(node -e "try{const j=require('./03-images/55-hires-log.json');console.log(j.failed||0)}catch(e){console.log(0)}" 2>/dev/null)
step "썸네일 결과: 성공 $SUCCESS / 실패 $FAILED (1304x976)"

# STEP 2 — draft 썸네일 일괄 교체
step "STEP 2/6 — draft 썸네일 일괄 교체"
echo '{"status":"running","step":2}' > "$STATE"
timeout 1800 node replace-image.js >> "$LOG" 2>&1 || step "⚠️ STEP 2 비정상 종료 — 일부 교체 실패 가능"

# STEP 2.5 — 썸네일 렌더 검증 (짤림/비율/크기)
step "STEP 2.5/6 — 썸네일 렌더 검증 (Playwright)"
echo '{"status":"running","step":2.5}' > "$STATE"
timeout 1800 node verify-thumbnails.js --all >> "$LOG" 2>&1 || step "⚠️ STEP 2.5 비정상 — 로그 참고"

# STEP 3 — 중복 draft 5건 정리 (run-log 분석 기반: 29,43,44,45)
step "STEP 3/6 — 중복 draft 5건 정리"
echo '{"status":"running","step":3}' > "$STATE"
timeout 600 node cleanup-by-id.js --execute 763078 763080 763083 763086 763088 >> "$LOG" 2>&1 || step "⚠️ STEP 3 비정상 — 로그 참고"

# STEP 4 — 판매핵심정보 / 필드 정찰
step "STEP 4/6 — 필드 정찰 (판매핵심정보 파악)"
echo '{"status":"running","step":4}' > "$STATE"
timeout 300 node recon-full-fields.js 763104 1 107 >> "$LOG" 2>&1 || step "⚠️ STEP 4 비정상"

# STEP 5 — 콘텐츠 일괄 업데이트 (풀자동화 7단계 + 판매핵심정보)
step "STEP 5/6 — 콘텐츠 일괄 업데이트"
echo '{"status":"running","step":5}' > "$STATE"
if [ -f "update-all-full.js" ]; then
  timeout 3600 node update-all-full.js >> "$LOG" 2>&1 || step "⚠️ STEP 5 비정상"
else
  step "STEP 5 스킵 — update-all-full.js 미작성"
fi

# STEP 6 — 최종 보고서
step "STEP 6/6 — 최종 보고서 생성"
echo '{"status":"running","step":6}' > "$STATE"
DONE_COUNT=$(node -e "try{const p=require('./55-progress.json');console.log(p.done.length)}catch(e){console.log(0)}" 2>/dev/null)
FAILED_COUNT=$(node -e "try{const p=require('./55-progress.json');console.log(p.failed.length)}catch(e){console.log(0)}" 2>/dev/null)

REPORT="📊 크몽 55상품 파이프라인 최종 보고서

작업 상태
- 임시저장 완료: $DONE_COUNT/55
- 실패 잔여: $FAILED_COUNT
- 고화질 썸네일: 성공 $SUCCESS / 실패 $FAILED

적용 내용
- 1304x976 (2x Retina) 썸네일 교체
- 중복 draft 5건 정리
- 판매핵심정보 필드 정찰 $(if [ -f "recon-full-fields.json" ]; then echo ✓완료; else echo ✗누락; fi)

퀄리티 개선 필요사항 (Claude 진행 관찰 기반)
1. 디자인 2차 카테고리 세분화 수정 필요:
   - 29/43-46/48-53은 '상세페이지'로 통합 저장됨
   - 실제 최적 카테고리: 유튜브 썸네일→SNS·광고소재·썸네일, IR PPT→PPT·인포그래픽 등
   - 카테고리 수정은 draft 삭제+재생성 필요

2. Before/After 사례 — 승현이 직접 수치/이미지 투입 필요
   - 본문의 [IMAGE: 설명], [수치 입력 필요] 마커 확인

3. 본문 FAQ 3~4개 + 크몽 FAQ 탭은 별도 분리 필수
   - 행정질문(세금계산서/환불)은 탭 FAQ로

4. 전문용어 일반인 해석 (LTV/CRM/ROI 등) — 풀어쓰기 필요

5. 크몽 TipTap 에디터: 꺾쇠 < 금지 → HTML 직접 입력 불가
   - 서식은 툴바 버튼 클릭 또는 단축키 기반

6. 실 발행은 사용자 직접 — draft URL 검토 후 '제출하기' 클릭

상세 로그: $LOG"

node "$TG" send "$REPORT" kmong >/dev/null 2>&1
echo "$REPORT" | tee -a "$LOG"
echo '{"status":"completed","step":6}' > "$STATE"
step "🎉 파이프라인 완료"
