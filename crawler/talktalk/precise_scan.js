#!/usr/bin/env node
/**
 * 정밀 스캔 v1: 핀란드 place_id 추출 + iwinv OCR(실제 place 페이지 DOM) 확인
 * 느리지만 정확 — false negative 최소화
 * 
 * 1단계: place_id 없는 업체 → 네이버 검색으로 추출
 * 2단계: place_id 있는 업체 → iwinv OCR checker로 문의 버튼 확인
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const OCR_CHECKER = 'http://49.247.137.28:3300/check';
const SEARCH_DELAY = 400;   // 프록시 검색 간격 (ms) — 한국 IP이므로 CAPTCHA 없음
const OCR_DELAY = 2000;     // OCR 간격 (ms) — Chrome 안정성
const SAVE_INTERVAL = 100;

// iwinv 프록시(한국 IP) 경유로 place_id 추출 — 핀란드 직접 요청 시 CAPTCHA 차단됨
const PROXY_HOST = '49.247.137.28';
const PROXY_PORT = 3100;
const PROXY_API_KEY = process.env.PROXY_API_KEY || '';

function searchPlaceId(name, address) {
  return new Promise((resolve) => {
    const addr = (address||'').split(' ').slice(0,2).join(' ');
    const query = `${name} ${addr}`.trim();
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
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const pids = [...new Set((data.match(/place[\/.](\d{5,})/g) || []))].map(m => m.replace(/place[\/.]/, ''));
        resolve(pids[0] || '');
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.write(body);
    req.end();
  });
}

function ocrCheck(placeId, name) {
  return new Promise((resolve) => {
    const body = JSON.stringify({place_id: placeId, name});
    const req = http.request({
      hostname: '49.247.137.28', port: 3300, path: '/check',
      method: 'POST',
      headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', (e) => { console.log(`    ⚠️ OCR 에러: ${e.message}`); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM'); });
process.on('SIGINT', () => { stopping = true; });

async function main() {
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);
  
  // talktalkVerified가 없거나 no_pid인 것 재스캔 (프록시로 place_id 재시도)
  const needScan = entries.filter(([,b]) => !b.talktalkVerified || b.talktalkVerified === 'no_pid');
  
  console.log(`📊 전체: ${entries.length} | OCR 검증 필요: ${needScan.length}`);
  
  let scanned = 0, pidFound = 0, pidExisted = 0, talkO = 0, talkX = 0, noPlace = 0, ocrFail = 0;
  const startTime = Date.now();
  
  for (const [key, biz] of needScan) {
    if (stopping) break;
    
    // 1단계: place_id 확보
    let pid = biz.placeUrl ? biz.placeUrl.split('/').pop() : '';
    
    if (!pid) {
      pid = await searchPlaceId(biz.name, biz.address || biz.roadAddress);
      if (pid) {
        biz.placeUrl = `https://m.place.naver.com/place/${pid}`;
        pidFound++;
      }
      await sleep(SEARCH_DELAY);
    } else {
      pidExisted++;
    }
    
    if (!pid) {
      biz.talktalkButton = '미확인';
      biz.talktalkVerified = 'no_pid';
      noPlace++;
      scanned++;
      if (scanned % SAVE_INTERVAL === 0) saveAndLog();
      continue;
    }
    
    // 2단계: iwinv OCR 실제 확인
    const result = await ocrCheck(pid, biz.name);
    scanned++;
    
    if (result && result.status === 'ok') {
      biz.talktalkButton = result.talktalk ? 'O' : 'X';
      biz.talktalkVerified = 'ocr';
      if (result.talk_url) biz.talkUrl = result.talk_url;
      if (result.talktalk) talkO++; else talkX++;
    } else if (result && result.status === '429') {
      // 429 → 60초 대기 후 재시도
      console.log('    ⏸️ 429 — 60초 대기');
      await sleep(60000);
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
    
    if (scanned % SAVE_INTERVAL === 0) saveAndLog();
    await sleep(OCR_DELAY);
  }
  
  saveAndLog();
  
  // 최종 통계
  const all = Object.values(history.crawled);
  const finalO = all.filter(b => b.talktalkButton === 'O').length;
  const finalX = all.filter(b => b.talktalkButton === 'X').length;
  const finalU = all.filter(b => b.talktalkButton === '미확인').length;
  
  // 업종별 톡톡 비율
  const catStats = {};
  all.forEach(b => {
    const cat = b.category || '기타';
    if (!catStats[cat]) catStats[cat] = {total:0, talk:0};
    catStats[cat].total++;
    if (b.talktalkButton === 'O') catStats[cat].talk++;
  });
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ 정밀 스캔 완료!`);
  console.log(`📊 전체: O:${finalO} X:${finalX} 미확인:${finalU}`);
  console.log(`📈 톡톡 보유율: ${(finalO/(finalO+finalX)*100).toFixed(1)}%`);
  console.log(`🔍 OCR 실패: ${ocrFail}건`);
  
  const topCats = Object.entries(catStats)
    .filter(([,s]) => s.talk > 0)
    .sort((a,b) => b[1].talk - a[1].talk)
    .slice(0, 20);
  console.log(`\n🏆 톡톡O 업종 TOP 20:`);
  topCats.forEach(([cat, s]) => {
    console.log(`  ${cat}: ${s.talk}/${s.total} (${(s.talk/s.total*100).toFixed(0)}%)`);
  });
  
  function saveAndLog() {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
    const rate = (scanned / ((Date.now() - startTime)/1000)).toFixed(2);
    const eta = ((needScan.length - scanned) / (scanned / ((Date.now()-startTime)/60000))).toFixed(0);
    console.log(`  [${scanned}/${needScan.length}] pid신규:${pidFound} 💬O:${talkO} ❌X:${talkX} ?:${noPlace} fail:${ocrFail} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
  }
}

main().catch(console.error);
