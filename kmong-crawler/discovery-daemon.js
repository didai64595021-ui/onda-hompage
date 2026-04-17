#!/usr/bin/env node
/**
 * 크몽 4축 통과 카테고리 발굴 데몬 (24시간 PM2)
 *
 *  - 1시간마다 5개 키워드 평가 (24시간에 120개, 풀 200개를 ~2일에 1바퀴)
 *  - 4축 통과 발견 시 즉시 텔레그램 (-5008298048)
 *  - 통과 보고에는 상품/카테고리/근거 데이터 모두 포함
 *  - 풀 소진 시 7일 쿨다운 (시장 변화 추적)
 *  - PM2 fork mode로 실행
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const https = require('https');
const { login } = require('./lib/login');

// onda_kmong_reply_bot 토큰 (kmong-crawler/.env의 TELEGRAM_BOT_TOKEN)
const KMONG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!KMONG_BOT_TOKEN) {
  console.error('[fatal] TELEGRAM_BOT_TOKEN 누락');
  process.exit(1);
}

const POOL_FILE = path.join(__dirname, 'discovery-keyword-pool.json');
const STATE_FILE = path.join(__dirname, 'discovery-state.json');
const PASSED_FILE = path.join(__dirname, 'discovery-passed.json');
const RESULT_DIR = path.join(__dirname, 'discovery-results');
const TG_CHANNEL = '-1003753252286'; // KMONG 채널 (2026-04-17 수정, 기존 -5008298048 chat_not_found)
const PER_BATCH = 5;
const BATCH_INTERVAL_MS = 60 * 60 * 1000; // 1시간
const COOLDOWN_DAYS = 7;
const POOL_EXHAUST_WAIT_MS = 60 * 60 * 1000; // 풀 비면 1시간 대기 후 재확인

if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadJson = (p, def) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return def; } };
const saveJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

// 1차: onda_kmong_reply_bot 직접 발송, 실패 시 onda_homepage_bot fallback (telegram-sender 경유)
function sendViaToken(token, msg) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ chat_id: TG_CHANNEL, text: msg, disable_web_page_preview: true });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      family: 4,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = ''; res.on('data', (c) => body += c);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', (e) => { console.error('[tg err]', e.code || '', e.message); resolve(false); });
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.write(data); req.end();
  });
}

async function tg(msg) {
  const ok = await sendViaToken(KMONG_BOT_TOKEN, msg);
  if (ok) return;
  // fallback: telegram-sender.js (onda_homepage_bot)
  console.error('[tg] KMONG bot 실패 → onda_homepage_bot fallback');
  const { spawn } = require('child_process');
  await new Promise((r) => {
    const proc = spawn('node', ['/home/onda/scripts/telegram-sender.js', 'send', msg, TG_CHANNEL], { stdio: 'pipe' });
    proc.on('close', r);
    setTimeout(r, 30000);
  });
}

async function searchKmong(page, keyword) {
  const url = `https://kmong.com/search?keyword=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3500);
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
        url: 'https://kmong.com/gig/' + m[1],
        title: a.title || a.innerText.split('\n')[0]?.slice(0, 100) || '',
        price: priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : null,
        reviews: reviewMatch ? parseInt(reviewMatch[1], 10) : 0,
      });
      if (out.length >= 20) break;
    }
    return out;
  });
}

// ROI 기준 모드 (수요 적은 시장 = CPC 싼 시장, 사용자 합의)
// 수요 컷 100으로 최소화 — 시장 존재만 증명되면 OK, 단가·경쟁·자동화가 진짜 필터
const CUT_DEMAND = 100;
const CUT_COMP = 0.60;
const CUT_PRICE = 100000;
const CUT_AUTO = 4;

function calc4axis(cards, autoFitGuess) {
  const prices = cards.map((c) => c.price).filter(Boolean).sort((a, b) => a - b);
  const reviews = cards.map((c) => c.reviews || 0);
  const totalReviews = reviews.reduce((a, b) => a + b, 0);
  const top3 = [...reviews].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const top3Share = totalReviews > 0 ? top3 / totalReviews : -1;
  const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
  const avg = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const min = prices[0] || 0;
  const max = prices[prices.length - 1] || 0;
  return {
    totalReviews, top3Share, median, avg, min, max,
    passDemand: totalReviews >= CUT_DEMAND,
    passComp: top3Share >= 0 && top3Share < CUT_COMP,
    passPrice: median >= CUT_PRICE,
    passAuto: (autoFitGuess || 0) >= CUT_AUTO,
    allPass: totalReviews >= CUT_DEMAND && top3Share >= 0 && top3Share < CUT_COMP && median >= CUT_PRICE && (autoFitGuess || 0) >= CUT_AUTO,
  };
}

// 진입 전략 자동 생성 (자동화 친화 + 시장 데이터 기반)
function buildStrategy(k, m) {
  const lines = [];
  lines.push('▶ 진입 전략');

  // 차별화 포지션
  if (k.autoFitGuess === 5) {
    lines.push('• 차별화: "Claude Code 자동 시스템" 정면 어필 (경쟁사는 사람 작업 ↔ 우리는 자동화)');
  } else if (m.median >= 200000) {
    lines.push('• 차별화: 프리미엄 라인 — 자동화로 7일→3일 단축, 동일 품질에 빠른 납기');
  } else {
    lines.push('• 차별화: 동일 가격대 + Claude Code 활용으로 결과물 2배 (예: 시안 5종 vs 경쟁 2종)');
  }

  // 타겟
  if (m.median >= 300000) {
    lines.push('• 타겟: 중소기업/스타트업 (단가 감당 가능 + 빠른 납기 니즈)');
  } else {
    lines.push('• 타겟: 소상공인/1인 기업 (가성비 + 빠른 납기)');
  }

  // 진입 가격
  const std = Math.max(50000, Math.round(m.median * 0.7 / 10000) * 10000);
  const dlx = Math.round(m.median * 1.2 / 10000) * 10000;
  const prm = Math.round(m.median * 2 / 10000) * 10000;
  lines.push(`• 가격: STD ${std.toLocaleString()}원 / DLX ${dlx.toLocaleString()}원 / PRM ${prm.toLocaleString()}원`);

  // 소재 (썸네일/제목) 방향
  if (m.top3Share < 0.5) {
    lines.push('• 소재: 1등 셀러 카피하지 말고 차별 포인트 강조 (자동화/속도/시안수)');
  } else {
    lines.push('• 소재: 상위 셀러 톤 벤치마크 + 가격/속도 차별점 명시');
  }

  // 6주 로드맵
  lines.push('');
  lines.push('▶ 6주 실행 로드맵');
  lines.push('W1: gig 등록 (Claude로 상세/썸네일/패키지 자동) + 초기 한정 30% 할인');
  lines.push('W2: CPC 광고 ON (롱테일 키워드 5~10개), 일일 CTR/CVR 측정');
  lines.push('W3: 첫 주문 받기, 납품 후 리뷰 요청 자동화');
  lines.push('W4: 리뷰 3건+ 도달 시 할인 종료, 정상가 전환');
  lines.push('W5-6: 데이터 보고 STD→DLX 업셀 비율 관찰, 소재 A/B');
  return lines.join('\n');
}

async function runBatch(state, passedAll) {
  const pool = loadJson(POOL_FILE, { keywords: [] }).keywords;
  const now = Date.now();
  const ageMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(state.scanned)) {
    if (now - v.at > ageMs) delete state.scanned[k];
  }

  const candidates = pool.filter((k) => !state.scanned[k.key]).slice(0, PER_BATCH);
  if (candidates.length === 0) return { exhausted: true, results: [], newlyPassed: [] };

  console.log(`[${new Date().toISOString()}] batch ${candidates.length}개 시작: ${candidates.map(c => c.cat).join(', ')}`);
  let browser, page;
  try {
    ({ browser, page } = await login());
  } catch (e) {
    console.error('[login 실패]', e.message);
    return { error: e.message };
  }

  const results = [];
  const newlyPassed = [];

  for (const k of candidates) {
    try {
      const cards = await searchKmong(page, k.q);
      const m = calc4axis(cards, k.autoFitGuess);
      const row = { ...k, ...m, scannedAt: new Date().toISOString() };
      results.push(row);
      state.scanned[k.key] = { at: now, allPass: m.allPass };
      console.log(`  ${k.cat} 리뷰=${m.totalReviews} 중앙=${m.median} 독식=${(m.top3Share*100).toFixed(0)}% 자동=${k.autoFitGuess}★ → 통과=${m.allPass}`);
      if (m.allPass && !passedAll.find((p) => p.key === k.key)) {
        newlyPassed.push(row);
        passedAll.push({ key: k.key, cat: k.cat, q: k.q, ...m, foundAt: new Date().toISOString() });
        const top5 = [...cards].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 5);
        const msg = [
          `[★ 4축 통과 발견] ${k.cat}`,
          ``,
          `검색어: ${k.q}`,
          `자동화 친화: ${'★'.repeat(k.autoFitGuess)} (${k.autoFitGuess}/5)`,
          ``,
          `▶ 시장 통계 (상위 카드 ${cards.length}개)`,
          `• 누적 리뷰: ${m.totalReviews.toLocaleString()}건 (${CUT_DEMAND.toLocaleString()} 이상 통과)`,
          `• 중앙 시작가: ${(m.median/10000).toFixed(0)}만원 (10만 이상 통과)`,
          `• 평균 시작가: ${(m.avg/10000).toFixed(0)}만 (${(m.min/10000).toFixed(0)}~${(m.max/10000).toFixed(0)}만)`,
          `• 상위3 독식: ${(m.top3Share*100).toFixed(0)}% (60% 미만 통과)`,
          ``,
          `▶ 상위 경쟁 gig`,
          ...top5.map((g, i) => `${i+1}. ${(g.title||'').slice(0, 50)}\n   ${(g.price||0).toLocaleString()}원 / 리뷰${g.reviews||0}\n   ${g.url}`),
          ``,
          buildStrategy(k, m),
        ].join('\n');
        await tg(msg);
      }
    } catch (e) {
      console.warn(`  [에러] ${k.q}: ${e.message}`);
      state.scanned[k.key] = { at: now, allPass: false, error: e.message };
    }
    await sleep(2500);
  }

  await browser.close().catch(() => {});

  const ts = Date.now();
  saveJson(path.join(RESULT_DIR, `${ts}.json`), { ts, count: results.length, results });
  saveJson(STATE_FILE, { lastRunAt: now, scanned: state.scanned });
  saveJson(PASSED_FILE, passedAll);

  return { results, newlyPassed, remaining: pool.length - Object.keys(state.scanned).length };
}

async function main() {
  console.log(`=== discovery-daemon 시작 ${new Date().toISOString()} ===`);
  await tg(`[발굴 데몬 시작] 1시간마다 ${PER_BATCH}개 키워드 평가\n4축 통과 발견 시 즉시 보고\n채널: ${TG_CHANNEL}`);

  while (true) {
    const state = loadJson(STATE_FILE, { scanned: {} });
    const passedAll = loadJson(PASSED_FILE, []);

    const result = await runBatch(state, passedAll);

    if (result.exhausted) {
      console.log('[exhausted] 모든 키워드 조사 완료, 1시간 대기');
      await sleep(POOL_EXHAUST_WAIT_MS);
      continue;
    }
    if (result.error) {
      console.error('[batch error]', result.error);
      await sleep(10 * 60 * 1000);
      continue;
    }

    console.log(`[batch 완료] 평가${result.results.length} / 신규통과${result.newlyPassed.length} / 누적통과${passedAll.length} / 남은풀${result.remaining}`);
    await sleep(BATCH_INTERVAL_MS);
  }
}

main().catch(async (e) => {
  console.error('[fatal]', e);
  await tg(`[발굴 데몬 비정상 종료] ${e.message}`).catch(() => {});
  process.exit(1);
});
