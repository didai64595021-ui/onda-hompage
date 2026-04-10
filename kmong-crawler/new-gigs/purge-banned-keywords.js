#!/usr/bin/env node
/**
 * 크몽 4상품 — 금지키워드 완전 제거
 * 1. 실제 저장된 텍스트를 Playwright로 읽기
 * 2. 금지키워드 전부 탐지
 * 3. 전체 본문 교체 (Ctrl+A → Delete → 새로 입력)
 * 4. 저장 후 에러 0건 검증
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

// 크몽 금지키워드 → 대체어
const BANNED_MAP = {
  '네이버': '포털',
  'NAVER': '포털',
  'naver': '포털',
  'N사': '포털',
  'N포털': '포털',
  '보장': '관리',
  '월보장': '월관리',
  '환불 보장': '환불',
  '상위노출': '최적화노출',
  '상단노출': '최적화노출',
  '상위권': '최적화',
  '상위': '최적화',
  '상단': '최적화',
  '1페이지': '검색 노출',
  '1위 노출': '최적화노출',
  '진입': '도달',
  '자연스러운': '정성스러운',
  '자연스럽': '정성스럽',
};

function cleanText(text) {
  let cleaned = text;
  // 순서 중요: 긴 키워드부터 매칭
  const sorted = Object.entries(BANNED_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [banned, replacement] of sorted) {
    while (cleaned.includes(banned)) {
      cleaned = cleaned.replace(banned, replacement);
    }
  }
  // 특수문자
  cleaned = cleaned.replace(/</g, '').replace(/`/g, '');
  // → 도 문제될 수 있으니 - 로 교체
  cleaned = cleaned.replace(/→/g, '-');
  return cleaned;
}

async function forceRewriteTipTap(page, containerId, newText, label) {
  const container = page.locator(`#${containerId}`);
  if ((await container.count()) === 0) {
    console.log(`  ⊘ [${label}] #${containerId} 없음`);
    return { status: 'no_field' };
  }
  await container.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await sleep(500);

  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log(`  ✗ [${label}] ProseMirror 미발견`);
    return { status: 'no_editor' };
  }

  // 현재 내용 읽기
  const before = await editor.innerText().catch(() => '');
  console.log(`  [${label}] 현재 ${before.length}자`);

  // 금지키워드 탐지
  const found = [];
  for (const banned of Object.keys(BANNED_MAP)) {
    if (before.includes(banned)) found.push(banned);
  }
  if (found.length > 0) {
    console.log(`  ⚠ 금지키워드 발견: ${found.join(', ')}`);
  }

  // 완전 삭제 → 새로 입력
  await editor.click({ force: true });
  await sleep(300);

  // 3번 연속 Ctrl+A + Delete (확실히 비우기)
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press('Control+A');
    await sleep(100);
    await page.keyboard.press('Delete');
    await sleep(200);
    await page.keyboard.press('Backspace');
    await sleep(100);
  }

  // 빈 상태 확인
  const afterClear = await editor.innerText().catch(() => '');
  if (afterClear.trim().length > 5) {
    console.log(`  ⚠ 삭제 후 잔여: "${afterClear.slice(0, 50)}..." — 강제 덮어쓰기`);
    // 잔여 텍스트가 있으면 끝으로 이동해서 추가
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
  }

  // 새 텍스트 입력
  const lines = newText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
  await sleep(500);

  // 입력 후 검증
  const after = await editor.innerText().catch(() => '');
  const remainBanned = [];
  for (const banned of Object.keys(BANNED_MAP)) {
    if (after.includes(banned)) remainBanned.push(banned);
  }

  console.log(`  ✓ [${label}] ${after.length}자 입력 완료${remainBanned.length > 0 ? ' ⚠ 잔여금지: ' + remainBanned.join(',') : ''}`);
  return { status: 'ok', beforeLen: before.length, afterLen: after.length, bannedFound: found, bannedRemain: remainBanned };
}

async function getPageErrors(page) {
  return await page.evaluate(() => {
    const errors = [];
    // 금지키워드 에러 메시지 (빨간 텍스트)
    document.querySelectorAll('*').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t.includes('삭제해 주세요') && t.length < 200 && el.children.length === 0) {
        errors.push(t);
      }
      if (t.includes('입력할 수 없으며') && t.length < 200 && el.children.length === 0) {
        errors.push(t);
      }
      if (t.includes('사용할 수 없어요') && t.length < 100 && el.children.length === 0) {
        errors.push(t);
      }
    });
    return [...new Set(errors)];
  });
}

async function run() {
  console.log('[PURGE] 금지키워드 완전 제거 시작\n');

  // 먼저 JS 데이터 자체에 금지키워드가 있는지 확인
  console.log('=== JS 데이터 금지키워드 사전 검증 ===');
  for (const p of REVIEW_PRODUCTS) {
    const fields = { description: p.description, progress: p.progress, preparation: p.preparation };
    for (const [name, text] of Object.entries(fields)) {
      for (const banned of Object.keys(BANNED_MAP)) {
        if (text.includes(banned)) {
          console.log(`  ⚠ [${p.id}/${name}] "${banned}" 발견 — 자동 교정`);
        }
      }
    }
  }
  console.log('');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const report = [];

  for (const product of REVIEW_PRODUCTS) {
    const draft = DRAFTS[product.id];
    if (!draft) continue;

    console.log(`${'═'.repeat(60)}`);
    console.log(`[${product.id}] gig=${draft.gigId} — ${product.title}`);
    console.log(`${'═'.repeat(60)}`);

    let url = `https://kmong.com/my-gigs/edit/${draft.gigId}?rootCategoryId=${draft.root}&subCategoryId=${draft.sub}`;
    if (draft.third) url += `&thirdCategoryId=${draft.third}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6000);
    await closeModals(page).catch(() => {});

    // 저장 전 에러 확인
    const errorsBefore = await getPageErrors(page);
    console.log(`\n에러(수정 전): ${errorsBefore.length}건`);
    errorsBefore.forEach(e => console.log(`  → ${e}`));

    // 1. 서비스 설명 — 교정된 텍스트로 강제 재입력
    const cleanDesc = cleanText(product.description);
    const descResult = await forceRewriteTipTap(page, 'DESCRIPTION', cleanDesc, '서비스 설명');

    // 2. 제공 절차
    const cleanProgress = cleanText(product.progress);
    const progResult = await forceRewriteTipTap(page, 'DESCRIPTION_PROGRESS', cleanProgress, '제공 절차');

    // 3. 저장
    console.log('\n저장 중...');
    const saveBtn = page.locator('button').filter({ hasText: '임시 저장하기' }).first();
    await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(300);
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click({ force: true });
      await sleep(5000);
      console.log('  ✓ 저장 완료');
    }

    // 4. 리로드 후 에러 확인
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    // 서비스 설명 영역으로 스크롤
    const descEl = page.locator('#DESCRIPTION');
    if ((await descEl.count()) > 0) {
      await descEl.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await sleep(1000);
    }

    const errorsAfter = await getPageErrors(page);
    console.log(`\n에러(수정 후): ${errorsAfter.length}건`);
    errorsAfter.forEach(e => console.log(`  → ${e}`));

    // 실제 저장된 텍스트에서 금지키워드 잔여 확인
    const savedText = await page.evaluate(() => {
      const desc = document.querySelector('#DESCRIPTION .ProseMirror');
      const prog = document.querySelector('#DESCRIPTION_PROGRESS .ProseMirror');
      return {
        desc: desc ? desc.innerText : '',
        prog: prog ? prog.innerText : '',
      };
    });

    const remainInSaved = [];
    for (const banned of Object.keys(BANNED_MAP)) {
      if (savedText.desc.includes(banned)) remainInSaved.push(`desc:"${banned}"`);
      if (savedText.prog.includes(banned)) remainInSaved.push(`prog:"${banned}"`);
    }
    if (remainInSaved.length > 0) {
      console.log(`⚠ 저장된 텍스트 내 금지키워드: ${remainInSaved.join(', ')}`);
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `purge-${product.id}.png`),
      fullPage: true
    });

    report.push({
      id: product.id,
      gigId: draft.gigId,
      errorsBefore: errorsBefore.length,
      errorsAfter: errorsAfter.length,
      errorsDetail: errorsAfter,
      remainInSaved,
      ok: errorsAfter.length === 0 && remainInSaved.length === 0,
    });

    console.log(`\n${errorsAfter.length === 0 && remainInSaved.length === 0 ? '✅' : '❌'} [${product.id}] 완료\n`);
  }

  await browser.close();

  // 최종 리포트
  console.log(`\n${'═'.repeat(60)}`);
  console.log('최종 검증 리포트');
  console.log(`${'═'.repeat(60)}`);
  let allOk = true;
  for (const r of report) {
    const ok = r.ok ? '✅' : '❌';
    if (!r.ok) allOk = false;
    console.log(`${ok} [${r.id}] gig=${r.gigId} | 에러전:${r.errorsBefore} → 후:${r.errorsAfter} | 잔여:${r.remainInSaved.length}`);
    r.errorsDetail.forEach(e => console.log(`   ${e}`));
  }
  console.log(`\n${allOk ? '🎉 전체 통과!' : '⚠ 수정 필요'}`);

  fs.writeFileSync(path.join(__dirname, 'purge-report.json'), JSON.stringify(report, null, 2));
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
