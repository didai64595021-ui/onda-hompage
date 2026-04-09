/** 1회용: 삭제된 draft URL 직접 진입해서 페이지 상태 확인 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targetIds = ['761411', '761412', '761234']; // 2개 삭제 + 1개 정상

(async () => {
  const { browser, page } = await login({ slowMo: 100 });
  try {
    for (const id of targetIds) {
      await page.goto(`https://kmong.com/my-gigs/edit/${id}?rootCategoryId=6&subCategoryId=667`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(3500);
      const finalUrl = page.url();
      const title = await page.title();
      const hasNotFound = await page.evaluate(() => {
        const t = document.body.innerText || '';
        return /존재하지 않|404|찾을 수 없|삭제|access|권한 없/i.test(t.slice(0, 1000));
      });
      console.log(`[${id}] finalUrl=${finalUrl.slice(0, 80)} title="${title.slice(0,50)}" notFound=${hasNotFound}`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
