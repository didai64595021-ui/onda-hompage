#!/usr/bin/env node
/**
 * 진단 스크립트: 특정 inbox_group의 messages API 응답을 원본 그대로 덤프
 *  - gig_card / service_block 같은 시스템 메시지 구조 파악용
 *  - 사용: node debug-inbox-messages.js [inboxGroupId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');

const INBOX_GROUP_ID = process.argv[2] || '52922649';
const OUT = path.join(__dirname, `debug-inbox-${INBOX_GROUP_ID}.json`);

(async () => {
  const { browser, context, page } = await login();
  await page.goto('https://kmong.com/inboxes', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  const [groupData, msgData] = await Promise.all([
    page.evaluate(async (gId) => {
      const r = await fetch(`https://kmong.com/api/inbox/v1/inbox-groups/${gId}`, { credentials: 'include' });
      return { status: r.status, json: await r.json().catch(() => null) };
    }, INBOX_GROUP_ID),
    page.evaluate(async (gId) => {
      const r = await fetch(`https://kmong.com/api/v5/inbox-groups/${gId}/messages?page=1`, { credentials: 'include' });
      return { status: r.status, json: await r.json().catch(() => null) };
    }, INBOX_GROUP_ID),
  ]);

  fs.writeFileSync(OUT, JSON.stringify({ INBOX_GROUP_ID, groupDetail: groupData, messages: msgData }, null, 2));
  console.log(`saved → ${OUT}`);

  // 핵심 구조만 요약 출력
  const msgs = msgData?.json?.messages || [];
  console.log(`\n=== 요약 ===`);
  console.log(`messages ${msgs.length}개`);
  const types = {};
  for (const m of msgs) types[m.type || '(type없음)'] = (types[m.type || '(type없음)'] || 0) + 1;
  console.log(`type 분포:`, types);
  console.log(`\n첫 메시지 전체 필드:`, Object.keys(msgs[0] || {}).join(', '));
  console.log(`\n처음 3개 원본:`);
  for (const m of msgs.slice(0, 3)) console.log(JSON.stringify(m).slice(0, 400));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
