#!/usr/bin/env node
/**
 * 크몽 Phase 3 — AI 콘텐츠 생성 크론 실행기
 * 매일 오전 10시: 저성과 서비스 콘텐츠 자동 생성
 */

const { generateContentForLowPerformers } = require('./lib/content-generator');
const { evaluateAllTests } = require('./lib/ab-test-manager');
const { notify } = require('./lib/telegram');

async function main() {
  console.log('=== Phase 3 AI 콘텐츠 생성 시작 ===');

  try {
    // 1. 저성과 서비스 콘텐츠 자동 생성
    const results = await generateContentForLowPerformers();

    // 2. 진행 중인 A/B 테스트 지표 업데이트
    const abResults = await evaluateAllTests();

    const msg = [
      'Phase 3 일간 리포트',
      `AI 콘텐츠 생성: ${results.length}건`,
      `A/B 테스트 평가: ${abResults.length}건`,
      abResults.filter(r => r.status === 'completed').length > 0 ?
        `완료된 테스트: ${abResults.filter(r => r.status === 'completed').map(r => `${r.testId}(승자:${r.winner||'없음'})`).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    console.log(msg);
    notify(msg);
  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`Phase 3 콘텐츠 생성 에러: ${err.message}`);
  }
}

main();
