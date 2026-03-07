const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ── 설정 ──
const NAVER_CLIENT_ID = 'Su_kCP4chZNUyLO5wZEQ';
const NAVER_CLIENT_SECRET = 'I4fA34bv0e';
const OUTPUT_DIR = path.join(__dirname, 'output');
const CSV_PATH = path.join(OUTPUT_DIR, 'prospects.csv');
const DB_PATH = path.join(OUTPUT_DIR, 'history.json');
const API_LOG_PATH = path.join(OUTPUT_DIR, 'api-usage.json');
const RATE_LIMIT_MS = 100; // 10req/s
const HOMEPAGE_TIMEOUT = 5000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DAILY_API_TARGET = 20000; // 하루 2만 API 목표

// ── 업종 (42개 + 세분화 = 120+ 검색어) ──
const CATEGORY_GROUPS = {
  '병원': ['성형외과', '피부과', '치과', '안과', '정형외과', '산부인과', '한의원', '이비인후과', '비뇨기과', '내과', '소아과', '정신건강의학과', '재활의학과', '통증의학과'],
  '학원': ['영어학원', '수학학원', '코딩학원', '미술학원', '음악학원', '입시학원', '보습학원', '태권도', '피아노학원', '유아영어', '성인영어', '토익학원'],
  '인테리어': ['인테리어', '리모델링', '인테리어업체', '인테리어시공', '주방리모델링', '욕실리모델링', '사무실인테리어', '상가인테리어'],
  '법률': ['법률사무소', '변호사사무소', '법무사', '세무사', '회계사무소', '노무사', '특허사무소'],
  '부동산': ['부동산', '공인중개사', '부동산중개', '오피스텔분양', '상가분양'],
  '웨딩': ['웨딩홀', '웨딩업체', '웨딩플래너', '웨딩촬영', '웨딩드레스', '스튜디오'],
  '숙박': ['호텔', '펜션', '리조트', '게스트하우스', '모텔'],
  '분양': ['아파트분양', '모델하우스', '분양대행', '분양사무소', '오피스텔분양'],
  '뷰티': ['미용실', '헤어샵', '네일샵', '속눈썹', '왁싱', '에스테틱', '두피관리', '탈모클리닉'],
  '피트니스': ['필라테스', 'PT', '요가', '헬스장', '크로스핏', '수영장', '골프연습장', '복싱'],
  '청소': ['입주청소', '이사청소', '청소업체', '에어컨청소', '사무실청소', '정리수납'],
  '자동차': ['중고차', '자동차매매', '수입차정비', '자동차검사', '타이어', '자동차도장'],
  '반려동물': ['동물병원', '애견미용', '펫호텔', '애견카페'],
  '교육': ['유치원', '어린이집', '방과후학교', '독서실', '스터디카페'],
  '음식': ['프랜차이즈본사', '케이터링', '도시락', '단체급식'],
  '기타서비스': ['이삿짐센터', '인력사무소', '번역사무소', '사진관', '복사인쇄', '꽃집', '장례식장'],
};

// 전체 검색어 플랫화
const ALL_CATEGORIES = [];
Object.values(CATEGORY_GROUPS).forEach(cats => ALL_CATEGORIES.push(...cats));

