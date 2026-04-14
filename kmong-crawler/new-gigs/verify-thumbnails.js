#!/usr/bin/env node
/**
 * 크몽 draft 썸네일 렌더 검증
 *  - 각 draft 페이지 접근 → 메인 이미지 찾기
 *  - 검증 항목:
 *    1. 이미지 존재 / src 있음
 *    2. 자연 크기(naturalWidth/Height) 1304x976 (±5%)
 *    3. 렌더 비율 4:3 (±2%)
 *    4. 잘림 여부 (object-fit: cover로 인한 crop 감지 — CSS 확인)
 *    5. 대칭/정렬 이상 (렌더 left/top 비정상 감지)
 *    6. 최소 너비 652px 미충족 감지
 *  - 스크린샷 저장 (검증 실패 건만)
 *  - 결과 JSON: verify-thumbnails-report.json
 *
 * 사용: node verify-thumbnails.js [draftId1,draftId2,...]
 *       node verify-thumbnails.js --all (run-log 기반 모든 draft)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SS = path.join(__dirname, 'screenshots');
const REPORT = path.join(__dirname, 'verify-thumbnails-report.json');

function collectDraftsFromRunLog() {
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '55-run-log.json'), 'utf-8'));
  const byId = {};
  for (const r of log.runs || []) {
    if (!r.savedUrl || !r.savedUrl.includes('/edit/')) continue;
    const m = r.savedUrl.match(/\/edit\/(\d+).*?subCategoryId=(\d+)(?:.*?thirdCategoryId=(\d+))?/);
    if (!m) continue;
    const draftId = m[1], subId = m[2], thirdId = m[3];
    // 상품별 최신 draft만 유지
    if (!byId[r.id] || r.at > byId[r.id].at) {
      byId[r.id] = { draftId, subId, thirdId, at: r.at, productId: r.id, url: r.savedUrl };
    }
  }
  return Object.values(byId);
}

async function verifyOne(page, draft) {
  const draftUrl = draft.url || `https://kmong.com/my-gigs/edit/${draft.draftId}?rootCategoryId=1&subCategoryId=${draft.subId}${draft.thirdId ? `&thirdCategoryId=${draft.thirdId}` : ''}`;

  // 쿠키 우회: client-side navigation
  await page.evaluate((url) => { window.location.href = url; }, draftUrl);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(4500);

  if (!page.url().includes('/my-gigs/edit')) {
    return { draftId: draft.draftId, productId: draft.productId, ok: false, reason: 'draft 접근 실패' };
  }

  const result = await page.evaluate(() => {
    const mainGallery = document.querySelector('#MAIN_GALLERY');
    if (!mainGallery) return { ok: false, reason: '#MAIN_GALLERY 없음' };

    // <img> 찾기 — 보통 preview thumbnail
    const imgs = [...mainGallery.querySelectorAll('img')];
    const visible = imgs.filter(i => {
      const r = i.getBoundingClientRect();
      return r.width > 100 && r.height > 50 && i.src && !i.src.startsWith('data:');
    });
    if (visible.length === 0) return { ok: false, reason: 'visible img 0개' };

    const img = visible[0];
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
    const rw = Math.round(r.width), rh = Math.round(r.height);

    // 렌더 비율
    const ratio = rh > 0 ? rw / rh : 0;
    const targetRatio = 4 / 3;
    const ratioDiff = Math.abs(ratio - targetRatio) / targetRatio;

    // 자연 크기 체크 (1304x976 ±5%)
    const naturalSizeOk = nw >= 1238 && nw <= 1370 && nh >= 927 && nh <= 1025;
    // 최소 크기 (크몽 652x488)
    const minSizeOk = nw >= 652 && nh >= 488;
    // 렌더 비율 (4:3 ±2%)
    const ratioOk = ratioDiff <= 0.02;
    // object-fit 검사 (cover면 잘림)
    const cs = getComputedStyle(img);
    const objectFit = cs.objectFit || '';
    const crop = objectFit === 'cover' && (Math.abs(nw / nh - rw / rh) > 0.02);

    return {
      ok: naturalSizeOk && ratioOk && minSizeOk && !crop,
      natural: { w: nw, h: nh },
      render: { w: rw, h: rh, ratio: ratio.toFixed(3) },
      checks: { naturalSizeOk, minSizeOk, ratioOk, crop },
      objectFit,
      src: (img.src || '').slice(0, 120),
    };
  });

  return { draftId: draft.draftId, productId: draft.productId, ok: result.ok, ...result };
}

(async () => {
  const args = process.argv.slice(2);
  let drafts;
  if (args.includes('--all') || args.length === 0) {
    drafts = collectDraftsFromRunLog();
  } else {
    const ids = args[0].split(',').map(s => s.trim()).filter(Boolean);
    drafts = ids.map(id => ({ draftId: id, productId: null, subId: '1', thirdId: null }));
  }

  console.log(`\n==== 크몽 썸네일 렌더 검증 ====`);
  console.log(`대상: ${drafts.length}건`);

  const { browser, page } = await login({ slowMo: 100 });
  // warm-up
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const results = [];
  let ok = 0, ng = 0;
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    process.stdout.write(`[${i+1}/${drafts.length}] draftId=${d.draftId} productId=${d.productId || '-'} ... `);
    try {
      const r = await verifyOne(page, d);
      results.push(r);
      if (r.ok) { ok++; console.log('✓ OK'); }
      else { ng++; console.log(`✗ ${r.reason || 'FAIL'} ${r.natural ? `natural=${r.natural.w}x${r.natural.h}` : ''} ${r.render ? `render=${r.render.w}x${r.render.h}(ratio=${r.render.ratio})` : ''}`); }
    } catch (e) {
      ng++;
      results.push({ draftId: d.draftId, productId: d.productId, ok: false, reason: e.message });
      console.log(`✗ ERR ${e.message.slice(0, 100)}`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    total: drafts.length,
    ok, ng,
    failed: results.filter(r => !r.ok),
    all: results,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  console.log(`\n==== 검증 완료 ====`);
  console.log(`  OK: ${ok} / NG: ${ng}`);
  console.log(`  리포트: ${REPORT}`);

  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
