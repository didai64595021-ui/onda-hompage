#!/usr/bin/env node
/**
 * 광고 일괄 토글 — 한 번의 로그인 세션으로 여러 상품 ON/OFF
 *
 * 매번 toggleAd() 호출 시 Playwright 로그인을 반복하면 7번 토글 = 7번 로그인.
 * 이 스크립트는 click-up 페이지 1회 진입 후 순차 토글하여 시간/리스크 최소화.
 *
 * 사용:
 *   node batch-toggle-ads.js
 *
 * 동작:
 *   OFF: responsive, pc-mobile, mobile-fix
 *   ON:  corp-seo, corp-renew, no-homepage, onepage
 *
 * 정책 출처: 사용자 지시 2026-04-27 (객단가 ↑ 위해 홈페이지 제작에 볼륨 집중)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';

// 모드: default = OFF/ON 기본 정책 / all-off = 전체 OFF (체리피커 시간대) / all-on = 전체 ON
const ALL_PRODUCTS = ['responsive', 'pc-mobile', 'mobile-fix', 'corp-seo', 'corp-renew', 'no-homepage', 'onepage'];
const DEFAULT_PLAN = {
  off: ['responsive', 'pc-mobile', 'mobile-fix'],
  on:  ['corp-seo', 'corp-renew', 'no-homepage', 'onepage'],
};

function resolvePlan() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--mode='));
  const mode = arg ? arg.split('=')[1] : (process.env.BATCH_TOGGLE_MODE || 'default');
  if (mode === 'all-off') return { mode, plan: { off: [...ALL_PRODUCTS], on: [] } };
  if (mode === 'all-on')  return { mode, plan: { off: [], on: [...ALL_PRODUCTS] } };
  return { mode: 'default', plan: DEFAULT_PLAN };
}

const { mode: MODE, plan: PLAN } = resolvePlan();

async function dismissModal(page) {
  for (const selector of [
    '.kmong-modal-root button[class*="close"]',
    '.kmong-modal-root [aria-label="close"]',
    '.kmong-modal-root [aria-label="닫기"]',
    '.kmong-modal-root button:has-text("닫기")',
    '.kmong-modal-root button:has-text("확인")',
  ]) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click();
        await page.waitForTimeout(500);
      }
    } catch {}
  }
  try { await page.keyboard.press('Escape'); await page.waitForTimeout(300); } catch {}
  try {
    await page.evaluate(() => {
      const m = document.querySelector('.kmong-modal-root');
      if (m) m.remove();
    });
  } catch {}
}

async function readToggleState(toggleCell) {
  try {
    const input = toggleCell.locator('input[type="checkbox"], input[role="switch"]').first();
    if (await input.count() > 0) return await input.isChecked();
    const el = toggleCell.locator('[class*="toggle"], [class*="switch"]').first();
    if (await el.count() > 0) {
      const cls = await el.getAttribute('class') || '';
      return cls.includes('on') || cls.includes('active') || cls.includes('checked');
    }
  } catch {}
  return false;
}

async function main() {
  const results = [];
  let browser;
  try {
    console.log(`=== 광고 일괄 토글 시작 (mode: ${MODE}) ===`);
    console.log('OFF:', PLAN.off.join(', ') || '(없음)');
    console.log('ON:', PLAN.on.join(', ') || '(없음)');
    console.log('---');

    const session = await login({ slowMo: 150 });
    browser = session.browser;
    const page = session.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await dismissModal(page);

    // 모든 상품 행 매핑
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    console.log(`[click-up] 테이블 행 ${rowCount}개 발견`);

    const rowMap = new Map(); // product_id → { row, currentState, status }
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      if (await cells.count() < 3) continue;
      const svcName = await cells.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
      const matched = matchProductId(svcName);
      if (!matched) continue;
      const statusText = await cells.nth(2).innerText().catch(() => '');
      const toggleCell = cells.nth(0);
      const currentState = await readToggleState(toggleCell);
      rowMap.set(matched, { row, toggleCell, currentState, statusText, svcName });
      console.log(`  - ${matched.padEnd(15)} state=${currentState ? 'ON ' : 'OFF'} | "${svcName.slice(0,40)}" | ${statusText.slice(0,20)}`);
    }

    // OFF 처리
    for (const pid of PLAN.off) {
      const info = rowMap.get(pid);
      if (!info) {
        console.log(`[누락] ${pid}: 행 못 찾음 — 스킵`);
        results.push({ id: pid, target: 'off', success: false, reason: 'row not found' });
        continue;
      }
      if (info.statusText.includes('잔액 부족') || info.statusText.includes('중지')) {
        console.log(`[잔액부족] ${pid}: 토글 스킵 (이미 사실상 OFF)`);
        results.push({ id: pid, target: 'off', success: true, reason: 'balance insufficient (already off)' });
        continue;
      }
      if (info.currentState === false) {
        console.log(`[skip] ${pid}: 이미 OFF`);
        results.push({ id: pid, target: 'off', success: true, reason: 'already off' });
        continue;
      }
      await toggleClick(page, info.toggleCell);
      console.log(`[OFF] ${pid} ✅`);
      results.push({ id: pid, target: 'off', success: true, action: 'toggled' });
      await page.waitForTimeout(1500);
    }

    // ON 처리
    for (const pid of PLAN.on) {
      const info = rowMap.get(pid);
      if (!info) {
        console.log(`[누락] ${pid}: 행 못 찾음 — 스킵`);
        results.push({ id: pid, target: 'on', success: false, reason: 'row not found' });
        continue;
      }
      if (info.statusText.includes('잔액 부족') || info.statusText.includes('중지')) {
        console.log(`[잔액부족] ${pid}: ON 불가 (비즈머니 충전 필요)`);
        results.push({ id: pid, target: 'on', success: false, reason: 'balance insufficient (need bizmoney)' });
        continue;
      }
      if (info.currentState === true) {
        console.log(`[skip] ${pid}: 이미 ON`);
        results.push({ id: pid, target: 'on', success: true, reason: 'already on' });
        continue;
      }
      await toggleClick(page, info.toggleCell);
      console.log(`[ON]  ${pid} ✅`);
      results.push({ id: pid, target: 'on', success: true, action: 'toggled' });
      await page.waitForTimeout(1500);
    }

    await browser.close();

    // 요약
    console.log('\n=== 결과 요약 ===');
    const offDone = results.filter(r => r.target === 'off' && r.success).length;
    const onDone = results.filter(r => r.target === 'on' && r.success).length;
    const failed = results.filter(r => !r.success);
    console.log(`OFF 성공: ${offDone}/${PLAN.off.length}`);
    console.log(`ON 성공: ${onDone}/${PLAN.on.length}`);
    if (failed.length) {
      console.log('실패:');
      for (const f of failed) console.log(`  - ${f.id} (${f.target}): ${f.reason}`);
    }

    // 텔레그램 요약
    const lines = [];
    const header = MODE === 'all-off' ? '🌙 *크몽 광고 야간 OFF* (02~08시 체리피커 회피)'
                 : MODE === 'all-on'  ? '☀️ *크몽 광고 전체 ON*'
                 : '🎯 *크몽 광고 일괄 토글 결과* (홈페이지 볼륨 전환)';
    lines.push(header);
    lines.push('');
    if (PLAN.off.length) {
      const offLabel = MODE === 'all-off' ? `*OFF (전체 ${PLAN.off.length}종)*` : '*OFF (반응형 3종, 객단가↓)*';
      lines.push(offLabel);
      for (const pid of PLAN.off) {
        const r = results.find(x => x.id === pid);
        lines.push(`  ${r?.success ? '✅' : '❌'} ${pid} ${r?.reason ? `(${r.reason})` : ''}`);
      }
    }
    if (PLAN.on.length) {
      lines.push('');
      const onLabel = MODE === 'all-on' ? `*ON (전체 ${PLAN.on.length}종)*` : '*ON (홈페이지 4종, 객단가↑)*';
      lines.push(onLabel);
      for (const pid of PLAN.on) {
        const r = results.find(x => x.id === pid);
        lines.push(`  ${r?.success ? '✅' : '❌'} ${pid} ${r?.reason ? `(${r.reason})` : ''}`);
      }
    }
    lines.push('');
    lines.push(`주간 한도: 100,000원 / 잔여 약 70,000원 (토~금)`);
    notify(lines.join('\n')).catch(() => {});

    process.exit(failed.length ? 1 : 0);
  } catch (err) {
    console.error('[에러]', err.message);
    if (browser) await browser.close().catch(() => {});
    notify(`광고 일괄 토글 실패: ${err.message}`).catch(() => {});
    process.exit(1);
  }
}

async function toggleClick(page, toggleCell) {
  const target = toggleCell.locator('.react-switch-handle, input[type="checkbox"], input[role="switch"], [class*="toggle"], [class*="switch"], label').first();
  await target.click({ force: true });
  await page.waitForTimeout(2000);
  // 확인 모달
  try {
    const confirmBtn = page.locator('button:has-text("확인"), button:has-text("네"), button:has-text("OK")').first();
    if (await confirmBtn.isVisible({ timeout: 1500 })) {
      await confirmBtn.click();
      await page.waitForTimeout(800);
    }
  } catch {}
}

main();
