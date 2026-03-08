#!/usr/bin/env node
/**
 * 500건 배치 스캔 — 정확도 최적화용
 * 사용: node batch500.js [배치번호]
 * 배치0=0~499, 배치1=500~999, ...
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const BATCH_SIZE = 500;
const SEARCH_DELAY = 600;
const PLACE_DELAY = 1200;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';

function cleanName(n) {
  return n.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/[^\w가-힣\s&().·-]/g,' ').replace(/\s+/g,' ').trim();
}

function httpsGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {headers:{'User-Agent':UA},timeout:12000}, (res) => {
      if (res.statusCode===302||res.statusCode===301) {
        const loc=res.headers.location;
        if(loc) return httpsGet(loc.startsWith('http')?loc:`https://m.place.naver.com${loc}`).then(resolve);
      }
      if (res.statusCode===429) return resolve({status:429,data:''});
      let data='';
      res.on('data',c=>{if(data.length<500000)data+=c});
      res.on('end',()=>resolve({status:res.statusCode,data}));
    });
    req.on('error',()=>resolve({status:0,data:''}));
    req.on('timeout',()=>{req.destroy();resolve({status:0,data:''})});
  });
}

async function searchPlaceId(name, address) {
  const cn=cleanName(name);
  const addr3=(address||'').split(' ').slice(0,3).join(' ');
  const addr2=(address||'').split(' ').slice(0,2).join(' ');
  const sn=cn.length>30?cn.substring(0,30):cn;
  const ft=cn.split(/[,\/·\s]+/)[0];
  const ws=cn.split(/\s+/);
  const brand=ws.length>=2?ws.slice(0,2).join(' '):'';
  
  const qs=[`${sn} ${addr3}`,sn];
  if(cn.length>15) qs.push(`${cn.substring(0,15)} ${addr2}`);
  if(ft.length>=2&&ft!==sn) { qs.push(`${ft} ${addr3}`); qs.push(`${ft} ${addr2}`); }
  if(brand&&brand!==sn&&brand!==ft) qs.push(`${brand} ${addr3}`);
  qs.push(cn.substring(0,15));
  
  const unique=[...new Set(qs.map(q=>q.trim()).filter(q=>q.length>2))];
  for(const q of unique){
    const r=await httpsGet(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(q)}`);
    if(r.status===200){
      const pids=[...new Set((r.data.match(/place[\/.](\d{5,})/g)||[]))].map(m=>m.replace(/place[\/.]/,''));
      if(pids[0]) return pids[0];
    }
    await sleep(SEARCH_DELAY);
  }
  return '';
}

function checkTalkTalk(pid) {
  return new Promise(async(resolve)=>{
    const r=await httpsGet(`https://m.place.naver.com/place/${pid}`);
    if(r.status===429) return resolve({status:429,talktalk:false,talkUrl:'',talkId:''});
    if(r.status!==200) return resolve({status:r.status,talktalk:false,talkUrl:'',talkId:''});
    const match=r.data.match(/talktalkUrl"\s*:\s*"(http[^"]+)"/);
    if(match){
      const tidMatch=match[1].match(/talk\.naver\.com(?:\\u002F|\/)([a-zA-Z0-9]+)/);
      resolve({status:200,talktalk:true,talkUrl:match[1].replace(/\\u002F/g,'/'),talkId:tidMatch?tidMatch[1]:''});
    } else {
      resolve({status:200,talktalk:false,talkUrl:'',talkId:''});
    }
  });
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function main() {
  const batchNum = parseInt(process.argv[2]||'0');
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH,'utf-8'));
  const allEntries = Object.entries(history.crawled);
  
  const start = batchNum * BATCH_SIZE;
  const end = Math.min(start + BATCH_SIZE, allEntries.length);
  const batch = allEntries.slice(start, end);
  
  console.log(`\n🔄 배치 #${batchNum} (${start}~${end-1}) — ${batch.length}건`);
  console.log(`${'═'.repeat(50)}`);
  
  let scanned=0, pidNew=0, pidExist=0, talkO=0, talkX=0, noPlace=0, blocked429=0;
  const startTime=Date.now();
  const catStats={};
  
  for(const [key,biz] of batch){
    // place_id
    let pid=biz.placeUrl?biz.placeUrl.split('/').pop():'';
    if(!pid){
      pid=await searchPlaceId(biz.name, biz.address||biz.roadAddress);
      if(pid){ biz.placeUrl=`https://m.place.naver.com/place/${pid}`; pidNew++; }
      await sleep(SEARCH_DELAY);
    } else { pidExist++; }
    
    if(!pid){
      biz.talktalkButton='미확인'; biz.talktalkVerified='no_pid'; noPlace++;
      scanned++;
      continue;
    }
    
    // talktalkUrl 체크
    const r=await checkTalkTalk(pid);
    scanned++;
    
    if(r.status===429){
      blocked429++;
      biz.talktalkButton='미확인'; biz.talktalkVerified='blocked';
      console.log(`  ⚠️ 429 at #${start+scanned} — 60초 대기`);
      await sleep(60000);
    } else {
      biz.talktalkButton=r.talktalk?'O':'X';
      biz.talktalkVerified='html';
      if(r.talkUrl) biz.talkUrl=r.talkUrl;
      if(r.talkId) biz.talkId=r.talkId;
      if(r.talktalk) talkO++; else talkX++;
      
      // 업종 통계
      const cat=biz.category||'기타';
      if(!catStats[cat]) catStats[cat]={total:0,talk:0};
      catStats[cat].total++;
      if(r.talktalk) catStats[cat].talk++;
    }
    
    if(scanned%50===0){
      const elapsed=((Date.now()-startTime)/60000).toFixed(1);
      console.log(`  [${scanned}/${batch.length}] O:${talkO} X:${talkX} ?:${noPlace} 429:${blocked429} | ${elapsed}분`);
    }
    
    await sleep(PLACE_DELAY);
  }
  
  // 저장
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history,null,2));
  
  // 결과 보고
  const elapsed=((Date.now()-startTime)/60000).toFixed(1);
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ 배치 #${batchNum} 완료 (${elapsed}분)`);
  console.log(`📊 결과: O:${talkO} X:${talkX} 미확인:${noPlace} 429:${blocked429}`);
  console.log(`📈 톡톡 보유율: ${talkO+talkX>0?(talkO/(talkO+talkX)*100).toFixed(1):0}%`);
  console.log(`🔍 place_id: 기존${pidExist} + 신규${pidNew} = ${pidExist+pidNew}, 미발견${noPlace}`);
  
  // 업종별 TOP
  const topCats=Object.entries(catStats).filter(([,s])=>s.talk>0).sort((a,b)=>b[1].talk-a[1].talk).slice(0,10);
  if(topCats.length>0){
    console.log(`\n🏆 톡톡O 업종:`);
    topCats.forEach(([cat,s])=>console.log(`  ${cat}: ${s.talk}/${s.total} (${(s.talk/s.total*100).toFixed(0)}%)`));
  }
  
  // 에러 케이스 목록
  const errors=batch.filter(([,b])=>b.talktalkButton==='미확인');
  if(errors.length>0){
    console.log(`\n⚠️ 미확인 업체 (${errors.length}건):`);
    errors.slice(0,10).forEach(([,b])=>console.log(`  ${b.name} | ${(b.address||'').substring(0,20)} | ${b.talktalkVerified}`));
  }
}

main().catch(console.error);
