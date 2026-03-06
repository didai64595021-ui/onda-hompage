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
const RATE_LIMIT_MS = 120;
const HOMEPAGE_TIMEOUT = 5000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── 업종 (사업계획서 기반 전체) ──
const CATEGORIES = [
  // 1차 타깃
  '성형외과', '피부과', '치과', '안과', '정형외과', '산부인과', '한의원',
  '영어학원', '수학학원', '코딩학원', '미술학원', '음악학원', '입시학원',
  '인테리어', '리모델링', '인테리어업체',
  '법률사무소', '변호사사무소',
  '부동산', '공인중개사',
  '웨딩홀', '웨딩업체', '웨딩플래너',
  '호텔', '펜션', '리조트',
  '아파트분양', '모델하우스', '분양대행',
  // 1차 타깃 추가 (사업계획서)
  '입주청소', '이사청소', '청소업체',
  '미용실', '헤어샵', '네일샵', '속눈썹',
  '필라테스', 'PT', '요가', '헬스장',
  // 2차 타깃
  '중고차', '자동차매매',
];

const REGIONS = [
  '서울', '강남', '서초', '송파', '마포', '홍대', '잠실', '종로', '영등포', '성동',
  '수원', '성남', '분당', '일산', '부천', '인천', '용인', '화성', '안양', '고양',
];

// ── 제외 도메인 ──
const EXCLUDED_DOMAINS = [
  'blog.naver.com', 'cafe.naver.com', 'post.naver.com',
  'blog.daum.net', 'cafe.daum.net',
  'tistory.com', 'brunch.co.kr',
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'pf.kakao.com', 'open.kakao.com',
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

// ── 히스토리 DB ──
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { crawled: {}, tm_status: {} }; }
}
function saveHistory(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
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
    if (e.response?.status === 429) {
      console.log('  ⏳ API 한도 도달, 1초 대기...');
      await sleep(1000);
      return searchLocal(query, start, display);
    }
    console.error(`  [API에러] ${query}: ${e.message}`);
    return [];
  }
}

