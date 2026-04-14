/**
 * 3차 카테고리 디버그 — Step1까지 진행 후 페이지 HTML/구조 dump
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const r = await login({ slowMo: 50 });
  const browser = r.browser;
  const page = r.page;

  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await closeModals(page).catch(() => {});

  // 제목
  await page.locator('input[placeholder*="제목"]').first().fill('소상공인 반응형 홈페이지 7일완성');
  await sleep(500);

  // 1차
  await page.locator('button').filter({ hasText: '1차 카테고리' }).first().click({ force: true });
  await sleep(2000);
  await page.getByText('IT·프로그래밍', { exact: true }).first().click({ force: true });
  await sleep(2000);

  // 2차
  await page.locator('button').filter({ hasText: '2차 카테고리' }).first().click({ force: true });
  await sleep(2000);
  await page.getByText('홈페이지 신규 제작', { exact: true }).first().click({ force: true });
  await sleep(2500);

  // 추천 카테고리 영역의 모든 텍스트 dump
  const recommendations = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a, li, div, span').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 100) return;
      // 카테고리 체인스러운 텍스트 (>, /, 분리자)
      if (t.includes('>') || t.includes('/') || t.includes('IT·프로그래밍 ') || t.includes('홈페이지 신규')) {
        out.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 100), text: t.slice(0, 100) });
      }
    });
    return out;
  });
  console.log(`\n=== 추천 카테고리 후보 ${recommendations.length}개 ===`);
  recommendations.forEach(r => console.log(`  [${r.tag}.${r.cls}] "${r.text}"`));

  // 3차 카테고리 button 클릭
  await sleep(1000);
  const cat3Btn = page.locator('button').filter({ hasText: '3차 카테고리' }).first();
  if (await cat3Btn.isVisible().catch(() => false)) {
    console.log('\n=== 3차 dropdown 클릭 ===');
    await cat3Btn.click({ force: true });
    await sleep(2500);

    // 클릭 후 페이지에서 가장 새로 나타난 element들 dump
    const visibleAll = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, li, [role="option"], [role="menuitem"], div').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 50 || t.includes('\n')) return;
        // 카테고리 옵션처럼 보이는 것
        if (t.includes('카테고리') || t.includes('TIP') || t.includes('보이나요') || t === '다음' || t === '제목 입력') return;
        out.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 80), text: t });
      });
      // 중복 제거 (텍스트 기준)
      const seen = new Set();
      return out.filter(o => { if (seen.has(o.text)) return false; seen.add(o.text); return true; });
    });
    console.log(`\n=== 3차 dropdown 클릭 후 visible elements ${visibleAll.length}개 ===`);
    visibleAll.slice(0, 50).forEach(v => console.log(`  [${v.tag}.${v.cls}] "${v.text}"`));

    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'debug-cat3-dropdown.png'), fullPage: true });
    console.log('\n스크린샷: screenshots/debug-cat3-dropdown.png');
  } else {
    console.log('\n3차 카테고리 button 미발견');
  }

  // 페이지 HTML dump
  const html = await page.content();
  fs.writeFileSync(path.join(__dirname, 'debug-cat3-page.html'), html);
  console.log('\nHTML dump: debug-cat3-page.html (' + html.length + 'B)');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
