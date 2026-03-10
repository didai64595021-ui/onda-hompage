#!/usr/bin/env node
/**
 * no_pid 재스캔 v2: 2단계 분리
 * PHASE 1: iwinv 프록시로 place_id 일괄 추출 (빠름, ~400ms/건)
 * PHASE 2: place_id 확보된 것만 OCR 톡톡 확인 (~2s/건)
 * 
 * 각 단계 10건마다 진행률 출력
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const PROXY_HOST = '49.247.137.28';
const PROXY_PORT = 3100;
const PROXY_API_KEY = 'onda-proxy-2026-secret';
const OCR_HOST = '49.247.137.28';
const OCR_PORT = 3300;

const SEARCH_DELAY = 500;
const OCR_DELAY = 2500;
const SAVE_INTERVAL = 25;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM'); });
process.on('SIGINT', () => { stopping = true; console.log('🛑 SIGINT'); });

function decodeHtmlEntities(str) {
  return (str || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function searchPlaceId(name, address) {
  return new Promise((resolve) => {
    const cleanName = decodeHtmlEntities(name);
    const addr = decodeHtmlEntities(address || '').split(' ').slice(0, 2).join(' ');
    const query = `${cleanName} ${addr}`.trim();
    const targetUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(query)}`;
    const body = JSON.stringify({ targetUrl });
    const req = http.request({
      hostname: PROXY_HOST, port: PROXY_PORT, path: '/proxy',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': PROXY_API_KEY
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const pids = [...new Set((data.match(/place[\/.](\d{5,})/g) || []))].map(m => m.replace(/place[\/.]/, ''));
        resolve(pids[0] || '');
      });
    });
    req.on('error', (e) => { console.log(`  ⚠️ 프록시에러: ${e.message}`); resolve(''); });
    req.on('timeout', () => { req.destroy(); console.log('  ⚠️ 프록시 타임아웃'); resolve(''); });
    req.write(body);
    req.end();
  });
}

function ocrCheck(placeId, name) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ place_id: placeId, name });
    const req = http.request({
      hostname: OCR_HOST, port: OCR_PORT, path: '/check',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 45000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', (e) => { console.log(`  ⚠️ OCR에러: ${e.message}`); resolve(null); });
    req.on('timeout', () => { req.destroy(); console.log('  ⚠️ OCR 타임아웃'); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🔄 no_pid 재스캔 시작...');
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);

  // no_pid + 미스캔 대상
  const noPidEntries = entries.filter(([, b]) => b.talktalkVerified === 'no_pid' || !b.talktalkVerified);
  console.log(`📊 전체: ${entries.length} | 재스캔 대상: ${noPidEntries.length}`);

  // ═══ PHASE 1: place_id 추출 ═══
  console.log(`\n${'═'.repeat(50)}`);
  console.log('📍 PHASE 1: place_id 추출 (iwinv 프록시)');
  console.log(`${'═'.repeat(50)}`);

  let p1Done = 0, p1Found = 0, p1Fail = 0;
  const p1Start = Date.now();

  for (const [key, biz] of noPidEntries) {
    if (stopping) break;

    // 이미 placeUrl 있으면 스킵
    const existingPid = biz.placeUrl ? biz.placeUrl.match(/\/(\d{5,})$/)?.[1] : '';
    if (existingPid) {
      p1Done++;
      continue;
    }

    const pid = await searchPlaceId(biz.name, biz.address || biz.roadAddress);
    p1Done++;

    if (pid) {
      biz.placeUrl = `https://m.place.naver.com/place/${pid}`;
      p1Found++;
    } else {
      p1Fail++;
    }

    if (p1Done % 10 === 0) {
      const elapsed = ((Date.now() - p1Start) / 60000).toFixed(1);
      const rate = (p1Done / ((Date.now() - p1Start) / 1000)).toFixed(2);
      const eta = ((noPidEntries.length - p1Done) / (p1Done / ((Date.now() - p1Start) / 60000))).toFixed(0);
      console.log(`  [P1 ${p1Done}/${noPidEntries.length}] 발견:${p1Found} 실패:${p1Fail} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
    }

    if (p1Done % SAVE_INTERVAL === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    }

    await sleep(SEARCH_DELAY);
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log(`\n✅ PHASE 1 완료: ${p1Found}건 place_id 발견, ${p1Fail}건 실패`);

  if (stopping) { console.log('🛑 중단됨'); return; }

  // ═══ PHASE 2: OCR 톡톡 확인 ═══
  // place_id가 있고 OCR 미완료인 것만
  const ocrTargets = Object.entries(history.crawled).filter(([, b]) => {
    if (b.talktalkVerified === 'ocr') return false; // 이미 완료
    const pid = b.placeUrl ? b.placeUrl.match(/\/(\d{5,})$/)?.[1] : '';
    return !!pid;
  });

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🔍 PHASE 2: OCR 톡톡 확인 (${ocrTargets.length}건)`);
  console.log(`${'═'.repeat(50)}`);

  let p2Done = 0, talkO = 0, talkX = 0, ocrFail = 0;
  const p2Start = Date.now();

  for (const [key, biz] of ocrTargets) {
    if (stopping) break;

    const pid = biz.placeUrl.match(/\/(\d{5,})$/)?.[1];
    if (!pid) continue;

    const result = await ocrCheck(pid, biz.name);
    p2Done++;

    if (result && result.status === 'ok') {
      biz.talktalkButton = result.talktalk ? 'O' : 'X';
      biz.talktalkVerified = 'ocr';
      if (result.talk_url) biz.talkUrl = result.talk_url;
      if (result.talktalk) talkO++; else talkX++;
    } else if (result && result.status === '429') {
      console.log('  ⏸️ 429 — 90초 대기 후 재시도');
      await sleep(90000);
      const retry = await ocrCheck(pid, biz.name);
      if (retry && retry.status === 'ok') {
        biz.talktalkButton = retry.talktalk ? 'O' : 'X';
        biz.talktalkVerified = 'ocr';
        if (retry.talk_url) biz.talkUrl = retry.talk_url;
        if (retry.talktalk) talkO++; else talkX++;
      } else {
        biz.talktalkButton = '미확인';
        biz.talktalkVerified = 'ocr_fail';
        ocrFail++;
      }
    } else {
      biz.talktalkButton = '미확인';
      biz.talktalkVerified = 'ocr_fail';
      ocrFail++;
    }

    if (p2Done % 10 === 0) {
      const elapsed = ((Date.now() - p2Start) / 60000).toFixed(1);
      const rate = (p2Done / ((Date.now() - p2Start) / 1000)).toFixed(2);
      const eta = ((ocrTargets.length - p2Done) / Math.max(1, p2Done / ((Date.now() - p2Start) / 60000))).toFixed(0);
      console.log(`  [P2 ${p2Done}/${ocrTargets.length}] 💬O:${talkO} ❌X:${talkX} fail:${ocrFail} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
    }

    if (p2Done % SAVE_INTERVAL === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    }

    await sleep(OCR_DELAY);
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // place_id도 못 구한 최종 잔여분 → no_pid 확정
  const finalNoPid = Object.entries(history.crawled).filter(([, b]) => {
    if (b.talktalkVerified === 'ocr' || b.talktalkVerified === 'ocr_fail' || b.talktalkVerified === 'html' || b.talktalkVerified === 'blocked') return false;
    const pid = b.placeUrl ? b.placeUrl.match(/\/(\d{5,})$/)?.[1] : '';
    return !pid;
  });
  for (const [, biz] of finalNoPid) {
    biz.talktalkButton = '미확인';
    biz.talktalkVerified = 'no_pid_final';
  }
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // ═══ 최종 보고 ═══
  const all = Object.values(history.crawled);
  const finalO = all.filter(b => b.talktalkButton === 'O').length;
  const finalX = all.filter(b => b.talktalkButton === 'X').length;
  const finalU = all.filter(b => b.talktalkButton === '미확인').length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('✅ 전체 재스캔 완료!');
  console.log(`📊 최종: 💬O:${finalO} ❌X:${finalX} ?미확인:${finalU}`);
  console.log(`📈 톡톡 보유율: ${(finalO / Math.max(1, finalO + finalX) * 100).toFixed(1)}%`);
  console.log(`📍 P1 place_id: 발견 ${p1Found} / 실패 ${p1Fail}`);
  console.log(`🔍 P2 OCR: O:${talkO} X:${talkX} fail:${ocrFail}`);
  console.log(`⏱️ 총 소요: ${((Date.now() - p1Start) / 60000).toFixed(1)}분`);

  const catStats = {};
  all.forEach(b => {
    const cat = b.category || '기타';
    if (!catStats[cat]) catStats[cat] = { total: 0, talk: 0 };
    catStats[cat].total++;
    if (b.talktalkButton === 'O') catStats[cat].talk++;
  });
  const topCats = Object.entries(catStats).filter(([, s]) => s.talk > 0).sort((a, b) => b[1].talk - a[1].talk).slice(0, 20);
  console.log('\n🏆 톡톡O 업종 TOP 20:');
  topCats.forEach(([cat, s]) => console.log(`  ${cat}: ${s.talk}/${s.total} (${(s.talk / s.total * 100).toFixed(0)}%)`));
}

main().catch(console.error);
