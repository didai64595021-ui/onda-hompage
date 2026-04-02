#!/usr/bin/env node
/**
 * 네이버 플레이스 GraphQL API로 전체 톡톡 재스캔
 * Chrome/OCR 없이 순수 API만 사용
 * 
 * PHASE 1: placeUrl 있는 업체 → placeDetail API (phone 포함)
 * PHASE 2: placeUrl 없는 업체 → places 검색 API
 * PHASE 3: 여전히 place_id 없는 업체 → 네이버 검색 API로 place_id 찾기
 * 
 * Usage: node api_rescan.js [--test N] [--phase 1|2|3] [--skip-done]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const PROXY_HOST = '49.247.137.28';
const PROXY_PORT = 3100;
const PROXY_API_KEY = process.env.PROXY_API_KEY || '';

// 네이버 검색 API 키 2개 (일 25,000 × 2 = 50,000건)
const NAVER_API_KEYS = [
  { id: process.env.NAVER_CLIENT_ID_2 || '', secret: process.env.NAVER_CLIENT_SECRET_2 || '' },
  { id: process.env.NAVER_CLIENT_ID || '', secret: process.env.NAVER_CLIENT_SECRET || '' }
];
let currentKeyIdx = 0;
let keyUsage = [0, 0];

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

function naverLocalSearch(query) {
  return new Promise((resolve) => {
    const key = NAVER_API_KEYS[currentKeyIdx];
    if (!key) return resolve('quota');
    const encoded = encodeURIComponent(query);
    const req = https.get(`https://openapi.naver.com/v1/search/local.json?query=${encoded}&display=1`, {
      headers: {
        'X-Naver-Client-Id': key.id,
        'X-Naver-Client-Secret': key.secret
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        keyUsage[currentKeyIdx]++;
        try {
          const d = JSON.parse(data);
          if (d.errorCode === '010') return resolve('quota'); // 쿼터 초과
          const items = d.items || [];
          if (items.length === 0) return resolve(null);
          // mapx/mapy로 place_id 유추는 어렵지만, link에서 추출 가능
          const item = items[0];
          // 네이버 지역검색 결과의 link에서 place_id 추출
          const pidMatch = (item.link || '').match(/place\/(\d+)/);
          if (pidMatch) return resolve({ id: pidMatch[1], name: item.title?.replace(/<[^>]*>/g, '') });
          // link에 place_id 없으면 title로 GraphQL 검색
          resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
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
        if (r.phone) biz.phone = r.phone;
        if (r.roadAddress) biz.roadAddress = r.roadAddress;
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

  if (stopping) { console.log('🛑 중단'); return; }

  // ═══ PHASE 3: not_found/fail → 네이버 검색 API로 place_id 찾기 → placeDetail ═══
  if (!phaseOnly || phaseOnly === 3) {
    const phase3 = Object.entries(history.crawled).filter(([, b]) => {
      if (b.talktalkVerified === 'api') return false;
      if (b.talktalkVerified === 'not_found' && skipDone) return false;
      const pid = b.placeUrl ? b.placeUrl.match(/(\d{5,})/)?.[1] : '';
      return !pid;
    });
    const p3Total = testLimit ? Math.min(testLimit, phase3.length) : phase3.length;

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🔎 PHASE 3: 네이버 검색 API → place_id → placeDetail (${p3Total}건)`);
    console.log(`  API 키 ${NAVER_API_KEYS.length}개, 일 ${NAVER_API_KEYS.length * 25000}건`);
    console.log(`${'═'.repeat(50)}`);

    let done = 0, talkO = 0, talkX = 0, found = 0, notFound = 0, fail = 0, quotaExhausted = false;
    const start = Date.now();

    for (const [key, biz] of phase3) {
      if (stopping || quotaExhausted || (testLimit && done >= testLimit)) break;

      const cleanName = decodeHtmlEntities(biz.name || '');
      const addr = decodeHtmlEntities(biz.address || biz.roadAddress || '').split(' ').slice(0, 2).join(' ');
      const q = `${cleanName} ${addr}`.trim();

      // 네이버 검색 API로 place_id 찾기
      const searchResult = await naverLocalSearch(q);
      done++;

      if (searchResult === 'quota') {
        // 현재 키 소진, 다음 키로
        currentKeyIdx++;
        if (currentKeyIdx >= NAVER_API_KEYS.length) {
          console.log('⚠️ 모든 API 키 쿼터 소진 — PHASE 3 중단');
          quotaExhausted = true;
          continue;
        }
        console.log(`  🔄 API 키 ${currentKeyIdx + 1}번으로 전환 (사용량: ${keyUsage})`);
        // 재시도
        const retry = await naverLocalSearch(q);
        if (retry === 'quota') { quotaExhausted = true; continue; }
        if (!retry) { notFound++; biz.talktalkVerified = 'not_found'; biz.talktalkButton = 'X'; continue; }
        // place_id 찾음 → placeDetail로 톡톡 확인
        biz.placeUrl = `https://m.place.naver.com/place/${retry.id}`;
        const detail = await checkByPlaceId(retry.id);
        if (detail.ok) {
          found++;
          biz.talktalkButton = detail.talktalkUrl ? 'O' : 'X';
          biz.talktalkVerified = 'api';
          if (detail.talktalkUrl) { biz.talkUrl = detail.talktalkUrl; talkO++; } else talkX++;
          if (detail.phone) biz.phone = detail.phone;
          if (detail.category && !biz.category) biz.category = detail.category;
        } else { fail++; }
        continue;
      }

      if (!searchResult) {
        notFound++;
        biz.talktalkVerified = 'not_found';
        biz.talktalkButton = 'X';
      } else {
        biz.placeUrl = `https://m.place.naver.com/place/${searchResult.id}`;
        const detail = await checkByPlaceId(searchResult.id);
        if (detail.ok) {
          found++;
          biz.talktalkButton = detail.talktalkUrl ? 'O' : 'X';
          biz.talktalkVerified = 'api';
          if (detail.talktalkUrl) { biz.talkUrl = detail.talktalkUrl; talkO++; } else talkX++;
          if (detail.phone) biz.phone = detail.phone;
          if (detail.category && !biz.category) biz.category = detail.category;
        } else { fail++; }
      }

      if (done % 10 === 0) {
        const elapsed = ((Date.now() - start) / 60000).toFixed(1);
        const rate = (done / ((Date.now() - start) / 1000)).toFixed(2);
        const eta = ((p3Total - done) / Math.max(0.01, done / ((Date.now() - start) / 60000))).toFixed(0);
        console.log(`  [P3 ${done}/${p3Total}] found:${found} 💬O:${talkO} ❌X:${talkX} nf:${notFound} fail:${fail} key:${currentKeyIdx+1} usage:${keyUsage} | ${elapsed}분 | ETA:${eta}분`);
      }

      if (done % SAVE_INTERVAL === 0) {
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
      }

      await sleep(DELAY_MS);
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`\n✅ PHASE 3 완료: ${done}건 | found:${found} 💬O:${talkO} ❌X:${talkX} notFound:${notFound} fail:${fail}`);
    console.log(`  API 사용량: ${keyUsage}`);
    console.log(`[STEP-DONE] PHASE3 완료`);
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
