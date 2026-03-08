#!/usr/bin/env node
/**
 * 전체 DB 톡톡 활성화 스캔
 * iwinv Place Checker API로 모든 업체 조회 → history.json에 talktalkButton O/X 업데이트
 * 
 * 사용: node batch_scan.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const CHECKER_URL = 'http://localhost:3201/check';
const DELAY_MS = 600; // 0.6초 간격 (rate limit 방지)
const SAVE_INTERVAL = 100; // 100건마다 저장

function checkTalkTalk(name, address) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ name, address: address ? address.split(' ').slice(0, 2).join(' ') : '' });
    const url = new URL(CHECKER_URL);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);
  
  // 이미 스캔된 건 스킵
  const todo = entries.filter(([, b]) => !b.talktalkButton || b.talktalkButton === '미확인');
  
  console.log(`📊 전체: ${entries.length}건 | 스캔필요: ${todo.length}건 | 이미완료: ${entries.length - todo.length}건`);
  console.log(`⏱️ 예상 소요: ${Math.round(todo.length * DELAY_MS / 60000)}분`);
  console.log('');
  
  let scanned = 0, talkO = 0, talkX = 0, errors = 0;
  const startTime = Date.now();
  
  for (const [key, biz] of todo) {
    const result = await checkTalkTalk(biz.name, biz.address || biz.roadAddress || '');
    scanned++;
    
    if (result) {
      if (result.talktalk) {
        biz.talktalkButton = 'O';
        biz.talktalkId = result.talktalk_id || '';
        talkO++;
      } else {
        biz.talktalkButton = 'X';
        talkX++;
      }
    } else {
      biz.talktalkButton = '미확인';
      errors++;
    }
    
    // 로그 (50건마다)
    if (scanned % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      const rate = (scanned / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(`  [${scanned}/${todo.length}] 💬O:${talkO} ❌X:${talkX} ❓:${errors} | ${elapsed}분 경과 | ${rate}/초`);
    }
    
    // 중간 저장
    if (scanned % SAVE_INTERVAL === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    }
    
    await sleep(DELAY_MS);
  }
  
  // 최종 저장
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  
  const totalO = Object.values(history.crawled).filter(b => b.talktalkButton === 'O').length;
  const totalX = Object.values(history.crawled).filter(b => b.talktalkButton === 'X').length;
  
  console.log('');
  console.log('═'.repeat(50));
  console.log(`✅ 스캔 완료!`);
  console.log(`📊 이번 스캔: ${scanned}건 (💬O:${talkO} ❌X:${talkX} ❓:${errors})`);
  console.log(`📊 전체 DB: 💬톡톡O: ${totalO}건 | ❌X: ${totalX}건`);
  console.log(`⏱️ 소요: ${((Date.now() - startTime) / 60000).toFixed(1)}분`);
  console.log('═'.repeat(50));
}

main().catch(console.error);
