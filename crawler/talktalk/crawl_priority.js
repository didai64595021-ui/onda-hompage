#!/usr/bin/env node
/**
 * 활성도 높은 업종 우선 크롤링
 * crawl_queue.json의 키워드를 순차 GraphQL 검색 → 톡톡 O만 저장
 * 
 * Usage: node crawl_priority.js [--skip-done] [--test N]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const QUEUE_PATH = path.join(__dirname, 'crawl_queue.json');
const PROGRESS_PATH = path.join(__dirname, 'crawl_progress.json');
const PROXY_HOST = '49.247.137.28';
const PROXY_PORT = 3100;
const PROXY_API_KEY = process.env.PROXY_API_KEY || '';

const DELAY_MS = 2000; // 차단 방지
const args = process.argv.slice(2);
const testLimit = args.includes('--test') ? parseInt(args[args.indexOf('--test') + 1]) || 5 : 0;

let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM'); });
process.on('SIGINT', () => { stopping = true; console.log('🛑 SIGINT'); });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function graphqlSearch(query) {
  return new Promise((resolve) => {
    const gql = `{ places(input: {query: "${query.replace(/"/g, '\\"')}"}) { items { id name talktalkUrl category } } }`;
    const postBody = JSON.stringify([{ query: gql }]);
    const proxyBody = JSON.stringify({
      targetUrl: 'https://pcmap-api.place.naver.com/place/graphql',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': 'https://pcmap.place.naver.com/' },
      postBody
    });

    const req = http.request({
      hostname: PROXY_HOST, port: PROXY_PORT, path: '/proxy',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(proxyBody), 'x-api-key': PROXY_API_KEY },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (data.startsWith('<')) { resolve('blocked'); return; } // HTML = 차단
          const parsed = JSON.parse(data);
          const d = Array.isArray(parsed) ? parsed[0] : parsed;
          resolve(d?.data?.places?.items || []);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(proxyBody);
    req.end();
  });
}

function graphqlDetail(placeId) {
  return new Promise((resolve) => {
    const gql = `{ placeDetail(input: {id: "${placeId}"}) { base { id name talktalkUrl phone category address roadAddress } } }`;
    const postBody = JSON.stringify([{ query: gql }]);
    const proxyBody = JSON.stringify({
      targetUrl: 'https://pcmap-api.place.naver.com/place/graphql',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': `https://pcmap.place.naver.com/place/${placeId}/home` },
      postBody
    });

    const req = http.request({
      hostname: PROXY_HOST, port: PROXY_PORT, path: '/proxy',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(proxyBody), 'x-api-key': PROXY_API_KEY },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const d = Array.isArray(parsed) ? parsed[0] : parsed;
          resolve(d?.data?.placeDetail?.base || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(proxyBody);
    req.end();
  });
}

async function main() {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  
  // 진행 상태 로드
  let progress = { done: 0, lastIdx: 0 };
  if (fs.existsSync(PROGRESS_PATH)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8')); } catch {}
  }

  const startIdx = progress.lastIdx || 0;
  const total = testLimit ? Math.min(testLimit, queue.length - startIdx) : queue.length - startIdx;
  
  console.log(`🚀 우선 크롤링 시작 (${startIdx}부터, ${total}건)`);
  
  let queriesDone = 0, newBiz = 0, talkO = 0, talkX = 0, consecutiveEmpty = 0;
  const start = Date.now();

  for (let i = startIdx; i < queue.length; i++) {
    if (stopping || (testLimit && queriesDone >= testLimit)) break;
    
    const keyword = queue[i];
    let items = await graphqlSearch(keyword);
    
    // 차단 감지 → 120초 대기 후 재시도
    if (items === 'blocked') {
      console.log('  🚫 차단 감지 — 120초 대기...');
      await sleep(120000);
      items = await graphqlSearch(keyword);
      if (items === 'blocked') {
        console.log('  🚫 여전히 차단 — 300초 대기...');
        await sleep(300000);
        items = await graphqlSearch(keyword);
        if (items === 'blocked') items = [];
      }
    }
    queriesDone++;

    let qNew = 0, qTalk = 0;
    for (const item of items) {
      if (!item.id) continue;
      const key = `place_${item.id}`;
      
      // 이미 있으면 톡톡 정보만 업데이트
      if (history.crawled[key]) {
        if (item.talktalkUrl && history.crawled[key].talktalkButton !== 'O') {
          history.crawled[key].talktalkButton = 'O';
          history.crawled[key].talkUrl = item.talktalkUrl;
          history.crawled[key].talktalkVerified = 'api';
          talkO++;
        }
        continue;
      }

      // 신규 업체 → 상세 조회 (phone 포함)
      const detail = await graphqlDetail(item.id);
      await sleep(300);

      const biz = {
        name: detail?.name || item.name,
        category: detail?.category || item.category || keyword.split(' ')[0],
        address: detail?.address || '',
        roadAddress: detail?.roadAddress || '',
        phone: detail?.phone || '',
        homepage: '',
        placeUrl: `https://m.place.naver.com/place/${item.id}`,
        talktalkButton: item.talktalkUrl ? 'O' : 'X',
        talktalkVerified: 'api',
        talkUrl: item.talktalkUrl || '',
        talkId: item.talktalkUrl ? item.talktalkUrl.match(/talk\.naver\.com\/(\w+)/)?.[1] || '' : '',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };

      history.crawled[key] = biz;
      newBiz++;
      qNew++;
      if (item.talktalkUrl) { talkO++; qTalk++; } else talkX++;
    }

    if (queriesDone % 5 === 0) {
      const elapsed = ((Date.now() - start) / 60000).toFixed(1);
      const eta = ((total - queriesDone) / Math.max(0.01, queriesDone / ((Date.now() - start) / 60000))).toFixed(0);
      console.log(`  [${queriesDone}/${total}] "${keyword}" → ${items.length}건, 신규:${qNew}, 톡톡:${qTalk} | 누적 신규:${newBiz} 💬O:${talkO} | ${elapsed}분 | ETA:${eta}분`);
    }

    // 10 쿼리마다 저장
    if (queriesDone % 10 === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ done: queriesDone, lastIdx: i + 1, talkO, newBiz }));
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ done: queriesDone + (progress.done || 0), lastIdx: startIdx + queriesDone, talkO, newBiz }));

  // 최종 통계
  const all = Object.values(history.crawled);
  const finalO = all.filter(b => b.talktalkButton === 'O').length;
  const finalTotal = all.length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ 우선 크롤링 완료`);
  console.log(`  쿼리: ${queriesDone} | 신규업체: ${newBiz} | 💬톡톡O: ${talkO} | ❌X: ${talkX}`);
  console.log(`  DB 전체: ${finalTotal} | 톡톡O 전체: ${finalO}`);
  console.log(`  톡톡 보유율: ${(finalO / finalTotal * 100).toFixed(1)}%`);
}

main().catch(console.error);
