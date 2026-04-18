/**
 * 니치 gig draft 범용 채움 스크립트
 *
 * 사용법: node fill-niche.js <productId>
 *   예:  node fill-niche.js N01
 *
 * 필수 선행:
 *   - gig-data-niches.js 에 PRODUCT 존재
 *   - gig-data-niches-extra.js 에 EXTRA[productId] 존재 (draftId·subCategoryId·revision·gallery·extraSelects)
 *
 * 동작:
 *   1) SPA warm-up + edit URL nav
 *   2) fillStep2 (probeOnly=true)
 *   3) discoverSelects → fillExtraSelects
 *   4) fillRevision
 *   5) fillSubGallery
 *   6) blur+change dispatch → 임시 저장
 *   7) reload + persist 검증
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');
const { fillStep2, fillRevision, fillSubGallery, fillExtraSelects } = require('./create-gig.js');
const { PRODUCTS } = require('./gig-data-niches.js');
const { EXTRA } = require('./gig-data-niches-extra.js');

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

const IMAGE_DIR = path.join(__dirname, '03-images');
const SNAP = path.join(__dirname, 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function snap(page, name) {
  fs.mkdirSync(SNAP, { recursive: true });
  await page.screenshot({ path: path.join(SNAP, `${name}.png`), fullPage: true }).catch(() => {});
}

async function main() {
  const productId = process.argv[2];
  if (!productId) { console.error('사용법: node fill-niche.js <productId>'); process.exit(1); }
  const product = (PRODUCTS || []).find(p => p.id === productId);
  const extra = EXTRA[productId];
  if (!product) { console.error(`PRODUCTS에 ${productId} 없음`); process.exit(1); }
  if (!extra) { console.error(`EXTRA에 ${productId} 없음`); process.exit(1); }

  const editUrl = `https://kmong.com/my-gigs/edit/${extra.draftId}?rootCategoryId=6&subCategoryId=${extra.subCategoryId}${extra.thirdCategoryId ? `&thirdCategoryId=${extra.thirdCategoryId}` : ''}`;
  console.log(`\n${'='.repeat(60)}\n[fill-niche] ${productId} — ${product.title}\n[fill-niche] draft=${extra.draftId} url=${editUrl}\n${'='.repeat(60)}\n`);

  const { browser, page } = await login({ slowMo: 100 });
  const log = { at: new Date().toISOString(), id: productId, steps: [], errors: [] };

  try {
    console.log('[1] warm-up');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    console.log(`[2] SPA nav`);
    await page.evaluate(u => { window.location.href = u; }, editUrl);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    console.log('[3] fillStep2');
    const s2 = await fillStep2(page, product, { probeOnly: true });
    log.steps.push({ name: 'fillStep2', ok: s2.ok });
    await sleep(2000);

    console.log('[4] fillExtraSelects');
    const selectMap = await discoverSelects(page);
    const esRes = await fillExtraSelects(page, selectMap, extra.extraSelects || []);
    log.steps.push({ name: 'fillExtraSelects', ok: esRes.ok, okCount: esRes.okCount, total: esRes.total });

    console.log('[5] fillRevision');
    const rRes = await fillRevision(page, extra.revision);
    log.steps.push({ name: 'fillRevision', ok: rRes.ok });

    console.log('[6] fillSubGallery');
    const paths = (extra.gallery || []).map(f => path.join(IMAGE_DIR, f));
    const gRes = await fillSubGallery(page, paths);
    log.steps.push({ name: 'fillSubGallery', ok: gRes.ok, count: gRes.count });

    // 6b) DESCRIPTION_PREPARATION 재시도 (timing 이슈 보강)
    console.log('[6b] DESCRIPTION_PREPARATION 재시도');
    const prepLen = await page.evaluate(() => {
      const el = document.querySelector('#DESCRIPTION_PREPARATION .ProseMirror');
      return el ? (el.innerText || '').trim().length : -1;
    });
    console.log(`   현재 PREP 길이=${prepLen}`);
    if (prepLen === 0 && product.preparation) {
      await page.evaluate((text) => {
        const el = document.querySelector('#DESCRIPTION_PREPARATION .ProseMirror');
        if (!el) return;
        el.focus();
        // ProseMirror 에 텍스트 주입
        document.execCommand('insertText', false, text);
      }, product.preparation);
      await sleep(1500);
      const prepLen2 = await page.evaluate(() => {
        const el = document.querySelector('#DESCRIPTION_PREPARATION .ProseMirror');
        return el ? (el.innerText || '').trim().length : -1;
      });
      console.log(`   재시도 후 길이=${prepLen2}`);
      log.steps.push({ name: 'preparation-retry', before: prepLen, after: prepLen2 });
    }

    // 6c) 판매 핵심 정보 — 페이지 수 fill
    if (extra.pageCount && extra.pageCount.length >= 3) {
      console.log('[6c] 페이지 수 fill');
      const pageRes = await page.evaluate((counts) => {
        // label 이 "페이지 수" 인 input 찾기 (visible + empty)
        const inputs = [...document.querySelectorAll('input[type="text"], input[type="number"]')];
        const pageInputs = inputs.filter(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          let cur = el;
          for (let i = 0; i < 8 && cur; i++) {
            cur = cur.parentElement;
            if (!cur) break;
            const lbl = cur.querySelector('label, p');
            if (lbl && ((lbl.innerText || '').trim().includes('페이지 수'))) return true;
          }
          return false;
        });
        if (pageInputs.length < 3) return { ok: false, found: pageInputs.length };
        const results = [];
        for (let i = 0; i < 3; i++) {
          const el = pageInputs[i];
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, String(counts[i]));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          results.push({ i, value: el.value });
        }
        return { ok: true, found: pageInputs.length, results };
      }, extra.pageCount);
      console.log(`   ${JSON.stringify(pageRes)}`);
      log.steps.push({ name: 'pageCount', ...pageRes });
      await sleep(1000);
    }

    console.log('[7] blur/dispatch');
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      document.querySelectorAll('input, textarea').forEach(el => {
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await sleep(3000);

    console.log('[8] 임시 저장');
    const saveBtn = page.locator('button:has-text("임시 저장하기")').last();
    if (!(await saveBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      log.errors.push('임시 저장 버튼 미발견');
    } else {
      await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await sleep(1000);
      await saveBtn.click({ force: true });
      await sleep(8000);

      console.log('[9] reload + verify');
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await sleep(5000);
      const verify = await page.evaluate(() => {
        const descLens = [...document.querySelectorAll('.ProseMirror')].map(el => (el.innerText || '').trim().length);
        const images = document.querySelectorAll('[id*="GALLERY"] img').length;
        const pkgFilled = [...document.querySelectorAll('textarea')].filter(t => t.name && t.name.includes('packageValue') && !!t.value).length;
        return { descLens, images, pkgFilled };
      });
      log.steps.push({ name: 'verify', ...verify });
      const persisted = verify.descLens.some(l => l > 10) && verify.pkgFilled >= 3;
      log.steps.push({ name: 'save', ok: persisted, persisted });
      console.log(`  ${persisted ? '✓' : '✗'} desc=${verify.descLens.join(',')} img=${verify.images} pkg=${verify.pkgFilled}/6`);
    }

    fs.writeFileSync(path.join(__dirname, `fill-niche-${productId}-log.json`), JSON.stringify(log, null, 2));
    console.log('\n✅ 완료');
  } catch (e) {
    console.error(`✗ ${e.message}`);
    log.errors.push(e.message);
  } finally {
    await browser.close().catch(() => {});
  }
  process.exit(log.errors.length > 0 ? 1 : 0);
}

main();
