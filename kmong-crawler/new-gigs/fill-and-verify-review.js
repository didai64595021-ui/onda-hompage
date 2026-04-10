#!/usr/bin/env node
/**
 * 크몽 리뷰 4상품 — 빈칸 전부 채우기 + Playwright 검증
 * 1. 서비스 설명 재입력 (크몽 템플릿 잔존 제거)
 * 2. 수정 및 재진행 안내 (REVISION) 채우기
 * 3. 저장 후 검증: 금지키워드 에러 확인
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

// 수정 및 재진행 안내 텍스트 (4상품 공통)
const REVISION_TEXT = `수정 요청은 인도일 기준 7일 이내 가능합니다.
수정 범위: 키워드 변경, 텍스트 톤 조정, 사진 교체
리뷰 등록 후 삭제/수정은 플랫폼 정책상 불가할 수 있습니다.
추가 건수 요청은 별도 상품으로 진행합니다.`;

async function fillTipTap(page, containerId, text, label) {
  // 스크롤
  const container = page.locator(`#${containerId}`);
  if ((await container.count()) === 0) {
    console.log(`  ⊘ [${label}] #${containerId} 없음 (카테고리에 해당 필드 없음)`);
    return 'no_field';
  }
  await container.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await sleep(500);

  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log(`  ✗ [${label}] ProseMirror 미발견`);
    return 'no_editor';
  }
  await editor.click({ force: true });
  await sleep(300);
  await page.keyboard.press('Control+A').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Delete').catch(() => {});
  await sleep(200);

  // 내용이 삭제됐는지 확인
  const afterClear = await editor.innerText().catch(() => '');
  if (afterClear.length > 10) {
    // 한 번 더 삭제 시도
    await page.keyboard.press('Control+A').catch(() => {});
    await sleep(100);
    await page.keyboard.press('Backspace').catch(() => {});
    await sleep(200);
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
  await sleep(400);
  console.log(`  ✓ [${label}] ${text.length}자`);
  return 'ok';
}

async function fillRevision(page, text) {
  const ta = page.locator('textarea[name*="REVISION"], textarea[name*="revision"]').first();
  if ((await ta.count()) === 0) {
    // fallback: "수정 및 재진행" 근처 textarea
    const allTa = page.locator('textarea');
    const count = await allTa.count();
    // 패키지 textarea 6개 이후의 것 찾기
    for (let i = 6; i < count; i++) {
      const name = await allTa.nth(i).getAttribute('name').catch(() => '');
      if (name && (name.includes('REVISION') || name.includes('revision'))) {
        await allTa.nth(i).scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await sleep(300);
        await allTa.nth(i).click({ force: true });
        await page.keyboard.press('Control+A').catch(() => {});
        await page.keyboard.press('Delete').catch(() => {});
        await allTa.nth(i).fill(text);
        console.log(`  ✓ [수정안내] REVISION (nth ${i})`);
        return 'ok';
      }
    }
    console.log(`  ⊘ [수정안내] REVISION textarea 미발견`);
    return 'no_field';
  }

  await ta.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(300);
  await ta.click({ force: true });
  await page.keyboard.press('Control+A').catch(() => {});
  await sleep(100);
  await page.keyboard.press('Delete').catch(() => {});
  await sleep(100);
  await ta.fill(text);
  console.log(`  ✓ [수정안내] REVISION (${text.length}자)`);
  return 'ok';
}

async function verifyErrors(page) {
  // 페이지 내 빨간 에러 메시지 수집
  const errors = await page.evaluate(() => {
    const errTexts = [];
    // 빨간 텍스트 (error, warning)
    document.querySelectorAll('.text-red-500, .text-red-600, [class*="error"], [class*="Error"], [role="alert"]').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t && t.length > 3 && t.length < 200) errTexts.push(t);
    });
    // "입력할 수 없으며 삭제해 주세요" 패턴
    document.querySelectorAll('*').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t.includes('삭제해 주세요') || t.includes('입력할 수 없으며')) {
        if (t.length < 200 && !errTexts.includes(t)) errTexts.push(t);
      }
    });
    return [...new Set(errTexts)];
  });
  return errors;
}

async function verifyEmptyFields(page) {
  // 빈 필수 필드 확인
  const empty = await page.evaluate(() => {
    const results = [];
    // TipTap 에디터
    ['DESCRIPTION', 'DESCRIPTION_PROGRESS', 'DESCRIPTION_PREPARATION'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const pm = el.querySelector('.ProseMirror');
      if (pm) {
        const text = (pm.innerText || '').trim();
        if (text.length < 50) results.push({ field: id, len: text.length, status: 'too_short' });
      }
    });
    // 패키지 textarea
    document.querySelectorAll('textarea').forEach((ta, i) => {
      const val = (ta.value || '').trim();
      if (ta.disabled) return;
      if (val.length === 0) {
        results.push({ field: `textarea_${i}`, name: ta.name, status: 'empty' });
      }
    });
    // 금액 input
    document.querySelectorAll('input[type="text"]').forEach((inp, i) => {
      if (inp.id && inp.id.startsWith('react-select')) return;
      const rect = inp.getBoundingClientRect();
      if (rect.width === 0) return;
      let label = '';
      let cur = inp;
      for (let j = 0; j < 5 && cur; j++) {
        cur = cur.parentElement;
        const lbl = cur?.querySelector('label, p');
        if (lbl && (lbl.innerText || '').includes('금액')) { label = '금액'; break; }
      }
      if (label === '금액' && !(inp.value || '').trim()) {
        results.push({ field: `price_${i}`, status: 'empty' });
      }
    });
    return results;
  });
  return empty;
}

async function run() {
  console.log('[FILL+VERIFY] 빈칸 채우기 + 검증 시작');
  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const report = [];

  for (const product of REVIEW_PRODUCTS) {
    const draft = DRAFTS[product.id];
    if (!draft) continue;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[${product.id}] gig=${draft.gigId} — ${product.title}`);
    console.log(`${'═'.repeat(60)}`);

    let url = `https://kmong.com/my-gigs/edit/${draft.gigId}?rootCategoryId=${draft.root}&subCategoryId=${draft.sub}`;
    if (draft.third) url += `&thirdCategoryId=${draft.third}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6000);
    await closeModals(page).catch(() => {});

    // 1. 서비스 설명 재입력 (크몽 템플릿 제거)
    console.log('\n[1] 서비스 설명');
    await fillTipTap(page, 'DESCRIPTION', product.description, '서비스 설명');

    // 2. 서비스 제공 절차
    console.log('[2] 제공 절차');
    await fillTipTap(page, 'DESCRIPTION_PROGRESS', product.progress, '제공 절차');

    // 3. 준비사항 (없으면 skip)
    console.log('[3] 준비사항');
    await fillTipTap(page, 'DESCRIPTION_PREPARATION', product.preparation, '준비사항');

    // 4. 수정 및 재진행 안내 (REVISION)
    console.log('[4] 수정 및 재진행 안내');
    // 페이지 하단으로 스크롤
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);
    await fillRevision(page, REVISION_TEXT);

    // 5. 임시 저장
    console.log('\n[5] 임시 저장');
    const saveBtn = page.locator('button').filter({ hasText: '임시 저장하기' }).first();
    await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(500);
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click({ force: true });
      await sleep(5000);
      console.log(`  ✓ 저장 완료`);
    }

    // 6. 검증 — 에러 메시지
    console.log('\n[6] 검증');
    // 페이지 리로드해서 저장된 상태 확인
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await closeModals(page).catch(() => {});

    // 에러 확인
    const errors = await verifyErrors(page);
    if (errors.length > 0) {
      console.log(`  ⚠ 에러 ${errors.length}건:`);
      errors.forEach(e => console.log(`    - ${e}`));
    } else {
      console.log(`  ✓ 에러 0건`);
    }

    // 빈 필드 확인
    const emptyFields = await verifyEmptyFields(page);
    if (emptyFields.length > 0) {
      console.log(`  ⚠ 빈 필드 ${emptyFields.length}건:`);
      emptyFields.forEach(e => console.log(`    - ${JSON.stringify(e)}`));
    } else {
      console.log(`  ✓ 빈 필드 0건`);
    }

    // 서비스 설명 첫 줄 확인
    const descStart = await page.evaluate(() => {
      const pm = document.querySelector('#DESCRIPTION .ProseMirror');
      return pm ? (pm.innerText || '').slice(0, 100) : 'NOT_FOUND';
    });
    const hasDisclaimer = descStart.includes('인위적인 리뷰 조작');
    console.log(`  ${hasDisclaimer ? '✓' : '✗'} 면책문구 상단: ${descStart.slice(0, 60)}...`);

    // 스크린샷
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `verify-${product.id}.png`),
      fullPage: true
    });

    report.push({
      id: product.id,
      gigId: draft.gigId,
      errors,
      emptyFields,
      hasDisclaimer,
      descStart: descStart.slice(0, 80),
    });
  }

  await browser.close();

  // 최종 리포트
  console.log(`\n${'═'.repeat(60)}`);
  console.log('최종 검증 리포트');
  console.log(`${'═'.repeat(60)}`);
  let allClear = true;
  for (const r of report) {
    const status = r.errors.length === 0 && r.hasDisclaimer ? '✅' : '❌';
    if (status === '❌') allClear = false;
    console.log(`${status} [${r.id}] gig=${r.gigId} | 에러:${r.errors.length} | 빈칸:${r.emptyFields.length} | 면책:${r.hasDisclaimer ? 'O' : 'X'}`);
    if (r.errors.length > 0) r.errors.forEach(e => console.log(`   에러: ${e}`));
  }
  console.log(`\n${allClear ? '🎉 전체 통과!' : '⚠ 수정 필요 항목 있음'}`);

  fs.writeFileSync(path.join(__dirname, 'verify-report.json'), JSON.stringify(report, null, 2));
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
