const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const NAVER_CLIENT_ID = 'Su_kCP4chZNUyLO5wZEQ';
const NAVER_CLIENT_SECRET = 'I4fA34bv0e';
const OUTPUT_DIR = path.join(__dirname, 'output');
const DB_PATH = path.join(OUTPUT_DIR, 'history.json');
const API_LOG_PATH = path.join(OUTPUT_DIR, 'api-usage.json');
// 일일 한도 체크 — 오늘 이미 사용한 API 제외
const DAILY_LIMIT = 19500;
const _apiLogTmp = fs.existsSync(path.join(__dirname,'output','api-usage.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname,'output','api-usage.json'),'utf8')) : {};
const _today = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const _usedToday = _apiLogTmp[_today]?.calls || 0;
const API_LIMIT = Math.max(0, DAILY_LIMIT - _usedToday);
const RATE_LIMIT_MS = 110;
const HOMEPAGE_TIMEOUT = 5000;
const ANALYZE_TIMEOUT = 8000; // 홈페이지 분석 전체 타임아웃
const SAVE_INTERVAL = 50; // 50 API마다 저장
const LOG_INTERVAL = 10; // 10 API마다 진행 로그

const CATEGORIES = {
  '병원': ['성형외과','피부과','치과','안과','정형외과','산부인과','한의원','이비인후과','비뇨기과','내과','소아과','재활의학과','통증의학과'],
  '학원': ['영어학원','수학학원','코딩학원','미술학원','음악학원','입시학원','보습학원','태권도','피아노학원','유아영어','성인영어','토익학원'],
  '인테리어': ['인테리어','리모델링','인테리어업체','주방리모델링','욕실리모델링','사무실인테리어','상가인테리어'],
  '법률': ['법률사무소','변호사사무소','법무사','세무사','회계사무소','노무사','특허사무소'],
  '부동산': ['부동산','공인중개사','부동산중개','오피스텔분양','상가분양'],
  '웨딩': ['웨딩홀','웨딩업체','웨딩플래너','웨딩촬영','웨딩드레스','스튜디오'],
  '숙박': ['호텔','펜션','리조트','게스트하우스','모텔'],
  '분양': ['아파트분양','모델하우스','분양대행','분양사무소','오피스텔분양'],
  '뷰티': ['미용실','헤어샵','네일샵','속눈썹','왁싱','에스테틱','두피관리','탈모클리닉'],
  '피트니스': ['필라테스','PT','요가','헬스장','크로스핏','수영장','골프연습장','복싱'],
  '청소': ['입주청소','이사청소','청소업체','에어컨청소','사무실청소','정리수납'],
  '자동차': ['중고차','자동차매매','수입차정비','자동차검사','타이어','자동차도장'],
  '반려동물': ['동물병원','애견미용','펫호텔','애견카페'],
  '교육': ['유치원','어린이집','방과후학교','독서실','스터디카페'],
  '음식': ['프랜차이즈본사','케이터링','도시락','단체급식'],
  '기타서비스': ['이삿짐센터','인력사무소','번역사무소','사진관','복사인쇄','꽃집','장례식장'],
};
const REGIONS = ['서울 강남','서울 서초','서울 송파','서울 마포','서울 용산','서울 종로','서울 중구','서울 성동','서울 광진','서울 강서','서울 영등포','서울 동작','서울 관악','서울 노원','서울 은평','서울 강북','서울 도봉','서울 강동','서울 구로','서울 금천','서울 양천','서울 서대문','서울 동대문','서울 중랑','서울 성북',
'수원','성남','분당','용인','화성','고양','일산','부천','안양','안산','평택','시흥','파주','김포','광명','하남','의정부','남양주',
'인천','인천 부평','인천 송도','인천 서구',
'부산','부산 해운대','부산 서면',
'대구','대구 수성구','대구 달서구',
'대전','대전 유성구',
'광주','울산','창원','천안','청주','전주','포항','제주'];

const allCats = [];
Object.values(CATEGORIES).forEach(c => allCats.push(...c));
const combos = [];
allCats.forEach(cat => REGIONS.forEach(reg => combos.push(`${reg} ${cat}`)));
for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i+1)); [combos[i],combos[j]] = [combos[j],combos[i]]; }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 타임아웃 래퍼 — 어떤 Promise든 제한시간 초과 시 reject
function withTimeout(promise, ms, label='') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT(${ms}ms): ${label}`)), ms))
  ]);
}

const SNS_DOMAINS = ['instagram.com','facebook.com','youtube.com','blog.naver.com','twitter.com','tiktok.com','linkedin.com','pinterest.com','kakao.com','band.us','brunch.co.kr'];
const BUILDER_DOMAINS = {'imweb.me':'아임웹','wixsite.com':'Wix','wix.com':'Wix','cafe24.com':'카페24','modoo.at':'모두','smartstore.naver.com':'스마트스토어','storefarm.naver.com':'스마트스토어','sixshop.com':'식스샵','makewebsite.net':'메이크웹'};

function classifyUrl(link) {
  if (!link || !link.trim()) return { type: '홈페이지없음', builder: '' };
  try {
    const host = new URL(link).hostname.toLowerCase();
    if (SNS_DOMAINS.some(d => host.includes(d))) return { type: 'SNS/블로그', builder: '' };
    for (const [d,b] of Object.entries(BUILDER_DOMAINS)) { if (host.includes(d)) return { type: '웹빌더', builder: b }; }
    return { type: '자체홈페이지', builder: '' };
  } catch { return { type: '홈페이지없음', builder: '' }; }
}

async function searchNaver(query, start=1) {
  try {
    const r = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      params: { query, display: 5, start, sort: 'random' },
      headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET },
      timeout: 5000
    });
    return r.data.items || [];
  } catch(e) { return []; }
}

async function analyzeHomepage(url) {
  const result = { responsive: null, contacts: [], problems: [], score: 0 };
  try {
    const start = Date.now();
    const r = await axios.get(url, { 
      timeout: HOMEPAGE_TIMEOUT, 
      headers: {'User-Agent':'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0'}, 
      maxRedirects: 3,
      maxContentLength: 2 * 1024 * 1024, // 2MB 제한
    });
    result.pageSpeed = Date.now() - start;
    const html = typeof r.data === 'string' ? r.data : '';
    if (!html) { result.problems.push('빈페이지'); return result; }
    
    // HTML 크기 제한 (5MB 이상이면 분석 스킵)
    if (html.length > 5_000_000) {
      result.problems.push('페이지과대'); 
      return result;
    }
    
    const $ = cheerio.load(html);
    const htmlLower = html.toLowerCase();
    result.responsive = htmlLower.includes('viewport') && htmlLower.includes('width=device');
    const hasPhoneBtn = $('a[href^="tel:"]').length > 0;
    const hasKakao = htmlLower.includes('kakao') || htmlLower.includes('카카오') || htmlLower.includes('pf.kakao');
    const hasContactForm = $('form').length > 0 || htmlLower.includes('contact') || htmlLower.includes('문의');
    const hasMap = htmlLower.includes('kakaomap') || htmlLower.includes('naver.map') || htmlLower.includes('google.com/maps');
    if (!result.responsive) { result.problems.push('비반응형'); result.score += 30; }
    if (!hasPhoneBtn) { result.problems.push('전화버튼없음'); result.score += 20; }
    if (!hasKakao) { result.problems.push('카톡없음'); result.score += 15; }
    if (!hasContactForm) { result.problems.push('문의폼없음'); result.score += 15; }
    if (!hasMap) { result.problems.push('지도없음'); result.score += 10; }
    if (result.pageSpeed > 3000) { result.problems.push('로딩느림'); result.score += 10; }
    
    // 연락처 (제한된 HTML에서만)
    const safeHtml = html.slice(0, 500_000); // 연락처 추출은 500KB까지만
    const phoneSet = new Set();
    $('a[href^="tel:"]').each((_,el) => { const t=$(el).attr('href').replace('tel:','').replace(/[\s+()-]/g,'').trim(); if(t.length>=9){phoneSet.add(t);result.contacts.push({type:'전화',value:t});} });
    const phoneRegex = /(?:^|[^\d])(0(?:2|[3-6]\d|70)[-.\s]?\d{3,4}[-.\s]?\d{4})(?=[^\d]|$)/g;
    let pm, pc=0; while((pm=phoneRegex.exec(safeHtml))&&pc<5){const n=pm[1].replace(/[\s.-]/g,'');if(n.length>=9&&!phoneSet.has(n)){phoneSet.add(n);result.contacts.push({type:'전화',value:pm[1]});pc++;}}
    (safeHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)||[]).slice(0,3).forEach(e=>{if(!e.includes('.png')&&!e.includes('.jpg'))result.contacts.push({type:'이메일',value:e});});
    (safeHtml.match(/pf\.kakao\.com\/[a-zA-Z0-9_]+/g)||[]).slice(0,2).forEach(k=>result.contacts.push({type:'카카오톡채널',value:'https://'+k}));
    (safeHtml.match(/open\.kakao\.com\/o\/[a-zA-Z0-9]+/g)||[]).slice(0,2).forEach(k=>result.contacts.push({type:'카카오오픈채팅',value:'https://'+k}));
    (safeHtml.match(/instagram\.com\/[a-zA-Z0-9_.]+/g)||[]).slice(0,2).forEach(k=>result.contacts.push({type:'인스타그램',value:'https://'+k}));
    (safeHtml.match(/blog\.naver\.com\/[a-zA-Z0-9_]+/g)||[]).slice(0,2).forEach(k=>result.contacts.push({type:'네이버블로그',value:'https://'+k}));
    (safeHtml.match(/talk\.naver\.com\/[a-zA-Z0-9/]+/g)||[]).slice(0,2).forEach(k=>result.contacts.push({type:'네이버톡톡',value:'https://'+k}));
    (safeHtml.match(/smartstore\.naver\.com\/[a-zA-Z0-9_]+/g)||[]).slice(0,2).forEach(k=>result.contacts.push({type:'스마트스토어',value:'https://'+k}));
  } catch(e) { 
    result.problems.push('사이트접속불가'); 
  }
  return result;
}

function csvEscape(v) { const s=String(v||''); return s.includes(',')||s.includes('"')||s.includes('\n') ? '"'+s.replace(/"/g,'""')+'"' : s; }

function saveAll(history, apiLog, stats) {
  fs.writeFileSync(DB_PATH, JSON.stringify(history, null, 2), 'utf8');
  fs.writeFileSync(API_LOG_PATH, JSON.stringify(apiLog, null, 2), 'utf8');
  
  // CSV
  const BOM = '\ufeff';
  const header = '우선순위점수,업종,업체명,주소,홈페이지,사이트분류,웹빌더,반응형,발견된문제,추천패키지,전화,이메일,카카오톡채널,카카오오픈채팅,인스타그램,네이버블로그,네이버톡톡,스마트스토어,전체연락수단,TM상태,수집일시';
  const rows = Object.values(history.crawled).map(h => [
    h.score||0, h.category, h.name, h.address, h.homepage, h.siteType||'', h.webBuilder||'',
    h.responsive||'', h.problems||'', h.recommendedPkg||'',
    h.phone||'', h.email||'', h.kakao||'', h.openKakao||'', h.insta||'',
    h.naverBlog||'', h.naverTalktalk||'', h.smartstore||'',
    h.allContacts||'', h.tmStatus, h.lastSeen
  ].map(csvEscape).join(','));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'prospects-all.csv'), BOM + header + '\n' + rows.join('\n'), 'utf8');
}

// Graceful shutdown
let shuttingDown = false;
let globalHistory, globalApiLog, globalStats;

function gracefulShutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n⚠️ ${sig} 수신 — 현재 데이터 저장 중...`);
  if (globalHistory) {
    saveAll(globalHistory, globalApiLog, globalStats);
    console.log(`💾 DB ${Object.keys(globalHistory.crawled).length}건 저장 완료`);
  }
  process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

