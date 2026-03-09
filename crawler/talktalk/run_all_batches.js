#!/usr/bin/env node
/**
 * 전체 배치 자동 실행 — 500건씩 스캔 + 배치별 검증 로그
 * 429 발생 시 간격 자동 조절 (1.2초 → 2초 → 3초)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const {execSync} = require('child_process');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const BATCH_SIZE = 500;
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let SEARCH_DELAY = 400;
let PLACE_DELAY = 800;  // 429 0건이므로 속도 향상. 429 시 자동 증가.

function cleanName(n) {
  return n.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/[^\w가-힣\s&().·-]/g,' ').replace(/\s+/g,' ').trim();
}

function httpsGet(url, ua) {
  return new Promise((resolve) => {
    const req = https.get(url, {headers:{'User-Agent':ua||UA_DESKTOP},timeout:15000}, (res) => {
      if (res.statusCode===302||res.statusCode===301) {
        const loc=res.headers.location;
        if(loc) return httpsGet(loc.startsWith('http')?loc:`https://m.place.naver.com${loc}`, ua).then(resolve);
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
  // 최대 3번만 시도 (stuck 방지)
  for(const q of unique.slice(0,3)){
    const r=await httpsGet(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(q)}`, UA_DESKTOP);
    if(r.status===200 && r.data.length > 1000){
      const pids=[...new Set((r.data.match(/place[\/.](\d{5,})/g)||[]))].map(m=>m.replace(/place[\/.]/,''));
      if(pids[0]) return pids[0];
    }
    await sleep(SEARCH_DELAY);
  }
  return '';
}

function checkTalkTalk(pid) {
  return new Promise((resolve)=>{
    try{
      const html=execSync(`curl -sL --compressed -m 10 "https://m.place.naver.com/place/${pid}" -H "User-Agent: ${UA_MOBILE}"`,{maxBuffer:5*1024*1024,timeout:15000}).toString();
      if(html.length<500) return resolve({status:429,talktalk:false,talkUrl:'',talkId:''});
      const match=html.match(/talktalkUrl"\s*:\s*"(http[^"]+)"/);
      if(match){
        const tidMatch=match[1].match(/talk\.naver\.com(?:\\u002F|\/)([a-zA-Z0-9]+)/);
        resolve({status:200,talktalk:true,talkUrl:match[1].replace(/\\u002F/g,'/'),talkId:tidMatch?tidMatch[1]:''});
      } else {
        resolve({status:200,talktalk:false,talkUrl:'',talkId:''});
      }
    }catch(e){
      resolve({status:0,talktalk:false,talkUrl:'',talkId:''});
    }
  });
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

let stopping=false;
process.on('SIGTERM',()=>{stopping=true;console.log('🛑 SIGTERM');});
process.on('SIGINT',()=>{stopping=true;});

async function main() {
  let history;
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH,'utf-8'));
  } catch(e) {
    // history.json 깨짐 — 백업에서 복구 시도
    const bak=HISTORY_PATH+'.bak';
    if(fs.existsSync(bak)){
      console.log('⚠️ history.json 깨짐 — 백업에서 복구');
      history = JSON.parse(fs.readFileSync(bak,'utf-8'));
    } else {
      console.log('❌ history.json 깨짐, 백업 없음. 종료.');
      process.exit(1);
    }
  }
  const allEntries = Object.entries(history.crawled);
  const totalBatches = Math.ceil(allEntries.length / BATCH_SIZE);
  
  // 이미 완료된 배치 스킵
  const needScan = allEntries.filter(([,b])=>!b.talktalkVerified);
  const startIdx = allEntries.length - needScan.length;
  const startBatch = Math.floor(startIdx / BATCH_SIZE);
  
  console.log(`📊 전체: ${allEntries.length} | 완료: ${startIdx} | 남은: ${needScan.length}`);
  console.log(`📦 총 ${totalBatches}배치 | 시작: 배치#${startBatch}`);
  console.log(`⏱️ 간격: 검색${SEARCH_DELAY}ms / place${PLACE_DELAY}ms\n`);
  
  let globalO=0, globalX=0, globalNoPlace=0, global429=0;
  const globalStart=Date.now();
  
  for(let batch=startBatch; batch<totalBatches && !stopping; batch++){
    const start=batch*BATCH_SIZE;
    const end=Math.min(start+BATCH_SIZE, allEntries.length);
    const entries=allEntries.slice(start,end).filter(([,b])=>!b.talktalkVerified);
    
    if(entries.length===0){ console.log(`배치#${batch} — 이미 완료, 스킵`); continue; }
    
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`🔄 배치 #${batch} (${start}~${end-1}) — ${entries.length}건`);
    
    let bO=0,bX=0,bNoPlace=0,b429=0,consecutive429=0;
    const bStart=Date.now();
    
    for(let i=0;i<entries.length&&!stopping;i++){
      const [key,biz]=entries[i];
      
      // place_id
      let pid=biz.placeUrl?biz.placeUrl.split('/').pop():'';
      if(!pid){
        pid=await searchPlaceId(biz.name,biz.address||biz.roadAddress);
        if(pid) biz.placeUrl=`https://m.place.naver.com/place/${pid}`;
        await sleep(SEARCH_DELAY);
      }
      
      if(!pid){
        biz.talktalkButton='미확인'; biz.talktalkVerified='no_pid'; bNoPlace++;
        continue;
      }
      
      // talktalkUrl 체크
      const r=await checkTalkTalk(pid);
      
      if(r.status===429){
        b429++; consecutive429++;
        biz.talktalkButton='미확인'; biz.talktalkVerified='blocked';
        
        // 429 연속 → 간격 늘리기
        if(consecutive429>=3){
          PLACE_DELAY=Math.min(PLACE_DELAY+500, 5000);
          console.log(`  ⚠️ 429 연속${consecutive429}회 → 간격 ${PLACE_DELAY}ms로 증가`);
        }
        const wait=Math.min(consecutive429*30, 180);
        await sleep(wait*1000);
      } else {
        consecutive429=0;
        biz.talktalkButton=r.talktalk?'O':'X';
        biz.talktalkVerified='html';
        if(r.talkUrl) biz.talkUrl=r.talkUrl;
        if(r.talkId) biz.talkId=r.talkId;
        if(r.talktalk) bO++; else bX++;
      }
      
      // 100건마다 중간 저장+로그
      if((i+1)%100===0){
        fs.copyFileSync(HISTORY_PATH,HISTORY_PATH+".bak");fs.writeFileSync(HISTORY_PATH,JSON.stringify(history,null,2));
        const elapsed=((Date.now()-bStart)/60000).toFixed(1);
        console.log(`  [${i+1}/${entries.length}] O:${bO} X:${bX} ?:${bNoPlace} 429:${b429} | ${elapsed}분`);
      }
      
      await sleep(PLACE_DELAY);
    }
    
    // 배치 완료 — 저장
    fs.copyFileSync(HISTORY_PATH,HISTORY_PATH+".bak");fs.writeFileSync(HISTORY_PATH,JSON.stringify(history,null,2));
    
    globalO+=bO; globalX+=bX; globalNoPlace+=bNoPlace; global429+=b429;
    const bElapsed=((Date.now()-bStart)/60000).toFixed(1);
    const rate=bO+bX>0?(bO/(bO+bX)*100).toFixed(1):'0';
    
    console.log(`  ✅ 배치#${batch} 완료 (${bElapsed}분) O:${bO} X:${bX} ?:${bNoPlace} 429:${b429} 톡톡율:${rate}%`);
    
    // 전체 누적
    const gElapsed=((Date.now()-globalStart)/60000).toFixed(1);
    const gRate=globalO+globalX>0?(globalO/(globalO+globalX)*100).toFixed(1):'0';
    console.log(`  📊 누적: O:${globalO} X:${globalX} ?:${globalNoPlace} 429:${global429} 톡톡율:${gRate}% (${gElapsed}분)`);
    
    // 500건 단위 MD 리포트 저장
    const allNow=Object.values(history.crawled);
    const totalDone=allNow.filter(b=>b.talktalkVerified).length;
    const totalO=allNow.filter(b=>b.talktalkButton==='O').length;
    const totalX=allNow.filter(b=>b.talktalkButton==='X').length;
    const totalU=allNow.filter(b=>b.talktalkButton==='미확인').length;
    
    // 업종별 톡톡 통계
    const cs={};
    allNow.forEach(b=>{
      const c=b.category||'기타';
      if(!cs[c]) cs[c]={total:0,talk:0};
      cs[c].total++;
      if(b.talktalkButton==='O') cs[c].talk++;
    });
    const topC=Object.entries(cs).filter(([,s])=>s.talk>0).sort((a,b)=>b[1].talk-a[1].talk).slice(0,20);
    
    const now=new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
    const md=`# 톡톡 스캔 중간보고 — 배치#${batch} 완료\n\n` +
      `📅 ${now}\n\n` +
      `## 진행 현황\n` +
      `| 항목 | 수치 |\n|------|------|\n` +
      `| 전체 DB | ${allNow.length}건 |\n` +
      `| 스캔 완료 | ${totalDone}건 (${(totalDone/allNow.length*100).toFixed(1)}%) |\n` +
      `| 💬 톡톡 O | ${totalO}건 |\n` +
      `| ❌ 톡톡 X | ${totalX}건 |\n` +
      `| ❓ 미확인 | ${totalU}건 |\n` +
      `| ⚠️ 429 차단 | ${global429}건 |\n` +
      `| 📈 톡톡 보유율 | ${totalO+totalX>0?(totalO/(totalO+totalX)*100).toFixed(1):'0'}% |\n` +
      `| ⏱️ 소요시간 | ${gElapsed}분 |\n` +
      `| 현재 간격 | ${PLACE_DELAY}ms |\n\n` +
      `## 이번 배치 (#${batch})\n` +
      `- O:${bO} X:${bX} 미확인:${bNoPlace} 429:${b429} (${bElapsed}분)\n\n` +
      `## 업종별 톡톡O TOP 20\n` +
      `| 업종 | 톡톡O | 전체 | 비율 |\n|------|-------|------|------|\n` +
      topC.map(([c,s])=>`| ${c} | ${s.talk} | ${s.total} | ${(s.talk/s.total*100).toFixed(0)}% |`).join('\n') +
      `\n`;
    
    const reportPath=path.join(__dirname,'..','output','SCAN_REPORT.md');
    fs.writeFileSync(reportPath, md);
    console.log(`  📝 리포트 저장: output/SCAN_REPORT.md`);
    
    // 배치 간 쿨다운
    if(!stopping) await sleep(5000);
  }
  
  // 최종 보고
  const all=Object.values(history.crawled);
  const finalO=all.filter(b=>b.talktalkButton==='O').length;
  const finalX=all.filter(b=>b.talktalkButton==='X').length;
  const finalU=all.filter(b=>b.talktalkButton==='미확인').length;
  const finalNone=all.filter(b=>!b.talktalkButton).length;
  
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`🏁 전체 스캔 완료!`);
  console.log(`📊 O:${finalO} X:${finalX} 미확인:${finalU} 미스캔:${finalNone}`);
  console.log(`📈 톡톡 보유율: ${(finalO/(finalO+finalX)*100).toFixed(1)}%`);
  
  // 업종별 TOP 20
  const catStats={};
  all.forEach(b=>{
    const cat=b.category||'기타';
    if(!catStats[cat]) catStats[cat]={total:0,talk:0};
    catStats[cat].total++;
    if(b.talktalkButton==='O') catStats[cat].talk++;
  });
  const topCats=Object.entries(catStats).filter(([,s])=>s.talk>0).sort((a,b)=>b[1].talk-a[1].talk).slice(0,20);
  console.log(`\n🏆 톡톡O 업종 TOP 20:`);
  topCats.forEach(([cat,s])=>console.log(`  ${cat}: ${s.talk}/${s.total} (${(s.talk/s.total*100).toFixed(0)}%)`));
}

main().catch(console.error);
