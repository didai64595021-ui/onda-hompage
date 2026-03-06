const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ── 설정 ──
const NAVER_CLIENT_ID = 'Su_kCP4chZNUyLO5wZEQ';
const NAVER_CLIENT_SECRET = 'I4fA34bv0e';
const OUTPUT_DIR = path.join(__dirname, 'output');
const CSV_PATH = path.join(OUTPUT_DIR, 'prospects.csv');
const RATE_LIMIT_MS = 120; // ~8req/s
const HOMEPAGE_TIMEOUT = 5000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── 업종 + 지역 ──
const CATEGORIES = [
  // 병원
  '성형외과', '피부과', '치과', '안과', '정형외과', '산부인과', '한의원',
  // 학원
  '영어학원', '수학학원', '코딩학원', '미술학원', '음악학원', '입시학원',
  // 인테리어
  '인테리어', '리모델링', '인테리어업체',
  // 법률
  '법률사무소', '변호사사무소',
  // 부동산
  '부동산', '공인중개사',
  // 웨딩
  '웨딩홀', '웨딩업체', '웨딩플래너',
  // 숙박
  '호텔', '펜션', '리조트',
  // 분양
  '아파트분양', '모델하우스', '분양대행',
];

const REGIONS = ['서울', '강남', '홍대', '잠실', '수원', '성남', '부천', '인천', '일산', '분당'];

// ── 블로그/SNS 도메인 필터 ──
const EXCLUDED_DOMAINS = [
  'blog.naver.com', 'cafe.naver.com', 'post.naver.com',
  'blog.daum.net', 'cafe.daum.net',
  'tistory.com', 'brunch.co.kr',
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'pf.kakao.com', 'open.kakao.com', 'kakao.com',
  'youtube.com', 'youtu.be',
  'baemin.com', 'yogiyo.co.kr', 'coupangeats.com',
  'smartstore.naver.com', 'shopping.naver.com',
];

function isOwnWebsite(url) {
  if (!url || url.trim() === '') return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return !EXCLUDED_DOMAINS.some(d => hostname.includes(d));
  } catch { return false; }
}

// ── 네이버 검색 API ──
async function searchLocal(query, start = 1, display = 5) {
  try {
    const res = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      params: { query, display, start, sort: 'random' },
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
      timeout: 10000,
    });
    return res.data.items || [];
  } catch (e) {
    console.error(`  [API에러] ${query}: ${e.message}`);
    return [];
  }
}

// ── 홈페이지에서 연락처 + 반응형 체크 ──
async function analyzeHomepage(url) {
  const result = {
    responsive: null,
    contacts: [],
  };
  
  try {
    const res = await axios.get(url, {
      timeout: HOMEPAGE_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3,
      validateStatus: s => s < 400,
    });
    
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    
    // ── 반응형 체크 ──
    const viewportMeta = $('meta[name="viewport"]').attr('content') || '';
    const hasViewport = viewportMeta.includes('device-width');
    
    // CSS media query 체크
    let hasMediaQuery = false;
    $('style').each((_, el) => {
      if ($(el).text().includes('@media')) hasMediaQuery = true;
    });
    $('link[rel="stylesheet"]').each((_, el) => {
      // external CSS는 간단히 체크 못하므로 viewport만으로 판단
    });
    
    result.responsive = hasViewport || hasMediaQuery;
    
    // ── 연락처 추출 ──
    const text = html;
    
    // 전화번호 (02-xxxx-xxxx, 010-xxxx-xxxx, 1588-xxxx 등)
    const phonePatterns = text.match(/(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}|1\d{3}[-.\s]?\d{4})/g) || [];
    phonePatterns.forEach(p => {
      const cleaned = p.replace(/\s/g, '');
      if (cleaned.length >= 9) result.contacts.push({ type: '전화', value: cleaned });
    });
    
    // 이메일
    const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    emails.forEach(e => {
      if (!e.includes('example') && !e.includes('test'))
        result.contacts.push({ type: '이메일', value: e });
    });
    
    // 카카오톡 채널
    const kakaoLinks = html.match(/pf\.kakao\.com\/[a-zA-Z0-9_]+/g) || [];
    kakaoLinks.forEach(k => result.contacts.push({ type: '카카오톡', value: 'https://' + k }));
    
    // 카카오 오픈채팅
    const openKakao = html.match(/open\.kakao\.com\/o\/[a-zA-Z0-9]+/g) || [];
    openKakao.forEach(k => result.contacts.push({ type: '카카오오픈채팅', value: 'https://' + k }));
    
    // 인스타그램
    const insta = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/g) || [];
    insta.forEach(i => result.contacts.push({ type: '인스타그램', value: 'https://' + i }));
    
    // 네이버 예약/톡톡
    const naverBooking = html.match(/booking\.naver\.com\/[^\s"'<>]+/g) || [];
    naverBooking.forEach(b => result.contacts.push({ type: '네이버예약', value: 'https://' + b }));
    
    // tel: 링크
    $('a[href^="tel:"]').each((_, el) => {
      const tel = $(el).attr('href').replace('tel:', '').trim();
      if (tel && !result.contacts.find(c => c.value === tel))
        result.contacts.push({ type: '전화', value: tel });
    });
    
    // mailto: 링크
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (mail && !result.contacts.find(c => c.value === mail))
        result.contacts.push({ type: '이메일', value: mail });
    });
    
    // 중복 제거
    const seen = new Set();
    result.contacts = result.contacts.filter(c => {
      const key = c.type + c.value;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
  } catch (e) {
    // 접속 실패 = skip
  }
  
  return result;
}

// ── HTML 태그 제거 ──
function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').trim();
}

