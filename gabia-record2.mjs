import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: '/tmp/gabia-state.json', userAgent:'Mozilla/5.0 Chrome/120' });
const page = await ctx.newPage();

await page.goto('https://dns.gabia.com/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2500);

// 검색 후 결과 내 vietnamcoco 행에서 직접 a 또는 button (text 設定)
await page.locator('input[name="search_domain"]').fill('vietnamcoco');
await page.locator('input[name="search_domain"]').press('Enter');
await page.waitForTimeout(3500);

await page.screenshot({ path:'/tmp/gabia-search-result.png', fullPage:true });

// link/button 모두 dump
const candidates = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a, button').forEach(el => {
    const t = (el.textContent||'').trim();
    if (t === '설정') {
      const tr = el.closest('tr');
      const trText = (tr?.textContent || '').replace(/\s+/g,' ').slice(0, 100);
      out.push({ tag: el.tagName, text: t, href: el.href||'', trContains: trText.includes('vietnamcoco'), trText });
    }
  });
  return out;
});
console.log('all 설정 candidates:');
candidates.forEach(c => console.log(' ', c.tag, '|', c.trContains, '|', c.trText, '|', c.href));

await browser.close();
