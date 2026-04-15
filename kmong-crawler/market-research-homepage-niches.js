#!/usr/bin/env node
/**
 * 크몽 홈페이지/랜딩/반응형 계열 - 업종별 니치 시장조사
 *
 * 수행:
 *  - 15~20개 업종 키워드에 대해 크몽 검색 (https://kmong.com/search?keyword=...)
 *  - 각 키워드 상위 20개 gig 수집 (제목/시작가/리뷰수/평점/셀러)
 *  - 업종별: 평균/중앙/최저/최고 단가, 총 리뷰수, 상위3 리뷰 집중도, 경쟁 강도
 *  - 기회 점수 = 평균단가 × 총리뷰수 / 경쟁gig수
 *
 * 출력:
 *  - market-research-{timestamp}.json (원본 데이터)
 *  - 콘솔에 업종별 요약 테이블
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = Date.now();
const OUT_JSON = path.join(__dirname, `market-research-${TS}.json`);
const OUT_DIR = path.join(__dirname, `market-research-detail-${TS}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

// 20개 키워드 - 홈페이지/랜딩/반응형 계열 니치
const KEYWORDS = [
  // 업종별 (병원~자영업)
  { key: 'hospital',      q: '병원 홈페이지',     cat: '병원/의료' },
  { key: 'law',           q: '법무사 홈페이지',   cat: '법무/세무' },
  { key: 'tax',           q: '세무사 홈페이지',   cat: '법무/세무' },
  { key: 'cafe',          q: '카페 홈페이지',     cat: 'F&B' },
  { key: 'restaurant',    q: '음식점 홈페이지',   cat: 'F&B' },
  { key: 'factory',       q: '공장 홈페이지',     cat: '제조/공장' },
  { key: 'manufacturing', q: '제조업 홈페이지',   cat: '제조/공장' },
  { key: 'academy',       q: '학원 홈페이지',     cat: '교육' },
  { key: 'church',        q: '교회 홈페이지',     cat: '종교' },
  { key: 'realestate',    q: '부동산 홈페이지',   cat: '부동산' },
  { key: 'shopping',      q: '쇼핑몰 홈페이지',   cat: '쇼핑몰' },
  { key: 'beauty',        q: '미용실 홈페이지',   cat: '뷰티' },
  { key: 'gym',           q: '헬스장 홈페이지',   cat: '피트니스' },
  { key: 'workshop',      q: '공방 홈페이지',     cat: '공방/자영업' },
  { key: 'smallbiz',      q: '자영업 홈페이지',   cat: '자영업' },
  // 기능별
  { key: 'powerlink',     q: '파워링크 랜딩페이지', cat: '광고용 랜딩' },
  { key: 'responsive',    q: '반응형 홈페이지',   cat: '반응형' },
  { key: 'wordpress',     q: '워드프레스 홈페이지', cat: '워드프레스' },
  { key: 'mobile',        q: '모바일 홈페이지 수정', cat: '모바일수정' },
  { key: 'landing',       q: '랜딩페이지 제작',   cat: '랜딩페이지' },
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
  console.log(`[시장조사] 시작 — ${KEYWORDS.length}개 키워드`);
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
      // lazy load 유도 (상위 20개만 필요)
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await sleep(600);
      }

      const finalUrl = page.url();

      // 상품 카드 추출 - /gig/\d+ 링크 기반
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

      // 상위 20개만
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

      // 통계
      const prices = parsed.filter(p => p.price && p.price >= 1000).map(p => p.price);
      const reviews = parsed.map(p => p.reviews || 0);
      const priceStats = stats(prices);
      const reviewStats = stats(reviews.filter(r => r > 0));
      const totalReviews = reviews.reduce((a, b) => a + b, 0);
      // 상위 3개 리뷰 집중도
      const sortedByReviews = [...parsed].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
      const top3Reviews = sortedByReviews.slice(0, 3).reduce((a, b) => a + (b.reviews || 0), 0);
      const top3ShareOfReviews = totalReviews > 0 ? (top3Reviews / totalReviews) : null;

      // 기회 점수 = 평균단가 × 총리뷰수 / 경쟁gig수
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

    // 매 5개마다 중간 저장
    if (done % 5 === 0) {
      fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, keywords: results }, null, 2));
    }
  }

  // 최종 저장
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, keywords: results }, null, 2));
  console.log(`\n==== 완료 ====`);
  console.log(`  report: ${OUT_JSON}`);
  console.log(`  detail: ${OUT_DIR}`);

  await browser.close();
})();
