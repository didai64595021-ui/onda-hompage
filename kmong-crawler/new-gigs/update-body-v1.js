#!/usr/bin/env node
/**
 * 크몽 draft 본문(TipTap) 일괄 업데이트
 *  - 새 gig-data-55.js의 title/description을 기존 draft에 반영
 *  - 플로우: listing → 편집하기 클릭 → TipTap 본문 Ctrl+A+type → 임시저장
 *  - 이미지는 건드리지 않음 (v2에서 이미 교체 완료)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');
const LOG_FILE = path.join(__dirname, '55-run-log.json');
const REPORT = path.join(__dirname, 'update-body-report.json');

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

async function fillTipTapField(page, containerId, text) {
  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 2000 }).catch(() => false))) return { ok: false, reason: `${containerId} 없음` };
  await editor.click({ force: true });
  await sleep(300);
  await page.keyboard.press('Control+A').catch(() => {});
  await sleep(150);
  await page.keyboard.press('Delete').catch(() => {});
  await sleep(150);
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
  await sleep(300);
  return { ok: true, len: String(text || '').length };
}

async function editAndUpdate(page, product) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(4500);
  await closeModals(page).catch(() => {});
  if (!page.url().includes('/my-gigs/edit')) return { ok: false, reason: `진입 실패 ${page.url()}` };

  // 1) 제목 업데이트 (input[placeholder*="제목"])
  let titleRes = { ok: false };
  const titleInput = page.locator('input[placeholder*="제목"]').first();
  if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await titleInput.click();
    await page.keyboard.press('Control+A').catch(() => {});
    await sleep(150);
    await titleInput.fill(product.title || '');
    titleRes = { ok: true, len: (product.title || '').length };
    await sleep(300);
  }

  // 2) 본문 TipTap 3개
  const descRes = await fillTipTapField(page, 'DESCRIPTION', product.description);
  const progressRes = product.progress ? await fillTipTapField(page, 'DESCRIPTION_PROGRESS', product.progress) : { ok: true, skipped: true };
  const prepRes = product.preparation ? await fillTipTapField(page, 'DESCRIPTION_PREPARATION', product.preparation) : { ok: true, skipped: true };

  // 3) 임시 저장
  const saveClicked = await page.evaluate(() => {
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
  await sleep(4000);

  return { ok: true, title: titleRes, desc: descRes, progress: progressRes, prep: prepRes, saveClicked };
}

(async () => {
  const drafts = collectDrafts();
  console.log(`대상 draft: ${drafts.length}개`);
  const productMap = {};
  PRODUCTS.forEach(p => { productMap[p.id] = p; });

  const { browser, page } = await login({ slowMo: 100 });
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const allIds = new Set(drafts.map(d => d.draftId));
  const processed = new Set();
  const results = [];
  let ok = 0, ng = 0;

  for (let pageNo = 1; pageNo <= 6; pageNo++) {
    const listingUrl = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
    console.log(`\n[listing ${pageNo}] ${listingUrl}`);
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
    const targets = visibleIds.filter(id => allIds.has(id) && !processed.has(id));
    console.log(`  visible=${visibleIds.length} 처리=${targets.length}`);

    for (const draftId of targets) {
      const d = drafts.find(x => x.draftId === draftId);
      const product = productMap[d.productId];
      if (!product) { console.log(`  [${draftId}] productId=${d.productId} 매핑 없음 skip`); continue; }
      process.stdout.write(`  [${draftId}] productId=${d.productId} → title=${product.title?.slice(0,20)}... `);
      const clickOk = await clickEditForDraft(page, draftId);
      if (!clickOk) { console.log('✗ 편집하기 클릭 실패'); ng++; results.push({ draftId, ok: false, reason: '편집하기 클릭 실패' }); continue; }
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4500);
      const r = await editAndUpdate(page, product);
      if (r.ok) { console.log(`✓ OK desc=${r.desc.len || 'n/a'} save=${r.saveClicked?.text || 'n/a'}`); ok++; }
      else { console.log(`✗ ${r.reason}`); ng++; }
      results.push({ draftId, productId: d.productId, ...r });
      processed.add(draftId);

      await page.evaluate((u) => { window.location.href = u; }, listingUrl);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4000);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }
    }

    if (processed.size >= allIds.size) { console.log('모두 처리 완료'); break; }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, processed: processed.size, results }, null, 2));
  console.log(`\n==== 완료 ====\n  처리: ${processed.size}/${drafts.length}\n  OK ${ok} / NG ${ng}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
