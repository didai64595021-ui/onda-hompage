#!/usr/bin/env node
/**
 * 크몽 매크로/RPA/업무자동화 계열 - 니치 시장조사
 *
 * 기존 market-research-homepage-niches.js와 동일 구조, 키워드만 매크로/자동화 풀로 교체.
 *
 * 수행:
 *  - 매크로/RPA/자동화/봇/크롤링/엑셀 등 18개 키워드 → 크몽 검색
 *  - 각 키워드 상위 20개 gig: 제목/시작가/리뷰수/평점/셀러
 *  - 평균/중앙/최저/최고 단가, 총 리뷰수, 상위3 리뷰 집중도(=레드오션 지표)
 *  - 기회 점수 = 평균단가 × 총리뷰수 / 경쟁gig수
 *
 * 출력:
 *  - market-research-macro-{ts}.json
 *  - market-research-macro-detail-{ts}/{keyword}.json
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = Date.now();
const OUT_JSON = path.join(__dirname, `market-research-macro-${TS}.json`);
const OUT_DIR = path.join(__dirname, `market-research-macro-detail-${TS}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

// 18개 키워드 - 매크로/자동화/RPA/봇/스크래핑 풀
const KEYWORDS = [
  // 일반 매크로/자동화
  { key: 'macro_program',    q: '매크로 프로그램',         cat: '매크로 일반' },
  { key: 'macro_dev',        q: '매크로 개발',             cat: '매크로 개발' },
  { key: 'auto_program',     q: '자동화 프로그램',         cat: '자동화 일반' },
  { key: 'rpa',              q: 'RPA',                     cat: 'RPA' },
  { key: 'work_auto',        q: '업무 자동화',             cat: '업무 자동화' },
  // 엑셀/오피스
  { key: 'excel_macro',      q: '엑셀 매크로',             cat: '엑셀 매크로' },
  { key: 'excel_vba',        q: '엑셀 VBA',                cat: 'VBA' },
  { key: 'excel_auto',       q: '엑셀 자동화',             cat: '엑셀 자동화' },
  { key: 'office_auto',      q: '오피스 자동화',           cat: '오피스' },
  // 웹 자동화/크롤링
  { key: 'crawling',         q: '크롤링 프로그램',         cat: '크롤링' },
  { key: 'scraping',         q: '데이터 수집',             cat: '데이터 수집' },
  { key: 'web_macro',        q: '웹 매크로',               cat: '웹 매크로' },
  { key: 'selenium',         q: '셀레니움',                cat: '셀레니움' },
  // 봇/메신저
  { key: 'tg_bot',           q: '텔레그램 봇',             cat: '텔레그램 봇' },
  { key: 'kakao_bot',        q: '카카오톡 자동화',         cat: '카카오톡 봇' },
  { key: 'discord_bot',      q: '디스코드 봇',             cat: '디스코드 봇' },
  // 게임/특수
  { key: 'game_macro',       q: '게임 매크로',             cat: '게임 매크로' },
  // 스케줄러/모니터링
  { key: 'monitoring',       q: '모니터링 프로그램',       cat: '모니터링' },
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
  console.log(`[매크로 시장조사] 시작 — ${KEYWORDS.length}개 키워드`);
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
      };
      fs.writeFileSync(path.join(OUT_DIR, `${kw.key}.json`), JSON.stringify(results[kw.key], null, 2));
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      results[kw.key] = { ...kw, error: e.message, cards: [] };
    }

    if (done % 5 === 0) {
      fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, keywords: results }, null, 2));
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, keywords: results }, null, 2));
  console.log(`\n==== 완료 ====`);
  console.log(`  report: ${OUT_JSON}`);
  console.log(`  detail: ${OUT_DIR}`);

  await browser.close();
})();
