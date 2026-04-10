#!/usr/bin/env node
/**
 * 기존 draft 4개의 서비스 설명만 업데이트 (공정위 고지 문구 추가)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');
const { REVIEW_PRODUCTS } = require('./gig-data-review');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DRAFTS = {
  R01: { gigId: 761745, root: 2, sub: 230 },
  R02: { gigId: 761746, root: 2, sub: 230 },
  R03: { gigId: 761750, root: 2, sub: 243, third: 24301 },
  R04: { gigId: 761748, root: 2, sub: 235, third: 23501 },
};

async function fillTipTap(page, containerId, text, label) {
  const container = page.locator(`#${containerId}`);
  await container.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await sleep(500);
  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log(`  ✗ [${label}] #${containerId} ProseMirror 미발견`);
    return false;
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
  console.log(`  ✓ [${label}] ${text.length}자`);
  return true;
}

async function run() {
  console.log('[UPDATE] 공정위 고지 문구 추가...');
  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  for (const product of REVIEW_PRODUCTS) {
    const draft = DRAFTS[product.id];
    if (!draft) continue;

    console.log(`\n[${product.id}] gig=${draft.gigId}`);

    let url = `https://kmong.com/my-gigs/edit/${draft.gigId}?rootCategoryId=${draft.root}&subCategoryId=${draft.sub}`;
    if (draft.third) url += `&thirdCategoryId=${draft.third}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await closeModals(page).catch(() => {});

    // 서비스 설명 업데이트
    await fillTipTap(page, 'DESCRIPTION', product.description, '서비스 설명');

    // 준비사항도 시도
    await fillTipTap(page, 'DESCRIPTION_PREPARATION', product.preparation, '준비사항');

    // 임시 저장
    const saveBtn = page.locator('button').filter({ hasText: '임시 저장하기' }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click({ force: true });
      await sleep(4000);
      console.log(`  ✓ 저장 완료`);
    } else {
      console.log(`  ✗ 저장 버튼 미발견`);
    }
  }

  await browser.close();
  console.log('\n[DONE]');
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
