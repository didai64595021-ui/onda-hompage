const { chromium, devices } = require('playwright');
const BASE = 'https://kmong-service.pages.dev';
const PAGES = ['safe-plan','nplace-seo','nplace-auth','naver-ad-auth','insta-guide','step-package','reels-boost','regram','post-exposure','auto-activity','optimized-account','price-list','capture-site','banned-biz','account-seo'];

(async () => {
  const b = await chromium.launch({ headless: true });
  let totalBroken = 0, totalImgs = 0, pagesOk = 0;
  for (const name of PAGES) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const bad = [];
    p.on('response', async r => {
      if (r.url().includes('/img/')) {
        const ct = r.headers()['content-type'] || '';
        if (!ct.startsWith('image/')) bad.push(`${r.url().split('/').pop()}: ct=${ct}`);
      }
    });
    try {
      await p.goto(`${BASE}/pages/${name}`, { waitUntil: 'networkidle', timeout: 20000 });
      await p.waitForTimeout(1500);
      const imgs = await p.evaluate(() => {
        const all = [...document.querySelectorAll('img')];
        return {
          total: all.length,
          broken: all.filter(i => i.complete && i.naturalWidth === 0).length,
        };
      });
      totalImgs += imgs.total;
      totalBroken += imgs.broken;
      const ok = imgs.broken === 0 && bad.length === 0;
      if (ok) pagesOk++;
      console.log(`${ok?'✓':'✗'} ${name.padEnd(22)} imgs ${imgs.total-imgs.broken}/${imgs.total}${bad.length?' badCT '+bad.length:''}`);
    } catch (e) {
      console.log(`✗ ${name}: ${e.message.slice(0,60)}`);
    }
    await ctx.close();
  }
  await b.close();
  console.log(`\nSUMMARY: ${pagesOk}/${PAGES.length} OK, imgs ${totalImgs-totalBroken}/${totalImgs}`);
})();
