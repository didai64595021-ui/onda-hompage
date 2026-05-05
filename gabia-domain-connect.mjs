import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args:['--disable-dev-shm-usage','--no-sandbox'] });
const ctx = await browser.newContext({ storageState: '/tmp/gabia-state.json', userAgent:'Mozilla/5.0 Chrome/120', viewport:{width:1280,height:800} });
const page = await ctx.newPage();
await page.route('**/*', (r) => {
  const t = r.request().resourceType();
  if (t === 'image' || t === 'font' || t === 'media') return r.abort();
  return r.continue();
});

await page.goto('https://dns.gabia.com/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2500);
await page.locator('input[name="search_domain"]').fill('vietnamcoco');
await page.locator('input[name="search_domain"]').press('Enter');
await page.waitForTimeout(3000);
await page.locator('tr', { hasText:'vietnamcoco.com' }).first().locator('a:has-text("설정"), button:has-text("설정")').first().click();
await page.waitForTimeout(4000);
await page.locator('button[onclick*="domain_connect_layer"]').first().click();
await page.waitForTimeout(3000);

const layerHtml = await page.evaluate(() => {
  const layer = document.getElementById('domain_connect_layer');
  return layer ? layer.outerHTML : 'no layer';
});
console.log('=== domain_connect_layer HTML (first 5000 chars) ===');
console.log(layerHtml.slice(0, 5000));

const presetHtml = await page.evaluate(() => {
  const p = document.getElementById('domain_connect_preset');
  return p ? p.outerHTML : 'no preset';
});
console.log('\n=== domain_connect_preset HTML ===');
console.log(presetHtml.slice(0, 3000));

await browser.close();