// ── 지역 (시/구 세분화 = 80+) ──
const REGIONS = {
  '서울': ['강남구', '서초구', '송파구', '강동구', '마포구', '용산구', '종로구', '중구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '영등포구', '동작구', '관악구', '금천구', '구로구', '양천구', '강서구'],
  '경기': ['수원', '성남', '분당', '용인', '화성', '고양', '일산', '부천', '안양', '안산', '평택', '시흥', '파주', '김포', '광명', '하남', '의정부', '남양주', '광주', '이천', '양평'],
  '인천': ['인천', '부평', '송도', '연수구', '남동구', '서구'],
  '부산': ['부산', '해운대', '서면', '남포동', '동래'],
  '대구': ['대구', '수성구', '달서구', '동성로'],
  '대전': ['대전', '유성구', '둔산동'],
  '광주': ['광주', '상무지구'],
  '제주': ['제주', '서귀포'],
};

const ALL_REGIONS = [];
Object.entries(REGIONS).forEach(([city, areas]) => {
  areas.forEach(area => {
    ALL_REGIONS.push(city === area ? area : `${area}`);
  });
});

// ── 제외 도메인 ──
const EXCLUDED_DOMAINS = [
  'blog.naver.com', 'cafe.naver.com', 'post.naver.com',
  'blog.daum.net', 'cafe.daum.net', 'tistory.com', 'brunch.co.kr',
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'pf.kakao.com', 'open.kakao.com',
  'youtube.com', 'youtu.be',
  'baemin.com', 'yogiyo.co.kr', 'coupangeats.com',
  'smartstore.naver.com', 'shopping.naver.com',
  'booking.naver.com', 'map.naver.com',
];

// 웹빌더 도메인 감지
const WEBBUILDER_DOMAINS = [
  { domain: 'imweb.me', name: '아임웹' },
  { domain: 'modoo.at', name: '모두' },
  { domain: 'wixsite.com', name: 'Wix' },
  { domain: 'wix.com', name: 'Wix' },
  { domain: 'squarespace.com', name: 'Squarespace' },
  { domain: 'wordpress.com', name: 'WordPress.com' },
  { domain: 'cafe24.com', name: '카페24' },
  { domain: 'cafe24shop.com', name: '카페24' },
  { domain: 'sixshop.com', name: '식스샵' },
  { domain: 'shopby.co.kr', name: 'NHN커머스' },
  { domain: 'godomall.com', name: '고도몰' },
  { domain: 'makeshop.co.kr', name: '메이크샵' },
  { domain: 'godpeople.com', name: '갓피플' },
  { domain: 'creatorlink.net', name: '크리에이터링크' },
  { domain: 'strikingly.com', name: 'Strikingly' },
  { domain: 'weebly.com', name: 'Weebly' },
  { domain: 'dothome.co.kr', name: '닷홈' },
  { domain: 'qshop.ai', name: 'Qshop' },
  { domain: 'kmswb.kr', name: 'KMS웹빌더' },
  { domain: 'alltheway.kr', name: '올더웨이' },
  { domain: 'my.pr', name: 'MyPR' },
  { domain: 'oopy.io', name: 'Oopy(노션)' },
  { domain: 'notion.site', name: 'Notion' },
  { domain: 'carrd.co', name: 'Carrd' },
  { domain: 'webflow.io', name: 'Webflow' },
  { domain: 'framer.app', name: 'Framer' },
  { domain: 'sites.google.com', name: 'Google Sites' },
];

// SNS/블로그 도메인 (홈페이지 아닌 것)
const SNS_DOMAINS = [
  'blog.naver.com', 'cafe.naver.com', 'post.naver.com',
  'blog.daum.net', 'cafe.daum.net', 'tistory.com', 'brunch.co.kr',
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'pf.kakao.com', 'open.kakao.com',
  'youtube.com', 'youtu.be',
  'baemin.com', 'yogiyo.co.kr', 'coupangeats.com',
  'smartstore.naver.com', 'shopping.naver.com',
  'booking.naver.com', 'map.naver.com',
];

function classifyUrl(url) {
  if (!url || url.trim() === '') return { type: '홈페이지없음', builder: '' };
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // SNS/블로그 체크
    if (SNS_DOMAINS.some(d => hostname.includes(d))) return { type: 'SNS/블로그', builder: '' };
    // 웹빌더 체크
    const wb = WEBBUILDER_DOMAINS.find(w => hostname.includes(w.domain));
    if (wb) return { type: '웹빌더', builder: wb.name };
    // 자체 홈페이지
    return { type: '자체홈페이지', builder: '' };
  } catch { return { type: '홈페이지없음', builder: '' }; }
}

function isOwnWebsite(url) {
  if (!url || url.trim() === '') return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return !EXCLUDED_DOMAINS.some(d => hostname.includes(d));
  } catch { return false; }
}

// ── 히스토리 DB ──
function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); }
function loadHistory() { const d = loadJSON(DB_PATH); return d.crawled ? d : { crawled: {}, tm_status: {} }; }

// ── API 사용량 추적 ──
function getApiUsage() {
  const usage = loadJSON(API_LOG_PATH);
  const today = new Date().toISOString().slice(0, 10);
  if (!usage[today]) usage[today] = { calls: 0, started: new Date().toISOString() };
  return { usage, today };
}
function logApiCall() {
  const { usage, today } = getApiUsage();
  usage[today].calls++;
  saveJSON(API_LOG_PATH, usage);
  return usage[today].calls;
}
function getRemainingCalls() {
  const { usage, today } = getApiUsage();
  return DAILY_API_TARGET - (usage[today]?.calls || 0);
}

