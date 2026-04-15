#!/usr/bin/env node
/**
 * 크몽 15개 추가 확장 시장조사 (마케팅/디자인/영상/광고)
 *  - SNS/블로그/SEO/영상편집/유튜브제작/스마트스토어/네이버광고/페이스북광고/콘텐츠마케팅
 *  - 굿즈/패키지/모션그래픽/명함/메뉴판/현수막
 *  - 각 키워드 상위 20 gig: 제목/시작가/리뷰수/평점
 *
 * 출력: market-research-extended-{timestamp}.json
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = Date.now();
const OUT_JSON = path.join(__dirname, `market-research-extended-${TS}.json`);

const KEYWORDS = [
  { key: 'instagram',     q: '인스타그램 운영',   cat: '인스타운영' },
  { key: 'blog_mkt',      q: '블로그 마케팅',     cat: '블로그마케팅' },
  { key: 'seo',           q: 'SEO 최적화',        cat: 'SEO' },
  { key: 'video_edit',    q: '영상 편집',         cat: '영상편집' },
  { key: 'youtube_prod',  q: '유튜브 영상 제작',  cat: '유튜브제작' },
  { key: 'smartstore',    q: '스마트스토어',      cat: '스마트스토어' },
  { key: 'naver_ad',      q: '네이버 광고',       cat: '네이버광고' },
  { key: 'facebook_ad',   q: '페이스북 광고',     cat: '페이스북광고' },
  { key: 'content_mkt',   q: '콘텐츠 마케팅',     cat: '콘텐츠마케팅' },
  { key: 'goods',         q: '굿즈 디자인',       cat: '굿즈' },
  { key: 'package',       q: '패키지 디자인',     cat: '패키지' },
  { key: 'motion',        q: '모션그래픽',        cat: '모션그래픽' },
  { key: 'namecard',      q: '명함 디자인',       cat: '명함' },
  { key: 'menu',          q: '메뉴판 디자인',     cat: '메뉴판' },
  { key: 'banner',        q: '현수막 디자인',     cat: '현수막' },
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
  console.log(`[확장 시장조사] 시작 — ${KEYWORDS.length}개 키워드`);
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
