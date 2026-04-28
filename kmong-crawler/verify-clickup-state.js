#!/usr/bin/env node
/**
 * 클릭업 광고 상태 검증 (read-only)
 * - 모든 광고 행의 토글 상태 + 라벨 확인
 * - 스크린샷 저장
 * - 텔레그램 보고 (선택)
 *
 * 사용: node verify-clickup-state.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';
const SCREENSHOT_PATH = '/tmp/kmong-clickup-verify.png';

async function main() {
  let browser;
  try {
    console.log('=== 클릭업 광고 상태 검증 시작 ===');
    const session = await login({ slowMo: 150 });
    browser = session.browser;
    const page = session.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);

    // 진입 시 안내 모달 닫기
    try {
      await page.evaluate(() => {
        const m = document.querySelector('.kmong-modal-root');
        if (m) m.remove();
      });
    } catch {}
    await page.waitForTimeout(1000);

    // 모든 행 enumerate
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    console.log(`[${count}개 행 발견]\n`);

    const items = [];
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      if (await cells.count() < 3) continue;

      const svcName = await cells.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
      const matched = matchProductId(svcName) || '?';
      const statusText = (await cells.nth(2).innerText().catch(() => '')).trim();
      const toggleCell = cells.nth(0);

      let isChecked = null;
      try {
        const inp = toggleCell.locator('input[type="checkbox"], input[role="switch"]').first();
        if (await inp.count() > 0) isChecked = await inp.isChecked();
      } catch {}

      items.push({ pid: matched, svc: svcName.slice(0, 40), status: statusText.split('\n')[0].slice(0, 25), checked: isChecked });
    }

    // 출력
    console.log('| product_id'.padEnd(20) + '| 토글'.padEnd(8) + '| 상태'.padEnd(20) + '| 서비스명');
    console.log('|' + '-'.repeat(76));
    for (const it of items) {
      const toggle = it.checked === true ? 'ON ✓ ' : it.checked === false ? 'OFF · ' : '?    ';
      console.log(`| ${it.pid.padEnd(17)}| ${toggle.padEnd(7)}| ${it.status.padEnd(18)}| ${it.svc}`);
    }

    // 통계
    const onCount = items.filter(i => i.checked === true).length;
    const offCount = items.filter(i => i.checked === false).length;
    const balanceOff = items.filter(i => i.status.includes('잔액 부족') || i.status.includes('중지')).length;
    console.log(`\n[통계] ON=${onCount}, OFF=${offCount}, 잔액부족/중지=${balanceOff}`);

    // 스크린샷
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(`[스크린샷] ${SCREENSHOT_PATH} (${fs.statSync(SCREENSHOT_PATH).size} bytes)`);

    // 텔레그램 알림 (text only)
    const verdict = onCount === 0
      ? '✅ 모든 광고 OFF 검증 통과 (사용자 요청 반영 완료)'
      : `⚠️ 여전히 ON 상태 ${onCount}개 발견`;
    const lines = [
      `🔍 <b>클릭업 광고 상태 검증</b>`,
      verdict,
      '',
      `<pre>${items.map(it => {
        const t = it.checked === true ? 'ON ' : it.checked === false ? 'OFF' : '? ';
        return `${t} | ${it.pid.padEnd(13)} | ${it.status.slice(0, 12).padEnd(12)} | ${it.svc.slice(0, 25)}`;
      }).join('\n')}</pre>`,
      '',
      `통계: ON=${onCount} / OFF=${offCount} / 잔액부족=${balanceOff}`,
    ];
    try { notify(lines.join('\n')); } catch (e) { console.error('[알림 실패]', e.message); }

    await browser.close();
    process.exit(onCount === 0 ? 0 : 1);
  } catch (err) {
    console.error('[에러]', err.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(2);
  }
}

main();
