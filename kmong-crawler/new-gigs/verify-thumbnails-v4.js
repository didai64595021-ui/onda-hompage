#!/usr/bin/env node
/**
 * 크몽 썸네일 검증 v4 — 관대한 셀렉터 + 상세 진단
 *  - v3 문제: 22건 NG 보고했지만 readGalleryCount 프로브는 이미 count=1 (업로드됨) 확인
 *  - v4 전략:
 *    1) MAIN_GALLERY 카운트 indicator 실측 (신뢰 소스)
 *    2) img 탐색: 크기 제한 완화 (w>10, h>10) + alt/src 정규화
 *    3) data:/blob: 제외 않음 (썸네일 프리뷰도 OK로 인정)
 *    4) count indicator가 >0 이면 OK로 판정 (img 못 찾아도)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPORT = path.join(__dirname, 'verify-thumbnails-v4-report.json');

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

async function probe(page, draft) {
  await page.evaluate((u) => { window.location.href = u; }, draft.url);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(7000);
  if (!page.url().includes('/my-gigs/edit')) return { ok: false, reason: '접근 실패' };

  await page.evaluate(() => {
    const g = document.querySelector('#MAIN_GALLERY');
    if (g) g.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await sleep(2000);

  return await page.evaluate(() => {
    const mg = document.querySelector('#MAIN_GALLERY');
    if (!mg) return { ok: false, reason: 'no MAIN_GALLERY' };

    // 1) 카운트 indicator 읽기 (신뢰 소스)
    let currentCount = -1;
    let maxCount = -1;
    const spans = [...mg.querySelectorAll('span')];
    for (const s of spans) {
      const t = (s.innerText || '').trim();
      if (/^\d+$/.test(t)) {
        const parent = s.parentElement;
        const parentText = (parent?.innerText || '').trim();
        const m = parentText.match(/^\s*\(?\s*(\d+)\s*\/\s*(\d+)\s*\)?/);
        if (m) { currentCount = parseInt(m[1], 10); maxCount = parseInt(m[2], 10); break; }
      }
    }

    // 2) 모든 img 수집 (크기 제한 완화)
    const imgs = [...mg.querySelectorAll('img')].map((img) => {
      const r = img.getBoundingClientRect();
      return {
        src: (img.src || '').slice(0, 180),
        w: Math.round(r.width), h: Math.round(r.height),
        nw: img.naturalWidth || 0, nh: img.naturalHeight || 0,
        alt: img.alt || '',
      };
    });
    const anyImg = imgs.find((i) => i.w > 10 && i.h > 10 && i.src && !/^data:image\/svg/.test(i.src));
    const cdnImg = imgs.find((i) => /cloudfront|kmong|s3|amazonaws/i.test(i.src) && i.w > 10);

    // 3) 판정: count > 0 이면 OK (UI 상태 신뢰)
    const ok = currentCount > 0;
    return {
      ok,
      count: currentCount,
      max: maxCount,
      imgsCount: imgs.length,
      imgs: imgs.slice(0, 5),
      main: cdnImg || anyImg || imgs[0] || null,
    };
  });
}

(async () => {
  const drafts = collectDrafts();
  console.log(`대상: ${drafts.length}건`);
  const { browser, page } = await login({ slowMo: 100 });
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const results = [];
  let ok = 0, ng = 0;
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    process.stdout.write(`[${i+1}/${drafts.length}] pid=${d.productId} draftId=${d.draftId} ... `);
    try {
      const r = await probe(page, d);
      results.push({ ...d, ...r });
      if (r.ok) { ok++; console.log(`✓ count=${r.count}/${r.max} imgs=${r.imgsCount} main=${r.main ? r.main.nw+'x'+r.main.nh : '-'}`); }
      else { ng++; console.log(`✗ count=${r.count} imgs=${r.imgsCount}`); }
    } catch (e) {
      ng++;
      results.push({ ...d, ok: false, error: e.message });
      console.log(`✗ ERR ${e.message.slice(0, 80)}`);
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, results }, null, 2));
  console.log(`\n==== v4 완료 ====\n  OK ${ok} / NG ${ng}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
