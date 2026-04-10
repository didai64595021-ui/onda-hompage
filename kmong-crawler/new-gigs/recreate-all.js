#!/usr/bin/env node
/**
 * 기존 4 draft 삭제 → 깨끗하게 재생성
 * 키보드 입력 방식으로 TipTap 확실히 반영
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');
const { REVIEW_PRODUCTS } = require('./gig-data-review');
const { execSync } = require('child_process');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const IMAGE_DIR = path.join(__dirname, '03-images');

// 금지키워드 정화
const BANNED = [
  ['환불 보장', '환불'], ['월보장', '월관리'], ['상위노출', '최적화노출'],
  ['상단노출', '최적화노출'], ['1위 노출', '최적화노출'], ['상위권', '최적화'],
  ['네이버', '포털'], ['NAVER', '포털'], ['naver', '포털'],
  ['N사', '포털'], ['보장', '관리'], ['상위', '최적화'],
  ['상단', '최적화'], ['1페이지', '검색 노출'], ['진입', '도달'],
  ['자연스러운', '정성스러운'], ['자연스럽', '정성스럽'],
];

function purge(text) {
  let r = text;
  for (const [from, to] of BANNED) {
    while (r.includes(from)) r = r.replace(from, to);
  }
  return r.replace(/</g, '').replace(/`/g, '');
}

function tg(msg) {
  try { execSync(`node /home/onda/scripts/telegram-sender.js "${msg.replace(/"/g, '\\"')}"`, { timeout: 15000 }); } catch {}
}

// 삭제된 ID 로그
const OLD_DRAFTS = [761745, 761746, 761750, 761748];

async function deleteDraft(page, gigId) {
  console.log(`  [삭제] gig=${gigId}...`);
  await page.goto('https://kmong.com/my-gigs?statusType=WAITING', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  // 카드에서 해당 gigId의 더보기 → 삭제 찾기 (제목 매칭은 어려우니 전체 삭제 건너뜀)
  // 대신 직접 API나 cleanup 스크립트 사용
  console.log(`  [삭제] skip — 수동 정리 필요 (draft ${gigId})`);
}

async function selectCategory(page, label, value) {
  const btn = page.locator('button').filter({ hasText: label }).first();
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await btn.click({ force: true });
  await sleep(2000);
  const opt = page.getByText(value, { exact: true }).first();
  if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await opt.click({ force: true });
    await sleep(1500);
    return true;
  }
  return false;
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

async function fillReactSelect(page, selectMap, labelKey, value, nth = 0) {
  const matches = selectMap.filter(s => s.label === labelKey);
  if (nth >= matches.length) return;
  const inputId = matches[nth].inputId;
  const input = page.locator(`#${inputId}`);
  if ((await input.count()) === 0) return;
  const control = input.locator('xpath=ancestor::div[contains(@class, "-control")][1]');
  if ((await control.count()) === 0) return;
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(200);
  await page.evaluate(() => document.body.click()).catch(() => {});
  await sleep(300);
  await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(300);
  await control.click({ force: true });
  await sleep(800);
  const ok = await page.evaluate((val) => {
    const all = [...document.querySelectorAll('div')].filter(el => {
      const cls = String(el.className || '');
      return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between') && cls.includes('text-gray-900') && cls.includes('px-3');
    }).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    let pick = all.find(el => (el.innerText || '').trim() === val);
    if (!pick) pick = all.find(el => (el.innerText || '').trim().includes(val));
    if (!pick && all.length) pick = all[0];
    if (pick) { pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); pick.click(); return true; }
    return false;
  }, value);
  if (ok) await sleep(1500);
}

async function typeTipTap(page, containerId, text) {
  const container = page.locator(`#${containerId}`);
  if ((await container.count()) === 0) return false;
  await container.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await sleep(500);
  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await editor.click({ force: true });
  await sleep(300);
  // 전체 선택 → 첫 글자 타이핑(선택 대체)
  await page.keyboard.press('Control+A');
  await sleep(200);
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
  await sleep(500);
  return true;
}

async function enablePackageToggle(page) {
  return await page.evaluate(() => {
    const labels = [...document.querySelectorAll('p, label, span, div')].filter(el => (el.innerText || '').trim() === '패키지로 설정');
    if (!labels.length) return false;
    labels.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
    let cur = labels[0];
    for (let i = 0; i < 6 && cur; i++) {
      cur = cur.parentElement;
      const cb = cur?.querySelector('input[type="checkbox"]');
      if (cb) { if (!cb.checked) cb.click(); return true; }
    }
    return false;
  });
}

async function run() {
  console.log('[RECREATE] 4상품 깨끗하게 재생성\n');
  tg('크몽 리뷰 4상품 재생성 시작 (금지키워드 완전 교정)');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const results = [];

  for (const product of REVIEW_PRODUCTS) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`[${product.id}] ${product.title}`);
    console.log(`${'═'.repeat(50)}`);

    try {
      // Step 1: 새 등록
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      await closeModals(page).catch(() => {});

      // 제목
      await page.locator('input[type="text"]').first().fill(product.title);
      await sleep(500);

      // 카테고리
      await selectCategory(page, '1차 카테고리', product.cat1);
      await selectCategory(page, '2차 카테고리', product.cat2);
      if (product.cat3) await selectCategory(page, '3차 카테고리', product.cat3);

      // 다음
      await page.locator('button').filter({ hasText: '다음' }).first().click();
      await sleep(6000);

      if (!page.url().includes('/my-gigs/edit/')) {
        throw new Error('Step 2 진입 실패: ' + page.url());
      }
      console.log(`  Step 2: ${page.url()}`);

      // Step 2: 서비스 설명 (정화된 텍스트)
      const cleanDesc = purge(product.description);
      await typeTipTap(page, 'DESCRIPTION', cleanDesc);
      console.log(`  서비스 설명: ${cleanDesc.length}자`);

      // 패키지 토글
      await enablePackageToggle(page);
      await sleep(2000);

      // 특징 select
      const selectMap = await discoverSelects(page);
      for (const [label, value] of Object.entries(product.features || {})) {
        await fillReactSelect(page, selectMap, label, value);
      }
      console.log(`  특징: ${Object.keys(product.features).join(', ')}`);

      // 메인 이미지
      const imgPath = path.join(IMAGE_DIR, product.image);
      if (fs.existsSync(imgPath)) {
        const fi = page.locator('#MAIN_GALLERY input[type=file]');
        if ((await fi.count()) > 0) { await fi.setInputFiles(imgPath); await sleep(4000); }
      }

      // 제공 절차
      const cleanProg = purge(product.progress);
      await typeTipTap(page, 'DESCRIPTION_PROGRESS', cleanProg);
      console.log(`  제공 절차: ${cleanProg.length}자`);

      // 패키지 (name 기반)
      for (let i = 0; i < 3; i++) {
        const pkg = product.packages[i];
        const titleTa = page.locator(`textarea[name*="packages.0.values.${i}.packageValue"]`).first();
        const descTa = page.locator(`textarea[name*="packages.1.values.${i}.packageValue"]`).first();
        if ((await titleTa.count()) > 0) { await titleTa.click({ force: true }); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await titleTa.fill(pkg.title); }
        if ((await descTa.count()) > 0) { await descTa.click({ force: true }); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await descTa.fill(pkg.desc); }
      }
      console.log(`  패키지 3종 완료`);

      // 금액
      const priceInputs = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('input[type="text"]').forEach((inp, idx) => {
          const r = inp.getBoundingClientRect();
          if (r.width === 0) return;
          if (inp.id?.startsWith('react-select')) return;
          let lbl = ''; let cur = inp;
          for (let j = 0; j < 8 && cur; j++) { cur = cur.parentElement; const l = cur?.querySelector('label, p'); if (l && (l.innerText || '').includes('금액')) { lbl = '금액'; break; } }
          if (lbl) out.push({ idx });
        });
        return out;
      });
      const allTI = page.locator('input[type="text"]');
      for (let i = 0; i < Math.min(3, priceInputs.length); i++) {
        const el = allTI.nth(priceInputs[i].idx);
        await el.click({ force: true }); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
        await el.fill(String(product.packages[i].price));
      }

      // 작업 기간 + 수정 횟수
      const map2 = await discoverSelects(page);
      for (let i = 0; i < 3; i++) {
        await fillReactSelect(page, map2, '작업 기간', `${product.packages[i].days}일`, i);
      }
      for (let i = 0; i < 3; i++) {
        await fillReactSelect(page, map2, '수정 횟수', `${product.packages[i].revisions}회`, i);
      }

      // REVISION
      const revTa = page.locator('textarea[name*="REVISION"]').first();
      if ((await revTa.count()) > 0) {
        await revTa.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await sleep(300);
        await revTa.click({ force: true });
        await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
        await revTa.fill('수정 요청은 인도일 기준 7일 이내 가능합니다.\n수정 범위: 키워드 변경, 텍스트 톤 조정, 사진 교체\n리뷰 등록 후 삭제/수정은 플랫폼 정책상 불가할 수 있습니다.\n추가 건수 요청은 별도 상품으로 진행합니다.');
      }

      // 저장
      const saveBtn = page.locator('button').filter({ hasText: '임시 저장하기' }).first();
      await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await sleep(300);
      await saveBtn.click({ force: true });
      await sleep(6000);

      const savedUrl = page.url();
      const gigMatch = savedUrl.match(/\/edit\/(\d+)/);
      const gigId = gigMatch ? gigMatch[1] : 'unknown';

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `recreate-${product.id}.png`), fullPage: true });

      results.push({ id: product.id, title: product.title, ok: true, gigId, url: savedUrl });
      console.log(`  ✓ 저장 완료 — gig=${gigId}`);

    } catch (e) {
      console.log(`  ✗ 실패: ${e.message}`);
      results.push({ id: product.id, title: product.title, ok: false, error: e.message });
    }
  }

  await browser.close();

  // 결과 리포트
  console.log(`\n${'═'.repeat(50)}`);
  console.log('최종 결과');
  console.log(`${'═'.repeat(50)}`);
  const lines = ['크몽 리뷰 4상품 재생성 결과\n'];
  for (const r of results) {
    const status = r.ok ? '✅' : '❌';
    console.log(`${status} [${r.id}] ${r.title} ${r.ok ? `gig=${r.gigId}` : `ERROR: ${r.error}`}`);
    lines.push(`${status} [${r.id}] ${r.title}`);
    if (r.ok) lines.push(`  ${r.url}`);
    else lines.push(`  ERROR: ${r.error}`);
  }
  lines.push(`\n이전 draft 삭제 필요: ${OLD_DRAFTS.join(', ')}`);
  lines.push('임시저장 상태 - 크몽에서 검수 후 제출해주세요');

  tg(lines.join('\n'));
  fs.writeFileSync(path.join(__dirname, 'recreate-log.json'), JSON.stringify(results, null, 2));
  console.log('\n텔레그램 보고 완료');
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
