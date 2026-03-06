/**
 * 경쟁사 비교 분석 도구
 * 같은 업종/지역 내 잘 만든 사이트 vs 타깃 업체 비교
 * 
 * 사용법:
 *   node compare.js "업체명"              해당 업체 vs 같은 업종 경쟁사 비교
 *   node compare.js --category 치과 강남  업종+지역 전체 비교
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const NAVER_CLIENT_ID = 'Su_kCP4chZNUyLO5wZEQ';
const NAVER_CLIENT_SECRET = 'I4fA34bv0e';
const OUTPUT_DIR = path.join(__dirname, 'output');
const COMPARE_DIR = path.join(OUTPUT_DIR, 'comparisons');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const EXCLUDED_DOMAINS = [
  'blog.naver.com', 'cafe.naver.com', 'instagram.com', 'facebook.com',
  'pf.kakao.com', 'youtube.com', 'tistory.com', 'smartstore.naver.com',
];

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8').replace(/^\ufeff/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current); return result;
}

async function analyzeCompetitor(url) {
  try {
    const start = Date.now();
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3,
      validateStatus: s => s < 400,
    });
    const loadTime = Date.now() - start;
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

    const viewport = $('meta[name="viewport"]').attr('content') || '';
    let hasMediaQuery = false;
    $('style').each((_, el) => { if ($(el).text().includes('@media')) hasMediaQuery = true; });

    return {
      responsive: viewport.includes('device-width') || hasMediaQuery,
      hasPhoneBtn: $('a[href^="tel:"]').length > 0,
      hasKakao: html.toLowerCase().includes('pf.kakao.com'),
      hasForm: $('form').length > 0,
      hasMap: html.toLowerCase().includes('map.naver.com') || html.toLowerCase().includes('maps.google') || $('iframe[src*="map"]').length > 0,
      loadTime,
      score: 0, // 좋은 점수 (높을수록 좋음)
    };
  } catch {
    return null;
  }
}

function scoreGood(a) {
  let s = 0;
  if (a.responsive) s += 30;
  if (a.hasPhoneBtn) s += 20;
  if (a.hasKakao) s += 15;
  if (a.hasForm) s += 15;
  if (a.hasMap) s += 10;
  if (a.loadTime < 3000) s += 10;
  return s;
}

async function searchLocal(query) {
  try {
    const res = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      params: { query, display: 5, start: 1 },
      headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET },
      timeout: 10000,
    });
    return res.data.items || [];
  } catch { return []; }
}

async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(COMPARE_DIR, { recursive: true });

  const csvPath = path.join(OUTPUT_DIR, 'prospects.csv');
  if (!fs.existsSync(csvPath)) { console.log('❌ prospects.csv 없음'); return; }
  const prospects = parseCSV(csvPath);

  let target;
  if (args.includes('--category')) {
    const catIdx = args.indexOf('--category');
    const category = args[catIdx + 1];
    const region = args[catIdx + 2] || '';
    console.log(`📊 ${region} ${category} 업종 전체 비교\n`);
    
    const items = await searchLocal(`${region} ${category}`);
    const results = [];
    
    for (const item of items) {
      const name = (item.title || '').replace(/<[^>]*>/g, '');
      const url = item.link;
      if (!url || EXCLUDED_DOMAINS.some(d => url.includes(d))) continue;
      
      console.log(`  분석: ${name} → ${url}`);
      const analysis = await analyzeCompetitor(url);
      if (analysis) {
        analysis.score = scoreGood(analysis);
        results.push({ name, url, ...analysis });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    console.log('\n📊 경쟁사 순위 (잘 만든 순):\n');
    results.forEach((r, i) => {
      const status = [
        r.responsive ? '✅반응형' : '❌비반응형',
        r.hasPhoneBtn ? '✅전화버튼' : '❌전화버튼X',
        r.hasKakao ? '✅카톡' : '❌카톡X',
        r.hasForm ? '✅폼' : '❌폼X',
        r.hasMap ? '✅지도' : '❌지도X',
      ].join(' ');
      console.log(`${i + 1}. [${r.score}점] ${r.name}`);
      console.log(`   ${r.url}`);
      console.log(`   ${status} | ${(r.loadTime / 1000).toFixed(1)}초`);
      console.log('');
    });
    return;
  }

  // 특정 업체 비교
  const name = args.join(' ');
  target = prospects.find(p => p['업체명']?.includes(name));
  if (!target) { console.log(`❌ "${name}" 못 찾음`); return; }

  console.log(`📊 ${target['업체명']} 경쟁사 비교\n`);
  console.log(`타깃: ${target['업체명']} (${target['업종']})`);
  console.log(`점수: ${target['우선순위점수']}점 (문제 많을수록 높음)`);
  console.log(`문제: ${target['발견된문제']}\n`);

  // 같은 업종 경쟁사 검색
  const region = target['주소']?.split(' ').slice(0, 2).join(' ') || '서울';
  const competitors = await searchLocal(`${region} ${target['업종']}`);

  console.log(`🔍 ${region} ${target['업종']} 경쟁사 분석:\n`);

  const results = [];
  for (const item of competitors) {
    const cName = (item.title || '').replace(/<[^>]*>/g, '');
    const url = item.link;
    if (!url || EXCLUDED_DOMAINS.some(d => url.includes(d))) continue;
    if (cName === target['업체명']) continue;

    console.log(`  분석: ${cName} → ${url}`);
    const analysis = await analyzeCompetitor(url);
    if (analysis) {
      analysis.score = scoreGood(analysis);
      results.push({ name: cName, url, ...analysis });
    }
  }

  results.sort((a, b) => b.score - a.score);

  console.log('\n━'.repeat(50));
  console.log(`\n📋 비교 결과:\n`);
  
  // 타깃 vs 경쟁사 중 최고
  const best = results[0];
  if (best) {
    console.log(`🏆 경쟁사 1위: ${best.name} (${best.score}점/100)`);
    console.log(`   ${best.responsive ? '✅' : '❌'} 반응형 | ${best.hasPhoneBtn ? '✅' : '❌'} 전화버튼 | ${best.hasKakao ? '✅' : '❌'} 카톡 | ${best.hasForm ? '✅' : '❌'} 문의폼 | ${best.hasMap ? '✅' : '❌'} 지도`);
    console.log('');
  }

  console.log(`🎯 ${target['업체명']} (문제점수 ${target['우선순위점수']}점)`);
  console.log(`   ${target['발견된문제']}`);
  console.log('');

  if (best && best.score > 50) {
    console.log(`💬 TM 멘트 제안:`);
    console.log(`   "대표님, 같은 지역 ${target['업종']} 중에 ${best.name}은 모바일 최적화가 잘 되어있거든요.`);
    console.log(`    대표님 사이트는 ${target['발견된문제']?.split('/')[0]?.trim()} 상태라 고객이 이탈할 수 있어요.`);
    console.log(`    ${target['추천패키지']}로 바로 개선 가능합니다."`);
  }

  // 결과 저장
  const safeName = target['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
  const report = {
    target: { name: target['업체명'], score: target['우선순위점수'], problems: target['발견된문제'] },
    competitors: results,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(COMPARE_DIR, `${safeName}.json`), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n💾 저장: ${path.join(COMPARE_DIR, safeName + '.json')}`);
}

main().catch(e => console.error('❌ 에러:', e));
