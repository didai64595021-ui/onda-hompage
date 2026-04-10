#!/usr/bin/env node
/**
 * 크몽 리뷰 4상품 — 금지키워드 + 중복텍스트 완전 제거 v2
 * ProseMirror innerHTML 직접 교체 방식
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

// 금지키워드 매핑 (긴 것부터)
const BANNED = [
  ['환불 보장', '환불'], ['월보장', '월관리'], ['상위노출', '최적화노출'],
  ['상단노출', '최적화노출'], ['1위 노출', '최적화노출'], ['상위권', '최적화'],
  ['네이버', '포털'], ['NAVER', '포털'], ['naver', '포털'],
  ['N사', '포털'], ['N포털', '포털'], ['보장', '관리'], ['상위', '최적화'],
  ['상단', '최적화'], ['1페이지', '검색 노출'], ['진입', '도달'],
  ['자연스러운', '정성스러운'], ['자연스럽', '정성스럽'],
];

function purge(text) {
  let r = text;
  for (const [from, to] of BANNED) {
    while (r.includes(from)) r = r.replace(from, to);
  }
  return r.replace(/</g, '').replace(/`/g, '').replace(/→/g, '-');
}

function textToHtml(text) {
  return text.split('\n').map(line =>
    `<p>${line ? line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '<br>'}</p>`
  ).join('');
}

async function setProseMirror(page, containerId, text, label) {
  const exists = await page.evaluate((id) => !!document.getElementById(id), containerId);
  if (!exists) {
    console.log(`  ⊘ [${label}] #${containerId} 없음`);
    return 'no_field';
  }

  // 스크롤
  await page.locator(`#${containerId}`).scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await sleep(300);

  const html = textToHtml(text);

  // ProseMirror innerHTML 직접 설정 + input 이벤트 발생
  const result = await page.evaluate(({ id, html }) => {
    const container = document.getElementById(id);
    if (!container) return { ok: false, reason: 'no container' };
    const pm = container.querySelector('.ProseMirror');
    if (!pm) return { ok: false, reason: 'no ProseMirror' };

    pm.innerHTML = html;

    // React/ProseMirror에 변경 알림
    pm.dispatchEvent(new Event('input', { bubbles: true }));
    pm.dispatchEvent(new Event('change', { bubbles: true }));

    // ProseMirror의 view를 직접 트리거
    // input 이벤트 후 blur → focus로 상태 갱신
    pm.blur();
    setTimeout(() => pm.focus(), 100);

    return { ok: true, len: pm.innerText.length };
  }, { id: containerId, html });

  if (!result.ok) {
    console.log(`  ✗ [${label}] ${result.reason}`);
    return 'error';
  }

  // innerHTML 설정 후 키보드 이벤트로 ProseMirror 상태 확정
  await sleep(200);
  const editor = page.locator(`#${containerId} .ProseMirror`);
  await editor.click({ force: true });
  await sleep(100);
  // 끝으로 이동해서 스페이스 + 백스페이스 (상태 동기화 트릭)
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' ');
  await page.keyboard.press('Backspace');
  await sleep(300);

  console.log(`  ✓ [${label}] ${text.length}자`);
  return 'ok';
}

async function getErrors(page) {
  // 서비스 설명 영역 스크롤
  const desc = page.locator('#DESCRIPTION');
  if ((await desc.count()) > 0) {
    await desc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(1000);
  }

  return await page.evaluate(() => {
    const errs = [];
    document.querySelectorAll('*').forEach(el => {
      const t = (el.innerText || '').trim();
      if (el.children.length > 2) return; // 리프/소규모 노드만
      if (t.length > 200) return;
      if (t.includes('삭제해 주세요') || t.includes('입력할 수 없으며') || t.includes('사용할 수 없어요')) {
        errs.push(t);
      }
    });
    return [...new Set(errs)];
  });
}

async function run() {
  console.log('[PURGE v2] 금지키워드 + 중복 완전 제거\n');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const report = [];

  for (const product of REVIEW_PRODUCTS) {
    const draft = DRAFTS[product.id];
    if (!draft) continue;

    console.log(`${'═'.repeat(60)}`);
    console.log(`[${product.id}] gig=${draft.gigId}`);
    console.log(`${'═'.repeat(60)}`);

    let url = `https://kmong.com/my-gigs/edit/${draft.gigId}?rootCategoryId=${draft.root}&subCategoryId=${draft.sub}`;
    if (draft.third) url += `&thirdCategoryId=${draft.third}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6000);
    await closeModals(page).catch(() => {});

    // 수정 전 에러 확인
    const errBefore = await getErrors(page);
    console.log(`에러(전): ${errBefore.length}건`);
    errBefore.forEach(e => console.log(`  ${e}`));

    // 1. 서비스 설명 — 교정 + 강제 교체
    console.log('\n[1] 서비스 설명');
    const cleanDesc = purge(product.description);
    await setProseMirror(page, 'DESCRIPTION', cleanDesc, '서비스 설명');

    // 2. 제공 절차 — 교정 + 강제 교체 (중복 제거)
    console.log('[2] 제공 절차');
    const cleanProg = purge(product.progress);
    await setProseMirror(page, 'DESCRIPTION_PROGRESS', cleanProg, '제공 절차');

    // 3. REVISION
    console.log('[3] 수정안내');
    const revTa = page.locator('textarea[name*="REVISION"]').first();
    if ((await revTa.count()) > 0) {
      const curRev = await revTa.inputValue().catch(() => '');
      if (!curRev || curRev.length < 10) {
        await revTa.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await revTa.click({ force: true });
        await page.keyboard.press('Control+A').catch(() => {});
        await page.keyboard.press('Delete').catch(() => {});
        await revTa.fill(REVISION_TEXT);
        console.log(`  ✓ REVISION ${REVISION_TEXT.length}자`);
      } else {
        console.log(`  ✓ REVISION 이미 있음`);
      }
    }

    // 4. 저장
    console.log('\n저장...');
    const saveBtn = page.locator('button').filter({ hasText: '임시 저장하기' }).first();
    await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(300);
    await saveBtn.click({ force: true });
    await sleep(6000);
    console.log('  ✓ 저장 완료');

    // 5. 리로드 → 검증
    console.log('\n검증...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    const errAfter = await getErrors(page);
    console.log(`에러(후): ${errAfter.length}건`);
    errAfter.forEach(e => console.log(`  ${e}`));

    // 저장된 텍스트 검증
    const saved = await page.evaluate(() => {
      const d = document.querySelector('#DESCRIPTION .ProseMirror');
      const p = document.querySelector('#DESCRIPTION_PROGRESS .ProseMirror');
      return {
        desc: d ? d.innerText.slice(0, 200) : '',
        prog: p ? p.innerText.slice(0, 200) : '',
        progFull: p ? p.innerText : '',
      };
    });

    // 절차 중복 여부
    const progLines = saved.progFull.split('\n').filter(l => l.trim());
    const uniqueLines = [...new Set(progLines)];
    const hasDup = progLines.length > uniqueLines.length;
    if (hasDup) console.log(`  ⚠ 절차 중복: ${progLines.length}줄 → 고유 ${uniqueLines.length}줄`);

    // 금지키워드 잔여
    const remain = [];
    for (const [banned] of BANNED) {
      if (saved.desc.includes(banned)) remain.push(`desc:"${banned}"`);
      if (saved.progFull.includes(banned)) remain.push(`prog:"${banned}"`);
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `purge2-${product.id}.png`),
      fullPage: true
    });

    const ok = errAfter.length === 0 && remain.length === 0 && !hasDup;
    report.push({ id: product.id, gigId: draft.gigId, errBefore: errBefore.length, errAfter: errAfter.length, errDetail: errAfter, remain, hasDup, ok });
    console.log(`\n${ok ? '✅' : '❌'} [${product.id}]\n`);
  }

  await browser.close();

  console.log(`${'═'.repeat(60)}`);
  console.log('최종 결과');
  console.log(`${'═'.repeat(60)}`);
  let allOk = true;
  for (const r of report) {
    if (!r.ok) allOk = false;
    console.log(`${r.ok ? '✅' : '❌'} [${r.id}] 에러:${r.errBefore}->${r.errAfter} 잔여:${r.remain.length} 중복:${r.hasDup ? 'Y' : 'N'}`);
    r.errDetail.forEach(e => console.log(`   ${e}`));
    r.remain.forEach(e => console.log(`   잔여: ${e}`));
  }
  console.log(`\n${allOk ? '전체 통과!' : '수정 필요'}`);

  fs.writeFileSync(path.join(__dirname, 'purge2-report.json'), JSON.stringify(report, null, 2));
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
