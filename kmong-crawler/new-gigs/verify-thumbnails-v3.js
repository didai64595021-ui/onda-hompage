#!/usr/bin/env node
/**
 * 크몽 썸네일 검증 v3
 *  - v2 문제: 22/55 "visible img 0개" — 동적 로드 타이밍 문제
 *  - v3 개선: 초기 sleep 8초 → 이후 1초 간격 3회 재시도 + MAIN_GALLERY 스크롤 강화
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPORT = path.join(__dirname, 'verify-thumbnails-v3-report.json');

function collectDrafts() {
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '55-run-log.json'), 'utf-8'));
  const byId = {};
  for (const r of log.runs || []) {
    if (!r.savedUrl || !r.savedUrl.includes('/edit/')) continue;
    const m = r.savedUrl.match(/\/edit\/(\d+)/);
    if (!m) continue;
    if (!byId[r.id] || r.at > byId[r.id].at) {
      byId[r.id] = { draftId: m[1], productId: r.id, at: r.at, url: r.savedUrl };
    }
  }
  return Object.values(byId);
}

async function probeInPage(page) {
  return await page.evaluate(() => {
    const candidates = [];
    const mg = document.querySelector('#MAIN_GALLERY');
    if (mg) [...mg.querySelectorAll('img')].forEach((img) => candidates.push({ src: 'MAIN_GALLERY', img }));
    document.querySelectorAll('img').forEach((img) => {
      const src = img.src || '';
      if (!src) return;
      if (src.startsWith('data:') || src.startsWith('blob:')) return;
      if (/cloudfront|kmong|s3|amazonaws/i.test(src)) candidates.push({ src: 'CDN', img });
    });
    const seen = new Set();
    const uniq = [];
    for (const c of candidates) { if (!seen.has(c.img)) { seen.add(c.img); uniq.push(c); } }
    const visible = uniq.filter(({ img }) => {
      const r = img.getBoundingClientRect();
      return r.width > 30 && r.height > 20;
    }).map(({ src, img }) => {
      const r = img.getBoundingClientRect();
      return {
        source: src,
        naturalW: img.naturalWidth || 0,
        naturalH: img.naturalHeight || 0,
        renderW: Math.round(r.width),
        renderH: Math.round(r.height),
        src: (img.src || '').slice(0, 180),
      };
    });
    return { count: visible.length, visible };
  });
}

async function probeThumbnail(page, draft) {
  await page.evaluate((u) => { window.location.href = u; }, draft.url);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(8000);
  if (!page.url().includes('/my-gigs/edit')) {
    return { ok: false, reason: 'draft 접근 실패', actualUrl: page.url() };
  }

  // MAIN_GALLERY 스크롤 + 페이지 전체 스크롤로 lazy-load 트리거
  await page.evaluate(() => {
    const g = document.querySelector('#MAIN_GALLERY');
    if (g) g.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await sleep(1000);
  for (let i = 0; i < 5; i++) { await page.evaluate(() => window.scrollBy(0, 400)); await sleep(400); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  await page.evaluate(() => {
    const g = document.querySelector('#MAIN_GALLERY');
    if (g) g.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await sleep(1500);

  // 3회 재시도
  let result = await probeInPage(page);
  for (let retry = 0; retry < 3 && result.count === 0; retry++) {
    await sleep(2000);
    result = await probeInPage(page);
  }

  if (result.count === 0) {
    const dump = await page.evaluate(() => {
      const g = document.querySelector('#MAIN_GALLERY');
      return g ? g.outerHTML.slice(0, 2000) : '(no MAIN_GALLERY)';
    });
    return { ok: false, reason: 'visible img 0개 (3회 재시도 후)', dump };
  }

  const main = result.visible.find((v) => v.source === 'CDN' && v.naturalW >= 400)
    || result.visible.find((v) => v.naturalW >= 400)
    || result.visible[0];
  const naturalOk = main.naturalW >= 652 && main.naturalH >= 488;
  return {
    ok: naturalOk,
    count: result.count,
    main,
    naturalOk,
  };
}

(async () => {
  const drafts = collectDrafts();
  console.log(`대상 draft: ${drafts.length}개`);
  const { browser, page } = await login({ slowMo: 100 });
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const results = [];
  let ok = 0, ng = 0;
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    process.stdout.write(`[${i + 1}/${drafts.length}] draftId=${d.draftId} productId=${d.productId} ... `);
    try {
      const r = await probeThumbnail(page, d);
      results.push({ ...d, ...r });
      if (r.ok) { ok++; console.log(`✓ natural=${r.main.naturalW}x${r.main.naturalH}`); }
      else { ng++; console.log(`✗ ${r.reason || 'size'} ${r.main ? `n=${r.main.naturalW}x${r.main.naturalH}` : ''}`); }
    } catch (e) {
      ng++;
      results.push({ ...d, ok: false, error: e.message });
      console.log(`✗ ERR ${e.message.slice(0, 100)}`);
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, results }, null, 2));
  console.log(`\n==== v3 완료 ====\n  OK ${ok} / NG ${ng}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
