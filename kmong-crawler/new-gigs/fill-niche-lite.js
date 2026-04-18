/**
 * 니치 draft 경량 보강 — 이미 채워진 draft의 빈 필드만 추가 채움
 *
 * 대상: 판매 핵심 정보 섹션 중 아직 비어있는 것
 *   - 페이지 수 input 3개 (STD/DLX/PRM)
 *
 * fillStep2 (본문/이미지) 는 절대 호출하지 않음 — 중복 삽입 방지.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');
const { PRODUCTS } = require('./gig-data-niches.js');
const { EXTRA } = require('./gig-data-niches-extra.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fillPageCount(page, counts) {
  return await page.evaluate((cs) => {
    const inputs = [...document.querySelectorAll('input[type="text"], input[type="number"]')];
    const pageInputs = inputs.filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      let cur = el;
      for (let i = 0; i < 8 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const lbl = cur.querySelector('label, p');
        if (lbl && (lbl.innerText || '').trim().includes('페이지 수')) return true;
      }
      return false;
    });
    if (pageInputs.length < 3) return { ok: false, found: pageInputs.length };
    const results = [];
    for (let i = 0; i < 3; i++) {
      const el = pageInputs[i];
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(cs[i]));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      results.push({ i, value: el.value });
    }
    return { ok: true, found: pageInputs.length, results };
  }, counts);
}

(async () => {
  const productId = process.argv[2];
  if (!productId) { console.error('node fill-niche-lite.js <productId>'); process.exit(1); }
  const product = PRODUCTS.find(p => p.id === productId);
  const extra = EXTRA[productId];
  if (!product || !extra) { console.error(`${productId} 데이터 없음`); process.exit(1); }
  if (!extra.pageCount || extra.pageCount.length < 3) { console.error('pageCount 미정의'); process.exit(1); }

  const url = `https://kmong.com/my-gigs/edit/${extra.draftId}?rootCategoryId=6&subCategoryId=${extra.subCategoryId}${extra.thirdCategoryId ? `&thirdCategoryId=${extra.thirdCategoryId}` : ''}`;
  console.log(`[lite] ${productId} draft=${extra.draftId}`);

  const { browser, page } = await login({ slowMo: 80 });
  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    console.log('[1] 페이지 수 fill');
    const r = await fillPageCount(page, extra.pageCount);
    console.log(`   ${JSON.stringify(r)}`);
    await sleep(1500);

    console.log('[2] blur/dispatch');
    await page.evaluate(() => {
      document.querySelectorAll('input').forEach(el => {
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await sleep(2000);

    console.log('[3] 임시 저장');
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) { console.log('✗ 저장 버튼 미발견'); process.exit(1); }
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    await btn.click({ force: true });
    await sleep(8000);

    console.log('[4] reload verify');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const v = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('input[type="text"], input[type="number"]')]
        .filter(el => {
          let cur = el;
          for (let i = 0; i < 8 && cur; i++) {
            cur = cur.parentElement;
            if (!cur) break;
            const lbl = cur.querySelector('label, p');
            if (lbl && (lbl.innerText || '').trim().includes('페이지 수')) return true;
          }
          return false;
        })
        .map(el => el.value);
      const descLen = [...document.querySelectorAll('.ProseMirror')].map(e => (e.innerText || '').trim().length);
      return { pages, descLen };
    });
    console.log(`   persist: pages=${JSON.stringify(v.pages)} desc=${v.descLen.join(',')}`);
  } finally {
    await browser.close().catch(() => {});
  }
})();
