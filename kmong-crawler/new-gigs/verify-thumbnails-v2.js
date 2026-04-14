#!/usr/bin/env node
/**
 * 크몽 draft 썸네일 검증 v2
 *  - v1 개선: 셀렉터 다변화 + data:/blob: 제외 + 동적 로드 대기 강화
 *  - #MAIN_GALLERY 외 후보: .uploaded-image, img[src*="cloudfront"], img[src*="kmong"]
 *  - 최소 렌더 크기 30px (v1은 100px — 썸네일 타일이 작은 경우 누락)
 *  - NG 건에 대해 갤러리 영역 HTML 일부 덤프 → 디버그
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPORT = path.join(__dirname, 'verify-thumbnails-v2-report.json');

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

async function probeThumbnail(page, draft) {
  // warm-up 이후 client-side navigation (Referer 세팅됨)
  await page.evaluate((u) => { window.location.href = u; }, draft.url);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(5000);
  if (!page.url().includes('/my-gigs/edit')) {
    return { ok: false, reason: 'draft 접근 실패', actualUrl: page.url() };
  }

  // 갤러리 영역으로 스크롤
  await page.evaluate(() => {
    const g = document.querySelector('#MAIN_GALLERY');
    if (g) g.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await sleep(1500);

  return await page.evaluate(() => {
    const candidates = [];

    // 1) MAIN_GALLERY 내 img
    const mg = document.querySelector('#MAIN_GALLERY');
    if (mg) {
      [...mg.querySelectorAll('img')].forEach((img) => candidates.push({ src: 'MAIN_GALLERY', img }));
    }
    // 2) 업로드 이미지 추정
    document.querySelectorAll('img').forEach((img) => {
      const src = img.src || '';
      if (!src) return;
      if (src.startsWith('data:') || src.startsWith('blob:')) return;
      if (/cloudfront|kmong|s3|amazonaws/i.test(src)) {
        candidates.push({ src: 'CDN', img });
      }
    });

    // 중복 제거 (same element)
    const seen = new Set();
    const uniq = [];
    for (const c of candidates) {
      if (seen.has(c.img)) continue;
      seen.add(c.img);
      uniq.push(c);
    }

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

    if (visible.length === 0) {
      // 디버그: gallery 영역 HTML 스냅샷
      const dump = mg ? mg.outerHTML.slice(0, 2000) : '(no #MAIN_GALLERY)';
      return { ok: false, reason: 'visible img 0개', dump };
    }

    // 첫 번째 실제 CDN 이미지 선호, 없으면 첫 번째
    const main = visible.find((v) => v.source === 'CDN' && v.naturalW >= 400) || visible.find((v) => v.naturalW >= 400) || visible[0];

    const naturalOk = main.naturalW >= 652 && main.naturalH >= 488;
    const ratio = main.renderH > 0 ? main.renderW / main.renderH : 0;
    const ratioOk = ratio > 0 && Math.abs(ratio - 4 / 3) / (4 / 3) <= 0.1;

    return {
      ok: naturalOk,
      count: visible.length,
      main,
      ratio: ratio.toFixed(3),
      naturalOk,
      ratioOk,
    };
  });
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
      if (r.ok) { ok++; console.log(`✓ OK natural=${r.main.naturalW}x${r.main.naturalH} render=${r.main.renderW}x${r.main.renderH}`); }
      else { ng++; console.log(`✗ ${r.reason || 'natural size fail'} ${r.main ? `n=${r.main.naturalW}x${r.main.naturalH}` : ''}`); }
    } catch (e) {
      ng++;
      results.push({ ...d, ok: false, error: e.message });
      console.log(`✗ ERR ${e.message.slice(0, 100)}`);
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, results }, null, 2));
  console.log(`\n==== 검증 v2 완료 ====\n  OK ${ok} / NG ${ng}\n  리포트: ${REPORT}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
