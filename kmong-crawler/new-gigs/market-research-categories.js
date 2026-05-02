#!/usr/bin/env node
/**
 * 크몽 카테고리별 시장조사 (2026-04-30 사용자 요청)
 *
 * 대상 카테고리:
 *   - 일반 프로그램 (파이썬/매크로/RPA) — gig-data.js #05/#06 매핑
 *   - 서비스·MVP 개발 (앱 개발) — gig-data.js #09/#10 매핑
 *
 * 추출 메타:
 *   - 제목, 시작가, 리뷰 수, 평점, 썸네일 URL
 *   - 카테고리 검색 1~2페이지 Top 30
 *
 * 분석 결과 → market-research-2026-04-30.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const OUT_PATH = path.join(__dirname, 'market-research-2026-04-30.json');
const SCREENSHOT_DIR = path.join(__dirname, 'market-research-shots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const CATEGORIES = [
  {
    slug: 'general-program',
    name: '일반 프로그램',
    keywords: ['파이썬', '매크로', '프로그램 제작', '자동화 프로그램', 'RPA'],
    // 검색어로 진입 (카테고리 ID 모르면 검색)
    searchTerms: ['파이썬 프로그램 제작', '매크로 프로그램', '자동화 프로그램', 'RPA 자동화'],
  },
  {
    slug: 'service-mvp',
    name: '서비스·MVP 개발',
    keywords: ['앱 개발', 'Flutter', 'React Native', 'MVP', '하이브리드 앱'],
    searchTerms: ['앱 개발', 'Flutter 앱', '하이브리드 앱 개발', 'MVP 개발'],
  },
];

async function crawlSearch(page, term, maxResults = 20) {
  const url = `https://kmong.com/search?keyword=${encodeURIComponent(term)}`;
  console.log(`  → ${term} (${url})`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 모달 닫기
  try {
    await page.evaluate(() => {
      const m = document.querySelector('.kmong-modal-root');
      if (m) m.remove();
    });
  } catch {}
  await page.waitForTimeout(1000);

  // 스크롤로 lazy-load 트리거
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(800);
  }

  // gig 카드 추출 (DOM 구조 다양 가능 — 여러 selector 시도)
  const gigs = await page.evaluate((max) => {
    const out = [];
    // 카드 후보 selector
    const selectors = [
      'a[href*="/gig/"]',
    ];
    const seen = new Set();
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const href = el.getAttribute('href') || '';
        const m = href.match(/\/gig\/(\d+)/);
        if (!m) continue;
        const gigId = m[1];
        if (seen.has(gigId)) continue;
        seen.add(gigId);

        // 카드 컨테이너 찾기 (ancestor walk)
        let card = el;
        for (let i = 0; i < 6; i++) {
          if (!card) break;
          const txt = card.innerText || '';
          // 가격 패턴 + 리뷰 패턴이 있는 ancestor
          if (/[\d,]+\s*원/.test(txt) && /\(\d+\)/.test(txt)) break;
          card = card.parentElement;
        }
        if (!card) card = el;
        const txt = (card.innerText || '').trim();
        const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);

        // 제목: 첫 의미 있는 줄 (img alt 우선)
        const img = card.querySelector('img');
        const thumbUrl = img?.src || img?.getAttribute('data-src') || '';
        const title = img?.alt || lines[0] || '';

        // 가격: ' 원' 포함 첫 줄
        const priceLine = lines.find(l => /[\d,]+\s*원/.test(l));
        const price = priceLine ? parseInt(priceLine.replace(/[^0-9]/g, ''), 10) : null;

        // 리뷰 수: '(\d+)' 패턴
        const reviewLine = lines.find(l => /^\(\d+\)$/.test(l) || /\(\d+\)\s*$/.test(l));
        let reviews = null;
        if (reviewLine) {
          const rm = reviewLine.match(/\((\d+)\)/);
          if (rm) reviews = parseInt(rm[1], 10);
        }

        // 평점: '4.X' 또는 '5.0' 패턴
        const ratingLine = lines.find(l => /^\d\.\d$/.test(l));
        const rating = ratingLine ? parseFloat(ratingLine) : null;

        // 셀러: 첫 가격 줄 직전 또는 별점 위
        let seller = '';
        for (const l of lines) {
          if (l.length > 1 && l.length < 25 && !l.includes('원') && !l.match(/^\(?\d/) && l !== title) {
            seller = l;
            break;
          }
        }

        out.push({ gigId, title: title.slice(0, 100), seller, price, reviews, rating, thumbUrl, href: 'https://kmong.com' + href });
        if (out.length >= max) return out;
      }
    }
    return out;
  }, maxResults);

  console.log(`     수집 ${gigs.length}건`);
  return gigs;
}

(async () => {
  const startTime = Date.now();
  console.log('=== 크몽 카테고리 시장조사 시작 ===');

  const session = await login({ slowMo: 200 });
  const browser = session.browser;
  const page = session.page;

  const result = { generated_at: new Date().toISOString(), categories: [] };

  for (const cat of CATEGORIES) {
    console.log(`\n[카테고리] ${cat.name}`);
    const allGigs = [];
    const seenIds = new Set();

    for (const term of cat.searchTerms) {
      try {
        const gigs = await crawlSearch(page, term, 20);
        for (const g of gigs) {
          if (seenIds.has(g.gigId)) continue;
          seenIds.add(g.gigId);
          allGigs.push({ ...g, search_term: term });
        }
        await page.waitForTimeout(2000);
      } catch (e) {
        console.error(`     [에러] ${term}: ${e.message}`);
      }
    }

    // 가격 정렬 + 분석
    const priced = allGigs.filter(g => g.price);
    priced.sort((a, b) => a.price - b.price);

    const prices = priced.map(g => g.price);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    const avg = prices.length ? Math.round(prices.reduce((s, x) => s + x, 0) / prices.length) : 0;
    const top3price = prices.slice(0, 3);
    const top10price = prices.slice(0, 10);
    const min = prices[0] || 0;
    const max = prices[prices.length - 1] || 0;

    // 리뷰 분포
    const lowReviewGigs = priced.filter(g => (g.reviews || 0) < 10);
    const highReviewGigs = priced.filter(g => (g.reviews || 0) >= 50);

    // 제목 키워드 빈도
    const titleWords = {};
    priced.forEach(g => {
      (g.title || '').replace(/[^\w가-힣\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && w.length <= 8).forEach(w => {
        titleWords[w] = (titleWords[w] || 0) + 1;
      });
    });
    const topKeywords = Object.entries(titleWords).sort((a, b) => b[1] - a[1]).slice(0, 20);

    const catResult = {
      slug: cat.slug,
      name: cat.name,
      total_gigs: allGigs.length,
      with_price: priced.length,
      price_stats: {
        min, max, avg, median,
        top3_avg: top3price.length ? Math.round(top3price.reduce((s, x) => s + x, 0) / top3price.length) : 0,
        top10_avg: top10price.length ? Math.round(top10price.reduce((s, x) => s + x, 0) / top10price.length) : 0,
        page1_threshold: prices[Math.min(11, prices.length - 1)] || 0, // 1페이지(12개) 진입 임계 시작가
      },
      review_stats: {
        low_reviews_count: lowReviewGigs.length, // 리뷰 <10 — 진입자
        high_reviews_count: highReviewGigs.length, // 리뷰 ≥50 — 베스트셀러
      },
      top_keywords: topKeywords,
      top10_by_price: priced.slice(0, 10),
      top10_by_reviews: [...allGigs].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 10),
      all_gigs: allGigs,
    };
    result.categories.push(catResult);

    // 카테고리별 스크린샷 저장 (썸네일 트렌드 시각 분석용)
    try {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${cat.slug}-page1.png`), fullPage: false });
    } catch {}
  }

  await browser.close();

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`\n=== 시장조사 완료 (${((Date.now() - startTime) / 1000).toFixed(1)}초) ===`);
  console.log(`결과: ${OUT_PATH}`);

  // 요약 출력 + 텔레그램
  const summary = result.categories.map(c => {
    return `📊 <b>${c.name}</b> (${c.total_gigs}건 수집)
  · 가격: 평균 ₩${c.price_stats.avg.toLocaleString()} / 중간값 ₩${c.price_stats.median.toLocaleString()}
  · Top3 평균: ₩${c.price_stats.top3_avg.toLocaleString()} / Top10 평균: ₩${c.price_stats.top10_avg.toLocaleString()}
  · 1페이지 임계가: ₩${c.price_stats.page1_threshold.toLocaleString()} (12위 시작가)
  · 리뷰 <10인 진입자: ${c.review_stats.low_reviews_count}건 / 리뷰 ≥50: ${c.review_stats.high_reviews_count}건
  · Top 키워드: ${c.top_keywords.slice(0, 8).map(([w, n]) => `${w}(${n})`).join(', ')}`;
  }).join('\n\n');

  try {
    const { notify } = require('../lib/telegram');
    notify(`🔍 <b>크몽 시장조사 완료</b>\n\n${summary}\n\n📁 ${OUT_PATH}`);
  } catch {}
})().catch(e => { console.error('[에러]', e.message); process.exit(1); });
