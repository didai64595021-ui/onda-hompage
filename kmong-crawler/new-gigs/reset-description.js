/**
 * 범용 DESCRIPTION reset + 재삽입 — 중복 삽입 이슈 복구용
 *
 * 사용법: node reset-description.js <productId>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { PRODUCTS } = require('./gig-data-niches.js');
const { EXTRA } = require('./gig-data-niches-extra.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const productId = process.argv[2];
  if (!productId) { console.error('node reset-description.js <productId>'); process.exit(1); }
  const product = PRODUCTS.find(p => p.id === productId);
  const extra = EXTRA[productId];
  if (!product || !extra) { console.error(`${productId} 데이터 없음`); process.exit(1); }
  const url = `https://kmong.com/my-gigs/edit/${extra.draftId}?rootCategoryId=6&subCategoryId=${extra.subCategoryId}${extra.thirdCategoryId ? `&thirdCategoryId=${extra.thirdCategoryId}` : ''}`;

  const { browser, page } = await login({ slowMo: 80 });
  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    const before = await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      return el ? (el.innerText || '').trim().length : -1;
    });
    const target = product.description.length;
    console.log(`[${productId}] before=${before} target=${target}`);

    // 이미 정상 범위면 skip (목표 ±300 이내)
    if (Math.abs(before - target) < 300 && before > 500) {
      console.log(`   정상 범위 — skip`);
      process.exit(0);
    }

    // clear (innerHTML + Ctrl+A Backspace 반복)
    await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      if (el) {
        el.focus();
        el.innerHTML = '<p></p>';
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
    });
    await sleep(1500);

    const editor = page.locator('#DESCRIPTION .ProseMirror').first();
    await editor.click({ force: true });
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Control+A').catch(() => {});
      await sleep(200);
      await page.keyboard.press('Backspace').catch(() => {});
      await sleep(200);
    }

    // 재삽입
    await editor.click({ force: true });
    await sleep(300);
    const lines = product.description.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
      if (i < lines.length - 1) await page.keyboard.press('Enter');
    }
    await sleep(2000);

    // 저장
    await page.evaluate(() => {
      document.querySelectorAll('input, textarea').forEach(el => {
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await sleep(2500);

    const btn = page.locator('button:has-text("임시 저장하기")').last();
    if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) throw new Error('save button not found');
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    await btn.click({ force: true });
    await sleep(8000);

    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const after = await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION .ProseMirror');
      return el ? (el.innerText || '').trim().length : -1;
    });
    console.log(`[${productId}] after=${after}  ${Math.abs(after - target) < 300 ? '✓' : '⚠'}`);
  } finally {
    await browser.close().catch(() => {});
  }
})();
