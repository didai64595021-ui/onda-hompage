#!/usr/bin/env node
/**
 * 크몽 Phase 3 — A/B 테스트 평가 크론 실행기
 * 매일 오후 9시: 진행 중인 A/B 테스트 지표 업데이트 + 승자 판정
 */

const { evaluateAllTests } = require('./lib/ab-test-manager');
const { notify } = require('./lib/telegram');

async function main() {
  console.log('=== Phase 3 A/B 테스트 평가 시작 ===');

  try {
    const results = await evaluateAllTests();

    if (results.length === 0) {
      console.log('진행 중인 A/B 테스트 없음');
      return;
    }

    const completed = results.filter(r => r.status === 'completed');
    const running = results.filter(r => r.status === 'running');

    const msg = [
      'A/B 테스트 일간 평가',
      `평가: ${results.length}건 (완료 ${completed.length} / 진행 ${running.length})`,
      ...completed.map(r => `→ 테스트 #${r.testId}: 승자 ${r.winner || '없음'}, CTR lift ${r.lift}%`),
      ...running.map(r => `→ 테스트 #${r.testId}: 표본 ${r.totalSample}/${r.minSampleSize || '?'} (진행중)`),
    ].join('\n');

    console.log(msg);
    notify(msg);
  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`A/B 테스트 평가 에러: ${err.message}`);
  }
}

main();
