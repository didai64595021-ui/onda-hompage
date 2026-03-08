#!/usr/bin/env node
/**
 * 핀란드에서 place_id 추출 (네이버 검색 OK)
 * + iwinv button checker API 호출로 톡톡 O/X 확인
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const BUTTON_CHECKER = 'http://49.247.137.28:3300/check'; // iwinv
const DELAY_MS = 800;
const SAVE_INTERVAL = 50;

function searchPlaceId(name, address) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(`${name} ${(address||'').split(' ').slice(0,2).join(' ')}`.trim());
    const url = `https://search.naver.com/search.naver?where=nexearch&query=${query}`;
    const req = https.get(url, {
      headers: {'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0'},
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const pids = [...new Set(data.match(/place[\/.](\d{5,})/g) || [])].map(m => m.replace(/place[\/.]/, ''));
        // 검색 HTML에서 톡톡 확인 (frm=mnmb or pnmb or talktalkUrl near place_id)
        const hasTalkInSearch = /talk\.naver\.com(?:\\u002F|\/)[a-zA-Z0-9]+\?frm=(?:mnmb|pnmb|nmb)/.test(data) ||
          (pids[0] && data.indexOf(pids[0]) > 0 && data.substring(Math.max(0, data.indexOf(pids[0])-3000), data.indexOf(pids[0])+3000).includes('talktalkUrl'));
        resolve({pid: pids[0] || '', hasTalkInSearch});
      });
    });
    req.on('error', () => resolve({pid:'', hasTalkInSearch: false}));
    req.on('timeout', () => { req.destroy(); resolve({pid:'', hasTalkInSearch: false}); });
  });
}

function checkButton(placeId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({place_id: placeId});
    const url = new URL(BUTTON_CHECKER);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: '/check',
      method: 'POST',
      headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
      timeout: 15000
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
  
  // placeUrl 없는 것만
  const todo = entries.filter(([,b]) => !b.placeUrl);
  // 이미 talktalkButton 있는 건 스킵
  const needScan = todo.filter(([,b]) => !b.talktalkButton);
  
  console.log(`📊 전체: ${entries.length} | place_id 필요: ${todo.length} | 스캔 필요: ${needScan.length}`);
  
  let scanned = 0, found = 0, talkO = 0, talkX = 0, noPlace = 0;
  
  for (const [key, biz] of needScan) {
    // 1) 핀란드에서 place_id 추출 + 검색 HTML 톡톡 확인
    const {pid, hasTalkInSearch} = await searchPlaceId(biz.name, biz.address || biz.roadAddress);
    scanned++;
    
    if (!pid) {
      biz.talktalkButton = '미확인';
      noPlace++;
    } else {
      biz.placeUrl = `https://m.place.naver.com/place/${pid}`;
      found++;
      
      if (hasTalkInSearch) {
        // 검색에서 이미 톡톡 확인 → iwinv 호출 불필요
        biz.talktalkButton = 'O';
        talkO++;
      } else {
        // 2) iwinv에서 문의 버튼 확인 (검색에서 못 찾은 경우만)
        const result = await checkButton(pid);
        if (result && result.status === 'ok') {
          biz.talktalkButton = result.talktalk ? 'O' : 'X';
          if (result.talktalk) talkO++;
          else talkX++;
        } else {
          biz.talktalkButton = 'X';
          talkX++;
        }
      }
    }
    
    if (scanned % 50 === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
      console.log(`  [${scanned}/${needScan.length}] pid:${found} O:${talkO} X:${talkX} 미확인:${noPlace}`);
    }
    
    await sleep(DELAY_MS);
  }
  
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  
  const totalO = Object.values(history.crawled).filter(b => b.talktalkButton === 'O').length;
  const totalX = Object.values(history.crawled).filter(b => b.talktalkButton === 'X').length;
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ 완료! 스캔: ${scanned} | pid발견: ${found} | O:${talkO} X:${talkX}`);
  console.log(`📊 전체 DB: O:${totalO} X:${totalX}`);
}

main().catch(console.error);
