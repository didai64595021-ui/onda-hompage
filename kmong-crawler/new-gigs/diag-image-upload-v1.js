#!/usr/bin/env node
/**
 * 크몽 메인이미지 업로드 진단 v1
 * 목적: setInputFiles "OK" false positive 의 근본 원인 추적
 *
 * 캡처 항목:
 *  1. 페이지 진입 후 #MAIN_GALLERY 영역 outerHTML 덤프
 *  2. 모든 input[type=file] outerHTML + parent label 정보
 *  3. setInputFiles 직전 screenshot
 *  4. setInputFiles 호출 후 30초간 네트워크 XHR/fetch 전수 캡처
 *  5. dispatchEvent change/input 후 변화 확인
 *  6. 30초 후 screenshot + DOM 재덤프
 *  7. 모든 결과 diag-out/ 디렉토리에 timestamped 저장
 *
 * 비교 대상:
 *  - SUCCESS: 763012 (랜딩페이지, IT subCat=663)  ← 이미 업로드 OK라 가정
 *  - FAIL:    763082 (AI상세페이지, 디자인 subCat=11301)
 *  - FAIL:    763028 (영업팀DB수집, IT 업무자동화 subCat=663)
 *  - FAIL:    763101 (AI로고, 디자인 subCat=101)
 *  - FAIL:    763102 (명함, 디자인 subCat=134)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(__dirname, 'diag-out', `image-upload-${TS}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  { kind: 'SUCCESS', draftId: '763012', label: '02-landing', cat: 'IT-663', img: '55-02.png' },
  { kind: 'FAIL',    draftId: '763082', label: '29-detail-img-comp', cat: 'DESIGN-11301', img: '55-29.png' },
  { kind: 'FAIL',    draftId: '763028', label: '16-sales-db', cat: 'IT-663', img: '55-16.png' },
  { kind: 'FAIL',    draftId: '763101', label: '39-ai-logo', cat: 'DESIGN-101', img: '55-39.png' },
  { kind: 'FAIL',    draftId: '763102', label: '47-namecard', cat: 'DESIGN-134', img: '55-47.png' },
];

async function dumpGalleryDom(page) {
  return await page.evaluate(() => {
    const mg = document.querySelector('#MAIN_GALLERY');
    if (!mg) return { ok: false, reason: 'no #MAIN_GALLERY' };
    const inputs = [...mg.querySelectorAll('input[type=file]')].map((i, idx) => ({
      idx,
      name: i.name,
      id: i.id,
      accept: i.accept,
      multiple: i.multiple,
      disabled: i.disabled,
      hidden: i.hidden,
      style_display: i.style?.display,
      computed_display: getComputedStyle(i).display,
      computed_visibility: getComputedStyle(i).visibility,
      parent_tag: i.parentElement?.tagName,
      parent_class: i.parentElement?.className?.toString().slice(0, 200),
      labels: i.labels ? [...i.labels].map(l => l.textContent.trim().slice(0, 50)) : [],
      onchange: i.onchange ? 'set' : null,
      hasReactProps: Object.keys(i).filter(k => k.startsWith('__react')).length > 0,
    }));
    const buttons = [...mg.querySelectorAll('button')].map(b => ({
      text: (b.innerText || '').trim().slice(0, 50),
      type: b.type,
      ariaLabel: b.getAttribute('aria-label'),
      disabled: b.disabled,
    }));
    const labels = [...mg.querySelectorAll('label')].map(l => ({
      text: (l.innerText || '').trim().slice(0, 80),
      htmlFor: l.htmlFor,
      hasFileInputChild: !!l.querySelector('input[type=file]'),
    }));
    const allCounts = [...mg.querySelectorAll('span, p')]
      .map(e => (e.innerText || '').trim())
      .filter(t => /\d+\s*\/\s*\d+/.test(t))
      .slice(0, 10);
    const imgs = [...mg.querySelectorAll('img')].map(i => ({
      src: (i.src || '').slice(0, 200),
      alt: i.alt,
      width: i.naturalWidth,
      height: i.naturalHeight,
    }));
    return {
      ok: true,
      outerHtmlLen: mg.outerHTML.length,
      outerHtmlSample: mg.outerHTML.slice(0, 4000),
      inputs,
      buttons,
      labels,
      counters: allCounts,
      imgs,
      mgClass: mg.className?.toString().slice(0, 200),
      mgChildCount: mg.children.length,
    };
  });
}

async function clickEditForDraft(page, draftId) {
  return await page.evaluate((targetId) => {
    const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
    for (const eb of editBtns) {
      let card = eb;
      for (let i = 0; i < 10; i++) {
        card = card.parentElement;
        if (!card) break;
        if ((card.innerText || '').includes('#' + targetId)) {
          eb.scrollIntoView({ block: 'center' });
          eb.click();
          return true;
        }
      }
    }
    return false;
  }, draftId);
}

async function diagnoseDraft(page, target, IMAGE_DIR) {
  const tag = `${target.kind}-${target.draftId}-${target.label}`;
  const tagDir = path.join(OUT_DIR, tag);
  fs.mkdirSync(tagDir, { recursive: true });
  const result = { target, steps: [] };
  const log = (step, data) => {
    console.log(`  [${tag}] ${step}`, typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : data);
    result.steps.push({ step, data, at: new Date().toISOString() });
  };

  // 0) listing 진입
  const listingUrl = 'https://kmong.com/my-gigs?statusType=WAITING&page=1';
  await page.evaluate((u) => { window.location.href = u; }, listingUrl);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(5000);
  for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }

  // 1) listing 전체 페이지 순회로 draft 찾기 (page 1~6)
  let entered = false;
  for (let pageNo = 1; pageNo <= 6 && !entered; pageNo++) {
    const url = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
    if (pageNo > 1) {
      await page.evaluate((u) => { window.location.href = u; }, url);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4500);
      for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }
    }
    const clicked = await clickEditForDraft(page, target.draftId);
    if (clicked) {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(5000);
      await closeModals(page).catch(() => {});
      if (page.url().includes('/my-gigs/edit')) { entered = true; log('enter', { url: page.url() }); break; }
    }
  }
  if (!entered) { log('enter', { ok: false, reason: 'not found in 6 pages' }); return result; }

  // 2) #MAIN_GALLERY scroll into view
  await page.evaluate(() => {
    const g = document.querySelector('#MAIN_GALLERY');
    if (g) g.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await sleep(2000);

  // 3) Network listener 시작
  const xhrs = [];
  const onRequest = (req) => {
    const u = req.url();
    if (/upload|s3|cloudfront|cdn|file|image|kmong-static|sirv|\.amazonaws|aws/i.test(u)) {
      xhrs.push({ phase: 'request', method: req.method(), url: u, postLen: (req.postData() || '').length, type: req.resourceType(), at: new Date().toISOString() });
    }
  };
  const onResponse = (res) => {
    const u = res.url();
    if (/upload|s3|cloudfront|cdn|file|image|kmong-static|sirv|\.amazonaws|aws/i.test(u)) {
      xhrs.push({ phase: 'response', status: res.status(), url: u, at: new Date().toISOString() });
    }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);

  // 4) BEFORE: DOM dump + screenshot
  const beforeDom = await dumpGalleryDom(page);
  fs.writeFileSync(path.join(tagDir, 'dom-before.json'), JSON.stringify(beforeDom, null, 2));
  await page.screenshot({ path: path.join(tagDir, 'before.png'), fullPage: false, clip: { x: 0, y: 0, width: 1920, height: 1080 } }).catch(() => {});
  log('dom-before', { inputs: beforeDom.inputs?.length, buttons: beforeDom.buttons?.length, counters: beforeDom.counters, imgs: beforeDom.imgs?.length });

  // 5) setInputFiles
  const imagePath = path.join(IMAGE_DIR, target.img);
  if (!fs.existsSync(imagePath)) { log('setInputFiles', { ok: false, reason: `image not found: ${imagePath}` }); return result; }

  const inputCount = await page.locator('#MAIN_GALLERY input[type=file]').count();
  log('input-count', { count: inputCount });
  let setRes = { ok: false };
  try {
    const input = page.locator('#MAIN_GALLERY input[type=file]').first();
    await input.setInputFiles(imagePath);
    setRes = { ok: true };
  } catch (e) {
    setRes = { ok: false, error: e.message };
  }
  log('setInputFiles', setRes);

  // 6) 5초 wait → dispatchEvent 강제 시도 (React state update 유도)
  await sleep(5000);
  const dispatchRes = await page.evaluate(() => {
    const inp = document.querySelector('#MAIN_GALLERY input[type=file]');
    if (!inp) return { ok: false, reason: 'no input' };
    try {
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  log('dispatchEvent', dispatchRes);

  // 7) 추가 25초 대기 (총 30초) → 네트워크 활동 캡처
  await sleep(25000);

  // 8) AFTER: DOM dump + screenshot
  const afterDom = await dumpGalleryDom(page);
  fs.writeFileSync(path.join(tagDir, 'dom-after.json'), JSON.stringify(afterDom, null, 2));
  await page.screenshot({ path: path.join(tagDir, 'after.png'), fullPage: false, clip: { x: 0, y: 0, width: 1920, height: 1080 } }).catch(() => {});
  log('dom-after', { counters: afterDom.counters, imgs: afterDom.imgs?.length, imgsSrc: (afterDom.imgs || []).map(i => i.src.slice(0, 100)) });

  // 9) Network detach + dump
  page.off('request', onRequest);
  page.off('response', onResponse);
  fs.writeFileSync(path.join(tagDir, 'network.json'), JSON.stringify(xhrs, null, 2));
  log('network', { count: xhrs.length, urls: xhrs.slice(0, 5).map(x => `${x.phase}:${x.method || x.status}:${x.url.slice(0, 80)}`) });

  fs.writeFileSync(path.join(tagDir, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}

(async () => {
  const IMAGE_DIR = path.join(__dirname, '03-images');
  console.log(`OUT_DIR: ${OUT_DIR}`);
  const { browser, page } = await login({ slowMo: 80 });

  // warm-up
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);

  const all = [];
  for (const t of TARGETS) {
    console.log(`\n=== ${t.kind} ${t.draftId} (${t.label}) ===`);
    try {
      const r = await diagnoseDraft(page, t, IMAGE_DIR);
      all.push(r);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      all.push({ target: t, error: e.message });
    }
    // 다음 진단 위해 listing 복귀
    await page.evaluate(() => { window.location.href = 'https://kmong.com/my-gigs/new'; });
    await sleep(4000);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(all, null, 2));
  console.log(`\n==== 진단 완료 ====\n  결과: ${OUT_DIR}/summary.json`);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