// ── 홈페이지 분석 (반응형 + 연락처 + UI 점수) ──
async function analyzeHomepage(url) {
  const result = {
    responsive: null,
    hasPhoneBtn: false,
    hasKakaoBtn: false,
    hasContactForm: false,
    hasMap: false,
    pageSpeed: null,
    contacts: [],
    problems: [],
    score: 0,
  };

  try {
    const start = Date.now();
    const res = await axios.get(url, {
      timeout: HOMEPAGE_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3,
      validateStatus: s => s < 400,
    });
    result.pageSpeed = Date.now() - start;

    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

    // ── 반응형 체크 ──
    const viewportMeta = $('meta[name="viewport"]').attr('content') || '';
    const hasViewport = viewportMeta.includes('device-width');
    let hasMediaQuery = false;
    $('style').each((_, el) => { if ($(el).text().includes('@media')) hasMediaQuery = true; });
    result.responsive = hasViewport || hasMediaQuery;

    // ── UI 요소 체크 ──
    const htmlLower = html.toLowerCase();

    // 전화 버튼
    result.hasPhoneBtn = $('a[href^="tel:"]').length > 0;

    // 카카오 버튼
    result.hasKakaoBtn = htmlLower.includes('pf.kakao.com') || htmlLower.includes('kakao') && htmlLower.includes('button');

    // 문의폼
    result.hasContactForm = $('form').length > 0 || htmlLower.includes('contact') || htmlLower.includes('문의');

    // 지도
    result.hasMap = htmlLower.includes('map.naver.com') || htmlLower.includes('maps.google') ||
      htmlLower.includes('kakaomap') || $('iframe[src*="map"]').length > 0;

    // ── 문제점 + 점수 계산 ──
    if (!result.responsive) { result.problems.push('비반응형(모바일X)'); result.score += 30; }
    if (!result.hasPhoneBtn) { result.problems.push('전화버튼 없음'); result.score += 20; }
    if (!result.hasKakaoBtn) { result.problems.push('카톡버튼 없음'); result.score += 15; }
    if (!result.hasContactForm) { result.problems.push('문의폼 없음'); result.score += 15; }
    if (!result.hasMap) { result.problems.push('지도 없음'); result.score += 10; }
    if (result.pageSpeed > 3000) { result.problems.push(`로딩느림(${(result.pageSpeed/1000).toFixed(1)}초)`); result.score += 10; }

    // ── 연락처 추출 ──
    // 전화번호
    const phonePatterns = html.match(/(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}|1\d{3}[-.\s]?\d{4})/g) || [];
    phonePatterns.forEach(p => {
      const cleaned = p.replace(/\s/g, '');
      if (cleaned.length >= 9 && cleaned.length <= 14) result.contacts.push({ type: '전화', value: cleaned });
    });

    // tel: 링크
    $('a[href^="tel:"]').each((_, el) => {
      const tel = $(el).attr('href').replace('tel:', '').replace(/\s/g, '').trim();
      if (tel && !result.contacts.find(c => c.value === tel))
        result.contacts.push({ type: '전화', value: tel });
    });

    // 이메일
    const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    emails.forEach(e => {
      if (!e.includes('example') && !e.includes('test') && !e.includes('wixpress') && !e.includes('sentry'))
        result.contacts.push({ type: '이메일', value: e });
    });

    // mailto:
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (mail && !result.contacts.find(c => c.value === mail))
        result.contacts.push({ type: '이메일', value: mail });
    });

    // 카카오톡
    const kakaoLinks = html.match(/pf\.kakao\.com\/[a-zA-Z0-9_]+/g) || [];
    kakaoLinks.forEach(k => result.contacts.push({ type: '카카오톡', value: 'https://' + k }));

    // 카카오 오픈채팅
    const openKakao = html.match(/open\.kakao\.com\/o\/[a-zA-Z0-9]+/g) || [];
    openKakao.forEach(k => result.contacts.push({ type: '카카오오픈채팅', value: 'https://' + k }));

    // 인스타그램
    const insta = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/g) || [];
    insta.forEach(i => result.contacts.push({ type: '인스타그램', value: 'https://' + i }));

    // 네이버 예약
    const naverBook = html.match(/booking\.naver\.com\/[^\s"'<>]+/g) || [];
    naverBook.forEach(b => result.contacts.push({ type: '네이버예약', value: 'https://' + b }));

    // 중복 제거
    const seen = new Set();
    result.contacts = result.contacts.filter(c => {
      const key = c.type + c.value;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  } catch (e) {
    result.problems.push('사이트접속불가');
  }

  return result;
}

// ── 패키지 추천 ──
function recommendPackage(score, problems) {
  if (score >= 80) return { name: '풀 리뉴얼 라이트', price: '50~80만원' };
  if (score >= 60) return { name: '모바일 응급팩', price: '29~35만원' };
  if (score >= 40) return { name: '전환형 패키지', price: '19~22만원' };
  return { name: '스타터팩', price: '10~12만원' };
}

// ── TM 스크립트 자동 생성 ──
function generateTMScript(name, problems, pkg) {
  const problemText = problems.slice(0, 2).join(', ');
  return `안녕하세요 대표님. ${name} 홈페이지 모바일에서 확인해보니 ${problemText} 상태입니다. ${pkg.name}(${pkg.price})로 24시간 내 개선 가능한데, 전후 비교 시안 보내드릴까요?`;
}

// ── 문자 템플릿 ──
function generateSMSTemplate(name, problems, pkg, homepage) {
  const problemText = problems.slice(0, 2).join(', ');
  return `[웹사이트 개선 안내] ${name} 대표님, 모바일에서 ${problemText} 확인됐습니다. ${pkg.name} ${pkg.price}으로 24시간 내 개선 가능합니다. 전후 비교 시안 무료 제공. 문의: 010-XXXX-XXXX`;
}

// ── 이메일 템플릿 ──
function generateEmailTemplate(name, problems, pkg, homepage) {
  return `제목: [${name}] 모바일 홈페이지 무료 진단 결과

${name} 대표님 안녕하세요.

홈페이지(${homepage}) 모바일 점검 결과를 공유드립니다.

📋 발견된 문제:
${problems.map(p => `  • ${p}`).join('\n')}

💡 추천 솔루션: ${pkg.name} (${pkg.price})
  - 24~48시간 내 작업 완료
  - 전후 비교 시안 무료 제공
  - 1회 수정 포함

궁금하신 점 있으시면 편하게 연락주세요.
전화: 010-XXXX-XXXX | 카톡: XXXXX`;
}

// ── HTML 태그 제거 ──
function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').trim();
}

// ── 플레이스 링크 ──
function buildPlaceLink(item) {
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
  console.log(`🚀 UI 잠재고객 크롤러 v2 시작 ${isTest ? '(테스트 모드)' : ''}`);
  console.log(`   업종 ${CATEGORIES.length}개 × 지역 ${REGIONS.length}개 = ${CATEGORIES.length * REGIONS.length} 조합\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 히스토리 로드
  const history = loadHistory();
  const existingCount = Object.keys(history.crawled).length;
  console.log(`📚 기존 DB: ${existingCount}개 업체\n`);

  const prospects = [];
  const newProspects = [];
  const seen = new Set();
  let apiCalls = 0;

  const categories = isTest ? CATEGORIES.slice(0, 3) : CATEGORIES;
  const regions = isTest ? REGIONS.slice(0, 2) : REGIONS;

  for (const category of categories) {
    for (const region of regions) {
      const query = `${region} ${category}`;
      console.log(`🔍 검색: ${query}`);

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
          if (!isOwnWebsite(homepage)) continue;

          // 히스토리 체크
          const isNew = !history.crawled[dedup];

          console.log(`  ${isNew ? '🆕' : '📋'} ${name} → ${homepage}`);

          // 홈페이지 분석
          const analysis = await analyzeHomepage(homepage);

          // 패키지 추천
          const pkg = recommendPackage(analysis.score, analysis.problems);

          // 연락처 분리
          const contactMap = {};
          analysis.contacts.forEach(c => {
            if (!contactMap[c.type]) contactMap[c.type] = [];
            contactMap[c.type].push(c.value);
          });

          const phone = (contactMap['전화'] || []).join(' / ');
          const email = (contactMap['이메일'] || []).join(' / ');
          const kakao = (contactMap['카카오톡'] || []).join(' / ');
          const openKakao = (contactMap['카카오오픈채팅'] || []).join(' / ');
          const insta = (contactMap['인스타그램'] || []).join(' / ');
          const naverBook = (contactMap['네이버예약'] || []).join(' / ');

          // TM 스크립트
          const tmScript = analysis.problems.length > 0
            ? generateTMScript(name, analysis.problems, pkg)
            : '';
          const smsTemplate = analysis.problems.length > 0
            ? generateSMSTemplate(name, analysis.problems, pkg, homepage)
            : '';
          const emailTemplate = analysis.problems.length > 0
            ? generateEmailTemplate(name, analysis.problems, pkg, homepage)
            : '';

          const prospect = {
            category,
            name,
            address,
            placeLink: buildPlaceLink(item),
            homepage,
            score: analysis.score,
            responsive: analysis.responsive === null ? '확인불가' : analysis.responsive ? 'Y' : 'N',
            problems: analysis.problems.join(' / '),
            recommendedPkg: `${pkg.name} (${pkg.price})`,
            phone, email, kakao, openKakao, insta, naverBook,
            tmScript,
            smsTemplate,
            emailTemplate,
            isNew: isNew ? 'Y' : 'N',
            crawledAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          };

          prospects.push(prospect);
          if (isNew) newProspects.push(prospect);

          // 히스토리 업데이트
          history.crawled[dedup] = {
            name, address, homepage, category,
            score: analysis.score,
            firstSeen: history.crawled[dedup]?.firstSeen || new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            tmStatus: history.crawled[dedup]?.tmStatus || '미연락',
          };
        }

        await sleep(RATE_LIMIT_MS);
      }
    }
  }

  // ── 점수 높은 순 정렬 ──
  prospects.sort((a, b) => b.score - a.score);
  newProspects.sort((a, b) => b.score - a.score);

  // ── CSV 저장 (전체) ──
  const BOM = '\ufeff';
  const header = '우선순위점수,업종,업체명,주소,네이버플레이스,홈페이지,반응형,발견된문제,추천패키지,전화,이메일,카카오톡,카카오오픈채팅,인스타그램,네이버예약,TM스크립트,문자템플릿,신규여부,수집일시';
  const toRow = (p) => [
    p.score, p.category, p.name, p.address, p.placeLink, p.homepage,
    p.responsive, p.problems, p.recommendedPkg,
    p.phone, p.email, p.kakao, p.openKakao, p.insta, p.naverBook,
    p.tmScript, p.smsTemplate, p.isNew, p.crawledAt
  ].map(csvEscape).join(',');

  const rows = prospects.map(toRow);
  fs.writeFileSync(CSV_PATH, BOM + header + '\n' + rows.join('\n'), 'utf8');

  // ── 신규만 별도 CSV ──
  const today = new Date().toISOString().slice(0, 10);
  const newCsvPath = path.join(OUTPUT_DIR, `new-${today}.csv`);
  if (newProspects.length > 0) {
    const newRows = newProspects.map(toRow);
    fs.writeFileSync(newCsvPath, BOM + header + '\n' + newRows.join('\n'), 'utf8');
  }

  // ── 이메일 템플릿 별도 저장 ──
  const emailDir = path.join(OUTPUT_DIR, 'emails');
  fs.mkdirSync(emailDir, { recursive: true });
  newProspects.filter(p => p.email).forEach(p => {
    const safeName = p.name.replace(/[/\\?%*:|"<>]/g, '_');
    fs.writeFileSync(path.join(emailDir, `${safeName}.txt`), p.emailTemplate, 'utf8');
  });

  // ── 히스토리 저장 ──
  saveHistory(history);

  // ── 결과 요약 ──
  console.log('\n' + '='.repeat(60));
  console.log('📊 크롤링 결과 요약 v2');
  console.log('='.repeat(60));
  console.log(`총 수집: ${prospects.length}건 (신규: ${newProspects.length}건)`);
  console.log(`API 호출: ${apiCalls}회`);
  console.log(`DB 누적: ${Object.keys(history.crawled).length}개 업체`);
  console.log(`CSV 전체: ${CSV_PATH}`);
  if (newProspects.length > 0) console.log(`CSV 신규: ${newCsvPath}`);

  // 점수 분포
  const highScore = prospects.filter(p => p.score >= 60).length;
  const midScore = prospects.filter(p => p.score >= 30 && p.score < 60).length;
  const lowScore = prospects.filter(p => p.score < 30).length;
  console.log(`\n🎯 잠재고객 등급:`);
  console.log(`  🔴 긴급 (60+점): ${highScore}건 → 풀리뉴얼/응급팩 추천`);
  console.log(`  🟡 중간 (30~59점): ${midScore}건 → 전환형/스타터팩 추천`);
  console.log(`  🟢 경미 (0~29점): ${lowScore}건 → 스타터팩 추천`);

  // 업종별
  const byCategory = {};
  prospects.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + 1; });
  console.log('\n📋 업종별:');
  Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, cnt]) => {
    console.log(`  ${cat}: ${cnt}건`);
  });

  // 연락수단 통계
  const withPhone = prospects.filter(p => p.phone).length;
  const withEmail = prospects.filter(p => p.email).length;
  const withKakao = prospects.filter(p => p.kakao).length;
  console.log(`\n📞 연락 가능:`);
  console.log(`  전화: ${withPhone}건`);
  console.log(`  이메일: ${withEmail}건`);
  console.log(`  카카오톡: ${withKakao}건`);

  // TOP 5 우선순위
  console.log('\n🏆 TOP 5 우선 TM 대상:');
  prospects.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.score}점] ${p.name} (${p.category}) → ${p.recommendedPkg}`);
    console.log(`     문제: ${p.problems}`);
    if (p.phone) console.log(`     전화: ${p.phone}`);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error('❌ 크롤러 에러:', e); process.exit(1); });
