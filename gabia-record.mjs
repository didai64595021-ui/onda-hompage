import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: '/tmp/gabia-state.json', userAgent:'Mozilla/5.0 Chrome/120' });
const page = await ctx.newPage();

await page.goto('https://dns.gabia.com/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2000);
await page.locator('input[name="search_domain"]').fill('vietnamcoco');
await page.locator('input[name="search_domain"]').press('Enter');
await page.waitForTimeout(3000);
await page.locator('tr', { hasText:'vietnamcoco.com' }).first().locator('button:has-text("설정")').first().click();
await page.waitForTimeout(4000);

// "레코드 수정" 클릭
console.log('clicking 레코드 수정');
await page.locator('button:has-text("레코드 수정")').first().click();
await page.waitForTimeout(4000);

console.log('after click url:', page.url());

// Capture: page 구조 dump
const dump = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('input, select, button, a').forEach(el => {
    if (el.offsetParent === null) return;
    out.push({
      tag: el.tagName,
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      text: (el.textContent || el.value || '').trim().slice(0,40),
    });
  });
  return out.slice(0, 30);
});
console.log('UI:');
dump.forEach(e => console.log(' ', e.tag, '|', e.type, '|', e.name||e.id, '|', e.placeholder, '|', e.text));

await page.screenshot({ path:'/tmp/gabia-edit.png', fullPage:true });
await browser.close();
