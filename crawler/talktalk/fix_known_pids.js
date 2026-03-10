#!/usr/bin/env node
/**
 * fix_known_pids.js
 * placeUrl이 있지만 talktalkVerified === 'no_pid'인 업체 OCR 재확인
 * - iwinv OCR /check로 톡톡 확인
 * - 429 시 90초 대기 후 재시도
 * - 25건마다 저장, 10건마다 진행률 출력
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const OCR_HOST = '49.247.137.28';
const OCR_PORT = 3300;
const OCR_DELAY = 2500;
const SAVE_INTERVAL = 25;

// CLI: --test N 으로 테스트 모드 (N건만 처리)
const testIdx = process.argv.indexOf('--test');
const TEST_LIMIT = testIdx !== -1 ? parseInt(process.argv[testIdx + 1], 10) : 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM — 안전 종료 중...'); });
process.on('SIGINT', () => { stopping = true; console.log('🛑 SIGINT — 안전 종료 중...'); });

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
      console.log(`  ⚠️ 실패 — ${wait / 1000}초 후 재시도 (${attempt}/${maxRetries})`);
      await sleep(wait);
    }
  }
  return null;
}

async function main() {
  console.log('[STEP-DONE] fix_known_pids 시작');
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);

  // placeUrl 있고 talktalkVerified === 'no_pid'인 것만
  const targets = entries.filter(([, b]) => {
    if (b.talktalkVerified !== 'no_pid') return false;
    const pid = b.placeUrl ? b.placeUrl.match(/\/(\d{5,})$/)?.[1] : '';
    return !!pid;
  });

  const total = TEST_LIMIT > 0 ? Math.min(TEST_LIMIT, targets.length) : targets.length;
  console.log(`📊 대상: ${targets.length}건 (placeUrl 있는 no_pid)${TEST_LIMIT > 0 ? ` | 테스트모드: ${total}건만 처리` : ''}`);

  let done = 0, talkO = 0, talkX = 0, fail = 0;
  const startTime = Date.now();

  for (let i = 0; i < total; i++) {
    if (stopping) break;

    const [key, biz] = targets[i];
    const pid = biz.placeUrl.match(/\/(\d{5,})$/)?.[1];
    if (!pid) continue;

    const result = await ocrWithRetry(pid, biz.name);
    done++;

    if (result && result.status === 'ok') {
      biz.talktalkButton = result.talktalk ? 'O' : 'X';
      biz.talktalkVerified = 'ocr';
      if (result.talk_url) biz.talkUrl = result.talk_url;
      if (result.talktalk) talkO++; else talkX++;
    } else {
      biz.talktalkButton = '미확인';
      biz.talktalkVerified = 'ocr_fail';
      fail++;
    }

    if (done % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      const rate = (done / ((Date.now() - startTime) / 1000)).toFixed(2);
      const remaining = total - done;
      const eta = (remaining / Math.max(0.01, done / ((Date.now() - startTime) / 60000))).toFixed(0);
      console.log(`  [${done}/${total}] 💬O:${talkO} ❌X:${talkX} fail:${fail} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
    }

    if (done % SAVE_INTERVAL === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
      if (TEST_LIMIT > 0) console.log(`  💾 저장 완료 (${done}건)`);
    }

    await sleep(OCR_DELAY);
  }

  // 최종 저장
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n${'═'.repeat(50)}`);
  console.log('✅ fix_known_pids 완료!');
  console.log(`📊 처리: ${done}/${total} | 💬O:${talkO} ❌X:${talkX} fail:${fail}`);
  console.log(`📈 톡톡 보유율: ${(talkO / Math.max(1, talkO + talkX) * 100).toFixed(1)}%`);
  console.log(`⏱️ 소요: ${elapsed}분`);
  if (stopping) console.log('🛑 중단됨 — 진행분까지 저장 완료');
  console.log('[STEP-DONE] fix_known_pids 완료');
}

main().catch(console.error);
