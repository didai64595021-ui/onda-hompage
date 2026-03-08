#!/usr/bin/env node
/**
 * 빠른 1차 스캔: 핀란드에서 place_id + 검색HTML 톡톡 확인
 * iwinv Chrome 불필요 — 네이버 검색만 사용
 * 톡톡 확인: frm=mnmb/pnmb 패턴 + talktalkUrl + 문의 키워드
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const DELAY_MS = 600;

function searchPlace(name, address) {
  return new Promise((resolve) => {
    const addr = (address||'').split(' ').slice(0,2).join(' ');
    const query = encodeURIComponent(`${name} ${addr}`.trim());
    const url = `https://search.naver.com/search.naver?where=nexearch&query=${query}`;
    const req = https.get(url, {
      headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'},
      timeout: 12000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // place_id
        const pids = [...new Set((data.match(/place[\/.](\d{5,})/g) || []))].map(m => m.replace(/place[\/.]/, ''));
        const pid = pids[0] || '';
        
        // 톡톡 확인 — 여러 패턴
        let hasTalk = false;
        
        // 1) frm=mnmb/pnmb (플레이스 블록 내 톡톡 링크)
        if (/talk\.naver\.com(?:\\u002F|\/)[a-zA-Z0-9]+\?frm=(?:mnmb|pnmb|nmb)/.test(data)) {
          hasTalk = true;
        }
        // 2) talktalkUrl (JSON 데이터 내)
        else if (pid && data.includes('talktalkUrl')) {
          const idx = data.indexOf(pid);
          if (idx > 0) {
            const block = data.substring(Math.max(0, idx-5000), idx+5000);
            if (block.includes('talktalkUrl') || block.includes('talkUrl')) hasTalk = true;
          }
        }
        // 3) 문의 버튼 텍스트 (플레이스 블록에서)
        else if (pid) {
          const idx = data.indexOf(pid);
          if (idx > 0) {
            const block = data.substring(Math.max(0, idx-3000), idx+3000);
            // "문의" 버튼 + talk.naver.com 조합
            if (block.includes('talk.naver.com') && !block.includes('W9NI795')) hasTalk = true;
          }
        }
        
        resolve({pid, hasTalk});
      });
    });
    req.on('error', () => resolve({pid:'', hasTalk: false}));
    req.on('timeout', () => { req.destroy(); resolve({pid:'', hasTalk: false}); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// SIGTERM 처리
let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM — 저장 후 종료'); });
process.on('SIGINT', () => { stopping = true; });

async function main() {
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);
  
  const needScan = entries.filter(([,b]) => !b.talktalkButton);
  console.log(`📊 전체: ${entries.length} | 스캔 필요: ${needScan.length}`);
  console.log(`⏱️ 예상: ${Math.round(needScan.length * DELAY_MS / 60000)}분\n`);
  
  let scanned = 0, pidFound = 0, talkO = 0, talkX = 0, noPlace = 0;
  const startTime = Date.now();
  
  for (const [key, biz] of needScan) {
    if (stopping) break;
    
    const {pid, hasTalk} = await searchPlace(biz.name, biz.address || biz.roadAddress);
    scanned++;
    
    if (!pid) {
      biz.talktalkButton = '미확인';
      noPlace++;
    } else {
      if (!biz.placeUrl) biz.placeUrl = `https://m.place.naver.com/place/${pid}`;
      biz.talktalkButton = hasTalk ? 'O' : 'X';
      pidFound++;
      if (hasTalk) talkO++; else talkX++;
    }
    
    if (scanned % 100 === 0) {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      const rate = (scanned / (Date.now() - startTime) * 1000).toFixed(1);
      console.log(`  [${scanned}/${needScan.length}] pid:${pidFound} 💬O:${talkO} ❌X:${talkX} ?:${noPlace} | ${elapsed}분 | ${rate}/초`);
    }
    
    await sleep(DELAY_MS);
  }
  
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  
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
  console.log(`✅ 스캔 완료!`);
  console.log(`📊 전체: O:${finalO} X:${finalX} 미확인:${finalU}`);
  console.log(`📈 톡톡 보유율: ${(finalO/(finalO+finalX)*100).toFixed(1)}%`);
  
  const topCats = Object.entries(catStats)
    .filter(([,s]) => s.talk > 0)
    .sort((a,b) => b[1].talk - a[1].talk)
    .slice(0, 15);
  console.log(`\n🏆 톡톡O 업종 TOP:`);
  topCats.forEach(([cat, s]) => {
    console.log(`  ${cat}: ${s.talk}/${s.total} (${(s.talk/s.total*100).toFixed(0)}%)`);
  });
}

main().catch(console.error);
