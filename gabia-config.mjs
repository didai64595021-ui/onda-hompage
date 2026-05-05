import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: '/tmp/gabia-state.json', userAgent:'Mozilla/5.0 Chrome/120' });
const page = await ctx.newPage();

await page.goto('https://dns.gabia.com/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2000);
await page.locator('input[name="search_domain"]').fill('vietnamcoco');
await page.locator('input[name="search_domain"]').press('Enter');
await page.waitForTimeout(3000);

const row = page.locator('tr', { hasText:'vietnamcoco.com' }).first();
await row.locator('a:has-text("설정"), button:has-text("설정")').first().click();
await page.waitForTimeout(4000);

console.log('config url:', page.url(), 'title:', await page.title());

const elements = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('input, select, button, a').forEach((el,i) => {
    if (i > 40) return;
    if (el.offsetParent === null) return;
    out.push({
      tag: el.tagName,
      type: el.type || '',
      name: el.name || el.id || '',
      text: (el.textContent || el.value || '').trim().slice(0,50),
    });
  });
  return out;
});
console.log('UI elements:');
elements.forEach(e => console.log(' ', e.tag, '|', e.type, '|', e.name, '|', e.text));

await page.screenshot({ path:'/tmp/gabia-cfg.png', fullPage:true });
await browser.close();
