#!/usr/bin/env node
/**
 * 크몽 신규 등록 Step 1 → Step 2 UI 탐색 (임시 데이터로 "다음" 클릭, 최종 제출 안 함)
 * 목적: Step 2 이후 폼 구조 파악 (입력 필드, 에디터, 이미지 업로드 등)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const SS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });

async function dumpPage(page, label) {
  const r = { label, url: page.url(), inputs: [], textareas: [], editors: [], buttons: [], imageInputs: [], radios: [] };
  try {
    const els = page.locator('input:visible');
    for (let i = 0; i < Math.min(await els.count(), 80); i++) {
      const el = els.nth(i);
      const o = { idx: i, type: await el.getAttribute('type').catch(() => '') || 'text', placeholder: await el.getAttribute('placeholder').catch(() => '') || '', value: (await el.inputValue().catch(() => '') || '').slice(0, 100) };
      if (o.type === 'file') r.imageInputs.push(o);
      else if (o.type === 'radio') r.radios.push(o);
      else r.inputs.push(o);
    }
  } catch {}
  try {
    const els = page.locator('textarea:visible');
    for (let i = 0; i < await els.count(); i++) r.textareas.push({ idx: i, placeholder: await els.nth(i).getAttribute('placeholder').catch(() => '') || '' });
  } catch {}
  try {
    const els = page.locator('[contenteditable="true"]:visible');
    for (let i = 0; i < await els.count(); i++) r.editors.push({ idx: i, text: ((await els.nth(i).innerText().catch(() => '')) || '').slice(0, 100) });
  } catch {}
  try {
    const els = page.locator('button:visible');
    for (let i = 0; i < Math.min(await els.count(), 80); i++) {
      const txt = ((await els.nth(i).innerText().catch(() => '')) || '').trim().slice(0, 80);
      if (txt) r.buttons.push({ idx: i, text: txt, type: await els.nth(i).getAttribute('type').catch(() => '') || '' });
    }
  } catch {}
  try { r.pageText = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000); } catch {}
  return r;
}

(async () => {
  let browser;
  try {
    console.log('[탐색] 로그인...');
    const { browser: b, page } = await login({ slowMo: 200 });
    browser = b;

    // Step 1
    console.log('[Step 1] /my-gigs/new');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await closeModals(page).catch(() => {});

    await page.locator('input[placeholder*="제목"]').first().fill('테스트 임시 서비스 제목입니다');
    await page.waitForTimeout(1000);

    // 1차 카테고리 열기 + 옵션 수집
    await page.locator('button:has-text("1차 카테고리")').first().click();
    await page.waitForTimeout(2000);
    const opts1 = await page.locator('[role="option"], [role="listbox"] li').allInnerTexts().catch(() => []);
    console.log('1차 옵션:', opts1.slice(0, 20));
    // IT·프로그래밍 선택
    const it = page.getByText(/IT.*프로그래밍/);
    if (await it.isVisible({ timeout: 3000 }).catch(() => false)) { await it.click(); await page.waitForTimeout(2000); }
    await page.screenshot({ path: path.join(SS, 'step1-cat1.png'), fullPage: true });

    // 2차 카테고리 — grid tile 방식 (role="option" 아님, 텍스트 직접 클릭)
    const cat2 = page.locator('button:has-text("2차 카테고리")').first();
    if (await cat2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cat2.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SS, 'step1-cat2-open.png'), fullPage: true });
      // "업무 자동화" 선택 (매크로 카테고리 663)
      const autoOpt = page.getByText('업무 자동화', { exact: true });
      if (await autoOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await autoOpt.click();
        console.log('2차 카테고리 "업무 자동화" 선택 성공');
        await page.waitForTimeout(2000);
      } else {
        // fallback: "일반 프로그램" 선택
        const fallback = page.getByText('일반 프로그램', { exact: true });
        if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
          await fallback.click();
          console.log('2차 카테고리 "일반 프로그램" 선택 (fallback)');
          await page.waitForTimeout(2000);
        }
      }
    }
    await page.screenshot({ path: path.join(SS, 'step1-filled.png'), fullPage: true });

    // 다음 클릭
    const next = page.locator('button:has-text("다음")').first();
    if (await next.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[Step 1] "다음" 클릭');
      await next.click();
      await page.waitForTimeout(5000);
    }

    // Step 2 수집
    console.log('[Step 2] URL:', page.url());
    await page.screenshot({ path: path.join(SS, 'step2-page.png'), fullPage: true });
    const s2 = await dumpPage(page, 'step2');
    console.log('[Step 2]', JSON.stringify({ inputs: s2.inputs.length, textareas: s2.textareas.length, editors: s2.editors.length, buttons: s2.buttons.length, imgInputs: s2.imageInputs.length }));

    fs.writeFileSync(path.join(__dirname, 'explore-step2.json'), JSON.stringify(s2, null, 2));
    console.log('[저장완료]');
  } catch (e) {
    console.error('[실패]', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
