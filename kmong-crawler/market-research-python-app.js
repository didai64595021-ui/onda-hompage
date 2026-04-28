#!/usr/bin/env node
/**
 * 크몽 4축 시장조사 — Python 프로그램 + 앱 출시 풀
 *
 * 4축 통과 기준 (market-research-4axis.js와 동일):
 *   1. 수요: 카테고리 총 누적 리뷰 ≥ 5,000건
 *   2. 경쟁: 상위3 셀러 리뷰 독식률 < 60%
 *   3. 단가: 시장 중앙 시작가 ≥ 10만원
 *   4. 자동화: Claude Code로 자동화율 ≥ 70%
 *
 * 출력:
 *   - market-research-python-app-{ts}.json (전체 데이터)
 *   - market-research-python-app-detail-{ts}/{key}.json (키워드별 상세)
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = Date.now();
const OUT_JSON = path.join(__dirname, `market-research-python-app-${TS}.json`);
const OUT_DIR = path.join(__dirname, `market-research-python-app-detail-${TS}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

// 18개 키워드 — Python 프로그램 제작 + 앱 제작·출시 풀
const KEYWORDS = [
  // ===== Python 프로그램 제작 =====
  { key: 'python_program',  q: '파이썬 프로그램',     cat: 'Python 프로그램',    autoScore: 90, autoStar: 5 },
  { key: 'python_dev',      q: '파이썬 개발',         cat: 'Python 개발',        autoScore: 90, autoStar: 5 },
  { key: 'python_auto',     q: '파이썬 자동화',       cat: 'Python 자동화',      autoScore: 95, autoStar: 5 },
  { key: 'python_data',     q: '파이썬 데이터',       cat: 'Python 데이터분석',  autoScore: 85, autoStar: 5 },
  { key: 'python_crawl',   q: '파이썬 크롤링',       cat: 'Python 크롤링',      autoScore: 95, autoStar: 5 },
  { key: 'python_gui',     q: '파이썬 GUI',          cat: 'Python GUI 프로그램', autoScore: 80, autoStar: 4 },

  // ===== 앱 제작·출시 =====
  { key: 'app_release',    q: '앱 출시',             cat: '앱 출시',            autoScore: 75, autoStar: 4 },
  { key: 'android_app',    q: '안드로이드 앱',       cat: '안드로이드 앱',      autoScore: 85, autoStar: 5 },
  { key: 'ios_app',        q: '아이폰 앱',           cat: 'iOS 앱',             autoScore: 80, autoStar: 4 },
  { key: 'hybrid_app',     q: '하이브리드 앱',       cat: '하이브리드 앱',      autoScore: 85, autoStar: 5 },
  { key: 'flutter_app',    q: '플러터 앱',           cat: 'Flutter 앱',         autoScore: 85, autoStar: 5 },
  { key: 'react_native',   q: '리액트네이티브',      cat: 'React Native',       autoScore: 85, autoStar: 5 },
  { key: 'app_dev',        q: '앱 개발',             cat: '앱 개발 일반',       autoScore: 80, autoStar: 4 },
  { key: 'app_design',     q: '앱 디자인',           cat: '앱 디자인',          autoScore: 70, autoStar: 4 },
  { key: 'pwa',            q: 'PWA',                 cat: 'PWA',                autoScore: 90, autoStar: 5 },
  { key: 'cross_platform', q: '크로스플랫폼 앱',     cat: '크로스플랫폼',       autoScore: 85, autoStar: 5 },

  // ===== 출시·심사 (앱스토어/플레이스토어 등록 대행) =====
  { key: 'app_store',      q: '앱스토어 출시',       cat: 'App Store 출시 대행', autoScore: 70, autoStar: 4 },
  { key: 'play_store',     q: '플레이스토어 출시',   cat: 'Play Store 출시 대행', autoScore: 70, autoStar: 4 },
];

function parsePrice(text) {
  const m1 = text.match(/([\d,]+)\s*원/);
  if (m1) return parseInt(m1[1].replace(/,/g, ''), 10);
  const m2 = text.match(/(\d+)\s*만\s*원/);
  if (m2) return parseInt(m2[1], 10) * 10000;
  return null;
}
function parseRating(text) { const m = text.match(/(\d\.\d)/); return m ? parseFloat(m[1]) : null; }
function parseReviews(text) { const m = text.match(/\((\d{1,4}(?:,\d{3})*)\)/); return m ? parseInt(m[1].replace(/,/g, ''), 10) : null; }

function stats(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    count: s.length, sum, min: s[0], max: s[s.length - 1],
    avg: Math.round(sum / s.length),
    median: s[Math.floor(s.length / 2)],
    p25: s[Math.floor(s.length * 0.25)],
    p75: s[Math.floor(s.length * 0.75)],
  };
}

(async () => {
  console.log(`[Python+앱 시장조사] ${KEYWORDS.length}개 키워드`);
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
          id: c.id, href: c.href,
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
        ? Math.round((priceStats.avg * totalReviews) / parsed.length) : null;

      // 4축 평가
      const passReview = totalReviews >= 5000;
      const passComp = top3ShareOfReviews !== null && top3ShareOfReviews < 0.6;
      const passPrice = (priceStats?.median || 0) >= 100000;
      const passAuto = kw.autoScore >= 70;
      const passCount = [passReview, passComp, passPrice, passAuto].filter(Boolean).length;

      console.log(`  cards=${parsed.length} avg=${priceStats?.avg ? Math.round(priceStats.avg/10000)+'만' : '-'} median=${priceStats?.median ? Math.round(priceStats.median/10000)+'만' : '-'} reviews=${totalReviews} top3=${top3ShareOfReviews ? (top3ShareOfReviews*100).toFixed(0)+'%' : '-'} 4축=${passCount}/4 ${passCount===4 ? '🎯PASS' : ''}`);

      results[kw.key] = {
        ...kw, finalUrl, totalCards: parsed.length, priceStats, reviewStats,
        totalReviews, top3Reviews, top3ShareOfReviews, opportunity,
        axis: { passReview, passComp, passPrice, passAuto, passCount },
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

  // 4축 요약
  console.log(`\n=== 4축 요약 ===`);
  Object.values(results).filter(r => r.axis).sort((a,b)=>(b.axis.passCount-a.axis.passCount)||(b.totalReviews-a.totalReviews)).forEach(r=>{
    const ax = r.axis;
    console.log(
      r.cat.padEnd(20),
      String(r.totalReviews||0).padStart(5),
      ((r.top3ShareOfReviews||0)*100).toFixed(0).padStart(3)+'%',
      String(Math.round((r.priceStats?.median||0)/10000)+'만').padStart(5),
      String(r.autoScore+'%').padStart(4),
      `R:${ax.passReview?'✓':'✗'} C:${ax.passComp?'✓':'✗'} P:${ax.passPrice?'✓':'✗'} A:${ax.passAuto?'✓':'✗'}`,
      ax.passCount===4 ? '🎯PASS' : `(${ax.passCount}/4)`
    );
  });

  console.log(`\n==== 완료 ====\n  report: ${OUT_JSON}\n  detail: ${OUT_DIR}`);
  await browser.close();
})();
