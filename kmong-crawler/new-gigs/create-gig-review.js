#!/usr/bin/env node
/**
 * 크몽 리뷰 서비스 등록 RPA — 마케팅 카테고리 전용
 *
 * - 3차 카테고리 지원 (마케팅 > 바이럴·포스팅 > 블로그 포스팅 등)
 * - 마케팅 전용 select (업종, 진행 영역, 대행 채널, 체험단 방식 등)
 * - 기존 create-gig.js의 헬퍼 함수 재사용
 *
 * 사용법:
 *   node create-gig-review.js --product R01 --mode save     # 단일 상품
 *   node create-gig-review.js --product all --mode save     # 4개 모두
 *   node create-gig-review.js --product R01 --mode probe    # select 탐색만
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');
const { REVIEW_PRODUCTS } = require('./gig-data-review');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const IMAGE_DIR = path.join(__dirname, '03-images');
const LOG_PATH = path.join(__dirname, 'create-gig-review-log.json');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ──────────────────────────────────────────
// 헬퍼: 스크린샷
// ──────────────────────────────────────────
async function snap(page, label) {
  const out = path.join(SCREENSHOT_DIR, `${label}.png`);
  await page.screenshot({ path: out, fullPage: true }).catch(() => {});
  return out;
}

// ──────────────────────────────────────────
// 헬퍼: select 목록 발견 (label 매핑)
// ──────────────────────────────────────────
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
          if (t && t.length < 40 && t !== '편집' && t !== '변경하기') {
            label = t;
            break;
          }
        }
        if (label) break;
      }
      out.push({ inputId: el.id, label });
    });
    return out;
  });
}

// ──────────────────────────────────────────
// 헬퍼: react-select 채우기
// ──────────────────────────────────────────
async function fillReactSelect(page, inputId, value, label = '') {
  const tag = label ? `[${label}]` : '';
  const input = page.locator(`#${inputId}`);
  if ((await input.count()) === 0) {
    console.log(`  ✗ ${tag} ${inputId} 미발견`);
    return { ok: false };
  }

  const control = input.locator('xpath=ancestor::div[contains(@class, "-control")][1]');
  if ((await control.count()) === 0) {
    console.log(`  ✗ ${tag} control 미발견`);
    return { ok: false };
  }

  await page.keyboard.press('Escape').catch(() => {});
  await sleep(200);
  await page.evaluate(() => document.body.click()).catch(() => {});
  await sleep(300);

  await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(300);
  await control.click({ force: true });
  await sleep(800);

  const options = await page.evaluate(() => {
    return [...document.querySelectorAll('div')].filter(el => {
      const cls = String(el.className || '');
      return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between')
        && cls.includes('text-gray-900') && cls.includes('px-3');
    }).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).map(el => (el.innerText || '').trim()).filter(t => t && t.length < 60);
  });

  if (options.length === 0) {
    console.log(`  ✗ ${tag} 옵션 0개`);
    await page.keyboard.press('Escape').catch(() => {});
    return { ok: false, options: [] };
  }

  const target = String(value);
  let pick = options.find(o => o === target);
  if (!pick) pick = options.find(o => o.includes(target));
  if (!pick) pick = options.find(o => target.includes(o));
  if (!pick) pick = options[0];

  const ok = await page.evaluate((pickText) => {
    const all = [...document.querySelectorAll('div')].filter(el => {
      const cls = String(el.className || '');
      return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between')
        && cls.includes('text-gray-900') && cls.includes('px-3');
    }).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const target = all.find(el => (el.innerText || '').trim() === pickText);
    if (target) {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
      target.click();
      return true;
    }
    return false;
  }, pick);

  if (ok) {
    await sleep(1800);
    console.log(`  ✓ ${tag} ${inputId} = "${pick}"${pick !== target ? ` (fallback, 요청="${value}")` : ''}`);
    return { ok: true, picked: pick, options };
  }

  await page.keyboard.press('Enter').catch(() => {});
  await sleep(800);
  console.log(`  ⚠ ${tag} keyboard fallback "${pick}"`);
  return { ok: true, picked: pick, options };
}

// ──────────────────────────────────────────
// 헬퍼: label 기반 select 채우기
// ──────────────────────────────────────────
async function fillSelectByLabel(page, selectMap, labelKey, value, nthOfLabel = 0) {
  const matches = selectMap.filter(s => s.label === labelKey);
  if (matches.length === 0) {
    console.log(`  ⚠ "${labelKey}" select 미발견 (skip)`);
    return { ok: false, skipped: true };
  }
  if (nthOfLabel >= matches.length) {
    console.log(`  ⚠ "${labelKey}" #${nthOfLabel} 없음 (전체 ${matches.length}개)`);
    return { ok: false, skipped: true };
  }
  return await fillReactSelect(page, matches[nthOfLabel].inputId, value, `${labelKey}#${nthOfLabel}`);
}

// ──────────────────────────────────────────
// 헬퍼: TipTap 에디터 채우기
// ──────────────────────────────────────────
async function fillTipTap(page, containerId, text, label = '') {
  const tag = label ? `[${label}]` : '';
  const container = page.locator(`#${containerId}`);
  // 스크롤해서 보이게
  await container.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await sleep(500);
  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log(`  ✗ ${tag} #${containerId} ProseMirror 미발견`);
    return { ok: false };
  }
  await editor.click({ force: true });
  await sleep(300);
  await page.keyboard.press('Control+A').catch(() => {});
  await sleep(150);
  await page.keyboard.press('Delete').catch(() => {});
  await sleep(150);

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
  await sleep(400);
  console.log(`  ✓ ${tag} #${containerId} (${text.length}자)`);
  return { ok: true };
}

// ──────────────────────────────────────────
// 헬퍼: 카테고리 선택
// ──────────────────────────────────────────
async function selectCategory(page, label, value) {
  const btn = page.locator('button').filter({ hasText: label }).first();
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) {
    return { ok: false, error: `${label} 버튼 미발견` };
  }
  await btn.click({ force: true });
  await sleep(2000);

  const opt = page.getByText(value, { exact: true }).first();
  if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await opt.click({ force: true });
    await sleep(1500);
    return { ok: true };
  }
  // 부분 일치
  const partial = page.locator('button, li, div, span').filter({ hasText: value }).first();
  if (await partial.isVisible({ timeout: 1500 }).catch(() => false)) {
    await partial.click({ force: true });
    await sleep(1500);
    return { ok: true, partial: true };
  }
  await page.keyboard.press('Escape').catch(() => {});
  return { ok: false, error: `${label} 옵션 "${value}" 미발견` };
}

// ──────────────────────────────────────────
// Step 1: 제목 + 카테고리 (3차 지원) → 다음
// ──────────────────────────────────────────
async function fillStep1(page, product) {
  console.log(`\n[Step1] /my-gigs/new`);
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await closeModals(page).catch(() => {});

  // 제목
  console.log(`[Step1] 제목: "${product.title}" (${product.title.length}자)`);
  const titleInput = page.locator('input[type="text"]').first();
  await titleInput.click();
  await titleInput.fill(product.title);
  await sleep(800);

  // 1차 카테고리
  console.log(`[Step1] 1차: ${product.cat1}`);
  const r1 = await selectCategory(page, '1차 카테고리', product.cat1);
  if (!r1.ok) throw new Error(`1차 카테고리 실패: ${r1.error}`);

  // 2차 카테고리
  console.log(`[Step1] 2차: ${product.cat2}`);
  const r2 = await selectCategory(page, '2차 카테고리', product.cat2);
  if (!r2.ok) throw new Error(`2차 카테고리 실패: ${r2.error}`);

  // 3차 카테고리 (있으면)
  if (product.cat3) {
    console.log(`[Step1] 3차: ${product.cat3}`);
    await sleep(1000);
    const r3 = await selectCategory(page, '3차 카테고리', product.cat3);
    if (!r3.ok) throw new Error(`3차 카테고리 실패: ${r3.error}`);
  }

  await snap(page, `review-${product.id}-step1-filled`);

  // 다음 클릭
  console.log(`[Step1] "다음" 클릭`);
  await page.locator('button').filter({ hasText: '다음' }).first().click();
  await sleep(6000);

  const url = page.url();
  console.log(`[Step1] Step 2 진입 — URL: ${url}`);

  if (!url.includes('/my-gigs/edit/')) {
    // 에러 메시지 확인
    const errors = await page.evaluate(() => {
      const errEls = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"], .text-red-500');
      return [...errEls].map(el => (el.innerText || '').trim()).filter(Boolean);
    });
    throw new Error(`Step 2 진입 실패: ${errors.join('; ') || 'unknown'}`);
  }

  return { ok: true, draftUrl: url };
}

// ──────────────────────────────────────────
// "패키지로 설정" 토글 활성화
// ──────────────────────────────────────────
async function enablePackageMode(page) {
  return await page.evaluate(() => {
    const labels = [...document.querySelectorAll('p, label, span, div')].filter(el => {
      return (el.innerText || '').trim() === '패키지로 설정';
    });
    if (labels.length === 0) return { ok: false, reason: 'label not found' };
    labels.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
    let cur = labels[0];
    for (let i = 0; i < 6 && cur; i++) {
      cur = cur.parentElement;
      const cb = cur?.querySelector('input[type="checkbox"][role="switch"], input[type="checkbox"]');
      if (cb) {
        if (cb.checked) return { ok: true, alreadyOn: true };
        cb.click();
        return { ok: true, clicked: true };
      }
    }
    return { ok: false, reason: 'checkbox not found' };
  });
}

// ──────────────────────────────────────────
// Step 2: 풀필 → 임시저장
// ──────────────────────────────────────────
async function fillStep2(page, product, opts = {}) {
  const probeOnly = opts.probeOnly === true;
  console.log(`\n[Step2] 풀필 시작 (probeOnly=${probeOnly})`);
  await snap(page, `review-${product.id}-step2-initial`);

  // 1. 서비스 설명 본문
  await fillTipTap(page, 'DESCRIPTION', product.description, '서비스 설명');

  // 2. 패키지 토글
  console.log(`[Step2] "패키지로 설정" 토글`);
  const toggleRes = await enablePackageMode(page);
  console.log(`  → ${JSON.stringify(toggleRes)}`);
  await sleep(2500);

  // 3. select 매핑 (토글 후)
  const selectMap = await discoverSelects(page);
  console.log(`[Step2] select ${selectMap.length}개:`);
  selectMap.forEach(s => console.log(`   ${s.inputId} → "${s.label}"`));

  // 4. 마케팅 전용 select 채우기
  console.log(`[Step2] 마케팅 특징`);
  for (const [labelKey, value] of Object.entries(product.features || {})) {
    await fillSelectByLabel(page, selectMap, labelKey, value);
  }

  // 5. 메인 이미지
  console.log(`[Step2] 메인 이미지`);
  const imagePath = path.join(IMAGE_DIR, product.image);
  if (!fs.existsSync(imagePath)) {
    console.log(`  ⚠ 이미지 없음: ${imagePath} — 건너뜀`);
  } else {
    const mainFileInput = page.locator('#MAIN_GALLERY input[type=file]');
    if (await mainFileInput.count() > 0) {
      await mainFileInput.setInputFiles(imagePath);
      await sleep(4000);
      console.log(`  ✓ 메인 이미지: ${product.image}`);
    }
  }

  // 6. 서비스 제공 절차
  await fillTipTap(page, 'DESCRIPTION_PROGRESS', product.progress, '제공 절차');

  // 7. 의뢰인 준비사항
  await fillTipTap(page, 'DESCRIPTION_PREPARATION', product.preparation, '준비사항');

  // 8. 패키지 (3개)
  console.log(`[Step2] 패키지`);
  const allTextareas = page.locator('textarea');
  for (let i = 0; i < 3; i++) {
    const pkg = product.packages[i];
    try {
      const titleEl = allTextareas.nth(i);
      const descEl = allTextareas.nth(3 + i);
      await titleEl.click({ force: true });
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await titleEl.fill(pkg.title);
      await descEl.click({ force: true });
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await descEl.fill(pkg.desc);
      console.log(`  ✓ 패키지 ${i} (${pkg.name}): ${pkg.title}`);
    } catch (e) {
      console.log(`  ✗ 패키지 ${i}: ${e.message}`);
    }
  }

  // 9. 금액
  console.log(`[Step2] 금액`);
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
  console.log(`  금액 input ${priceTargets.length}개`);
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
        console.log(`  ✓ ${pkg.name}: ${pkg.price.toLocaleString()}원`);
      } catch (e) {
        console.log(`  ✗ ${pkg.name} 금액 실패: ${e.message}`);
      }
    }
  }

  // 10. 작업 기간 + 수정 횟수
  console.log(`[Step2] 작업 기간 + 수정 횟수`);
  const map2 = await discoverSelects(page);
  for (let i = 0; i < 3; i++) {
    const pkg = product.packages[i];
    await fillSelectByLabel(page, map2, '작업 기간', `${pkg.days}일`, i);
  }
  for (let i = 0; i < 3; i++) {
    const pkg = product.packages[i];
    const v = pkg.revisions === '제한없음' ? '제한없음' : `${pkg.revisions}회`;
    await fillSelectByLabel(page, map2, '수정 횟수', v, i);
  }

  await snap(page, `review-${product.id}-step2-filled`);

  // 11. 저장
  if (probeOnly) {
    console.log(`\n[Step2] probeOnly — 저장 안 함`);
    return { ok: true, mode: 'probe', selectMap: map2 };
  }

  console.log(`\n[Step2] "임시 저장하기" 클릭`);
  const saveBtn = page.locator('button').filter({ hasText: '임시 저장하기' }).first();
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click({ force: true });
    await sleep(6000);
    await snap(page, `review-${product.id}-step2-saved`);
    console.log(`  ✓ 임시 저장 완료 — URL: ${page.url()}`);
    return { ok: true, mode: 'save', savedUrl: page.url() };
  }
  return { ok: false, error: '임시 저장 버튼 미발견' };
}

// ──────────────────────────────────────────
// 메인 실행
// ──────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  let productFilter = 'all';
  let mode = 'save'; // probe | save

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--product' && args[i + 1]) productFilter = args[++i];
    if (args[i] === '--mode' && args[i + 1]) mode = args[++i];
  }

  const products = productFilter === 'all'
    ? REVIEW_PRODUCTS
    : REVIEW_PRODUCTS.filter(p => p.id === productFilter);

  if (products.length === 0) {
    console.error(`상품 "${productFilter}" 미발견. 가능: ${REVIEW_PRODUCTS.map(p => p.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`[CREATE-GIG-REVIEW] ${products.length}개 상품, mode=${mode}`);

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const log = [];

  for (const product of products) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[${product.id}] ${product.title} (${product.cat1} > ${product.cat2}${product.cat3 ? ' > ' + product.cat3 : ''})`);
    console.log(`${'═'.repeat(60)}`);

    try {
      // Step 1
      const step1 = await fillStep1(page, product);
      if (!step1.ok) throw new Error(`Step 1 실패`);

      // Step 2
      const step2 = await fillStep2(page, product, { probeOnly: mode === 'probe' });

      log.push({
        id: product.id,
        title: product.title,
        ok: true,
        mode,
        draftUrl: step1.draftUrl,
        savedUrl: step2.savedUrl,
      });

      console.log(`\n[${product.id}] ✓ 완료 (${mode})`);
    } catch (e) {
      console.error(`\n[${product.id}] ✗ 실패: ${e.message}`);
      await snap(page, `review-${product.id}-error`);
      log.push({ id: product.id, title: product.title, ok: false, error: e.message });
    }
  }

  // 로그 저장
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`\n[DONE] 로그: ${LOG_PATH}`);

  // 결과 요약
  console.log('\n── 결과 요약 ──');
  log.forEach(l => {
    console.log(`  ${l.ok ? '✓' : '✗'} [${l.id}] ${l.title} ${l.ok ? `(${l.savedUrl || l.draftUrl || ''})` : `ERROR: ${l.error}`}`);
  });

  await browser.close();
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
