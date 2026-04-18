/**
 * N01 draft 의 DESCRIPTION ProseMirror 내용 완전 clear 후 재삽입 (중복 해결)
 *
 * 문제: fillTipTap 의 Ctrl+A + Delete 가 TipTap/ProseMirror 에선 불완전해서
 *        재실행 시 기존 + 신규 이어붙어 2배 길이 됨 (4843 = 2510 + 2333).
 *
 * 해결:
 *   1) ProseMirror 가 노출하는 editor API 를 통해 명시적 clear
 *   2) 또는 innerHTML 을 빈 <p> 로 덮고 input event 발생 → React 재렌더
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { PRODUCTS } = require('./gig-data-niches.js');
const { EXTRA } = require('./gig-data-niches-extra.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const productId = 'N01';
  const product = PRODUCTS.find(p => p.id === productId);
  const extra = EXTRA[productId];
  const url = `https://kmong.com/my-gigs/edit/${extra.draftId}?rootCategoryId=6&subCategoryId=${extra.subCategoryId}&thirdCategoryId=${extra.thirdCategoryId}`;

  const { browser, page } = await login({ slowMo: 80 });
  try {
    console.log('[1] warm-up + nav');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    console.log('[2] 현재 DESCRIPTION 길이 확인');
    const before = await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      return el ? (el.innerText || '').trim().length : -1;
    });
    console.log(`   현재 길이 = ${before}`);

    console.log('[3] DESCRIPTION clear');
    await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      if (!el) return;
      el.focus();
      // ProseMirror의 기본 구조로 초기화
      el.innerHTML = '<p></p>';
      // React / TipTap 상태 동기화를 위해 input event dispatch
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    });
    await sleep(1500);

    // Ctrl+A + Backspace 여러 번 (ProseMirror 안전장치)
    const editor = page.locator('#DESCRIPTION .ProseMirror').first();
    await editor.click({ force: true });
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Control+A').catch(() => {});
      await sleep(200);
      await page.keyboard.press('Backspace').catch(() => {});
      await sleep(200);
    }

    const mid = await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      return el ? (el.innerText || '').trim().length : -1;
    });
    console.log(`   clear 후 길이 = ${mid}`);

    console.log('[4] DESCRIPTION 재삽입 (깨끗한 상태에서)');
    await editor.click({ force: true });
    await sleep(300);
    const lines = product.description.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
      if (i < lines.length - 1) await page.keyboard.press('Enter');
    }
    await sleep(1500);

    const after = await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      return el ? (el.innerText || '').trim().length : -1;
    });
    console.log(`   재삽입 후 길이 = ${after} (목표 ≈ ${product.description.length})`);

    console.log('[5] blur/dispatch + 저장');
    await page.evaluate(() => {
      document.querySelectorAll('input, textarea').forEach(el => {
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await sleep(2500);

    const saveBtn = page.locator('button:has-text("임시 저장하기")').last();
    if (!(await saveBtn.isVisible({ timeout: 5000 }).catch(() => false))) throw new Error('save button not found');
    await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    await saveBtn.click({ force: true });
    await sleep(8000);

    console.log('[6] reload verify');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const final = await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      return el ? (el.innerText || '').trim().length : -1;
    });
    console.log(`   최종 길이 = ${final} (목표 ≈ ${product.description.length})`);
    if (Math.abs(final - product.description.length) > 200) {
      console.log('   ⚠ 불일치 — 수동 확인 필요');
    } else {
      console.log('   ✓ OK');
    }
  } finally {
    await browser.close().catch(() => {});
  }
})();
