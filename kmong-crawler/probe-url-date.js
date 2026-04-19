#!/usr/bin/env node
/**
 * URL 쿼리로 날짜 범위 설정 가능한지 검증
 * /seller/click-up?startedDate=YYYY-MM-DD&endedDate=YYYY-MM-DD&filter=custom
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');

(async () => {
  const { browser, page } = await login({ slowMo: 100 });
  for (const d of ['2026-04-10', '2026-04-15', '2026-04-18']) {
    const url = `https://kmong.com/seller/click-up?startedDate=${d}&endedDate=${d}&filter=custom`;
    console.log(`\n[테스트] ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    try { const b = page.locator('button:has-text("확인")').first(); if (await b.isVisible({ timeout: 1500 }).catch(()=>false)) await b.click(); } catch {}
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[readonly]')).map(i => i.value).filter(v => v);
      const active = document.querySelector('a.rounded-full.bg-gray-900')?.innerText?.trim() || null;
      const rows = document.querySelectorAll('table tbody tr').length;
      const firstRowMetrics = (() => {
        const tds = document.querySelectorAll('table tbody tr:first-child td');
        return Array.from(tds).map(t => (t.innerText || '').trim().slice(0, 30));
      })();
      return { inputs, active, rows, firstRowMetrics };
    });
    console.log(`  dateInputs=${JSON.stringify(state.inputs)} active=${state.active} rows=${state.rows}`);
    console.log(`  row0 metrics: ${JSON.stringify(state.firstRowMetrics)}`);
  }
  await browser.close();
})();