// ── 네이버 검색 API ──
async function searchLocal(query, start = 1, display = 5) {
  if (getRemainingCalls() <= 0) {
    console.log('  ⛔ 일일 API 한도(2만) 도달. 중단.');
    return null; // null = 중단 시그널
  }
  try {
    const res = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      params: { query, display, start, sort: 'random' },
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
      timeout: 10000,
    });
    logApiCall();
    return res.data.items || [];
  } catch (e) {
    if (e.response?.status === 429) {
      console.log('  ⏳ Rate limit, 2초 대기...');
      await sleep(2000);
      return searchLocal(query, start, display);
    }
    logApiCall(); // 실패해도 카운트
    return [];
  }
}

// ── 톡톡 활성화 확인 (홈페이지 HTML 기반) ──
function checkTalkTalkFromHtml(html) {
  if (!html) return 'X';
  const lower = html.toLowerCase();
  // 네이버 톡톡 링크/버튼 패턴
  if (lower.includes('talk.naver.com')) return 'O';
  if (lower.includes('네이버톡톡') || lower.includes('naver톡톡')) return 'O';
  if (lower.includes('톡톡문의') || lower.includes('톡톡상담') || lower.includes('톡톡으로')) return 'O';
  if (/pf\.kakao\.com/.test(html) === false && lower.includes('톡톡')) return 'O';  // 카카오가 아닌 톡톡
  if (lower.includes('navertalktalk') || lower.includes('naver_talktalk')) return 'O';
  if (lower.includes('talk.naver.com/ct/') || lower.includes('talk.naver.com/w/')) return 'O';
  return 'X';
}

