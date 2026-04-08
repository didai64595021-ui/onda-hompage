#!/usr/bin/env node
/**
 * 크몽 신규 등록 페이지 심층 정찰 (read-only)
 *
 * 1단계: /my-gigs/new — 제목 + 카테고리 입력
 *        → 임시 텍스트("정찰용 임시 제목 삭제예정")로 채우고
 *        → "다음" 클릭 → 2단계 진입
 * 2단계 이후: 모든 단계의 입력 필드 / 버튼 / contenteditable 덤프
 *
 * 안전:
 * - 페이지 닫기 전 절대 "제출" 류 버튼 클릭 안 함
 * - draft 자동 저장 가능성 있음 → 마지막 단계에서 임시 draft를 만들 수 있음
 *   (사용자에게 텔레그램으로 즉시 안내)
 * - 결과: explore-new-gig-deep.json + 단계별 스크린샷
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const TEMP_TITLE = '정찰임시 삭제예정 24시간 자동알림 봇 제작';  // 23자, 허용 문자만

async function dumpStep(page, label) {
  const result = { label, url: page.url(), title: '', inputs: [], textareas: [], editors: [], buttons: [], imageInputs: [], radios: [], selects: [], regions: [] };
  try { result.title = await page.title(); } catch {}

  // input
  const inputs = page.locator('input:visible');
  const ni = await inputs.count();
  for (let i = 0; i < Math.min(ni, 80); i++) {
    const el = inputs.nth(i);
    const r = {
      idx: i,
      type: await el.getAttribute('type').catch(() => '') || 'text',
      name: await el.getAttribute('name').catch(() => '') || '',
      placeholder: await el.getAttribute('placeholder').catch(() => '') || '',
      ariaLabel: await el.getAttribute('aria-label').catch(() => '') || '',
      value: ((await el.inputValue().catch(() => '')) || '').slice(0, 80),
    };
    if (r.type === 'file') result.imageInputs.push(r);
    else if (r.type === 'radio' || r.type === 'checkbox') result.radios.push(r);
    else result.inputs.push(r);
  }

  // textarea
  const tas = page.locator('textarea:visible');
  const nt = await tas.count();
  for (let i = 0; i < nt; i++) {
    const el = tas.nth(i);
    result.textareas.push({
      idx: i,
      name: await el.getAttribute('name').catch(() => '') || '',
      placeholder: await el.getAttribute('placeholder').catch(() => '') || '',
    });
  }

  // contenteditable
  const eds = page.locator('[contenteditable="true"]:visible');
  const ne = await eds.count();
  for (let i = 0; i < ne; i++) {
    const el = eds.nth(i);
    result.editors.push({
      idx: i,
      cls: ((await el.getAttribute('class').catch(() => '')) || '').slice(0, 100),
    });
  }

  // select
  const sels = page.locator('select:visible');
  const ns = await sels.count();
  for (let i = 0; i < ns; i++) {
    const el = sels.nth(i);
    result.selects.push({
      idx: i,
      name: await el.getAttribute('name').catch(() => '') || '',
      options: (await el.locator('option').allInnerTexts().catch(() => [])).slice(0, 30),
    });
  }

  // 모든 visible button (텍스트 있는)
  const btns = page.locator('button:visible');
  const nb = await btns.count();
  for (let i = 0; i < Math.min(nb, 120); i++) {
    const el = btns.nth(i);
    const txt = ((await el.innerText().catch(() => '')) || '').trim().slice(0, 80);
    if (!txt) continue;
    const type = await el.getAttribute('type').catch(() => '') || '';
    result.buttons.push({ idx: i, text: txt, type });
  }

  // section/h2/h3 텍스트로 영역 파악
  const heads = page.locator('h1:visible, h2:visible, h3:visible, label:visible');
  const nh = await heads.count();
  for (let i = 0; i < Math.min(nh, 60); i++) {
    const el = heads.nth(i);
    const txt = ((await el.innerText().catch(() => '')) || '').trim().slice(0, 100);
    if (txt) result.regions.push(txt);
  }

  // 스크린샷
  const safeName = label.replace(/[^a-z0-9가-힣]/gi, '_').slice(0, 50);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `deep-${safeName}.png`),
    fullPage: true,
  }).catch(() => {});

  return result;
}

(async () => {
  let browser;
  const allSteps = [];
  try {
    console.log('[심층 정찰] 로그인...');
    const r = await login({ slowMo: 200 });
    browser = r.browser;
    const page = r.page;

    console.log('[Step1] /my-gigs/new 진입');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await closeModals(page).catch(() => {});

    const step1 = await dumpStep(page, 'step1-initial');
    console.log(`[Step1] inputs=${step1.inputs.length} buttons=${step1.buttons.length}`);
    allSteps.push(step1);

    // 제목 입력
    console.log(`[Step1] 제목 입력: "${TEMP_TITLE}"`);
    const titleInput = page.locator('input[placeholder*="제목을 입력"]').first();
    if (!(await titleInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      throw new Error('제목 input 미발견');
    }
    await titleInput.click();
    await titleInput.fill(TEMP_TITLE);
    await page.waitForTimeout(800);

    // 1차 카테고리 클릭 → 옵션 덤프
    console.log('[Step1] 1차 카테고리 버튼 클릭');
    const cat1Btn = page.locator('button:has-text("1차 카테고리")').first();
    if (await cat1Btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cat1Btn.click({ force: true });
      await page.waitForTimeout(2000);

      // 옵션들 덤프
      const cat1Options = await page.locator('[role="dialog"] button, [role="dialog"] li, [role="listbox"] [role="option"], [class*="modal"] button, [class*="dropdown"] button').allInnerTexts().catch(() => []);
      const filtered = cat1Options.map(t => t.trim()).filter(t => t && t.length < 50).slice(0, 60);
      console.log(`[Step1] 1차 카테고리 옵션 ${filtered.length}개:`);
      filtered.slice(0, 30).forEach(t => console.log(`   - ${t}`));
      step1.cat1Options = filtered;

      // IT·프로그래밍 선택
      const itBtn = page.locator('text=/IT.*프로그래밍|IT프로그래밍|IT \\u00b7 프로그래밍/i').first();
      if (await itBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await itBtn.click({ force: true });
        await page.waitForTimeout(1500);
        console.log('[Step1] 1차 카테고리: IT·프로그래밍 선택');
      } else {
        console.log('[Step1] IT·프로그래밍 옵션 미발견');
        // 옵션 첫 번째 클릭으로 fallback
        const firstOption = page.locator('[role="dialog"] button, [role="listbox"] [role="option"]').first();
        if (await firstOption.isVisible({ timeout: 1000 }).catch(() => false)) {
          await firstOption.click({ force: true });
          await page.waitForTimeout(1500);
          console.log('[Step1] 첫 번째 옵션 fallback 선택');
        }
      }
    }

    // 2차 카테고리도 동일하게
    console.log('[Step1] 2차 카테고리 버튼 클릭');
    const cat2Btn = page.locator('button:has-text("2차 카테고리")').first();
    if (await cat2Btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cat2Btn.click({ force: true });
      await page.waitForTimeout(1500);
      const cat2Options = await page.locator('[role="dialog"] button, [role="dialog"] li, [role="listbox"] [role="option"], [class*="modal"] button').allInnerTexts().catch(() => []);
      const filtered2 = cat2Options.map(t => t.trim()).filter(t => t && t.length < 50).slice(0, 80);
      console.log(`[Step1] 2차 카테고리 옵션 ${filtered2.length}개`);
      step1.cat2Options = filtered2;
      // ESC로 닫기 (제출 안 함)
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }

    // 2차 정찰 후 페이지 닫음 — 더 깊은 단계까지 들어가지 않음 (draft 생성 방지)
    // 만약 후속 단계 정찰이 필요하면 이 시점에서 "다음" 클릭하면 됨

    const outPath = path.join(__dirname, 'explore-new-gig-deep.json');
    fs.writeFileSync(outPath, JSON.stringify(allSteps, null, 2));
    console.log(`\n[저장] ${outPath}`);
  } catch (e) {
    console.error('[심층 정찰 실패]', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
