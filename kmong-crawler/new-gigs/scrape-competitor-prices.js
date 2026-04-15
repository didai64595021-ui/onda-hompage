#!/usr/bin/env node
/**
 * 카테고리 1페이지 실 경쟁자 가격 실측
 *  - 우리 55상품의 7-8개 카테고리 페이지 진입
 *  - 각 카테고리 상위 상품 카드 추출 (href, title, rating, reviewCount, price)
 *  - 가격 파싱: "1,320,000원~" → 1320000
 *  - 출력: scrape-competitor-prices.json + 통계 요약
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT_DIR = path.join(__dirname, 'diag-out', `competitor-prices-${Date.now()}`);
fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT = path.join(__dirname, 'competitor-prices-report.json');

// 우리 55상품의 카테고리 (probe 결과 + KMONG_CONTEXT.md 매핑)
const CATEGORIES = [
  { id: '601',   name: 'IT 홈페이지 신규 제작', ourCount: 8 },
  { id: '663',   name: 'IT 업무 자동화',         ourCount: 22 },
  { id: '667',   name: 'IT 맞춤형 챗봇·GPT',     ourCount: 10 },
  { id: '617',   name: 'IT 봇·챗봇 (참조)',      ourCount: 0 },
  { id: '645',   name: 'IT 크롤링·스크래핑',     ourCount: 0 },
  { id: '113',   name: '디자인 상세페이지·이미지편집', ourCount: 11 },
  { id: '101',   name: '디자인 로고 디자인',     ourCount: 2 },
  { id: '107',   name: '디자인 명함',             ourCount: 1 },
  { id: '134',   name: '디자인 메뉴판',           ourCount: 1 },
];

function parsePrice(text) {
  // "1,320,000원~" / "300,000원~" / "6,600,000원" / "1만원~"
  const m1 = text.match(/([\d,]+)\s*원/);
  if (m1) return parseInt(m1[1].replace(/,/g, ''), 10);
  const m2 = text.match(/(\d+)\s*만\s*원/);
  if (m2) return parseInt(m2[1], 10) * 10000;
  return null;
}

function parseRating(text) {
  // 평점 패턴: 숫자.숫자 한 줄로 + (리뷰수)
  const m = text.match(/^(\d\.\d)\s*$/m);
  return m ? parseFloat(m[1]) : null;
}

function parseReviews(text) {
  const m = text.match(/\((\d{1,4}(?:,\d{3})*)\)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 }, locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  const results = {};

  for (const cat of CATEGORIES) {
    const url = `https://kmong.com/category/${cat.id}`;
    console.log(`\n=== [${cat.id}] ${cat.name} ===`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3500);
      // lazy load 유도
      for (let i = 0; i < 4; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await sleep(700); }

      const finalUrl = page.url();
      const isError = await page.evaluate(() => /찾을 수 없|페이지를 찾을/i.test(document.title));
      if (isError) {
        console.log(`  ✗ 404 페이지 — skip`);
        results[cat.id] = { ...cat, finalUrl, error: '404', cards: [] };
        continue;
      }

      // 상품 카드 추출
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

      // 가격/평점/리뷰 파싱
      const parsed = cards.map(c => ({
        id: c.id,
        href: c.href,
        title: (c.text.split('\n')[0] || '').trim().slice(0, 80),
        price: parsePrice(c.text),
        rating: parseRating(c.text),
        reviews: parseReviews(c.text),
        seller: (c.text.split('\n').filter(l => l.trim() && !/(빠른 응답|세금계산서|원|^\d+\.\d+$|^\(\d+\)$)/.test(l.trim()))[1] || '').slice(0, 30),
      }));

      // 가격 통계
      const prices = parsed.filter(p => p.price && p.price >= 1000).map(p => p.price);
      prices.sort((a, b) => a - b);
      const sum = prices.reduce((a, b) => a + b, 0);
      const stats = prices.length === 0 ? null : {
        count: prices.length,
        min: prices[0],
        max: prices[prices.length - 1],
        avg: Math.round(sum / prices.length),
        median: prices[Math.floor(prices.length / 2)],
        p25: prices[Math.floor(prices.length * 0.25)],
        p75: prices[Math.floor(prices.length * 0.75)],
      };

      console.log(`  ${parsed.length} cards | 가격있음 ${prices.length} | 평균 ${stats?.avg ? Math.round(stats.avg/10000)+'만' : '-'} | 중앙 ${stats?.median ? Math.round(stats.median/10000)+'만' : '-'} | 범위 ${stats?.min ? Math.round(stats.min/10000)+'만' : '-'}~${stats?.max ? Math.round(stats.max/10000)+'만' : '-'}`);

      results[cat.id] = { ...cat, finalUrl, totalCards: parsed.length, stats, cards: parsed };
      // 카테고리별 detail 저장
      fs.writeFileSync(path.join(OUT_DIR, `cat-${cat.id}.json`), JSON.stringify({ ...cat, finalUrl, totalCards: parsed.length, stats, cards: parsed }, null, 2));
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      results[cat.id] = { ...cat, error: e.message, cards: [] };
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), categories: results }, null, 2));
  console.log(`\n==== 완료 ====\n  report: ${REPORT}\n  detail: ${OUT_DIR}`);
  await browser.close();
})();
