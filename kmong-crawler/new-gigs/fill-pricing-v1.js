#!/usr/bin/env node
/**
 * 크몽 draft 가격/작업기간/수정횟수 일괄 주입 (Step2)
 *  - 편집하기 → (Step1 로딩) → "다음" 클릭 → Step2 → 금액/기간/수정횟수 3패키지 × 3필드 → 임시저장
 *  - 본문(Step1 TipTap)은 건드리지 않음 — update-body-v1.js가 담당
 *  - 참조: create-gig.js의 discoverSelects, fillReactSelect, fillSelectByLabel
 *
 *  실행: node fill-pricing-v1.js [--only=01,02,03] [--dry-run]
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

  const ok = await page.evaluate((pickText) => {
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
  if (ok) { await sleep(1500); return { ok: true, picked: pick, fallback }; }
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

async function clickNextToStep2(page) {
  const nextBtn = page.locator('button:has-text("다음")').first();
  if (!(await nextBtn.isVisible({ timeout: 5000 }).catch(() => false))) return { ok: false, error: '"다음" 버튼 미발견' };
  await nextBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(300);
  await nextBtn.click({ force: true });
  await sleep(5000);
  // Step2 감지: "금액" 라벨 또는 "임시 저장하기" 버튼 존재
  const onStep2 = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    return txt.includes('금액') && txt.includes('작업 기간');
  });
  return { ok: onStep2, url: page.url() };
}

async function fillPricingOnStep2(page, product) {
  // 금액 input 탐색
  const priceTargets = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type="text"]').forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (el.id && el.id.startsWith('react-select')) return;
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
    priceRes.push({ ok: false, error: `priceTargets=${priceTargets.length}` });
  }

  await sleep(500);

  // 작업 기간 / 수정 횟수 셀렉트
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

  return { priceRes, periodRes, reviseRes };
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
      process.stdout.write(`  [${draftId}] productId=${d.productId} → 편집하기 `);
      const clickOk = await clickEditForDraft(page, draftId);
      if (!clickOk) { console.log('✗ 편집하기 클릭 실패'); ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'edit click' }); processed.add(draftId); continue; }
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4500);
      await closeModals(page).catch(() => {});
      if (!page.url().includes('/my-gigs/edit')) { console.log(`✗ 진입실패 ${page.url()}`); ng++; results.push({ draftId, productId: d.productId, ok: false, reason: 'edit enter' }); processed.add(draftId); continue; }

      // Step1 → Step2
      const step2 = await clickNextToStep2(page);
      if (!step2.ok) {
        console.log(`✗ Step2 진입 실패 ${step2.error || step2.url}`);
        ng++;
        results.push({ draftId, productId: d.productId, ok: false, reason: 'step2', step2 });
        processed.add(draftId);
        await page.evaluate((u) => { window.location.href = u; }, listingUrl);
        await sleep(4000);
        continue;
      }

      // 금액/기간/수정
      const r = DRY ? { priceRes: [], periodRes: [], reviseRes: [], skipped: true } : await fillPricingOnStep2(page, product);
      const save = DRY ? { ok: true, skipped: true } : await saveDraft(page);
      const success = !DRY && (r.priceRes.every(x => x.ok) && r.periodRes.every(x => x.ok) && r.reviseRes.every(x => x.ok) && save.ok);
      if (DRY || success) { console.log(`✓ OK`); ok++; }
      else { console.log(`⚠ 일부 실패`); ng++; }
      results.push({ draftId, productId: d.productId, ok: DRY || success, ...r, save });
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
