require('dotenv').config();
const { login } = require('./lib/login');
const fs = require('fs');

(async () => {
  const { browser, page } = await login({ slowMo: 30 });
  try {
    await page.waitForTimeout(2000);
    // 크몽 도메인에서 fetch해야 credentials 적용됨
    console.log('current url:', page.url());
    await page.goto('https://kmong.com/inboxes', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log('after goto url:', page.url());

    // Playwright request context 사용 (쿠키 공유, CORS 우회)
    const resp = await page.context().request.get('https://kmong.com/api/v5/inbox-groups/52954758/messages/334766495/files/49723524');
    console.log('status:', resp.status(), 'ct:', resp.headers()['content-type']);
    const body = await resp.body();
    console.log('bytes:', body.length);
    const ct = resp.headers()['content-type'] || '';
    if (ct.includes('json')) {
      console.log('body:', body.toString('utf-8').slice(0, 800));
    } else {
      fs.writeFileSync('/tmp/inquiry-60-original.png', body);
      console.log('saved /tmp/inquiry-60-original.png');
    }
  } finally {
    await browser.close();
  }
})();
