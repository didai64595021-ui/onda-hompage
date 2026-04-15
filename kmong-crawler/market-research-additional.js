#!/usr/bin/env node
/**
 * 크몽 8개 추가 카테고리 시장조사
 *  - 상세페이지/카드뉴스/유튜브썸네일/로고/브랜드가이드/PPT/데이터크롤링/챗봇
 *  - 각 키워드 상위 20개 gig: 제목/시작가/리뷰수
 *  - 카테고리별 평균/중앙 시작가, 총 리뷰수, 상위3 리뷰 독식률
 *
 * 출력: market-research-additional-{timestamp}.json
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = Date.now();
const OUT_JSON = path.join(__dirname, `market-research-additional-${TS}.json`);

const KEYWORDS = [
  { key: 'detail_page',     q: '상세페이지 디자인',  cat: '상세페이지' },
  { key: 'card_news',       q: '카드뉴스',           cat: '카드뉴스' },
  { key: 'youtube_thumb',   q: '유튜브 썸네일',      cat: '유튜브썸네일' },
  { key: 'logo',            q: '로고 디자인',        cat: '로고' },
  { key: 'brand_guide',     q: '브랜드 가이드',      cat: '브랜드가이드' },
  { key: 'ppt',             q: 'PPT 디자인',         cat: 'PPT' },
  { key: 'crawling',        q: '데이터 크롤링',      cat: '크롤링' },
  { key: 'chatbot',         q: '챗봇 제작',          cat: '챗봇' },
];

function parsePrice(text) {
  const m1 = text.match(/([\d,]+)\s*원/);
  if (m1) return parseInt(m1[1].replace(/,/g, ''), 10);
  const m2 = text.match(/(\d+)\s*만\s*원/);
  if (m2) return parseInt(m2[1], 10) * 10000;
  return null;
}
function parseRating(text) {
  const m = text.match(/(\d\.\d)/);
  return m ? parseFloat(m[1]) : null;
}
function parseReviews(text) {
  const m = text.match(/\((\d{1,4}(?:,\d{3})*)\)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

function stats(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    count: s.length,
    sum,
    min: s[0],
    max: s[s.length - 1],
    avg: Math.round(sum / s.length),
    median: s[Math.floor(s.length / 2)],
    p25: s[Math.floor(s.length * 0.25)],
    p75: s[Math.floor(s.length * 0.75)],
  };
}

(async () => {
  console.log(`[추가 시장조사] 시작 — ${KEYWORDS.length}개 키워드`);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();

  const results = {};
  let done = 0;

  for (const kw of KEYWORDS) {
    done++;
    const searchUrl = `https://kmong.com/search?keyword=${encodeURIComponent(kw.q)}`;
    console.log(`\n[${done}/${KEYWORDS.length}] ${kw.key} "${kw.q}"`);
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await sleep(600);
      }

      const finalUrl = page.url();

      const cards = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a')].filter(a => /\/gig\/\d+/.test(a.href));
        const seen = new Set();
        const out = [];
        for (const a of links) {
          const id = (a.href.match(/\/gig\/(\d+)/) || [])[1];
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const text = (a.innerText || '').trim();
          if (text.length < 5) continue;
          out.push({ id, href: a.href, text });
        }
        return out;
      });

      const top = cards.slice(0, 20);
      const parsed = top.map(c => {
        const lines = c.text.split('\n').map(l => l.trim()).filter(Boolean);
        return {
          id: c.id,
          href: c.href,
          title: (lines[0] || '').slice(0, 100),
          price: parsePrice(c.text),
          rating: parseRating(c.text),
          reviews: parseReviews(c.text),
          seller: (lines.filter(l => !/(빠른 응답|세금계산서|원|^\d+\.\d+$|^\(\d+\)$|^★)/.test(l))[1] || '').slice(0, 30),
        };
      });

      const prices = parsed.filter(p => p.price && p.price >= 1000).map(p => p.price);
      const reviews = parsed.map(p => p.reviews || 0);
      const priceStats = stats(prices);
      const reviewStats = stats(reviews.filter(r => r > 0));
      const totalReviews = reviews.reduce((a, b) => a + b, 0);
      const sortedByReviews = [...parsed].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
      const top3Reviews = sortedByReviews.slice(0, 3).reduce((a, b) => a + (b.reviews || 0), 0);
      const top3ShareOfReviews = totalReviews > 0 ? (top3Reviews / totalReviews) : null;

      const opportunity = (priceStats && parsed.length > 0)
        ? Math.round((priceStats.avg * totalReviews) / parsed.length)
        : null;

      console.log(`  cards=${parsed.length} prices=${prices.length} avg=${priceStats?.avg ? Math.round(priceStats.avg/10000)+'만' : '-'} totalReviews=${totalReviews} top3Share=${top3ShareOfReviews ? (top3ShareOfReviews*100).toFixed(1)+'%' : '-'}`);

      results[kw.key] = {
        ...kw,
        finalUrl,
        totalCards: parsed.length,
        priceStats,
        reviewStats,
        totalReviews,
        top3Reviews,
        top3ShareOfReviews,
        opportunity,
        cards: parsed,
        dataAvailable: parsed.length > 0,
      };
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      results[kw.key] = { ...kw, error: e.message, cards: [], dataAvailable: false, note: '데이터 없음' };
    }

    fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, keywords: results }, null, 2));
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, keywords: results }, null, 2));
  console.log(`\n==== 완료 ====`);
  console.log(`  report: ${OUT_JSON}`);

  // 요약 출력
  console.log(`\n[요약]`);
  for (const kw of KEYWORDS) {
    const r = results[kw.key];
    if (!r || !r.dataAvailable) {
      console.log(`  ${kw.q}: 데이터 없음`);
      continue;
    }
    const avg = r.priceStats?.avg ? Math.round(r.priceStats.avg/10000) + '만' : '-';
    const med = r.priceStats?.median ? Math.round(r.priceStats.median/10000) + '만' : '-';
    const top3 = r.top3ShareOfReviews ? (r.top3ShareOfReviews*100).toFixed(1)+'%' : '-';
    console.log(`  ${kw.q}: 평균 ${avg} / 중앙 ${med} / 총리뷰 ${r.totalReviews} / 상위3독식 ${top3}`);
  }

  await browser.close();
})();