// ── 홈페이지 분석 ──
async function analyzeHomepage(url) {
  const result = {
    responsive: null, hasPhoneBtn: false, hasKakaoBtn: false,
    hasContactForm: false, hasMap: false, pageSpeed: null,
    contacts: [], problems: [], score: 0, talkTalk: 'X',
  };
  try {
    const start = Date.now();
    const res = await axios.get(url, {
      timeout: HOMEPAGE_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3, validateStatus: s => s < 400,
    });
    result.pageSpeed = Date.now() - start;
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    const htmlLower = html.toLowerCase();

    // 반응형
    const viewport = $('meta[name="viewport"]').attr('content') || '';
    let hasMedia = false;
    $('style').each((_, el) => { if ($(el).text().includes('@media')) hasMedia = true; });
    result.responsive = viewport.includes('device-width') || hasMedia;

    // UI 요소
    result.hasPhoneBtn = $('a[href^="tel:"]').length > 0;
    result.hasKakaoBtn = htmlLower.includes('pf.kakao.com') || (htmlLower.includes('kakao') && htmlLower.includes('button'));
    result.hasContactForm = $('form').length > 0 || htmlLower.includes('contact') || htmlLower.includes('문의');
    result.hasMap = htmlLower.includes('map.naver.com') || htmlLower.includes('maps.google') || $('iframe[src*="map"]').length > 0;
    result.talkTalk = checkTalkTalkFromHtml(html);

    // 점수
    if (!result.responsive) { result.problems.push('비반응형(모바일X)'); result.score += 30; }
    if (!result.hasPhoneBtn) { result.problems.push('전화버튼없음'); result.score += 20; }
    if (!result.hasKakaoBtn) { result.problems.push('카톡버튼없음'); result.score += 15; }
    if (!result.hasContactForm) { result.problems.push('문의폼없음'); result.score += 15; }
    if (!result.hasMap) { result.problems.push('지도없음'); result.score += 10; }
    if (result.pageSpeed > 3000) { result.problems.push(`로딩느림(${(result.pageSpeed/1000).toFixed(1)}초)`); result.score += 10; }

    // 연락처 추출 (전화번호 — 정확도 강화)
    // tel: 링크 먼저 (가장 정확)
    const phoneSet = new Set();
    $('a[href^="tel:"]').each((_, el) => {
      const t = $(el).attr('href').replace('tel:', '').replace(/[\s+()-]/g, '').trim();
      if (t && t.length >= 9 && t.length <= 13 && /^0/.test(t)) {
        phoneSet.add(t);
        result.contacts.push({ type: '전화', value: t });
      }
    });
    // 텍스트에서 전화번호 (tel: 없는 경우만 보충, 최대 5개)
    const phoneRegex = /(?:^|[^\d])(0(?:2|[3-6]\d|70)[-.\s]?\d{3,4}[-.\s]?\d{4})(?=[^\d]|$)/g;
    let phoneMatch;
    let phoneCount = 0;
    while ((phoneMatch = phoneRegex.exec(html)) !== null && phoneCount < 5) {
      const num = phoneMatch[1].replace(/[\s.-]/g, '');
      if (num.length >= 9 && num.length <= 12 && !phoneSet.has(num)) {
        phoneSet.add(num);
        result.contacts.push({ type: '전화', value: phoneMatch[1] });
        phoneCount++;
      }
    }
    // 대표번호 (1588, 1577, 1600 등)
    const tollFree = html.match(/(?:^|[^\d])(1[56]\d{2}[-.\s]?\d{4})(?=[^\d]|$)/g) || [];
    tollFree.slice(0, 3).forEach(p => {
      const num = p.replace(/[^\d-]/g, '').trim();
      if (num.length >= 8 && !phoneSet.has(num.replace(/[-]/g, ''))) {
        phoneSet.add(num.replace(/[-]/g, ''));
        result.contacts.push({ type: '전화', value: num });
      }
    });
    const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    emails.forEach(e => {
      if (!/example|test|wixpress|sentry|webpack/.test(e))
        result.contacts.push({ type: '이메일', value: e });
    });
    $('a[href^="mailto:"]').each((_, el) => {
      const m = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (m && !result.contacts.find(c => c.value === m)) result.contacts.push({ type: '이메일', value: m });
    });
    // 카카오톡 채널
    (html.match(/pf\.kakao\.com\/[a-zA-Z0-9_]+/g) || []).forEach(k => result.contacts.push({ type: '카카오톡채널', value: 'https://' + k }));
    // 카카오 오픈채팅
    (html.match(/open\.kakao\.com\/o\/[a-zA-Z0-9]+/g) || []).forEach(k => result.contacts.push({ type: '카카오오픈채팅', value: 'https://' + k }));
    // 카카오톡 1:1 채팅 링크
    (html.match(/talk\.naver\.com\/[a-zA-Z0-9]+/g) || []).forEach(k => result.contacts.push({ type: '네이버톡톡', value: 'https://' + k }));
    // 네이버 톡톡
    (html.match(/talk\.naver\.com\/[^\s"'<>]+/g) || []).forEach(t => result.contacts.push({ type: '네이버톡톡', value: 'https://' + t }));
    // 네이버 예약
    (html.match(/booking\.naver\.com\/[^\s"'<>]+/g) || []).forEach(b => result.contacts.push({ type: '네이버예약', value: 'https://' + b }));
    // 인스타그램
    (html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/g) || []).forEach(i => {
      if (!/instagram\.com\/(p|reel|explore|accounts|static|about)/.test('https://'+i))
        result.contacts.push({ type: '인스타그램', value: 'https://' + i });
    });
    // 페이스북
    (html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/g) || []).forEach(f => {
      if (!/facebook\.com\/(sharer|share|dialog|plugins|tr)/.test('https://'+f))
        result.contacts.push({ type: '페이스북', value: 'https://' + f });
    });
    // 유튜브
    (html.match(/youtube\.com\/(channel|c|@)[^\s"'<>]+/g) || []).forEach(y => result.contacts.push({ type: '유튜브', value: 'https://' + y }));
    (html.match(/youtube\.com\/[a-zA-Z0-9_-]{20,}/g) || []).forEach(y => result.contacts.push({ type: '유튜브', value: 'https://' + y }));
    // 네이버 블로그
    (html.match(/blog\.naver\.com\/[a-zA-Z0-9_]+/g) || []).forEach(b => result.contacts.push({ type: '네이버블로그', value: 'https://' + b }));
    // 네이버 카페
    (html.match(/cafe\.naver\.com\/[a-zA-Z0-9_]+/g) || []).forEach(c => result.contacts.push({ type: '네이버카페', value: 'https://' + c }));
    // 트위터/X
    (html.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/g) || []).forEach(t => {
      if (!/(?:twitter|x)\.com\/(intent|share|widgets|i)/.test('https://'+t))
        result.contacts.push({ type: '트위터', value: 'https://' + t });
    });
    // 라인
    (html.match(/line\.me\/[^\s"'<>]+/g) || []).forEach(l => result.contacts.push({ type: '라인', value: 'https://' + l }));
    // 틱톡
    (html.match(/tiktok\.com\/@[a-zA-Z0-9_.]+/g) || []).forEach(t => result.contacts.push({ type: '틱톡', value: 'https://' + t }));
    // 팩스
    const faxes = html.match(/(?:팩스|FAX|fax|Fax)\s*[:：]?\s*(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})/gi) || [];
    faxes.forEach(f => {
      const num = f.replace(/(?:팩스|FAX|fax|Fax)\s*[:：]?\s*/i, '').replace(/\s/g,'');
      if (num.length >= 9) result.contacts.push({ type: '팩스', value: num });
    });
    // 네이버 플레이스 (자체 링크)
    (html.match(/naver\.me\/[a-zA-Z0-9]+/g) || []).forEach(n => result.contacts.push({ type: '네이버플레이스', value: 'https://' + n }));
    // 카카오맵
    (html.match(/kko\.to\/[a-zA-Z0-9_-]+/g) || []).forEach(k => result.contacts.push({ type: '카카오맵', value: 'https://' + k }));
    // 배달의민족/요기요 (참고용)
    (html.match(/baemin\.com\/[^\s"'<>]+/g) || []).forEach(b => result.contacts.push({ type: '배달의민족', value: 'https://' + b }));
    // 스마트스토어
    (html.match(/smartstore\.naver\.com\/[a-zA-Z0-9_-]+/g) || []).forEach(s => result.contacts.push({ type: '스마트스토어', value: 'https://' + s }));

    // 중복 제거
    const seen = new Set();
    result.contacts = result.contacts.filter(c => {
      const k = c.type + c.value; if (seen.has(k)) return false; seen.add(k); return true;
    });
  } catch { result.problems.push('사이트접속불가'); }
  return result;
}

// ── 패키지 추천 ──
function recommendPackage(score) {
  if (score >= 80) return { name: '풀 리뉴얼 라이트', price: '50~80만원' };
  if (score >= 60) return { name: '모바일 응급팩', price: '29~35만원' };
  if (score >= 40) return { name: '전환형 패키지', price: '19~22만원' };
  return { name: '스타터팩', price: '10~12만원' };
}

// ── TM / 문자 / 이메일 템플릿 ──
function generateTM(name, problems, pkg) {
  return `안녕하세요 대표님. ${name} 홈페이지 모바일에서 확인해보니 ${problems.slice(0,2).join(', ')} 상태입니다. ${pkg.name}(${pkg.price})로 24시간 내 개선 가능한데, 전후 비교 시안 보내드릴까요?`;
}
function generateSMS(name, problems, pkg) {
  return `[웹사이트 개선] ${name} 대표님, 모바일에서 ${problems.slice(0,2).join(', ')} 확인됐습니다. ${pkg.name} ${pkg.price}으로 24시간 내 개선 가능합니다. 전후비교시안 무료. 문의:010-XXXX-XXXX`;
}
function generateEmail(name, problems, pkg, homepage) {
  return `제목: [${name}] 모바일 홈페이지 무료 진단 결과\n\n${name} 대표님 안녕하세요.\n\n홈페이지(${homepage}) 모바일 점검 결과를 공유드립니다.\n\n📋 발견된 문제:\n${problems.map(p=>'  • '+p).join('\n')}\n\n💡 추천: ${pkg.name} (${pkg.price})\n  - 24~48시간 내 작업 완료\n  - 전후 비교 시안 무료 제공\n\n문의: 010-XXXX-XXXX | 카톡: XXXXX`;
}

function stripHtml(s) { return (s||'').replace(/<[^>]*>/g, '').trim(); }
function buildPlaceLink(item) {
  return `https://map.naver.com/v5/search/${encodeURIComponent(stripHtml(item.title)+' '+stripHtml(item.address))}`;
}
function csvEscape(val) {
  const s = String(val||'');
  return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s;
}

// ── 검색 조합 생성 (셔플) ──
function generateSearchCombinations() {
  const combos = [];
  for (const cat of ALL_CATEGORIES) {
    for (const region of ALL_REGIONS) {
      combos.push({ category: cat, region, query: `${region} ${cat}` });
    }
  }
  // 셔플 (매일 다른 순서로 검색 → 중복 최소화)
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  return combos;
}

// ── 메인 ──
async function main() {
  const isTest = process.argv.includes('--test');
  const remaining = getRemainingCalls();

  console.log(`🚀 UI 잠재고객 크롤러 v3 시작 ${isTest ? '(테스트)' : ''}`);
  console.log(`   검색어: ${ALL_CATEGORIES.length}개 업종 × ${ALL_REGIONS.length}개 지역 = ${ALL_CATEGORIES.length * ALL_REGIONS.length} 조합`);
  console.log(`   오늘 남은 API: ${remaining}/${DAILY_API_TARGET}\n`);

  if (remaining <= 0 && !isTest) {
    console.log('⛔ 오늘 API 한도 소진. 내일 다시 실행됩니다.');
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const history = loadHistory();
  console.log(`📚 기존 DB: ${Object.keys(history.crawled).length}개 업체\n`);

  const prospects = [];
  const newProspects = [];
  const seen = new Set(Object.keys(history.crawled)); // 기존 DB 전부 seen에 로드
  let apiCalls = 0;
  let skippedDup = 0;

  const combos = generateSearchCombinations();
  const maxCombos = isTest ? 6 : combos.length;

  // API 예산: 각 조합당 최대 20페이지 (100건) 검색
  // 2만 API ÷ 20페이지 = 1000조합, 여유 있게 페이지 수 조절
  const pagesPerCombo = isTest ? 1 : Math.min(20, Math.floor(remaining / Math.min(maxCombos, 1000)));

  for (let ci = 0; ci < maxCombos; ci++) {
    const { category, region, query } = combos[ci];

    if (getRemainingCalls() <= 0) {
      console.log('\n⛔ API 한도 도달. 중단.');
      break;
    }

    // 진행률 (100개마다)
    if (ci % 100 === 0 && ci > 0) {
      const { usage, today } = getApiUsage();
      console.log(`\n📊 진행: ${ci}/${maxCombos} 조합 | API: ${usage[today]?.calls || 0}/${DAILY_API_TARGET} | 수집: ${prospects.length}건 | 신규: ${newProspects.length}건 | 중복스킵: ${skippedDup}건\n`);
    }

    console.log(`🔍 [${ci+1}/${maxCombos}] ${query}`);

    for (let page = 1; page <= pagesPerCombo; page++) {
      const start = (page - 1) * 5 + 1;
      if (start > 100) break; // 네이버 API 최대 start=100

      const items = await searchLocal(query, start, 5);
      if (items === null) break; // API 한도
      if (items.length === 0) break;
      apiCalls++;

      for (const item of items) {
        const name = stripHtml(item.title);
        const address = stripHtml(item.address);
        const dedup = name + '|' + address;

        if (seen.has(dedup)) { skippedDup++; continue; }
        seen.add(dedup);

        const homepage = item.link || '';
        const urlClass = classifyUrl(homepage);
        
        // SNS/블로그만 있는 건 스킵 (자체홈페이지/웹빌더/없음은 수집)
        if (urlClass.type === 'SNS/블로그') continue;

        const isNew = !history.crawled[dedup];
        
        // 홈페이지 분석 (없는 업체는 빈 결과)
        const analysis = (urlClass.type === '홈페이지없음') 
          ? { responsive: null, contacts: [], problems: ['홈페이지없음'], score: 0 }
          : await analyzeHomepage(homepage);
        const pkg = recommendPackage(analysis.score);

        // 연락처 분리
        const contactMap = {};
        analysis.contacts.forEach(c => {
          if (!contactMap[c.type]) contactMap[c.type] = [];
          contactMap[c.type].push(c.value);
        });

        // 전체 연락매체를 "매체:값" 형태로 통합
        const allContacts = analysis.contacts.map(c => `[${c.type}] ${c.value}`).join(' | ');

        const prospect = {
          category, name, address,
          placeLink: buildPlaceLink(item),
          homepage,
          siteType: urlClass.type,   // 자체홈페이지 / 웹빌더 / 홈페이지없음
          webBuilder: urlClass.builder, // 아임웹, Wix, 카페24 등
          talkTalk: analysis.talkTalk || 'X',  // 톡톡 활성화 O/X
          score: analysis.score,
          responsive: analysis.responsive === null ? '확인불가' : analysis.responsive ? 'Y' : 'N',
          problems: analysis.problems.join(' / '),
          recommendedPkg: `${pkg.name} (${pkg.price})`,
          phone: (contactMap['전화']||[]).join(' / '),
          email: (contactMap['이메일']||[]).join(' / '),
          kakao: (contactMap['카카오톡채널']||[]).join(' / '),
          openKakao: (contactMap['카카오오픈채팅']||[]).join(' / '),
          insta: (contactMap['인스타그램']||[]).join(' / '),
          facebook: (contactMap['페이스북']||[]).join(' / '),
          youtube: (contactMap['유튜브']||[]).join(' / '),
          naverBlog: (contactMap['네이버블로그']||[]).join(' / '),
          naverTalktalk: (contactMap['네이버톡톡']||[]).join(' / '),
          naverBook: (contactMap['네이버예약']||[]).join(' / '),
          naverCafe: (contactMap['네이버카페']||[]).join(' / '),
          twitter: (contactMap['트위터']||[]).join(' / '),
          line: (contactMap['라인']||[]).join(' / '),
          tiktok: (contactMap['틱톡']||[]).join(' / '),
          fax: (contactMap['팩스']||[]).join(' / '),
          smartstore: (contactMap['스마트스토어']||[]).join(' / '),
          allContacts,
          tmScript: analysis.problems.length > 0 ? generateTM(name, analysis.problems, pkg) : '',
          smsTemplate: analysis.problems.length > 0 ? generateSMS(name, analysis.problems, pkg) : '',
          isNew: isNew ? 'Y' : 'N',
          crawledAt: new Date().toISOString().slice(0,19).replace('T',' '),
        };

        prospects.push(prospect);
        if (isNew) newProspects.push(prospect);

        // 이메일 템플릿 파일
        if (prospect.email && analysis.problems.length > 0) {
          const emailDir = path.join(OUTPUT_DIR, 'emails');
          fs.mkdirSync(emailDir, { recursive: true });
          const safe = name.replace(/[/\\?%*:|"<>]/g, '_');
          fs.writeFileSync(path.join(emailDir, `${safe}.txt`), generateEmail(name, analysis.problems, pkg, homepage), 'utf8');
        }

        // 히스토리 업데이트
        history.crawled[dedup] = {
          name, address, homepage, category, score: analysis.score,
          siteType: urlClass.type, webBuilder: urlClass.builder,
          talkTalk: prospect.talkTalk,
          responsive: prospect.responsive,
          problems: prospect.problems,
          recommendedPkg: prospect.recommendedPkg,
          phone: prospect.phone,
          email: prospect.email,
          kakao: prospect.kakao,
          openKakao: prospect.openKakao,
          insta: prospect.insta,
          facebook: prospect.facebook,
          youtube: prospect.youtube,
          naverBlog: prospect.naverBlog,
          naverTalktalk: prospect.naverTalktalk,
          naverBook: prospect.naverBook,
          naverCafe: prospect.naverCafe,
          twitter: prospect.twitter,
          line: prospect.line,
          tiktok: prospect.tiktok,
          fax: prospect.fax,
          smartstore: prospect.smartstore,
          allContacts,
          firstSeen: history.crawled[dedup]?.firstSeen || new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          tmStatus: history.crawled[dedup]?.tmStatus || '미연락',
        };

        const typeEmoji = {'자체홈페이지':'🏠','웹빌더':'🔧','홈페이지없음':'❌'}[urlClass.type]||'';
        const ttEmoji = prospect.talkTalk === 'O' ? '💬' : '';
        if (isNew) console.log(`  🆕 [${analysis.score}점] ${typeEmoji}${ttEmoji}${urlClass.builder?'('+urlClass.builder+')':''} ${name} → ${homepage||'없음'}`);
      }

      await sleep(RATE_LIMIT_MS);
    }
  }

  // ── 점수순 정렬 ──
  prospects.sort((a,b) => b.score - a.score);
  newProspects.sort((a,b) => b.score - a.score);

  // ── CSV 저장 ──
  const BOM = '\ufeff';
  const header = '우선순위점수,업종,업체명,주소,네이버플레이스,홈페이지,사이트분류,웹빌더,톡톡활성화,반응형,발견된문제,추천패키지,전화,이메일,카카오톡채널,카카오오픈채팅,인스타그램,페이스북,유튜브,네이버블로그,네이버톡톡,네이버예약,네이버카페,트위터,라인,틱톡,팩스,스마트스토어,전체연락수단,TM스크립트,문자템플릿,신규여부,수집일시';
  const toRow = p => [
    p.score, p.category, p.name, p.address, p.placeLink, p.homepage,
    p.siteType, p.webBuilder, p.talkTalk, p.responsive, p.problems, p.recommendedPkg,
    p.phone, p.email, p.kakao, p.openKakao, p.insta,
    p.facebook, p.youtube, p.naverBlog, p.naverTalktalk, p.naverBook,
    p.naverCafe, p.twitter, p.line, p.tiktok, p.fax, p.smartstore,
    p.allContacts, p.tmScript, p.smsTemplate, p.isNew, p.crawledAt
  ].map(csvEscape).join(',');

  // 기존 CSV 유지 + 신규 추가 (append 모드)
  if (fs.existsSync(CSV_PATH) && newProspects.length > 0) {
    const existingContent = fs.readFileSync(CSV_PATH, 'utf8');
    const newRows = newProspects.map(toRow);
    fs.writeFileSync(CSV_PATH, existingContent + '\n' + newRows.join('\n'), 'utf8');
  } else if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, BOM + header + '\n' + prospects.map(toRow).join('\n'), 'utf8');
  }

  // 오늘 신규 CSV
  const today = new Date().toISOString().slice(0,10);
  const newCsvPath = path.join(OUTPUT_DIR, `new-${today}.csv`);
  if (newProspects.length > 0) {
    fs.writeFileSync(newCsvPath, BOM + header + '\n' + newProspects.map(toRow).join('\n'), 'utf8');
  }

  // 전체 CSV 재생성 (히스토리 기반)
  const allCsvPath = path.join(OUTPUT_DIR, 'prospects-all.csv');
  const allRows = Object.entries(history.crawled).map(([key, h]) => {
    return [h.score||0, h.category, h.name, h.address, '', h.homepage, h.siteType||'', h.webBuilder||'', h.talkTalk||'', h.responsive||'', h.problems||'', h.recommendedPkg||'', h.phone||'', h.email||'', h.kakao||'', h.openKakao||'', h.insta||'', h.facebook||'', h.youtube||'', h.naverBlog||'', h.naverTalktalk||'', h.naverBook||'', h.naverCafe||'', h.twitter||'', h.line||'', h.tiktok||'', h.fax||'', h.smartstore||'', h.allContacts||'', '', '', h.tmStatus, h.lastSeen].map(csvEscape).join(',');
  });
  fs.writeFileSync(allCsvPath, BOM + header + '\n' + allRows.join('\n'), 'utf8');

  // ── 분류별 CSV 분리 ──
  const ownSite = prospects.filter(p => p.siteType === '자체홈페이지');
  const builderSite = prospects.filter(p => p.siteType === '웹빌더');
  const noSite = prospects.filter(p => p.siteType === '홈페이지없음');

  if (ownSite.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'type-자체홈페이지.csv'), BOM + header + '\n' + ownSite.map(toRow).join('\n'), 'utf8');
  }
  if (builderSite.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'type-웹빌더.csv'), BOM + header + '\n' + builderSite.map(toRow).join('\n'), 'utf8');
  }
  if (noSite.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'type-홈페이지없음.csv'), BOM + header + '\n' + noSite.map(toRow).join('\n'), 'utf8');
  }

  // 히스토리 저장
  saveJSON(DB_PATH, history);

  // ── 결과 ──
  const { usage, today: td } = getApiUsage();
  console.log('\n' + '='.repeat(60));
  console.log('📊 크롤링 결과 v3');
  console.log('='.repeat(60));
  console.log(`금일 API 사용: ${usage[td]?.calls || 0}/${DAILY_API_TARGET}`);
  console.log(`신규 수집: ${newProspects.length}건`);
  console.log(`중복 스킵: ${skippedDup}건`);
  console.log(`DB 누적: ${Object.keys(history.crawled).length}개 업체`);
  console.log(`CSV 신규: ${newCsvPath}`);
  console.log(`CSV 전체: ${allCsvPath}`);

  // 사이트 분류
  console.log(`\n🏠 사이트 분류:`);
  console.log(`  🏠 자체홈페이지: ${ownSite.length}건 → type-자체홈페이지.csv`);
  console.log(`  🔧 웹빌더: ${builderSite.length}건 → type-웹빌더.csv`);
  if (builderSite.length > 0) {
    const builders = {};
    builderSite.forEach(p => { builders[p.webBuilder] = (builders[p.webBuilder]||0)+1; });
    Object.entries(builders).sort((a,b)=>b[1]-a[1]).forEach(([b,c]) => console.log(`     ${b}: ${c}건`));
  }
  console.log(`  ❌ 홈페이지없음: ${noSite.length}건 → type-홈페이지없음.csv`);

  // 등급
  const urgent = newProspects.filter(p => p.score >= 60).length;
  const mid = newProspects.filter(p => p.score >= 30 && p.score < 60).length;
  const low = newProspects.filter(p => p.score < 30).length;
  console.log(`\n🎯 신규 잠재고객 등급 (자체홈페이지 기준):`);
  console.log(`  🔴 긴급: ${urgent}건 | 🟡 중간: ${mid}건 | 🟢 경미: ${low}건`);

  // 연락 가능
  const wp = newProspects.filter(p=>p.phone).length;
  const we = newProspects.filter(p=>p.email).length;
  const wk = newProspects.filter(p=>p.kakao).length;
  console.log(`📞 연락가능: 전화 ${wp} | 이메일 ${we} | 카톡 ${wk}`);

  // TOP 5
  console.log('\n🏆 TOP 5 신규:');
  newProspects.slice(0,5).forEach((p,i) => {
    console.log(`  ${i+1}. [${p.score}점] ${p.name} (${p.category}) → ${p.recommendedPkg}`);
    if (p.phone) console.log(`     📞 ${p.phone}`);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
main().catch(e => { console.error('❌:', e); process.exit(1); });
