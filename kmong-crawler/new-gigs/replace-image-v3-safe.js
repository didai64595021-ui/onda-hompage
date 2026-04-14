#!/usr/bin/env node
/**
 * 크몽 메인 이미지 업로드 v3-safe
 *  - v2 문제: 22건 "OK" 보고했지만 실제 MAIN_GALLERY 0/4 (업로드 실패)
 *  - 원인 추정: 빈 갤러리에서 "삭제" 버튼 오클릭 → input 상태 깨짐 → setInputFiles 무효
 *  - v3-safe 전략:
 *    1) 삭제 클릭 생략 (drafts 전부 0/4 상태)
 *    2) setInputFiles 호출
 *    3) 8초 대기 후 갤러리 카운트 indicator 실측 (0/4 → 1/4 전환 확인)
 *    4) 전환 실패 시 filechooser API로 재시도
 *    5) 카운트 전환 확정된 경우만 "임시 저장하기" 클릭
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const IMAGE_DIR = path.join(__dirname, '03-images');
const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');
const LOG_FILE = path.join(__dirname, '55-run-log.json');
const REPORT = path.join(__dirname, 'replace-image-v3-safe-report.json');

const argv = process.argv.slice(2);
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function collectDrafts() {
  const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  const byId = {};
  for (const r of log.runs || []) {
    const m = (r.savedUrl || '').match(/\/edit\/(\d+)/);
    if (!m) continue;
    if (!byId[r.id] || r.at > byId[r.id].at) {
      byId[r.id] = { draftId: m[1], at: r.at, productId: r.id };
    }
  }
  return Object.values(byId);
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

async function readGalleryCount(page) {
  return await page.evaluate(() => {
    const mg = document.querySelector('#MAIN_GALLERY');
    if (!mg) return { ok: false, reason: 'no #MAIN_GALLERY' };
    // 패턴: <p>(<span>0</span>/4)</p>
    const spans = [...mg.querySelectorAll('span')];
    for (const s of spans) {
      const t = (s.innerText || '').trim();
      if (/^\d+$/.test(t)) {
        const parent = s.parentElement;
        const parentText = (parent?.innerText || '').trim();
        if (/\/\d+/.test(parentText)) return { ok: true, current: parseInt(t, 10), raw: parentText };
      }
    }
    return { ok: false, reason: 'count indicator not found' };
  });
}

async function uploadMainImage(page, imagePath) {
  // 0) 초기 상태 읽기
  const before = await readGalleryCount(page);
  const initial = before.ok ? before.current : -1;

  // 1) Strategy A: setInputFiles via locator
  let used = null;
  try {
    const input = page.locator('#MAIN_GALLERY input[type=file]').first();
    if (await input.count() > 0) {
      await input.setInputFiles(imagePath);
      used = 'setInputFiles';
    }
  } catch (e) {
    used = `setInputFiles-err: ${e.message}`;
  }
  await sleep(8000);

  // 2) 카운트 증가 확인
  let after = await readGalleryCount(page);
  if (after.ok && initial >= 0 && after.current > initial) {
    return { ok: true, strategy: used, before: initial, after: after.current };
  }

  // 3) Strategy B: filechooser API (클릭 → 다이얼로그 → setFiles)
  try {
    const uploadBtn = await page.evaluate(() => {
      const mg = document.querySelector('#MAIN_GALLERY');
      if (!mg) return null;
      // "업로드" / "이미지 추가" / "파일 선택" 류 버튼
      const btns = [...mg.querySelectorAll('button')];
      for (const b of btns) {
        const t = (b.innerText || '').trim();
        if (/업로드|이미지 추가|파일|선택|추가/.test(t)) { b.scrollIntoView({ block: 'center' }); return t; }
      }
      return null;
    });
    if (uploadBtn) {
      // file chooser 리스너 달고 클릭
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
        page.evaluate(() => {
          const mg = document.querySelector('#MAIN_GALLERY');
          const btns = [...mg.querySelectorAll('button')];
          for (const b of btns) {
            const t = (b.innerText || '').trim();
            if (/업로드|이미지 추가|파일|선택|추가/.test(t)) { b.click(); return; }
          }
        })
      ]);
      if (fc) {
        await fc.setFiles(imagePath);
        used = 'filechooser';
        await sleep(8000);
        after = await readGalleryCount(page);
        if (after.ok && initial >= 0 && after.current > initial) {
          return { ok: true, strategy: used, before: initial, after: after.current };
        }
      }
    }
  } catch (e) {
    used += `/filechooser-err: ${e.message}`;
  }

  // 4) Strategy C: dispatch change event manually
  try {
    await page.evaluate(() => {
      const input = document.querySelector('#MAIN_GALLERY input[type=file]');
      if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(3000);
    after = await readGalleryCount(page);
    if (after.ok && initial >= 0 && after.current > initial) {
      return { ok: true, strategy: used + '/change-dispatch', before: initial, after: after.current };
    }
  } catch {}

  return { ok: false, strategy: used, before: initial, after: after.ok ? after.current : 'n/a', reason: 'count unchanged' };
}

async function saveDraft(page) {
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    for (const b of btns) {
      const t = (b.innerText || '').trim();
      if (t === '임시 저장하기' || t === '임시저장하기' || t === '임시저장') {
        b.scrollIntoView({ block: 'center' });
        b.click();
        return { ok: true, text: t };
      }
    }
    return { ok: false };
  });
  await sleep(5000);
  return clicked;
}

(async () => {
  let drafts = collectDrafts();
  if (ONLY.length) drafts = drafts.filter(d => ONLY.includes(d.productId));
  console.log(`대상 draft: ${drafts.length}개${ONLY.length ? ` (--only=${ONLY.join(',')})` : ''}`);

  const productMap = {};
  PRODUCTS.forEach(p => { productMap[p.id] = p; });

  const { browser, page } = await login({ slowMo: 100 });
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const allDraftIds = new Set(drafts.map(d => d.draftId));
  const processedIds = new Set();
  const results = [];
  let ok = 0, ng = 0;

  for (let pageNo = 1; pageNo <= 6; pageNo++) {
    const listingUrl = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
    console.log(`\n[listing ${pageNo}]`);
    await page.evaluate((u) => { window.location.href = u; }, listingUrl);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await sleep(5000);
    if (!page.url().includes('/my-gigs?')) { console.log('listing 리다이렉트 → 종료'); break; }
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }

    const visibleIds = await page.evaluate(() => {
      const out = [];
      const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
      for (const eb of editBtns) {
        let card = eb;
        for (let i = 0; i < 10; i++) {
          card = card.parentElement;
          if (!card) break;
          const m = (card.innerText || '').match(/#(\d{6,})/);
          if (m) { out.push(m[1]); break; }
        }
      }
      return out;
    });
    const targets = visibleIds.filter(id => allDraftIds.has(id) && !processedIds.has(id));
    console.log(`  처리 대상: ${targets.length}개`);

    for (const draftId of targets) {
      const d = drafts.find(x => x.draftId === draftId);
      const p = productMap[d.productId];
      const imagePath = path.join(IMAGE_DIR, p.image);
      if (!fs.existsSync(imagePath)) { console.log(`  [${draftId}] ${p.image} 없음 skip`); continue; }

      process.stdout.write(`  [${draftId}] pid=${d.productId} → ${p.image} ... `);
      const clickOk = await clickEditForDraft(page, draftId);
      if (!clickOk) { console.log('✗ 편집하기 실패'); ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'edit click' }); processedIds.add(draftId); continue; }
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(5000);
      await closeModals(page).catch(() => {});
      if (!page.url().includes('/my-gigs/edit')) {
        console.log(`✗ 진입실패`);
        ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'edit enter' });
        processedIds.add(draftId);
        await page.evaluate((u) => { window.location.href = u; }, listingUrl); await sleep(4000);
        continue;
      }

      // MAIN_GALLERY 스크롤
      await page.evaluate(() => {
        const g = document.querySelector('#MAIN_GALLERY');
        if (g) g.scrollIntoView({ block: 'center' });
      }).catch(() => {});
      await sleep(1000);

      const upload = await uploadMainImage(page, imagePath);
      let saveClicked = { skipped: true };
      if (upload.ok) {
        saveClicked = await saveDraft(page);
      }

      const success = upload.ok && saveClicked.ok;
      if (success) { console.log(`✓ ${upload.strategy} before=${upload.before} after=${upload.after} save=${saveClicked.text}`); ok++; }
      else { console.log(`✗ ${upload.reason || ''} strategy=${upload.strategy} before=${upload.before} after=${upload.after}`); ng++; }
      results.push({ draftId, productId: d.productId, ok: success, upload, save: saveClicked });
      processedIds.add(draftId);

      await page.evaluate((u) => { window.location.href = u; }, listingUrl);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4000);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }
    }

    if (processedIds.size >= allDraftIds.size) break;
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, processed: processedIds.size, results }, null, 2));
  console.log(`\n==== v3-safe 완료 ====\n  처리: ${processedIds.size}/${drafts.length}\n  OK ${ok} / NG ${ng}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
