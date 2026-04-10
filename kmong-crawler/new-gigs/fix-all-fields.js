#!/usr/bin/env node
/**
 * 크몽 리뷰 4상품 — 패키지 재채우기 + 빈칸 완전 보정 + 검증
 * name 속성 기반 정확 매칭으로 패키지 textarea 채움
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');
const { REVIEW_PRODUCTS } = require('./gig-data-review');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DRAFTS = {
  R01: { gigId: 761745, root: 2, sub: 230 },
  R02: { gigId: 761746, root: 2, sub: 230 },
  R03: { gigId: 761750, root: 2, sub: 243, third: 24301 },
  R04: { gigId: 761748, root: 2, sub: 235, third: 23501 },
};

const REVISION_TEXT = `수정 요청은 인도일 기준 7일 이내 가능합니다.
수정 범위: 키워드 변경, 텍스트 톤 조정, 사진 교체
리뷰 등록 후 삭제/수정은 플랫폼 정책상 불가할 수 있습니다.
추가 건수 요청은 별도 상품으로 진행합니다.`;

async function fillTextareaByName(page, namePattern, value, label) {
  const ta = page.locator(`textarea[name*="${namePattern}"]`).first();
  if ((await ta.count()) === 0) {
    console.log(`  ⊘ [${label}] name="${namePattern}" 미발견`);
    return false;
  }
  await ta.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(200);
  // 기존값 확인
  const current = await ta.inputValue().catch(() => '');
  if (current === value) {
    console.log(`  ✓ [${label}] 이미 올바름 (${value.length}자)`);
    return true;
  }
  await ta.click({ force: true });
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Delete').catch(() => {});
  await ta.fill(value);
  await sleep(300);
  console.log(`  ✓ [${label}] → "${value}" (${value.length}자)`);
  return true;
}

async function fillTipTapSafe(page, containerId, text, label) {
  const container = page.locator(`#${containerId}`);
  if ((await container.count()) === 0) {
    console.log(`  ⊘ [${label}] #${containerId} 없음`);
    return false;
  }
  await container.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await sleep(500);
  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log(`  ✗ [${label}] ProseMirror 미발견`);
    return false;
  }

  // 현재 내용 확인
  const current = await editor.innerText().catch(() => '');

  // 크몽 템플릿이 있으면 그 아래에 내용이 있는지 확인
  if (current.includes('필수 고정 문구') && current.includes(text.slice(0, 30))) {
    console.log(`  ✓ [${label}] 이미 올바름 (템플릿 + 내 내용)`);
    return true;
  }

  // 내 내용이 이미 들어있으면 skip
  if (current.includes(text.slice(0, 50))) {
    console.log(`  ✓ [${label}] 이미 올바름`);
    return true;
  }

  // 새로 입력
  await editor.click({ force: true });
  await sleep(300);
  await page.keyboard.press('Control+A').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Delete').catch(() => {});
  await sleep(300);
  // 삭제 후 확인 — 템플릿이 남아있을 수 있음
  const afterDel = await editor.innerText().catch(() => '');
  if (afterDel.includes('필수 고정 문구')) {
    // 템플릿 끝으로 이동 후 내용 추가
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
  await sleep(400);
  console.log(`  ✓ [${label}] ${text.length}자 입력`);
  return true;
}

async function run() {
  console.log('[FIX-ALL] 빈칸 완전 보정 시작');
  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const report = [];

  for (const product of REVIEW_PRODUCTS) {
    const draft = DRAFTS[product.id];
    if (!draft) continue;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[${product.id}] gig=${draft.gigId}`);
    console.log(`${'═'.repeat(60)}`);

    let url = `https://kmong.com/my-gigs/edit/${draft.gigId}?rootCategoryId=${draft.root}&subCategoryId=${draft.sub}`;
    if (draft.third) url += `&thirdCategoryId=${draft.third}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6000);
    await closeModals(page).catch(() => {});

    // 0. 현재 패키지 상태 확인
    const pkgState = await page.evaluate(() => {
      const tas = [];
      document.querySelectorAll('textarea').forEach((ta, i) => {
        const name = ta.name || '';
        const val = (ta.value || '').trim();
        const dis = ta.disabled;
        if (name.includes('PACKAGE')) {
          tas.push({ i, name, val: val.slice(0, 30), dis, empty: val.length === 0 });
        }
      });
      return tas;
    });
    console.log('\n[0] 현재 패키지 상태:');
    pkgState.forEach(t => console.log(`  ${t.empty ? '✗' : '✓'} [${t.i}] ${t.dis ? 'DIS' : 'ON '} ${t.name.split('.').pop()} = "${t.val}"`));

    // 1. 서비스 설명
    console.log('\n[1] 서비스 설명');
    await fillTipTapSafe(page, 'DESCRIPTION', product.description, '서비스 설명');

    // 2. 제공 절차
    console.log('[2] 제공 절차');
    await fillTipTapSafe(page, 'DESCRIPTION_PROGRESS', product.progress, '제공 절차');

    // 3. 패키지 제목/설명 — name 기반 정확 매칭
    console.log('[3] 패키지');
    // 패키지 제목: packages.0.values.{0,1,2}.packageValue
    // 패키지 설명: packages.1.values.{0,1,2}.packageValue
    for (let i = 0; i < 3; i++) {
      const pkg = product.packages[i];
      await fillTextareaByName(page, `packages.0.values.${i}.packageValue`, pkg.title, `${pkg.name} 제목`);
      await fillTextareaByName(page, `packages.1.values.${i}.packageValue`, pkg.desc, `${pkg.name} 설명`);
    }

    // 4. 금액
    console.log('[4] 금액');
    const priceInputs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[type="text"]').forEach((inp, idx) => {
        const r = inp.getBoundingClientRect();
        if (r.width === 0) return;
        if (inp.id && inp.id.startsWith('react-select')) return;
        let label = '';
        let cur = inp;
        for (let j = 0; j < 8 && cur; j++) {
          cur = cur.parentElement;
          const lbl = cur?.querySelector('label, p');
          if (lbl && (lbl.innerText || '').includes('금액')) { label = '금액'; break; }
        }
        if (label) out.push({ idx, value: inp.value });
      });
      return out;
    });
    const allTI = page.locator('input[type="text"]');
    for (let i = 0; i < Math.min(3, priceInputs.length); i++) {
      const pkg = product.packages[i];
      const current = priceInputs[i].value;
      if (current === String(pkg.price)) {
        console.log(`  ✓ [${pkg.name}] 금액 이미 올바름: ${pkg.price}`);
        continue;
      }
      const el = allTI.nth(priceInputs[i].idx);
      await el.click({ force: true });
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await el.fill(String(pkg.price));
      console.log(`  ✓ [${pkg.name}] 금액: ${pkg.price}`);
    }

    // 5. REVISION
    console.log('[5] 수정안내');
    await fillTextareaByName(page, 'REVISION', REVISION_TEXT, 'REVISION');

    // 6. 저장
    console.log('\n[6] 저장');
    const saveBtn = page.locator('button').filter({ hasText: '임시 저장하기' }).first();
    await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click({ force: true });
      await sleep(5000);
      console.log(`  ✓ 저장 완료`);
    }

    // 7. 저장 후 재로드 검증
    console.log('[7] 검증');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    // 빈 패키지 확인
    const pkgAfter = await page.evaluate(() => {
      const empty = [];
      document.querySelectorAll('textarea').forEach((ta) => {
        const name = ta.name || '';
        const val = (ta.value || '').trim();
        if (name.includes('PACKAGE') && !ta.disabled && val.length === 0) {
          empty.push(name.split('.').slice(-2).join('.'));
        }
      });
      return empty;
    });

    // 에러 텍스트 확인
    const errors = await page.evaluate(() => {
      const errs = [];
      document.querySelectorAll('*').forEach(el => {
        const t = (el.innerText || '').trim();
        if ((t.includes('삭제해 주세요') || t.includes('입력할 수 없으며')) && t.length < 200) {
          if (!errs.includes(t)) errs.push(t);
        }
      });
      return errs;
    });

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `final-${product.id}.png`),
      fullPage: true
    });

    const result = {
      id: product.id,
      gigId: draft.gigId,
      emptyPkg: pkgAfter,
      bannedErrors: errors,
      ok: pkgAfter.length === 0 && errors.length === 0
    };
    report.push(result);

    console.log(`  패키지 빈칸: ${pkgAfter.length === 0 ? '✓ 0건' : '✗ ' + pkgAfter.join(', ')}`);
    console.log(`  금지키워드: ${errors.length === 0 ? '✓ 0건' : '✗ ' + errors.length + '건'}`);
    errors.forEach(e => console.log(`    → ${e}`));
  }

  await browser.close();

  // 최종
  console.log(`\n${'═'.repeat(60)}`);
  console.log('최종 결과');
  console.log(`${'═'.repeat(60)}`);
  for (const r of report) {
    console.log(`${r.ok ? '✅' : '❌'} [${r.id}] gig=${r.gigId} | 빈칸:${r.emptyPkg.length} | 금지:${r.bannedErrors.length}`);
  }

  fs.writeFileSync(path.join(__dirname, 'final-report.json'), JSON.stringify(report, null, 2));
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
