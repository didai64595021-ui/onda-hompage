#!/usr/bin/env node
/**
 * 크몽 draft 가격/작업기간/수정횟수 일괄 주입 v2
 *  - v1 문제: "다음" 버튼 찾지 못해 전멸 (0/55)
 *  - v2 원인분석: EXISTING draft 편집 시 Step1+Step2 한 페이지 통합 (fix-all-fields.js 패턴 확인)
 *  - v2 개선: "다음" 클릭 제거. 편집하기 후 같은 페이지에서 전체 필드 접근
 *  - 금액 label="금액" 탐색, 작업기간/수정횟수는 react-select label 매칭
 *
 *  실행: node fill-pricing-v2.js [--only=01,02,03] [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');
const LOG_FILE = path.join(__dirname, '55-run-log.json');
const REPORT = path.join(__dirname, 'fill-pricing-report.json');

const argv = process.argv.slice(2);
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);
const DRY = argv.includes('--dry-run');

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

async function discoverSelects(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[id^="react-select-"]').forEach(el => {
      if (!el.id.endsWith('-input')) return;
      let label = '';
      let cur = el;
      for (let i = 0; i < 12 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const ps = [...cur.querySelectorAll(':scope > p, :scope > div > p, :scope > label')];
        for (const p of ps) {
          const t = (p.innerText || '').trim().replace(/\*\s*$/, '').trim();
          if (t && t.length < 40 && t !== '편집' && t !== '변경하기') { label = t; break; }
        }
        if (label) break;
      }
      out.push({ inputId: el.id, label });
    });
    return out;
  });
}

async function fillReactSelect(page, inputId, value, tag = '') {
  const input = page.locator(`#${inputId}`);
  if ((await input.count()) === 0) return { ok: false, error: `${inputId} 미발견` };
  const control = input.locator('xpath=ancestor::div[contains(@class, "-control")][1]');
  if ((await control.count()) === 0) return { ok: false, error: `${inputId} control 미발견` };

  await page.keyboard.press('Escape').catch(() => {});
  await sleep(200);
  await page.evaluate(() => document.body.click()).catch(() => {});
  await sleep(300);

  await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(300);
  await control.click({ force: true });
  await sleep(800);

  const options = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div')].filter(el => {
      const cls = String(el.className || '');
      return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between')
        && cls.includes('text-gray-900') && cls.includes('px-3');
    }).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return all.map(el => (el.innerText || '').trim()).filter(t => t && t.length < 60);
  });

  if (options.length === 0) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, error: 'no options' }; }

  const target = String(value);
  let pick = options.find(o => o === target) || options.find(o => o.includes(target)) || options.find(o => target.includes(o)) || options[0];
  const fallback = pick !== target;

  const clicked = await page.evaluate((pickText) => {
    const all = [...document.querySelectorAll('div')].filter(el => {
      const cls = String(el.className || '');
      return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between')
        && cls.includes('text-gray-900') && cls.includes('px-3');
    }).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const target = all.find(el => (el.innerText || '').trim() === pickText);
    if (target) {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
      target.click();
      return true;
    }
    return false;
  }, pick);
  if (clicked) { await sleep(1500); return { ok: true, picked: pick, fallback }; }
  await page.keyboard.press('Enter').catch(() => {});
  await sleep(700);
  return { ok: true, picked: pick, fallback, viaKeyboard: true };
}

async function fillSelectByLabel(page, map, labelKey, value, nth = 0) {
  const matches = map.filter(s => s.label === labelKey);
  if (matches.length === 0) return { ok: false, error: `label "${labelKey}" 미발견` };
  if (nth >= matches.length) return { ok: false, error: `label "${labelKey}" #${nth} out of ${matches.length}` };
  return await fillReactSelect(page, matches[nth].inputId, value, `${labelKey}#${nth}`);
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

async function fillPricingFields(page, product) {
  // 전체 페이지 스크롤로 lazy-load 트리거 + 필드 노출
  for (let s = 0; s < 8; s++) { await page.evaluate(() => window.scrollBy(0, 600)); await sleep(250); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // 금액 input 탐색 (label "금액" 포함)
  const priceTargets = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type="text"]').forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      if (el.id && el.id.startsWith('react-select')) return;
      if (r.width === 0 || r.height === 0) {
        // scrollIntoView 후 다시 측정
      }
      let lbl = '';
      let cur = el;
      for (let i = 0; i < 8 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const lblEl = cur.querySelector('label, p');
        if (lblEl) {
          const t = (lblEl.innerText || '').trim();
          if (t.includes('금액')) { lbl = t; break; }
        }
      }
      if (lbl) out.push({ idx, label: lbl });
    });
    return out;
  });

  const priceRes = [];
  if (priceTargets.length >= 3) {
    const allTI = page.locator('input[type="text"]');
    for (let i = 0; i < 3; i++) {
      const pkg = product.packages[i];
      try {
        const el = allTI.nth(priceTargets[i].idx);
        await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await sleep(200);
        await el.click({ force: true });
        await page.keyboard.press('Control+A').catch(() => {});
        await page.keyboard.press('Delete').catch(() => {});
        await el.fill(String(pkg.price));
        priceRes.push({ pkg: pkg.name, price: pkg.price, ok: true });
      } catch (e) {
        priceRes.push({ pkg: pkg.name, price: pkg.price, ok: false, error: e.message });
      }
    }
  } else {
    priceRes.push({ ok: false, error: `priceTargets=${priceTargets.length} (<3)` });
  }

  await sleep(500);

  // 작업 기간 / 수정 횟수 select
  const map = await discoverSelects(page);
  const periodRes = [];
  const reviseRes = [];
  for (let i = 0; i < 3; i++) {
    const pkg = product.packages[i];
    const pr = await fillSelectByLabel(page, map, '작업 기간', `${pkg.days}일`, i);
    periodRes.push({ pkg: pkg.name, days: pkg.days, ...pr });
    await sleep(300);
    const v = pkg.revisions === '제한없음' ? '제한없음' : `${pkg.revisions}회`;
    const rr = await fillSelectByLabel(page, map, '수정 횟수', v, i);
    reviseRes.push({ pkg: pkg.name, revisions: pkg.revisions, ...rr });
    await sleep(300);
  }

  return { priceRes, periodRes, reviseRes, priceTargetsCount: priceTargets.length, selectMapCount: map.length };
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
  const drafts = collectDrafts();
  console.log(`대상 draft: ${drafts.length}개${ONLY.length ? ` (--only=${ONLY.join(',')})` : ''}${DRY ? ' [DRY-RUN]' : ''}`);
  const productMap = {};
  PRODUCTS.forEach(p => { productMap[p.id] = p; });

  const { browser, page } = await login({ slowMo: 100 });
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const filterSet = ONLY.length ? new Set(ONLY) : null;
  const allIds = new Set(drafts.filter(d => !filterSet || filterSet.has(d.productId)).map(d => d.draftId));
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
      process.stdout.write(`  [${draftId}] productId=${d.productId} → 편집 `);
      const clickOk = await clickEditForDraft(page, draftId);
      if (!clickOk) { console.log('✗ 편집하기 클릭 실패'); ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'edit click' }); processed.add(draftId); continue; }
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(5500);
      await closeModals(page).catch(() => {});
      if (!page.url().includes('/my-gigs/edit')) {
        console.log(`✗ 진입실패 ${page.url()}`);
        ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'edit enter' });
        processed.add(draftId);
        await page.evaluate((u) => { window.location.href = u; }, listingUrl);
        await sleep(4000);
        continue;
      }

      const r = DRY ? { priceRes: [], periodRes: [], reviseRes: [], skipped: true } : await fillPricingFields(page, product);
      const save = DRY ? { ok: true, skipped: true } : await saveDraft(page);
      const priceOk = r.priceRes.every(x => x.ok);
      const periodOk = r.periodRes.every(x => x.ok);
      const reviseOk = r.reviseRes.every(x => x.ok);
      const success = DRY || (priceOk && periodOk && reviseOk && save.ok);
      if (success) { console.log(`✓ OK price${priceOk?'✓':'✗'} period${periodOk?'✓':'✗'} revise${reviseOk?'✓':'✗'} save=${save.text||'-'}`); ok++; }
      else { console.log(`⚠ price=${priceOk} period=${periodOk} revise=${reviseOk} save=${save.ok} (priceTargets=${r.priceTargetsCount} selects=${r.selectMapCount})`); ng++; }
      results.push({ draftId, productId: d.productId, ok: success, ...r, save });
      processed.add(draftId);

      await page.evaluate((u) => { window.location.href = u; }, listingUrl);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4000);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }
    }

    if (processed.size >= allIds.size) { console.log('모두 처리 완료'); break; }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: allIds.size, ok, ng, processed: processed.size, results }, null, 2));
  console.log(`\n==== 완료 ====\n  처리: ${processed.size}/${allIds.size}\n  OK ${ok} / NG ${ng}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
