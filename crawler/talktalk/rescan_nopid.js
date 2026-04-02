#!/usr/bin/env node
/**
 * rescan_nopid.js v3: 미확인 업체 재스캔
 *
 * PHASE 1: placeUrl 없는 업체 → 프록시로 네이버 검색해서 place_id 추출
 * PHASE 2: placeUrl 있는 업체 → OCR /check로 톡톡 확인
 * PHASE 3: 최종 잔여분 → no_pid_final 확정
 *
 * 개선사항 v3:
 * - decodeHtmlEntities 강화 (&#숫자; &#x16진수; 패턴)
 * - 에러 재시도 로직 (최대 3회, exponential backoff)
 * - 스팸 업체 자동 감지 (이름 50자 초과 → X 확정)
 * - 최종 통계에 처리율 표시
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const PROXY_HOST = '49.247.137.28';
const PROXY_PORT = 3100;
const PROXY_API_KEY = process.env.PROXY_API_KEY || '';
const OCR_HOST = '49.247.137.28';
const OCR_PORT = 3300;

const SEARCH_DELAY = 500;
const OCR_DELAY = 2500;
const SAVE_INTERVAL = 25;
const SPAM_NAME_LIMIT = 50;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM — 안전 종료 중...'); });
process.on('SIGINT', () => { stopping = true; console.log('🛑 SIGINT — 안전 종료 중...'); });

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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

function searchPlaceIdWithRetry(name, address, maxRetries = 3) {
  return new Promise(async (resolve) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const pid = await searchPlaceId(name, address);
      if (pid) { resolve(pid); return; }
      if (attempt < maxRetries) {
        const wait = Math.pow(2, attempt) * 500;
        await sleep(wait);
      }
    }
    resolve('');
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

async function ocrWithRetry(placeId, name, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await ocrCheck(placeId, name);

    if (result && result.status === 'ok') return result;

    if (result && result.status === '429') {
      console.log(`  ⏸️ 429 — 90초 대기 (시도 ${attempt}/${maxRetries})`);
      await sleep(90000);
      continue;
    }

    if (attempt < maxRetries) {
      const wait = Math.pow(2, attempt) * 1000;
      console.log(`  ⚠️ OCR 실패 — ${wait / 1000}초 후 재시도 (${attempt}/${maxRetries})`);
      await sleep(wait);
    }
  }
  return null;
}

async function main() {
  console.log('🔄 no_pid 재스캔 v3 시작...');
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);

  // ═══ PRE-PHASE: 스팸 업체 자동 감지 ═══
  console.log(`\n${'═'.repeat(50)}`);
  console.log('🗑️ PRE-PHASE: 스팸 업체 자동 감지');
  console.log(`${'═'.repeat(50)}`);

  let spamCount = 0;
  for (const [, biz] of entries) {
    if (biz.talktalkVerified === 'spam') continue;
    if (biz.name && biz.name.length > SPAM_NAME_LIMIT) {
      biz.talktalkButton = 'X';
      biz.talktalkVerified = 'spam';
      spamCount++;
    }
  }
  console.log(`  스팸 처리: ${spamCount}건 (이름 ${SPAM_NAME_LIMIT}자 초과)`);
  if (spamCount > 0) fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // 재스캔 대상: no_pid 또는 미스캔
  const noPidEntries = entries.filter(([, b]) =>
    (b.talktalkVerified === 'no_pid' || !b.talktalkVerified) &&
    b.talktalkVerified !== 'spam'
  );
  console.log(`📊 전체: ${entries.length} | 재스캔 대상: ${noPidEntries.length}`);

  // ═══ PHASE 1: place_id 추출 ═══
  console.log(`\n${'═'.repeat(50)}`);
  console.log('📍 PHASE 1: place_id 추출 (iwinv 프록시)');
  console.log(`${'═'.repeat(50)}`);

  let p1Done = 0, p1Found = 0, p1Fail = 0, p1Skip = 0;
  const p1Start = Date.now();

  for (const [key, biz] of noPidEntries) {
    if (stopping) break;

    // 이미 placeUrl 있으면 스킵
    const existingPid = biz.placeUrl ? biz.placeUrl.match(/\/(\d{5,})$/)?.[1] : '';
    if (existingPid) {
      p1Done++;
      p1Skip++;
      continue;
    }

    const pid = await searchPlaceIdWithRetry(biz.name, biz.address || biz.roadAddress);
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
      const remaining = noPidEntries.length - p1Done;
      const eta = (remaining / Math.max(0.01, p1Done / ((Date.now() - p1Start) / 60000))).toFixed(0);
      console.log(`  [P1 ${p1Done}/${noPidEntries.length}] 발견:${p1Found} 실패:${p1Fail} 스킵:${p1Skip} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
    }

    if (p1Done % SAVE_INTERVAL === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    }

    await sleep(SEARCH_DELAY);
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log(`\n✅ PHASE 1 완료: 발견 ${p1Found} / 실패 ${p1Fail} / 스킵 ${p1Skip}`);

  if (stopping) { console.log('🛑 중단됨 — 저장 완료'); return; }

  // ═══ PHASE 2: OCR 톡톡 확인 ═══
  const ocrTargets = Object.entries(history.crawled).filter(([, b]) => {
    if (b.talktalkVerified === 'ocr' || b.talktalkVerified === 'spam') return false;
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

    const result = await ocrWithRetry(pid, biz.name);
    p2Done++;

    if (result && result.status === 'ok') {
      biz.talktalkButton = result.talktalk ? 'O' : 'X';
      biz.talktalkVerified = 'ocr';
      if (result.talk_url) biz.talkUrl = result.talk_url;
      if (result.talktalk) talkO++; else talkX++;
    } else {
      biz.talktalkButton = '미확인';
      biz.talktalkVerified = 'ocr_fail';
      ocrFail++;
    }

    if (p2Done % 10 === 0) {
      const elapsed = ((Date.now() - p2Start) / 60000).toFixed(1);
      const rate = (p2Done / ((Date.now() - p2Start) / 1000)).toFixed(2);
      const remaining = ocrTargets.length - p2Done;
      const eta = (remaining / Math.max(0.01, p2Done / ((Date.now() - p2Start) / 60000))).toFixed(0);
      console.log(`  [P2 ${p2Done}/${ocrTargets.length}] 💬O:${talkO} ❌X:${talkX} fail:${ocrFail} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
    }

    if (p2Done % SAVE_INTERVAL === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    }

    await sleep(OCR_DELAY);
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // ═══ PHASE 3: 최종 잔여분 no_pid_final 확정 ═══
  const finalNoPid = Object.entries(history.crawled).filter(([, b]) => {
    if (['ocr', 'ocr_fail', 'html', 'blocked', 'spam', 'no_pid_final', 'local_check'].includes(b.talktalkVerified)) return false;
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
  const finalSpam = all.filter(b => b.talktalkVerified === 'spam').length;
  const totalProcessed = finalO + finalX + finalSpam;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('✅ 전체 재스캔 완료!');
  console.log(`📊 최종: 💬O:${finalO} ❌X:${finalX} ?미확인:${finalU} 🗑️스팸:${finalSpam}`);
  console.log(`📈 톡톡 보유율: ${(finalO / Math.max(1, finalO + finalX) * 100).toFixed(1)}%`);
  console.log(`📊 처리율: ${(totalProcessed / Math.max(1, all.length) * 100).toFixed(1)}% (${totalProcessed}/${all.length})`);
  console.log(`📍 P1 place_id: 발견 ${p1Found} / 실패 ${p1Fail} / 스킵 ${p1Skip}`);
  console.log(`🔍 P2 OCR: O:${talkO} X:${talkX} fail:${ocrFail}`);
  console.log(`🗑️ 스팸: ${spamCount}건 신규 처리`);
  console.log(`📋 no_pid_final: ${finalNoPid.length}건 확정`);
  console.log(`⏱️ 총 소요: ${((Date.now() - p1Start) / 60000).toFixed(1)}분`);

  // 업종별 통계 TOP 20
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

  console.log('[STEP-DONE] rescan_nopid 완료');
}

main().catch(console.error);
