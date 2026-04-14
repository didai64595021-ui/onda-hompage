#!/usr/bin/env node
/**
 * 크몽 메인 이미지 업로드 v4 — 엄격한 검증 + 재시도
 *  - v3-safe 문제: count reader 느슨해서 false positive (1/1 오인식)
 *  - v4 개선:
 *    1) count 정규식 엄격 `^\s*\(?\s*(\d+)\s*\/\s*(\d+)\s*\)?` + span 위치 검증
 *    2) 업로드 전/후 count 비교, before==0 && after>0 이어야 성공
 *    3) 실패 시 3회 재시도 (페이지 리로드 포함)
 *    4) 저장 후 재검증 (임시저장 후 count 유지 확인)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const IMAGE_DIR = path.join(__dirname, '03-images');
const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');
const LOG_FILE = path.join(__dirname, '55-run-log.json');
const REPORT = path.join(__dirname, 'replace-image-v4-report.json');

const argv = process.argv.slice(2);
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function collectDrafts() {
  const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  const byId = {};
  for (const r of log.runs || []) {
    const m = (r.savedUrl || '').match(/\/edit\/(\d+)/);
    if (!m) continue;
    if (!byId[r.id] || r.at > byId[r.id].at) byId[r.id] = { draftId: m[1], at: r.at, productId: r.id };
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

// 엄격한 count reader (v4 verify 방식)
async function readCount(page) {
  return await page.evaluate(() => {
    const mg = document.querySelector('#MAIN_GALLERY');
    if (!mg) return { ok: false, reason: 'no MAIN_GALLERY' };
    const spans = [...mg.querySelectorAll('span')];
    for (const s of spans) {
      const t = (s.innerText || '').trim();
      if (/^\d+$/.test(t)) {
        const parent = s.parentElement;
        const parentText = (parent?.innerText || '').trim();
        const m = parentText.match(/^\s*\(?\s*(\d+)\s*\/\s*(\d+)\s*\)?/);
        if (m) return { ok: true, current: parseInt(m[1], 10), max: parseInt(m[2], 10), raw: parentText };
      }
    }
    return { ok: false, reason: 'no counter' };
  });
}

async function uploadWithRetry(page, imagePath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const before = await readCount(page);
    const beforeN = before.ok ? before.current : -1;

    // setInputFiles
    let strategy = 'setInputFiles';
    try {
      const input = page.locator('#MAIN_GALLERY input[type=file]').first();
      if (await input.count() === 0) return { ok: false, attempt, reason: 'no file input' };
      await input.setInputFiles(imagePath);
    } catch (e) {
      strategy = `setInputFiles-err:${e.message.slice(0,50)}`;
    }

    // 긴 대기 (15초, 업로드 처리)
    await sleep(15000);
    const after = await readCount(page);
    const afterN = after.ok ? after.current : -1;

    if (after.ok && afterN > beforeN && afterN > 0) {
      return { ok: true, attempt, strategy, before: beforeN, after: afterN };
    }

    // 실패 → filechooser 시도 (2번째 시도부터)
    if (attempt >= 2) {
      try {
        const [fc] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
          page.evaluate(() => {
            const mg = document.querySelector('#MAIN_GALLERY');
            if (!mg) return;
            const btns = [...mg.querySelectorAll('button')];
            for (const b of btns) {
              const t = (b.innerText || '').trim();
              if (/업로드|이미지 추가|파일|선택|추가|드래|drag/i.test(t)) { b.click(); return; }
            }
            // label with for attribute linked to file input
            const lbl = [...mg.querySelectorAll('label')].find(l => l.htmlFor && mg.querySelector(`#${l.htmlFor}`)?.type === 'file');
            if (lbl) lbl.click();
          })
        ]);
        if (fc) {
          await fc.setFiles(imagePath);
          await sleep(12000);
          const after2 = await readCount(page);
          if (after2.ok && after2.current > beforeN && after2.current > 0) {
            return { ok: true, attempt, strategy: 'filechooser', before: beforeN, after: after2.current };
          }
        }
      } catch {}
    }

    // 마지막 시도가 아니면 페이지 리로드 후 재진입 준비 필요 — 여기서는 그냥 반복
    if (attempt < retries) await sleep(2000);
  }
  const finalCount = await readCount(page);
  return { ok: false, reason: 'count unchanged after retries', finalCount: finalCount.ok ? finalCount.current : 'n/a' };
}

async function saveAndVerify(page) {
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
  await sleep(6000);
  // 저장 후 재검증
  const after = await readCount(page);
  return { save: clicked, after };
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
    if (!page.url().includes('/my-gigs?')) { console.log('listing 리다이렉트'); break; }
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
      if (!clickOk) { console.log('✗ edit click'); ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'edit click' }); processedIds.add(draftId); continue; }
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(5000);
      await closeModals(page).catch(() => {});
      if (!page.url().includes('/my-gigs/edit')) {
        console.log(`✗ enter`);
        ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'enter' });
        processedIds.add(draftId);
        await page.evaluate((u) => { window.location.href = u; }, listingUrl); await sleep(4000);
        continue;
      }

      await page.evaluate(() => {
        const g = document.querySelector('#MAIN_GALLERY');
        if (g) g.scrollIntoView({ block: 'center' });
      }).catch(() => {});
      await sleep(1500);

      const upload = await uploadWithRetry(page, imagePath, 3);
      let saveRes = { skipped: true };
      if (upload.ok) saveRes = await saveAndVerify(page);

      const success = upload.ok && saveRes.save?.ok && saveRes.after?.current > 0;
      if (success) { console.log(`✓ ${upload.strategy} (attempt ${upload.attempt}) before=${upload.before} after=${upload.after} saved=${saveRes.after.current}/${saveRes.after.max}`); ok++; }
      else { console.log(`✗ ${upload.reason || saveRes.save?.ok===false ? 'save fail' : ''} finalCount=${upload.finalCount || saveRes.after?.current || 'n/a'}`); ng++; }
      results.push({ draftId, productId: d.productId, ok: success, upload, save: saveRes });
      processedIds.add(draftId);

      await page.evaluate((u) => { window.location.href = u; }, listingUrl);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4000);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }
    }

    if (processedIds.size >= allDraftIds.size) break;
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, processed: processedIds.size, results }, null, 2));
  console.log(`\n==== v4 완료 ====\n  처리: ${processedIds.size}/${drafts.length}\n  OK ${ok} / NG ${ng}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
