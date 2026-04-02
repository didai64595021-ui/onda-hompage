#!/usr/bin/env node
/**
 * 크몽 세션 쿠키 갱신 전용 스크립트
 * - 다른 크롤러 실행 전에 먼저 실행하여 쿠키를 생성/갱신
 * - 쿠키가 유효하면 스킵, 만료되었으면 재로그인
 * - cron: 크롤러들보다 5분 먼저 실행
 */

const { login } = require('./lib/login');
const { notify } = require('./lib/telegram');

async function refreshSession() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 세션 갱신 시작 ===');

    const result = await login({ slowMo: 200 });
    browser = result.browser;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`=== 세션 갱신 완료 (${elapsed}초) ===`);

    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error(`[에러] 세션 갱신 실패: ${err.message}`);
    notify(`크몽 세션 갱신 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

refreshSession();
