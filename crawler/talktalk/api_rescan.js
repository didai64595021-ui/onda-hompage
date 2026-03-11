#!/usr/bin/env node
/**
 * 네이버 플레이스 GraphQL API로 전체 톡톡 재스캔
 * Chrome/OCR 없이 순수 API만 사용
 * 
 * PHASE 1: placeUrl 있는 업체 → placeDetail API
 * PHASE 2: placeUrl 없는 업체 → places 검색 API
 * 
 * Usage: node api_rescan.js [--test N] [--phase 1|2] [--skip-done]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const PROXY_HOST = '49.247.137.28';
const PROXY_PORT = 3100;
const PROXY_API_KEY = 'onda-proxy-2026-secret';

const DELAY_MS = 400;
const SAVE_INTERVAL = 25;
const RETRY_MAX = 3;

const args = process.argv.slice(2);
const testLimit = args.includes('--test') ? parseInt(args[args.indexOf('--test') + 1]) || 5 : 0;
const phaseOnly = args.includes('--phase') ? parseInt(args[args.indexOf('--phase') + 1]) : 0;
const skipDone = args.includes('--skip-done');

let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM'); });
process.on('SIGINT', () => { stopping = true; console.log('🛑 SIGINT'); });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeHtmlEntities(str) {
  return (str || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function graphqlRequest(query, referer) {
  return new Promise((resolve) => {
    const postBody = JSON.stringify([{ query }]);
    const proxyBody = JSON.stringify({
      targetUrl: 'https://pcmap-api.place.naver.com/place/graphql',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': referer || 'https://pcmap.place.naver.com/' },
      postBody
    });

    const req = http.request({
      hostname: PROXY_HOST, port: PROXY_PORT, path: '/proxy',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(proxyBody),
        'x-api-key': PROXY_API_KEY
      },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed[0] : parsed);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(proxyBody);
    req.end();
  });
}

async function checkByPlaceId(placeId) {
  const query = `{ placeDetail(input: {id: "${placeId}"}) { base { id name talktalkUrl phone category address roadAddress } } }`;
  for (let retry = 0; retry < RETRY_MAX; retry++) {
    const result = await graphqlRequest(query, `https://pcmap.place.naver.com/place/${placeId}/home`);
    if (result && result.data) {
      const base = result.data.placeDetail?.base;
      if (base) {
        return {
          ok: true,
          talktalkUrl: base.talktalkUrl || null,
          name: base.name,
          phone: base.phone,
          category: base.category,
          address: base.address,
          roadAddress: base.roadAddress
        };
      }
    }
    if (retry < RETRY_MAX - 1) await sleep(3000 * (retry + 1));
  }
  return { ok: false };
}

async function searchByName(name, address) {
  const cleanName = decodeHtmlEntities(name);
  const addr = decodeHtmlEntities(address || '').split(' ').slice(0, 2).join(' ');
  const searchQuery = `${cleanName} ${addr}`.trim();
  const query = `{ places(input: {query: "${searchQuery.replace(/"/g, '\\"')}"}) { items { id name talktalkUrl } } }`;
  
  for (let retry = 0; retry < RETRY_MAX; retry++) {
    const result = await graphqlRequest(query);
    if (result && result.data) {
      const items = result.data.places?.items;
      if (items && items.length > 0) {
        return { ok: true, item: items[0], allItems: items.slice(0, 3) };
      }
      return { ok: true, item: null };
    }
    if (retry < RETRY_MAX - 1) await sleep(3000 * (retry + 1));
  }
  return { ok: false };
}

async function main() {
  console.log('🚀 GraphQL API 톡톡 재스캔 시작');
  if (testLimit) console.log(`🧪 테스트 모드: ${testLimit}건`);
  if (skipDone) console.log('⏭️ api 검증 완료건 스킵');

  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);
  const total = entries.length;

  // ═══ PHASE 1: placeUrl 있는 업체 ═══
  if (!phaseOnly || phaseOnly === 1) {
    const phase1 = entries.filter(([, b]) => {
      if (skipDone && b.talktalkVerified === 'api') return false;
      const pid = b.placeUrl ? b.placeUrl.match(/(\d{5,})/)?.[1] : '';
      return !!pid;
    });
    const p1Total = testLimit ? Math.min(testLimit, phase1.length) : phase1.length;

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📍 PHASE 1: placeUrl → placeDetail API (${p1Total}건)`);
    console.log(`${'═'.repeat(50)}`);

    let done = 0, talkO = 0, talkX = 0, fail = 0;
    const start = Date.now();

    for (const [key, biz] of phase1) {
      if (stopping || (testLimit && done >= testLimit)) break;
      const pid = biz.placeUrl.match(/(\d{5,})/)?.[1];
      if (!pid) continue;

      const r = await checkByPlaceId(pid);
      done++;

      if (r.ok) {
        biz.talktalkButton = r.talktalkUrl ? 'O' : 'X';
        biz.talktalkVerified = 'api';
        if (r.talktalkUrl) { biz.talkUrl = r.talktalkUrl; talkO++; } else talkX++;
        if (r.category && !biz.category) biz.category = r.category;
      } else {
        fail++;
      }

      if (done % 10 === 0) {
        const elapsed = ((Date.now() - start) / 60000).toFixed(1);
        const rate = (done / ((Date.now() - start) / 1000)).toFixed(2);
        const eta = ((p1Total - done) / Math.max(0.01, done / ((Date.now() - start) / 60000))).toFixed(0);
        console.log(`  [P1 ${done}/${p1Total}] 💬O:${talkO} ❌X:${talkX} fail:${fail} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
      }

      if (done % SAVE_INTERVAL === 0) {
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
      }

      await sleep(DELAY_MS);
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`\n✅ PHASE 1 완료: ${done}건 | 💬O:${talkO} ❌X:${talkX} fail:${fail}`);
    console.log(`[STEP-DONE] PHASE1 완료`);
  }

  if (stopping) { console.log('🛑 중단'); return; }

  // ═══ PHASE 2: placeUrl 없는 업체 → 검색 ═══
  if (!phaseOnly || phaseOnly === 2) {
    const phase2 = entries.filter(([, b]) => {
      if (skipDone && b.talktalkVerified === 'api') return false;
      const pid = b.placeUrl ? b.placeUrl.match(/(\d{5,})/)?.[1] : '';
      return !pid;
    });
    const p2Total = testLimit ? Math.min(testLimit, phase2.length) : phase2.length;

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🔍 PHASE 2: 검색 API → places (${p2Total}건)`);
    console.log(`${'═'.repeat(50)}`);

    let done = 0, talkO = 0, talkX = 0, found = 0, notFound = 0, fail = 0;
    const start = Date.now();

    for (const [key, biz] of phase2) {
      if (stopping || (testLimit && done >= testLimit)) break;

      const r = await searchByName(biz.name, biz.address || biz.roadAddress);
      done++;

      if (r.ok && r.item) {
        found++;
        biz.placeUrl = `https://m.place.naver.com/place/${r.item.id}`;
        biz.talktalkButton = r.item.talktalkUrl ? 'O' : 'X';
        biz.talktalkVerified = 'api';
        if (r.item.talktalkUrl) { biz.talkUrl = r.item.talktalkUrl; talkO++; } else talkX++;
      } else if (r.ok && !r.item) {
        notFound++;
        biz.talktalkButton = 'X';
        biz.talktalkVerified = 'not_found';
      } else {
        fail++;
      }

      if (done % 10 === 0) {
        const elapsed = ((Date.now() - start) / 60000).toFixed(1);
        const rate = (done / ((Date.now() - start) / 1000)).toFixed(2);
        const eta = ((p2Total - done) / Math.max(0.01, done / ((Date.now() - start) / 60000))).toFixed(0);
        console.log(`  [P2 ${done}/${p2Total}] found:${found} 💬O:${talkO} ❌X:${talkX} notFound:${notFound} fail:${fail} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
      }

      if (done % SAVE_INTERVAL === 0) {
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
      }

      await sleep(DELAY_MS);
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`\n✅ PHASE 2 완료: ${done}건 | found:${found} 💬O:${talkO} ❌X:${talkX} notFound:${notFound} fail:${fail}`);
    console.log(`[STEP-DONE] PHASE2 완료`);
  }

  // ═══ 최종 통계 ═══
  const all = Object.values(history.crawled);
  const finalO = all.filter(b => b.talktalkButton === 'O').length;
  const finalX = all.filter(b => b.talktalkButton === 'X').length;
  const finalU = all.filter(b => !b.talktalkButton || b.talktalkButton === '미확인').length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 최종 통계');
  console.log(`  전체: ${total} | 💬O: ${finalO} | ❌X: ${finalX} | ?미확인: ${finalU}`);
  console.log(`  톡톡 보유율: ${(finalO / Math.max(1, finalO + finalX) * 100).toFixed(1)}%`);
  console.log(`  처리율: ${((finalO + finalX) / total * 100).toFixed(1)}%`);

  const catStats = {};
  all.forEach(b => {
    const cat = b.category || '기타';
    if (!catStats[cat]) catStats[cat] = { total: 0, talk: 0 };
    catStats[cat].total++;
    if (b.talktalkButton === 'O') catStats[cat].talk++;
  });
  const topCats = Object.entries(catStats).filter(([, s]) => s.talk > 0).sort((a, b) => b[1].talk - a[1].talk).slice(0, 20);
  if (topCats.length) {
    console.log('\n🏆 톡톡O 업종 TOP 20:');
    topCats.forEach(([cat, s]) => console.log(`  ${cat}: ${s.talk}/${s.total} (${(s.talk / s.total * 100).toFixed(0)}%)`));
  }
}

main().catch(console.error);
