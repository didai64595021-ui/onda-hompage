require('dotenv').config({ path: '/home/onda/projects/onda-hompage/kmong-crawler/.env' });
const { login } = require('/home/onda/projects/onda-hompage/kmong-crawler/lib/login');
(async () => {
  let browser;
  try {
    const r = await login({ slowMo: 100 });
    browser = r.browser;
    const page = r.page;
    await page.goto('https://kmong.com/my-gigs?statusType=WAITING', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    const count = await page.evaluate(() => {
      // 탭 카운트 — "승인 전 N"
      const link = [...document.querySelectorAll('a[href*="statusType=WAITING"]')]
        .find(a => /승인\s*전/.test(a.innerText || ''));
      if (!link) return null;
      const m = (link.innerText || '').match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    });
    console.log('승인 전 카드 수:', count);
  } catch (e) {
    console.error(e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
