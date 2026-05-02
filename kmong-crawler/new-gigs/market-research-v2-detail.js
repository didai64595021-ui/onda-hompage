#!/usr/bin/env node
/**
 * 크몽 시장조사 v2 — Top gig 상세 진입 → 3패키지 추출 (2026-04-30)
 *
 * v1 한계: 검색 페이지 가격은 STD만 — 시장 PRM/DLX 분포 못 봄
 * v2: 1페이지 Top N gig 상세 진입해 STANDARD/DELUXE/PREMIUM 가격/기간 모두 추출
 *
 * 입력: market-research-2026-04-30.json (v1 결과 — Top10 by Price + by Reviews 활용)
 * 출력: market-research-v2-2026-04-30.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const V1_PATH = path.join(__dirname, 'market-research-2026-04-30.json');
const OUT_PATH = path.join(__dirname, 'market-research-v2-2026-04-30.json');

if (!fs.existsSync(V1_PATH)) {
  console.error('v1 결과 파일 없음:', V1_PATH);
  process.exit(2);
}
const v1 = JSON.parse(fs.readFileSync(V1_PATH, 'utf-8'));

// gig 상세 페이지에서 3패키지 추출
async function extractPackages(page, gigId, href) {
  const url = href || `https://kmong.com/gig/${gigId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  // 모달 제거
  try {
    await page.evaluate(() => {
      const m = document.querySelector('.kmong-modal-root');
      if (m) m.remove();
    });
  } catch {}

  // 패키지 카드 추출 — 여러 패턴 시도
  return await page.evaluate(() => {
    const out = { STANDARD: null, DELUXE: null, PREMIUM: null };

    // 패턴 1: tab + 활성 카드
    const tabs = ['STANDARD', 'DELUXE', 'PREMIUM'];

    // 페이지 전체 텍스트에서 패키지 블록 추출
    const bodyText = document.body.innerText || '';
    const lines = bodyText.split('\n').map(l => l.trim());

    // 각 tab 인덱스 위치 찾고 그 다음 가격 패턴 추출
    for (const tab of tabs) {
      const idx = lines.findIndex(l => l === tab);
      if (idx === -1) continue;

      // 다음 30줄 내에서 가격(₩X 또는 X원) + 일수(N일) 추출
      const window = lines.slice(idx, Math.min(idx + 40, lines.length));
      const priceLines = window.filter(l => /[\d,]{3,}\s*원/.test(l) && !/할인|적립|쿠폰/.test(l));
      const dayLines = window.filter(l => /^\d+일$/.test(l) || /^\d+일\s*$/.test(l));
      const revLines = window.filter(l => /^\d+회$/.test(l) || /무제한|제한없음/.test(l));

      let price = null;
      if (priceLines.length) {
        const m = priceLines[0].match(/([\d,]{3,})\s*원/);
        if (m) price = parseInt(m[1].replace(/,/g, ''), 10);
      }
      let days = null;
      if (dayLines.length) {
        const m = dayLines[0].match(/(\d+)/);
        if (m) days = parseInt(m[1], 10);
      }
      const revisions = revLines[0] || null;

      out[tab] = { price, days, revisions };
    }
    return out;
  });
}

(async () => {
  const startTime = Date.now();
  console.log('=== 크몽 시장조사 v2 (3패키지 상세) 시작 ===');

  // 카테고리별 Top 15 gig (가격 정렬 + 리뷰 정렬 union)
  const targets = [];
  for (const cat of v1.categories) {
    const seen = new Set();
    const candidates = [...(cat.top10_by_price || []), ...(cat.top10_by_reviews || [])];
    for (const g of candidates) {
      if (seen.has(g.gigId)) continue;
      seen.add(g.gigId);
      targets.push({ category: cat.slug, name: cat.name, ...g });
      if ([...seen].filter(id => candidates.find(c => c.gigId === id && targets.find(t => t.gigId === id && t.category === cat.slug))).length >= 15) break;
    }
  }
  console.log(`총 대상: ${targets.length}건 (카테고리당 최대 15건)`);

  const session = await login({ slowMo: 200 });
  const browser = session.browser;
  const page = session.page;

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`[${i + 1}/${targets.length}] ${t.category} | ${t.gigId} | ${(t.title || '').slice(0, 50)}`);
    try {
      const pkgs = await extractPackages(page, t.gigId, t.href);
      results.push({ ...t, packages: pkgs });
      const stdP = pkgs.STANDARD?.price;
      const dlxP = pkgs.DELUXE?.price;
      const prmP = pkgs.PREMIUM?.price;
      console.log(`     STD=${stdP ? '₩' + stdP.toLocaleString() : '?'} / DLX=${dlxP ? '₩' + dlxP.toLocaleString() : '?'} / PRM=${prmP ? '₩' + prmP.toLocaleString() : '?'}`);
    } catch (e) {
      console.error(`     [에러] ${e.message}`);
      results.push({ ...t, packages: null, error: e.message });
    }
    await page.waitForTimeout(1500);
  }

  await browser.close();

  // 카테고리별 집계
  const summary = { generated_at: new Date().toISOString(), categories: {} };
  for (const cat of v1.categories) {
    const catResults = results.filter(r => r.category === cat.slug);
    const stdPrices = catResults.map(r => r.packages?.STANDARD?.price).filter(Boolean).sort((a, b) => a - b);
    const dlxPrices = catResults.map(r => r.packages?.DELUXE?.price).filter(Boolean).sort((a, b) => a - b);
    const prmPrices = catResults.map(r => r.packages?.PREMIUM?.price).filter(Boolean).sort((a, b) => a - b);

    const stat = (arr) => {
      if (!arr.length) return { count: 0 };
      const median = arr[Math.floor(arr.length / 2)];
      const avg = Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);
      const min = arr[0];
      const max = arr[arr.length - 1];
      const top5avg = arr.slice(0, 5).length ? Math.round(arr.slice(0, 5).reduce((s, x) => s + x, 0) / arr.slice(0, 5).length) : 0;
      return { count: arr.length, min, max, avg, median, top5avg };
    };

    summary.categories[cat.slug] = {
      name: cat.name,
      sampled: catResults.length,
      STANDARD: stat(stdPrices),
      DELUXE: stat(dlxPrices),
      PREMIUM: stat(prmPrices),
      raw: catResults,
    };
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
  console.log(`\n=== v2 완료 (${((Date.now() - startTime) / 1000).toFixed(1)}초) ===`);
  console.log(`결과: ${OUT_PATH}`);

  // 텔레그램 (HTML 안전)
  const tgLines = [];
  tgLines.push('🔍 <b>크몽 시장조사 v2 — 3패키지 정밀 분석</b>');
  for (const slug of Object.keys(summary.categories)) {
    const c = summary.categories[slug];
    tgLines.push('');
    tgLines.push(`📊 <b>${c.name}</b> (${c.sampled}건 샘플)`);
    ['STANDARD', 'DELUXE', 'PREMIUM'].forEach(tier => {
      const s = c[tier];
      if (!s.count) { tgLines.push(`  ${tier}: 데이터 없음`); return; }
      tgLines.push(`  ${tier}: avg ₩${s.avg.toLocaleString()} / median ₩${s.median.toLocaleString()} / Top5 ₩${s.top5avg.toLocaleString()} (n=${s.count})`);
    });
  }
  try {
    const { notify } = require('../lib/telegram');
    notify(tgLines.join('\n'));
  } catch {}
})().catch(e => { console.error('[에러]', e.message); process.exit(1); });
