#!/usr/bin/env node
/**
 * 진단: gig 상세 API 엔드포인트 확인
 * 여러 후보 URL을 동시에 시도 → 성공한 것 찾기
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');

const GIG_ID = process.argv[2] || '747186';  // 김치공장 고객이 본 원페이지 랜딩

const CANDIDATES = [
  `https://kmong.com/api/v5/gig/${GIG_ID}`,
  `https://kmong.com/api/v5/gigs/${GIG_ID}`,
  `https://kmong.com/api/v6/gig/${GIG_ID}`,
  `https://kmong.com/api/v6/gigs/${GIG_ID}`,
  `https://kmong.com/api/gig/v1/${GIG_ID}`,
  `https://kmong.com/api/gig/v5/${GIG_ID}`,
  `https://kmong.com/api/gig/v5/gigs/${GIG_ID}`,
  `https://kmong.com/api/search/v5/gig/${GIG_ID}`,
];

(async () => {
  const { browser, context, page } = await login();
  await page.goto('https://kmong.com/inboxes', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // 1) API 후보 병렬 탐색
  console.log('=== API 후보 탐색 ===');
  const results = await page.evaluate(async (urls) => {
    const out = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: 'include' });
        out.push({ url: u, status: r.status, len: r.status === 200 ? (await r.text()).length : 0 });
      } catch (e) { out.push({ url: u, error: e.message }); }
    }
    return out;
  }, CANDIDATES);
  for (const r of results) console.log(` ${r.status || 'ERR'} (${r.len || 0}b) ${r.url}`);

  // 2) gig 페이지 HTML fetch → __NEXT_DATA__ 추출 가능성
  console.log('\n=== HTML 페이지 __NEXT_DATA__ 확인 ===');
  const htmlInfo = await page.evaluate(async (gId) => {
    const r = await fetch(`https://kmong.com/gig/${gId}`, { credentials: 'include' });
    if (!r.ok) return { status: r.status };
    const txt = await r.text();
    const nextMatch = txt.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const apolloMatch = txt.match(/__APOLLO_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
    return {
      status: r.status,
      totalLen: txt.length,
      hasNextData: !!nextMatch,
      nextDataLen: nextMatch ? nextMatch[1].length : 0,
      hasApolloState: !!apolloMatch,
    };
  }, GIG_ID);
  console.log(' HTML:', htmlInfo);

  // 3) 200 응답 하나 샘플 덤프
  const hit = results.find(r => r.status === 200);
  if (hit) {
    console.log(`\n=== ${hit.url} 응답 샘플 ===`);
    const sample = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      const txt = await r.text();
      try {
        const j = JSON.parse(txt);
        return { keys: Object.keys(j), sample: JSON.stringify(j).slice(0, 1500) };
      } catch { return { raw: txt.slice(0, 800) }; }
    }, hit.url);
    console.log(' keys:', sample.keys);
    fs.writeFileSync(path.join(__dirname, `debug-gig-${GIG_ID}.json`), sample.sample || sample.raw);
    console.log(` saved → debug-gig-${GIG_ID}.json`);
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
