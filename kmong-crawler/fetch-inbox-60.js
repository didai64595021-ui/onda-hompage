require('dotenv').config();
const { login } = require('./lib/login');
const fs = require('fs');

(async () => {
  const { browser, page } = await login({ slowMo: 30 });
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const msgData = await page.evaluate(async () => {
      const r = await fetch('https://kmong.com/api/v5/inbox-groups/52954758/messages?page=1', { credentials: 'include' });
      return { status: r.status, text: await r.text() };
    });
    fs.writeFileSync('/tmp/inbox-60-raw.json', msgData.text);
    console.log('status:', msgData.status, 'bytes:', msgData.text.length);
    const j = JSON.parse(msgData.text);
    console.log('total messages:', j.messages?.length);
    for (const m of (j.messages || [])) {
      console.log('---');
      console.log('MID:', m.MID, 'is_mine:', m.is_mine, 'sent_at:', m.sent_at);
      console.log('message:', String(m.message||'').slice(0,100));
      console.log('files:', JSON.stringify(m.files));
      console.log('action:', m.action);
      if (m.extra_data) console.log('extra_data keys:', Object.keys(m.extra_data));
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
