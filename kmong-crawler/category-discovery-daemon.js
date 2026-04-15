#!/usr/bin/env node
/**
 * 크몽 카테고리 URL 전수 크롤링 데몬 (24시간 PM2)
 *  - /category/{ID} 직접 진입 → 1~3페이지 카드 모집단으로 4축 평가
 *  - 미조사 카테고리 1시간마다 5개 평가
 *  - 4축 통과 시 즉시 채널 -5008298048 (onda_kmong_reply_bot)으로 전략 포함 보고
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const { login } = require('./lib/login');

const POOL_FILE = path.join(__dirname, 'category-id-pool.json');
const STATE_FILE = path.join(__dirname, 'category-discovery-state.json');
const PASSED_FILE = path.join(__dirname, 'category-discovery-passed.json');
const RESULT_DIR = path.join(__dirname, 'category-discovery-results');
const TG_CHANNEL = '-5008298048';
const KMONG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PER_BATCH = 5;
const BATCH_INTERVAL_MS = 60 * 60 * 1000;
const COOLDOWN_DAYS = 7;
const POOL_EXHAUST_WAIT_MS = 60 * 60 * 1000;

const CUT_DEMAND = 100;  // ROI 기준 모드 (수요 적으면 CPC도 쌈)
const CUT_COMP = 0.60;
const CUT_PRICE = 100000;
const CUT_AUTO = 4;

if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });
if (!KMONG_BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN 없음'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadJson = (p, def) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return def; } };
const saveJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

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
    req.on('error', (e) => { console.error('[tg]', e.code, e.message); resolve(false); });
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.write(data); req.end();
  });
}
async function tg(msg) {
  const ok = await sendViaToken(KMONG_BOT_TOKEN, msg);
  if (ok) return;
  await new Promise((r) => {
    const proc = spawn('node', ['/home/onda/scripts/telegram-sender.js', 'send', msg, TG_CHANNEL], { stdio: 'pipe' });
    proc.on('close', r); setTimeout(r, 30000);
  });
}

function autoFitFromName(name) {
  const t = name || '';
  if (/자동화|크롤|데이터|봇|AI|시스템|대시보드|API|연동|수익자동/i.test(t)) return 5;
  if (/디자인|홈페이지|랜딩|콘텐츠|문서|슬라이드|카탈로그|뉴스레터|페이지|번역|SEO|챗봇|GPT|블로그/i.test(t)) return 4;
  if (/영상|모션|마케팅|광고|개발|앱|게임|쇼핑몰/i.test(t)) return 3;
  if (/사진|음원|통역|녹음|일러스트|모델링/i.test(t)) return 2;
  if (/컨설팅|코칭|사주|타로|상담/i.test(t)) return 1;
  return 3;
}

async function fetchCategory(page, id) {
  const url = `https://kmong.com/category/${id}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  return await page.evaluate(() => {
    const title = document.title || '';
    const cards = [...document.querySelectorAll('a[href*="/gig/"]')];
    const seen = new Set();
    const out = [];
    for (const a of cards) {
      const m = a.href.match(/\/gig\/(\d+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const txt = (a.closest('article')?.innerText || a.closest('div')?.innerText || a.innerText || '');
      const priceMatch = txt.match(/(\d{1,3}(?:,\d{3})*)\s*원/);
      const reviewMatch = txt.match(/\((\d+)\)/) || txt.match(/리뷰\s*(\d+)/);
      out.push({
        gigId: m[1], url: 'https://kmong.com/gig/' + m[1],
        title: (a.title || a.innerText.split('\n')[0] || '').slice(0, 100),
        price: priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : null,
        reviews: reviewMatch ? parseInt(reviewMatch[1], 10) : 0,
      });
    }
    return { title, cards: out };
  });
}

function calc4axis(cards, autoFit) {
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
    passAuto: autoFit >= CUT_AUTO,
    allPass: totalReviews >= CUT_DEMAND && top3Share >= 0 && top3Share < CUT_COMP && median >= CUT_PRICE && autoFit >= CUT_AUTO,
  };
}

function buildStrategy(catName, autoFit, m) {
  const std = Math.max(50000, Math.round(m.median * 0.7 / 10000) * 10000);
  const dlx = Math.round(m.median * 1.2 / 10000) * 10000;
  const prm = Math.round(m.median * 2 / 10000) * 10000;
  const lines = [];
  lines.push('▶ 진입 전략');
  if (autoFit === 5) lines.push('• 차별화: "Claude Code 자동 시스템" 정면 어필');
  else if (m.median >= 200000) lines.push('• 차별화: 프리미엄 라인 (자동화로 납기 단축)');
  else lines.push('• 차별화: 동일 가격 + 결과물 2배 (시안수/속도)');
  lines.push(m.median >= 300000 ? '• 타겟: 중소기업/스타트업' : '• 타겟: 소상공인/1인 기업');
  lines.push(`• 가격: STD ${std.toLocaleString()}원 / DLX ${dlx.toLocaleString()}원 / PRM ${prm.toLocaleString()}원`);
  lines.push(m.top3Share < 0.5 ? '• 소재: 차별 포인트 강조 (자동화/속도/시안수)' : '• 소재: 상위 셀러 톤 벤치마크 + 가격/속도 차별');
  lines.push('');
  lines.push('▶ 6주 실행 로드맵');
  lines.push('W1: gig 등록 (Claude로 상세/썸네일/패키지) + 초기 30% 할인');
  lines.push('W2: CPC 광고 ON (롱테일 5~10), 일일 측정');
  lines.push('W3: 첫 주문 + 리뷰 자동 요청');
  lines.push('W4: 리뷰 3건+ 시 정상가 전환');
  lines.push('W5-6: 소재 A/B + STD→DLX 업셀 관찰');
  return lines.join('\n');
}

async function runBatch(state, passedAll) {
  const pool = loadJson(POOL_FILE, { categories: [] }).categories;
  const now = Date.now();
  const ageMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(state.scanned)) {
    if (now - v.at > ageMs) delete state.scanned[k];
  }
  const candidates = pool.filter((c) => !state.scanned[String(c.id)]).slice(0, PER_BATCH);
  if (candidates.length === 0) return { exhausted: true };

  console.log(`[${new Date().toISOString()}] batch ${candidates.length}개: ${candidates.map(c => c.id+':'+c.name).join(', ')}`);
  let browser, page;
  try { ({ browser, page } = await login()); } catch (e) {
    console.error('[login 실패]', e.message);
    return { error: e.message };
  }

  const results = [];
  const newlyPassed = [];
  for (const c of candidates) {
    try {
      const data = await fetchCategory(page, c.id);
      const cards = data.cards;
      const autoFit = c.autoFit || autoFitFromName(c.name || data.title);
      const m = calc4axis(cards, autoFit);
      const row = { ...c, autoFit, ...m, scannedAt: new Date().toISOString() };
      results.push(row);
      state.scanned[String(c.id)] = { at: now, allPass: m.allPass };
      console.log(`  ${c.id} ${c.name||data.title} 카드${cards.length} 리뷰=${m.totalReviews} 중앙=${m.median} 독식=${(m.top3Share*100).toFixed(0)}% 자동=${autoFit}★ → 통과=${m.allPass}`);
      if (m.allPass && !passedAll.find((p) => p.id === c.id)) {
        newlyPassed.push(row);
        passedAll.push({ id: c.id, name: c.name || data.title, ...m, autoFit, foundAt: new Date().toISOString() });
        const top5 = [...cards].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 5);
        const msg = [
          `[★ 4축 통과 발견] ${c.name || data.title}`,
          ``,
          `카테고리 URL: https://kmong.com/category/${c.id}`,
          `자동화 친화: ${'★'.repeat(autoFit)} (${autoFit}/5)`,
          ``,
          `▶ 시장 통계 (카드 ${cards.length}개)`,
          `• 누적 리뷰: ${m.totalReviews.toLocaleString()}건 (${CUT_DEMAND.toLocaleString()} 이상 통과)`,
          `• 중앙 시작가: ${(m.median/10000).toFixed(0)}만원 (10만 이상 통과)`,
          `• 평균 시작가: ${(m.avg/10000).toFixed(0)}만 (${(m.min/10000).toFixed(0)}~${(m.max/10000).toFixed(0)}만)`,
          `• 상위3 독식: ${(m.top3Share*100).toFixed(0)}% (60% 미만 통과)`,
          ``,
          `▶ 상위 경쟁 gig`,
          ...top5.map((g, i) => `${i+1}. ${(g.title||'').slice(0, 50)}\n   ${(g.price||0).toLocaleString()}원 / 리뷰${g.reviews||0}\n   ${g.url}`),
          ``,
          buildStrategy(c.name || data.title, autoFit, m),
        ].join('\n');
        await tg(msg);
      }
    } catch (e) {
      console.warn(`  [에러] ${c.id}: ${e.message}`);
      state.scanned[String(c.id)] = { at: now, allPass: false, error: e.message };
    }
    await sleep(3000);
  }

  await browser.close().catch(() => {});
  saveJson(path.join(RESULT_DIR, `${Date.now()}.json`), { results });
  saveJson(STATE_FILE, { lastRunAt: now, scanned: state.scanned });
  saveJson(PASSED_FILE, passedAll);
  return { results, newlyPassed, remaining: pool.length - Object.keys(state.scanned).length };
}

async function main() {
  console.log(`=== category-discovery-daemon 시작 ${new Date().toISOString()} ===`);
  await tg('[카테고리 데몬 시작] 1시간마다 5개 카테고리 직접 평가\n4축 통과 시 전략 포함 알림');

  while (true) {
    const state = loadJson(STATE_FILE, { scanned: {} });
    const passedAll = loadJson(PASSED_FILE, []);
    const result = await runBatch(state, passedAll);
    if (result.exhausted) { console.log('[exhausted] 1시간 대기'); await sleep(POOL_EXHAUST_WAIT_MS); continue; }
    if (result.error) { console.error('[batch err]', result.error); await sleep(10 * 60 * 1000); continue; }
    console.log(`[완료] 평가${result.results.length} 신규통과${result.newlyPassed.length} 누적${passedAll.length} 남은풀${result.remaining}`);
    await sleep(BATCH_INTERVAL_MS);
  }
}
main().catch(async (e) => { console.error(e); await tg(`[카테고리 데몬 비정상] ${e.message}`).catch(()=>{}); process.exit(1); });
