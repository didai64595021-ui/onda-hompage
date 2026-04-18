require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const gigs = [
    { id: 'N01', draft: '764206', sub: '639', third: '63901' },
    { id: 'N02', draft: '764211', sub: '601', third: '60113' },
    { id: 'N04', draft: '764212', sub: '660', third: '66001' },
    { id: 'N05', draft: '764213', sub: '601', third: '60113' },
    { id: 'N08', draft: '764215', sub: '601', third: '60113' },
    { id: 'N09', draft: '764216', sub: '601', third: '60113' },
    { id: 'N10', draft: '764217', sub: '634', third: '' },
  ];
  const OUT = path.join(__dirname, 'all-gigs-feat-shots');
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page } = await login({ slowMo: 60 });
  try {
    for (const g of gigs) {
      const url = `https://kmong.com/my-gigs/edit/${g.draft}?rootCategoryId=6&subCategoryId=${g.sub}${g.third ? `&thirdCategoryId=${g.third}` : ''}`;
      console.log(`[${g.id}] ${g.draft}`);
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      await page.evaluate(u => { window.location.href = u; }, url);
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await sleep(4000);

      // 주요 특징 섹션 위치
      const y = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h1,h2,h3,h4')].find(h => (h.innerText || '').includes('주요 특징'));
        return h ? h.getBoundingClientRect().top + window.scrollY : 0;
      });
      if (y > 0) {
        await page.evaluate(y => window.scrollTo(0, y - 50), y);
        await sleep(1500);
      }
      await page.screenshot({ path: path.join(OUT, `${g.id}-feat.png`), fullPage: false });
    }
    console.log('saved');
  } finally {
    await browser.close().catch(() => {});
  }
})();
