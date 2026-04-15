#!/usr/bin/env node
/**
 * 크몽 4축 통과 카테고리 발굴 cron — 매일 새벽 4시
 *
 *  - keyword pool에서 미조사 30개 픽
 *  - 각 키워드 크몽 검색 상위 20 gig 파싱 → 4축 평가
 *  - 4축 통과 발견 시 즉시 텔레그램 단건 보고 + 누적 통과 풀에 추가
 *  - 미조사 풀에서 평가 완료 키워드 제거
 *  - 풀 소진 시 한 바퀴 종료, 다음 사이클은 7일 후 재조사
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { login } = require('./lib/login');

const POOL_FILE = path.join(__dirname, 'discovery-keyword-pool.json');
const STATE_FILE = path.join(__dirname, 'discovery-state.json');
const PASSED_FILE = path.join(__dirname, 'discovery-passed.json');
const RESULT_DIR = path.join(__dirname, 'discovery-results');
const TELEGRAM_CHANNEL = '-1003738825402';
const PER_RUN = 30;
const COOLDOWN_DAYS = 7;

if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });

function loadJson(p, def) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return def; } }
function saveJson(p, v) { fs.writeFileSync(p, JSON.stringify(v, null, 2)); }
function tg(msg) {
  return new Promise((resolve) => {
    const proc = spawn('node', ['/home/onda/scripts/telegram-sender.js', 'send', msg, TELEGRAM_CHANNEL], { stdio: 'pipe' });
    proc.on('close', () => resolve());
    setTimeout(resolve, 30000);
  });
}

async function searchKmong(page, keyword) {
  const url = `https://kmong.com/search?keyword=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  return await page.evaluate(() => {
    const cards = [...document.querySelectorAll('a[href*="/gig/"]')].slice(0, 30);
    const seen = new Set();
    const out = [];
    for (const a of cards) {
      const m = a.href.match(/\/gig\/(\d+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const card = a.closest('div');
      const txt = card?.innerText || '';
      const priceMatch = txt.match(/(\d{1,3}(?:,\d{3})*)\s*원/);
      const reviewMatch = txt.match(/\((\d+)\)/) || txt.match(/리뷰\s*(\d+)/);
      out.push({
        gigId: m[1],
        title: a.title || a.innerText.split('\n')[0]?.slice(0, 100) || '',
        price: priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : null,
        reviews: reviewMatch ? parseInt(reviewMatch[1], 10) : 0,
      });
      if (out.length >= 20) break;
    }
    return out;
  });
}

function calc4axis(cards, autoFitGuess) {
  const prices = cards.map((c) => c.price).filter(Boolean).sort((a, b) => a - b);
  const reviews = cards.map((c) => c.reviews || 0);
  const totalReviews = reviews.reduce((a, b) => a + b, 0);
  const top3 = [...reviews].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const top3Share = totalReviews > 0 ? top3 / totalReviews : -1;
  const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
  const avg = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

  const passDemand = totalReviews >= 5000;
  const passComp = top3Share >= 0 && top3Share < 0.60;
  const passPrice = median >= 100000;
  const passAuto = (autoFitGuess || 0) >= 4;
  const allPass = passDemand && passComp && passPrice && passAuto;

  return { totalReviews, top3Share, median, avg, passDemand, passComp, passPrice, passAuto, allPass };
}

(async () => {
  const ts = Date.now();
  const pool = loadJson(POOL_FILE, { keywords: [] }).keywords;
  const state = loadJson(STATE_FILE, { lastRunAt: 0, scanned: {} });
  const passedAll = loadJson(PASSED_FILE, []);

  // 7일 지나면 재조사 가능
  const now = Date.now();
  const ageMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(state.scanned)) {
    if (now - v.at > ageMs) delete state.scanned[k];
  }

  const candidates = pool.filter((k) => !state.scanned[k.key]).slice(0, PER_RUN);
  if (candidates.length === 0) {
    console.log('[discovery] 모든 키워드 조사 완료, 7일 쿨다운 대기 중');
    return;
  }

  console.log(`[discovery] ${candidates.length}개 키워드 조사 시작 (${new Date().toISOString()})`);
  const { browser, page } = await login();
  const results = [];
  const newlyPassed = [];

  for (const k of candidates) {
    try {
      const cards = await searchKmong(page, k.q);
      const m = calc4axis(cards, k.autoFitGuess);
      const row = { ...k, ...m, scannedAt: new Date().toISOString() };
      results.push(row);
      state.scanned[k.key] = { at: now, allPass: m.allPass };
      console.log(`  ${k.cat} 리뷰=${m.totalReviews} 중앙=${m.median} 독식=${(m.top3Share*100).toFixed(0)}% 자동=${k.autoFitGuess}★ 통과=${m.allPass}`);
      if (m.allPass && !passedAll.find((p) => p.key === k.key)) {
        newlyPassed.push(row);
        passedAll.push({ key: k.key, cat: k.cat, q: k.q, ...m, foundAt: new Date().toISOString() });
        await tg(`[★ 4축 통과 발견] ${k.cat} (${k.q})\n• 리뷰: ${m.totalReviews}\n• 중앙가: ${(m.median/10000).toFixed(0)}만원\n• 독식률: ${(m.top3Share*100).toFixed(0)}%\n• 자동화: ${k.autoFitGuess}★\n→ gig 등록 검토 권장`);
      }
    } catch (e) {
      console.warn(`  [에러] ${k.q}: ${e.message}`);
      state.scanned[k.key] = { at: now, allPass: false, error: e.message };
    }
    await new Promise((r) => setTimeout(r, 2000)); // 크롤 간격
  }

  await browser.close();

  // 결과 저장
  saveJson(path.join(RESULT_DIR, `${ts}.json`), { ts, count: results.length, results });
  saveJson(STATE_FILE, { lastRunAt: now, scanned: state.scanned });
  saveJson(PASSED_FILE, passedAll);

  const remaining = pool.length - Object.keys(state.scanned).length;
  const summary = `[발굴 cron 완료]\n• 이번 회 평가: ${candidates.length}개\n• 신규 4축 통과: ${newlyPassed.length}개\n• 누적 통과: ${passedAll.length}개\n• 남은 풀: ${remaining}개${newlyPassed.length > 0 ? `\n\n신규 통과:\n${newlyPassed.map(p => `  • ${p.cat} (리뷰${p.totalReviews}/중앙${(p.median/10000).toFixed(0)}만/독식${(p.top3Share*100).toFixed(0)}%)`).join('\n')}` : ''}`;
  console.log(summary);
  await tg(summary);
})().catch(async (e) => {
  console.error(e);
  await tg(`[발굴 cron 실패] ${e.message}`).catch(() => {});
  process.exit(1);
});
