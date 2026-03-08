#!/usr/bin/env node
/**
 * 터보 스캔: place 페이지 HTML에서 talktalkUrl 패턴으로 O/X 판별
 * Chrome 불필요 — curl/https만 사용
 * 
 * 1단계: place_id 없으면 네이버 검색으로 추출
 * 2단계: m.place.naver.com/place/{pid} HTML에서 talktalkUrl 확인
 *   - talktalkUrl":"http://..." → O (talk_id도 추출)
 *   - talktalkUrl":null 또는 "" → X
 * 
 * 429 방지: 요청 간격 조절 + 429시 자동 대기
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const SEARCH_DELAY = 600;
const PLACE_DELAY = 1200;  // 429 방지
const SAVE_INTERVAL = 50;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';

function httpsGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {'User-Agent': UA},
      timeout: 12000
    }, (res) => {
      // follow redirects
      if (res.statusCode === 302 || res.statusCode === 301) {
        const loc = res.headers.location;
        if (loc) return httpsGet(loc.startsWith('http') ? loc : `https://m.place.naver.com${loc}`).then(resolve);
      }
      if (res.statusCode === 429) {
        resolve({status: 429, data: ''});
        return;
      }
      let data = '';
      res.on('data', c => { if (data.length < 500000) data += c; });
      res.on('end', () => resolve({status: res.statusCode, data}));
    });
    req.on('error', () => resolve({status: 0, data: ''}));
    req.on('timeout', () => { req.destroy(); resolve({status: 0, data: ''}); });
  });
}

function cleanName(name) {
  // HTML 엔티티 디코딩 + 특수문자 정리
  return name
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[^\w가-힣\s&().·-]/g, ' ')  // 특수문자 제거
    .replace(/\s+/g, ' ').trim();
}

function extractAddr(address) {
  // 주소에서 시/구/동 단위만 추출
  const parts = (address||'').split(' ').filter(p => p.length > 0);
  // 시/도 + 구/군 + 동/읍/면
  return parts.slice(0, 3).join(' ');
}

async function searchPlaceId(name, address) {
  const cleanedName = cleanName(name);
  const addr3 = extractAddr(address);
  const addr2 = (address||'').split(' ').slice(0,2).join(' ');
  
  // 검색어 후보 (우선순위)
  const queries = [];
  
  // 1) 정제된 이름(30자 제한) + 주소 3단위
  const shortName = cleanedName.length > 30 ? cleanedName.substring(0, 30) : cleanedName;
  queries.push(`${shortName} ${addr3}`.trim());
  
  // 2) 이름만 (주소 없이)
  queries.push(shortName);
  
  // 3) 이름 앞 15자 + 주소 2단위
  if (cleanedName.length > 15) {
    queries.push(`${cleanedName.substring(0, 15)} ${addr2}`.trim());
  }
  
  // 4) 쉼표/슬래시로 구분된 이름 → 첫 번째 키워드 + 주소
  const firstToken = cleanedName.split(/[,\/·\s]+/)[0];
  if (firstToken.length >= 2 && firstToken !== shortName) {
    queries.push(`${firstToken} ${addr3}`.trim());
    queries.push(`${firstToken} ${addr2}`.trim());
  }
  
  // 5) 브랜드명 추출 시도 (공백 기준 첫 2단어)
  const words = cleanedName.split(/\s+/);
  if (words.length >= 2) {
    const brand = words.slice(0, 2).join(' ');
    if (brand !== shortName && brand !== firstToken) {
      queries.push(`${brand} ${addr3}`.trim());
    }
  }
  
  // 6) 이름만 (15자)
  queries.push(cleanedName.substring(0, 15));
  
  // 중복 제거
  const uniqueQueries = [...new Set(queries)];
  
  for (const q of uniqueQueries) {
    const encoded = encodeURIComponent(q);
    const r = await httpsGet(`https://search.naver.com/search.naver?where=nexearch&query=${encoded}`);
    if (r.status === 200) {
      const pids = [...new Set((r.data.match(/place[\/.](\d{5,})/g) || []))].map(m => m.replace(/place[\/.]/, ''));
      if (pids[0]) return pids[0];
    }
    await sleep(SEARCH_DELAY);
  }
  return '';
}

function checkTalkTalk(placeId) {
  return new Promise(async (resolve) => {
    const r = await httpsGet(`https://m.place.naver.com/place/${placeId}`);
    if (r.status === 429) return resolve({status: 429, talktalk: false, talkUrl: ''});
    if (r.status !== 200) return resolve({status: r.status, talktalk: false, talkUrl: ''});
    
    // talktalkUrl 패턴 확인
    const match = r.data.match(/talktalkUrl"\s*:\s*"(http[^"]+)"/);
    if (match) {
      // talk_id 추출
      const tidMatch = match[1].match(/talk\.naver\.com(?:\\u002F|\/)([a-zA-Z0-9]+)/);
      const talkId = tidMatch ? tidMatch[1] : '';
      const talkUrl = match[1].replace(/\\u002F/g, '/');
      resolve({status: 200, talktalk: true, talkUrl, talkId});
    } else {
      // null 또는 빈 문자열
      resolve({status: 200, talktalk: false, talkUrl: ''});
    }
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let stopping = false;
process.on('SIGTERM', () => { stopping = true; console.log('🛑 SIGTERM'); });
process.on('SIGINT', () => { stopping = true; });

async function main() {
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);
  
  const needScan = entries.filter(([,b]) => !b.talktalkVerified);
  console.log(`📊 전체: ${entries.length} | 스캔 필요: ${needScan.length}`);
  
  let scanned=0, pidNew=0, talkO=0, talkX=0, noPlace=0, blocked=0;
  let consecutiveBlocks = 0;
  const startTime = Date.now();
  
  for (const [key, biz] of needScan) {
    if (stopping) break;
    
    // 1) place_id 확보
    let pid = biz.placeUrl ? biz.placeUrl.split('/').pop() : '';
    if (!pid) {
      pid = await searchPlaceId(biz.name, biz.address || biz.roadAddress);
      if (pid) {
        biz.placeUrl = `https://m.place.naver.com/place/${pid}`;
        pidNew++;
      }
      await sleep(SEARCH_DELAY);
    }
    
    if (!pid) {
      biz.talktalkButton = '미확인';
      biz.talktalkVerified = 'no_pid';
      noPlace++;
      scanned++;
      if (scanned % SAVE_INTERVAL === 0) saveAndLog();
      continue;
    }
    
    // 2) place 페이지에서 talktalkUrl 확인
    const result = await checkTalkTalk(pid);
    scanned++;
    
    if (result.status === 429) {
      consecutiveBlocks++;
      blocked++;
      biz.talktalkButton = '미확인';
      biz.talktalkVerified = 'blocked';
      
      // 연속 429 → 대기 시간 증가
      const waitSec = Math.min(consecutiveBlocks * 30, 300);
      console.log(`    ⚠️ 429 (연속 ${consecutiveBlocks}회) → ${waitSec}초 대기`);
      await sleep(waitSec * 1000);
    } else {
      consecutiveBlocks = 0;
      biz.talktalkButton = result.talktalk ? 'O' : 'X';
      biz.talktalkVerified = 'html';
      if (result.talkUrl) biz.talkUrl = result.talkUrl;
      if (result.talkId) biz.talkId = result.talkId;
      if (result.talktalk) talkO++; else talkX++;
    }
    
    if (scanned % SAVE_INTERVAL === 0) saveAndLog();
    await sleep(PLACE_DELAY);
  }
  
  saveAndLog();
  
  // 최종 통계
  const all = Object.values(history.crawled);
  const finalO = all.filter(b => b.talktalkButton === 'O').length;
  const finalX = all.filter(b => b.talktalkButton === 'X').length;
  const finalU = all.filter(b => !b.talktalkButton || b.talktalkButton === '미확인').length;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ 터보 스캔 완료!`);
  console.log(`📊 전체: O:${finalO} X:${finalX} 미확인:${finalU}`);
  console.log(`📈 톡톡 보유율: ${finalO > 0 ? (finalO/(finalO+finalX)*100).toFixed(1) : 0}%`);
  console.log(`⚠️ 429 차단: ${blocked}건`);
  
  // 업종별
  const catStats = {};
  all.forEach(b => {
    const cat = b.category || '기타';
    if (!catStats[cat]) catStats[cat] = {total:0, talk:0};
    catStats[cat].total++;
    if (b.talktalkButton === 'O') catStats[cat].talk++;
  });
  const topCats = Object.entries(catStats).filter(([,s])=>s.talk>0).sort((a,b)=>b[1].talk-a[1].talk).slice(0,20);
  console.log(`\n🏆 톡톡O 업종 TOP 20:`);
  topCats.forEach(([cat,s]) => console.log(`  ${cat}: ${s.talk}/${s.total} (${(s.talk/s.total*100).toFixed(0)}%)`));
  
  function saveAndLog() {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    const elapsed = ((Date.now()-startTime)/60000).toFixed(1);
    const rate = scanned > 0 ? (scanned/((Date.now()-startTime)/1000)).toFixed(2) : '0';
    const remaining = needScan.length - scanned;
    const eta = scanned > 0 ? (remaining / (scanned/((Date.now()-startTime)/60000))).toFixed(0) : '?';
    console.log(`  [${scanned}/${needScan.length}] pid신규:${pidNew} 💬O:${talkO} ❌X:${talkX} ?:${noPlace} 429:${blocked} | ${elapsed}분 | ${rate}/초 | ETA:${eta}분`);
  }
}

main().catch(console.error);
