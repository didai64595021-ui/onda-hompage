#!/usr/bin/env node
/**
 * 크몽 Phase 4 — 학습 루프 크론 실행기
 * 매주 월요일 오전 6시: A/B 테스트 결과 → 패턴 DB 반영 → 자동 개선
 */

const { runFullLearningLoop } = require('./lib/learning-loop');
const { generateWeeklyReport } = require('./lib/reply-optimizer');

async function main() {
  console.log('=== Phase 4 학습 루프 시작 ===');

  try {
    // 1. 전체 학습 루프 (A/B 테스트 → 패턴 DB)
    await runFullLearningLoop();

    // 2. 답변 학습 주간 리포트 (기존 Phase 2)
    await generateWeeklyReport();

    console.log('=== Phase 4 학습 루프 완료 ===');
  } catch (err) {
    console.error(`[에러] ${err.message}`);
    const { notify } = require('./lib/telegram');
    notify(`Phase 4 학습 루프 에러: ${err.message}`);
  }
}

main();
