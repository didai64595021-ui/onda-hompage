#!/usr/bin/env node
// 크몽 inbox API 응답 구조 덤프
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
const fs = require('fs');

(async () => {
  const { browser, page } = await login({ slowMo: 100 });
  try {
    // 1) inbox-groups 페이지 1 필드
    const g1 = await page.evaluate(async () => {
      const r = await fetch('https://kmong.com/api/v5/inbox-groups?page=1&per_page=5', { credentials: 'include' });
      return await r.json();
    });
    console.log('--- inbox-groups top-level keys:', Object.keys(g1 || {}));
    const list = g1?.inbox_groups || g1?.data || g1?.results || [];
    console.log('--- group count:', list.length);
    if (list[0]) console.log('--- group[0] keys:', Object.keys(list[0]));

    // 첫 대화 id
    const gid = list[0]?.id || list[0]?.INBOX_GROUP_ID || list[0]?.inbox_group_id;
    console.log('--- sample group_id:', gid);

    if (gid) {
      const msgs = await page.evaluate(async (g) => {
        const r = await fetch(`https://kmong.com/api/v5/inbox-groups/${g}/messages?page=1`, { credentials: 'include' });
        return await r.json();
      }, gid);
      console.log('--- messages top keys:', Object.keys(msgs || {}));
      const arr = msgs?.messages || msgs?.data || [];
      console.log('--- message count:', arr.length);
      if (arr[0]) {
        console.log('--- message[0] keys:', Object.keys(arr[0]));
        console.log('--- message[0] sample:');
        const m = arr[0];
        const sample = {};
        for (const k of Object.keys(m)) {
          const v = m[k];
          sample[k] = typeof v === 'string' ? v.slice(0, 100) : v;
        }
        console.log(JSON.stringify(sample, null, 2));
      }
      if (arr[1]) {
        console.log('--- message[1] (다른 발신자?):');
        const m = arr[1];
        const sample = {};
        for (const k of Object.keys(m)) sample[k] = typeof m[k] === 'string' ? m[k].slice(0, 100) : m[k];
        console.log(JSON.stringify(sample, null, 2));
      }
      fs.writeFileSync('/tmp/inbox-api-dump.json', JSON.stringify({ g1, msgs }, null, 2));
      console.log('--- 풀 덤프: /tmp/inbox-api-dump.json');
    }
  } finally { await browser.close(); }
})();
