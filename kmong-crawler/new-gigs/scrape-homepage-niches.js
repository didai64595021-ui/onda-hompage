#!/usr/bin/env node
/**
 * 홈페이지 관련 니치 10개 + 웹빌더 5종 실측
 *  - 카테고리 + 검색어 둘 다 지원
 *  - 출력: homepage-niches-report.json
 *  - 완료 시 텔레그램 리포트 자동 전송
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = Date.now();
const OUT_DIR = path.join(__dirname, 'diag-out', `homepage-niches-${TS}`);
fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT = path.join(__dirname, 'homepage-niches-report.json');

// 카테고리 (홈페이지 관련)
const CATEGORIES = [
  { id: '601', name: 'IT 홈페이지 신규 제작' },
  { id: '636', name: 'IT 홈페이지 수정·유지보수' },
  { id: '632', name: 'IT 랜딩페이지' },
  { id: '631', name: 'IT 워드프레스' },
  { id: '638', name: 'IT 카페24' },
  { id: '639', name: 'IT 아임웹' },
  { id: '660', name: 'IT 노션' },
  { id: '633', name: 'IT 퍼블리싱' },
  { id: '634', name: 'IT 검색최적화·SEO' },
];

// 검색어 (니치별 실수요 파악)
const SEARCHES = [
  { key: 'imweb_move',  kw: '아임웹 이전',        niche: '웹빌더 탈출: 아임웹' },
  { key: 'sixshop_move',kw: '식스샵 이전',        niche: '웹빌더 탈출: 식스샵' },
  { key: 'wix_move',    kw: 'Wix 이전',           niche: '웹빌더 탈출: Wix' },
  { key: 'inquiry_form',kw: '문의폼',             niche: '문의폼 추가' },
  { key: 'email_alert', kw: '홈페이지 이메일',    niche: '이메일 알림' },
  { key: 'speed_opt',   kw: '홈페이지 속도',      niche: '속도 최적화' },
  { key: 'ssl_transfer',kw: 'SSL 설치',           niche: 'SSL 전환' },
  { key: 'multilang',   kw: '다국어 홈페이지',    niche: '다국어' },
  { key: 'img_translate',kw: '상세페이지 번역',   niche: '상세페이지 이미지 번역' },
  { key: 'legacy_renew',kw: '홈페이지 리뉴얼',    niche: '레거시 현대화' },
  { key: 'pwa_app',     kw: 'PWA 홈페이지',       niche: 'PWA 전환' },
  { key: 'seo_migrate', kw: '301 리디렉트',       niche: 'SEO 마이그레이션' },
  { key: 'reservation', kw: '홈페이지 예약',      niche: '예약 시스템' },
  { key: 'responsive_fix',kw: '모바일 반응형 수정',niche: '반응형 수정(기존)' },
];

function parsePrice(text) {
  const m1 = text.match(/([\d,]+)\s*원/);
  if (m1) return parseInt(m1[1].replace(/,/g, ''), 10);
  const m2 = text.match(/(\d+)\s*만\s*원/);
  if (m2) return parseInt(m2[1], 10) * 10000;
  return null;
}
function parseRating(text) {
  const m = text.match(/^(\d\.\d)\s*$/m);
  return m ? parseFloat(m[1]) : null;
}
function parseReviews(text) {
  const m = text.match(/\((\d{1,4}(?:,\d{3})*)\)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

async function scrapeUrl(page, url, label) {
  console.log(`\n=== ${label} ===\n  ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await sleep(600);
  }
  const finalUrl = page.url();
  const isError = await page.evaluate(() => /찾을 수 없|페이지를 찾을/i.test(document.title));
  if (isError) return { finalUrl, error: '404', cards: [] };

  const cards = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')].filter(a => /\/gig\/\d+/.test(a.href));
    const seen = new Set();
    const out = [];
    for (const a of links) {
      const href = a.href;
      const id = (href.match(/\/gig\/(\d+)/) || [])[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const text = (a.innerText || '').trim();
      out.push({ id, href, text });
    }
    return out;
  });

  const parsed = cards.map(c => ({
    id: c.id,
    href: c.href,
    title: (c.text.split('\n')[0] || '').trim().slice(0, 80),
    price: parsePrice(c.text),
    rating: parseRating(c.text),
    reviews: parseReviews(c.text),
  }));

  const prices = parsed.filter(p => p.price && p.price >= 1000).map(p => p.price).sort((a,b)=>a-b);
  const reviews = parsed.filter(p => p.reviews).map(p => p.reviews);
  const stats = prices.length === 0 ? null : {
    count: prices.length,
    min: prices[0],
    max: prices[prices.length - 1],
    avg: Math.round(prices.reduce((a,b)=>a+b,0) / prices.length),
    median: prices[Math.floor(prices.length / 2)],
    p25: prices[Math.floor(prices.length * 0.25)],
    p75: prices[Math.floor(prices.length * 0.75)],
  };
  const reviewStats = reviews.length === 0 ? null : {
    count: reviews.length,
    totalReviews: reviews.reduce((a,b)=>a+b,0),
    top3Reviews: reviews.sort((a,b)=>b-a).slice(0,3),
  };

  console.log(`  카드 ${parsed.length} | 가격 ${prices.length} | 중앙 ${stats?.median ? Math.round(stats.median/10000)+'만' : '-'} | 리뷰 총 ${reviewStats?.totalReviews || 0}`);

  return { finalUrl, totalCards: parsed.length, stats, reviewStats, cards: parsed };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 }, locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  const results = { categories: {}, searches: {} };

  // 카테고리
  for (const cat of CATEGORIES) {
    const url = `https://kmong.com/category/${cat.id}`;
    try {
      const r = await scrapeUrl(page, url, `CAT [${cat.id}] ${cat.name}`);
      results.categories[cat.id] = { ...cat, ...r };
      fs.writeFileSync(path.join(OUT_DIR, `cat-${cat.id}.json`), JSON.stringify({ ...cat, ...r }, null, 2));
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      results.categories[cat.id] = { ...cat, error: e.message };
    }
  }

  // 검색어
  for (const s of SEARCHES) {
    const url = `https://kmong.com/search?keyword=${encodeURIComponent(s.kw)}`;
    try {
      const r = await scrapeUrl(page, url, `SEARCH [${s.key}] "${s.kw}" (${s.niche})`);
      results.searches[s.key] = { ...s, ...r };
      fs.writeFileSync(path.join(OUT_DIR, `search-${s.key}.json`), JSON.stringify({ ...s, ...r }, null, 2));
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      results.searches[s.key] = { ...s, error: e.message };
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), ...results }, null, 2));
  console.log(`\n==== 완료 ====\n  ${REPORT}\n  ${OUT_DIR}`);
  await browser.close();

  // 텔레그램 리포트 생성
  const lines = ['📊 크몽 홈페이지 니치 실측 완료', ''];
  lines.push('━ 카테고리 시세 (상위 1페이지) ━');
  for (const cat of CATEGORIES) {
    const r = results.categories[cat.id];
    if (!r || r.error || !r.stats) { lines.push(`• ${cat.name}: 실패/데이터없음`); continue; }
    const m = (v) => v ? Math.round(v/10000)+'만' : '-';
    lines.push(`• ${cat.name} (${r.totalCards}개): 중앙 ${m(r.stats.median)} / 평균 ${m(r.stats.avg)} / ${m(r.stats.min)}~${m(r.stats.max)}`);
  }
  lines.push('');
  lines.push('━ 니치별 검색어 결과 ━');
  for (const s of SEARCHES) {
    const r = results.searches[s.key];
    if (!r || r.error) { lines.push(`• ${s.niche}: 실패`); continue; }
    const m = (v) => v ? Math.round(v/10000)+'만' : '-';
    const totalR = r.reviewStats?.totalReviews || 0;
    lines.push(`• ${s.niche} [${s.kw}] (${r.totalCards}개, 리뷰총${totalR}): 중앙 ${m(r.stats?.median)} / ${m(r.stats?.min)}~${m(r.stats?.max)}`);
  }
  lines.push('');
  lines.push(`상세: ${path.basename(REPORT)}`);

  const msg = lines.join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'telegram-report.txt'), msg);
  try {
    execSync(`node /home/onda/scripts/telegram-sender.js ${JSON.stringify(msg)}`, { stdio: 'inherit' });
    console.log('텔레그램 전송 완료');
  } catch (e) {
    console.log('텔레그램 전송 실패:', e.message);
  }
})();