// ── 플레이스 링크 생성 ──
function buildPlaceLink(item) {
  // 네이버 local API는 mapx, mapy 제공
  if (item.mapx && item.mapy) {
    return `https://map.naver.com/v5/search/${encodeURIComponent(stripHtml(item.title))}`;
  }
  return `https://map.naver.com/v5/search/${encodeURIComponent(stripHtml(item.title) + ' ' + stripHtml(item.address))}`;
}

// ── CSV 이스케이프 ──
function csvEscape(val) {
  const s = String(val || '');
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ── 메인 ──
async function main() {
  const isTest = process.argv.includes('--test');
  console.log(`🚀 UI 잠재고객 크롤러 시작 ${isTest ? '(테스트 모드)' : ''}`);
  console.log(`   업종 ${CATEGORIES.length}개 × 지역 ${REGIONS.length}개 = ${CATEGORIES.length * REGIONS.length} 조합\n`);
  
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const prospects = [];
  const seen = new Set(); // 중복 방지 (업체명+주소)
  let apiCalls = 0;
  
  const categories = isTest ? CATEGORIES.slice(0, 2) : CATEGORIES;
  const regions = isTest ? REGIONS.slice(0, 2) : REGIONS;
  
  for (const category of categories) {
    for (const region of regions) {
      const query = `${region} ${category}`;
      console.log(`🔍 검색: ${query}`);
      
      // 각 조합마다 최대 5페이지 (25건)
      const maxPages = isTest ? 1 : 5;
      for (let page = 1; page <= maxPages; page++) {
        const start = (page - 1) * 5 + 1;
        const items = await searchLocal(query, start, 5);
        apiCalls++;
        
        if (items.length === 0) break;
        
        for (const item of items) {
          const name = stripHtml(item.title);
          const address = stripHtml(item.address);
          const dedup = name + '|' + address;
          
          if (seen.has(dedup)) continue;
          seen.add(dedup);
          
          const homepage = item.link || '';
          
          // 자사 홈페이지 필터
          if (!isOwnWebsite(homepage)) {
            continue;
          }
          
          console.log(`  ✅ ${name} → ${homepage}`);
          
          // 홈페이지 분석
          const analysis = await analyzeHomepage(homepage);
          
          const contactStr = analysis.contacts.map(c => `${c.type}:${c.value}`).join(' | ');
          
          prospects.push({
            category,
            name,
            address,
            placeLink: buildPlaceLink(item),
            homepage,
            responsive: analysis.responsive === null ? '확인불가' : analysis.responsive ? 'Y' : 'N',
            contacts: contactStr,
            crawledAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          });
        }
        
        await sleep(RATE_LIMIT_MS);
      }
    }
  }
  
  // ── CSV 저장 ──
  const BOM = '\ufeff';
  const header = '업종,업체명,주소,네이버플레이스링크,홈페이지URL,전화,이메일,카카오톡,카카오오픈채팅,인스타그램,네이버예약,기타연락수단,수집일시';
  const rows = prospects.map(p => {
    // 연락수단을 매체별로 분리
    const contactMap = {};
    if (p.contacts) {
      p.contacts.split(' | ').forEach(c => {
        const [type, ...rest] = c.split(':');
        const val = rest.join(':');
        if (!contactMap[type]) contactMap[type] = [];
        contactMap[type].push(val);
      });
    }
    const phone = (contactMap['전화'] || []).join(' / ');
    const email = (contactMap['이메일'] || []).join(' / ');
    const kakao = (contactMap['카카오톡'] || []).join(' / ');
    const openKakao = (contactMap['카카오오픈채팅'] || []).join(' / ');
    const insta = (contactMap['인스타그램'] || []).join(' / ');
    const naverBook = (contactMap['네이버예약'] || []).join(' / ');
    // 나머지 기타
    const knownTypes = ['전화','이메일','카카오톡','카카오오픈채팅','인스타그램','네이버예약'];
    const etc = Object.entries(contactMap)
      .filter(([t]) => !knownTypes.includes(t))
      .map(([t, v]) => `${t}:${v.join('/')}`)
      .join(' / ');
    return [p.category, p.name, p.address, p.placeLink, p.homepage, phone, email, kakao, openKakao, insta, naverBook, etc, p.crawledAt]
      .map(csvEscape).join(',');
  });
  
  fs.writeFileSync(CSV_PATH, BOM + header + '\n' + rows.join('\n'), 'utf8');
  
  // ── 결과 요약 ──
  console.log('\n' + '='.repeat(60));
  console.log('📊 크롤링 결과 요약');
  console.log('='.repeat(60));
  console.log(`총 수집: ${prospects.length}건`);
  console.log(`API 호출: ${apiCalls}회`);
  console.log(`CSV 저장: ${CSV_PATH}`);
  
  // 업종별 집계
  const byCategory = {};
  const nonResponsive = prospects.filter(p => p.responsive === 'N');
  prospects.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + 1; });
  
  console.log(`\n🎯 비반응형 업체 (잠재고객): ${nonResponsive.length}건`);
  console.log('\n📋 업종별:');
  Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, cnt]) => {
    console.log(`  ${cat}: ${cnt}건`);
  });
  
  // 연락수단 통계
  const contactTypes = {};
  prospects.forEach(p => {
    if (p.contacts) {
      p.contacts.split(' | ').forEach(c => {
        const type = c.split(':')[0];
        if (type) contactTypes[type] = (contactTypes[type] || 0) + 1;
      });
    }
  });
  console.log('\n📞 연락수단별:');
  Object.entries(contactTypes).sort((a, b) => b[1] - a[1]).forEach(([type, cnt]) => {
    console.log(`  ${type}: ${cnt}건`);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error('❌ 크롤러 에러:', e); process.exit(1); });