(async () => {
  const history = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH,'utf8')) : {crawled:{},tm_status:{}};
  if (!history.crawled) history.crawled = {};
  const apiLog = fs.existsSync(API_LOG_PATH) ? JSON.parse(fs.readFileSync(API_LOG_PATH,'utf8')) : {};
  const today = new Date().toISOString().slice(0,10);
  if (!apiLog[today]) apiLog[today] = { calls: 0 };
  const stats = {};
  
  globalHistory = history;
  globalApiLog = apiLog;
  globalStats = stats;

  let apiCalls = 0;
  let newCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  const startTime = Date.now();

  console.log(`🚀 대량 크롤링 시작 (${new Date().toISOString()})`);
  console.log(`📚 기존 DB: ${Object.keys(history.crawled).length}건`);
  console.log(`🎯 목표: API ${API_LIMIT}회, 조합 ${combos.length}개`);
  console.log(`🛡️ 재발방지: 분석타임아웃=${ANALYZE_TIMEOUT}ms, HTML제한=2MB, SIGTERM저장, ${SAVE_INTERVAL}API마다 저장\n`);

  for (const query of combos) {
    if (apiCalls >= API_LIMIT || shuttingDown) break;

    for (let page = 1; page <= 3; page++) {
      if (apiCalls >= API_LIMIT || shuttingDown) break;
      
      let items;
      try {
        items = await withTimeout(searchNaver(query, (page-1)*5+1), 10000, `API:${query}`);
      } catch(e) {
        errorCount++;
        console.log(`  ❌ API타임아웃: ${query} (${e.message})`);
        continue;
      }
      apiCalls++;
      apiLog[today].calls++;
      
      if (!items || items.length === 0) break;

      for (const item of items) {
        if (shuttingDown) break;
        const name = item.title.replace(/<[^>]*>/g,'').trim();
        const address = item.address || '';
        const homepage = item.link || '';
        const dedup = `${name}|${address}`;
        
        if (history.crawled[dedup]) { skipCount++; continue; }
        
        const urlClass = classifyUrl(homepage);
        if (urlClass.type === 'SNS/블로그') { skipCount++; continue; }

        const category = query.split(' ').slice(-1)[0];
        let analysis;
        if (urlClass.type === '홈페이지없음') {
          analysis = { responsive:null, contacts:[], problems:['홈페이지없음'], score:0 };
        } else {
          try {
            analysis = await withTimeout(analyzeHomepage(homepage), ANALYZE_TIMEOUT, homepage);
          } catch(e) {
            // 타임아웃이든 에러든 → 접속불가로 처리, 멈추지 않음
            analysis = { responsive:null, contacts:[], problems:['분석타임아웃'], score:0 };
            errorCount++;
          }
        }

        const contactMap = {};
        analysis.contacts.forEach(c => { if(!contactMap[c.type])contactMap[c.type]=[]; contactMap[c.type].push(c.value); });
        const allContacts = analysis.contacts.map(c=>`[${c.type}] ${c.value}`).join(' | ');
        const pkg = analysis.score >= 60 ? {name:'모바일 응급팩',price:'29~35만원'} : analysis.score >= 30 ? {name:'전환형 패키지',price:'19~22만원'} : {name:'스타터팩',price:'10~12만원'};

        history.crawled[dedup] = {
          name, address, homepage, category, score: analysis.score,
          siteType: urlClass.type, webBuilder: urlClass.builder,
          responsive: analysis.responsive === null ? '확인불가' : analysis.responsive ? 'Y' : 'N',
          problems: (analysis.problems||[]).join(' / '),
          recommendedPkg: `${pkg.name} (${pkg.price})`,
          phone: (contactMap['전화']||[]).join(' / '),
          email: (contactMap['이메일']||[]).join(' / '),
          kakao: (contactMap['카카오톡채널']||[]).join(' / '),
          openKakao: (contactMap['카카오오픈채팅']||[]).join(' / '),
          insta: (contactMap['인스타그램']||[]).join(' / '),
          naverBlog: (contactMap['네이버블로그']||[]).join(' / '),
          naverTalktalk: (contactMap['네이버톡톡']||[]).join(' / '),
          smartstore: (contactMap['스마트스토어']||[]).join(' / '),
          allContacts,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          tmStatus: '미연락',
        };

        newCount++;
        if (!stats[category]) stats[category] = {total:0,urgent:0,mid:0,low:0};
        stats[category].total++;
        if (analysis.score>=60) stats[category].urgent++;
        else if (analysis.score>=30) stats[category].mid++;
        else stats[category].low++;
        
        const emoji = analysis.score >= 60 ? '🔴' : analysis.score >= 30 ? '🟡' : '🟢';
        console.log(`  🆕 [${analysis.score}점] ${emoji} ${name} → ${homepage || '없음'}`);
      }

      await sleep(RATE_LIMIT_MS);
    }

    // 진행 로그
    if (apiCalls % LOG_INTERVAL === 0 && apiCalls > 0) {
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      const rate = (apiCalls / (elapsed || 1)).toFixed(0);
      console.log(`📊 [${elapsed}분] API: ${apiCalls}/${API_LIMIT} | 신규: ${newCount} | DB: ${Object.keys(history.crawled).length} | 에러: ${errorCount} | ${rate} API/분`);
    }

    // 주기적 저장
    if (apiCalls % SAVE_INTERVAL === 0 && apiCalls > 0) {
      saveAll(history, apiLog, stats);
      console.log(`💾 중간 저장 완료 (${Object.keys(history.crawled).length}건)`);
    }
  }

  // 최종 저장
  saveAll(history, apiLog, stats);

  // 업종별 CSV
  const BOM = '\ufeff';
  const catDir = path.join(OUTPUT_DIR, 'by-category');
  fs.mkdirSync(catDir, { recursive: true });
  const byCategory = {};
  Object.values(history.crawled).forEach(h => {
    if (!byCategory[h.category]) byCategory[h.category] = [];
    byCategory[h.category].push(h);
  });
  const catHeader = '점수,업종,업체명,주소,홈페이지,문제,패키지,전화,이메일,카카오,인스타,톡톡';
  for (const [cat, items] of Object.entries(byCategory)) {
    const rows = items.map(h => [h.score||0,h.category,h.name,h.address,h.homepage,h.problems||'',h.recommendedPkg||'',h.phone||'',h.email||'',h.kakao||'',h.insta||'',h.naverTalktalk||''].map(csvEscape).join(','));
    const safe = cat.replace(/[/\\?%*:|"<>]/g, '_');
    fs.writeFileSync(path.join(catDir, `${safe}.csv`), BOM + catHeader + '\n' + rows.join('\n'), 'utf8');
  }

  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 크롤링 완료! (${elapsed}분 소요)`);
  console.log(`📊 API: ${apiCalls}회 | 신규: ${newCount}건 | DB: ${Object.keys(history.crawled).length}건`);
  console.log(`⚠️ 에러: ${errorCount}건 | 스킵(중복/SNS): ${skipCount}건`);
  console.log(`\n📋 업종별:`);
  Object.entries(stats).sort((a,b)=>b[1].total-a[1].total).forEach(([cat,s]) => {
    console.log(`  ${cat}: ${s.total}건 (🔴${s.urgent} 🟡${s.mid} 🟢${s.low})`);
  });
  console.log(`\n📁 prospects-all.csv / by-category/ 저장 완료`);
})();
