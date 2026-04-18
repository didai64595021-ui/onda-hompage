/**
 * React Fiber 기반 select 옵션 선택 — 일반 click 안 먹히는 custom select 대응
 *
 * 전략:
 *   1) control 클릭 → dropdown 열기
 *   2) 원하는 옵션 요소의 React fiber 올라가면서 'selectOption' 함수 찾기
 *   3) fiber.memoizedProps.selectOption(optionData) 직접 호출
 *      → react-select 내부 상태 업데이트 + onChange 발화
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { discoverSelects } = require('./create-gig.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function selectOptionViaFiber(page, inputId, targetText) {
  // 1) control 클릭 → dropdown 열기
  const control = page.locator(`#${inputId}`).locator('xpath=ancestor::div[contains(@class, "-control")][1]');
  if ((await control.count()) === 0) return { ok: false, error: 'control not found' };
  await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(400);
  await control.click({ force: true });
  await sleep(1200);

  // 2) fiber 로 selectOption 호출
  const res = await page.evaluate((args) => {
    const { targetText } = args;
    const options = [...document.querySelectorAll('[role="option"]')];
    if (options.length === 0) return { ok: false, error: 'no options visible' };

    // 매칭 전략
    const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    const tnorm = norm(targetText);
    let target = options.find(el => (el.innerText || '').trim() === targetText);
    if (!target) target = options.find(el => norm(el.innerText) === tnorm);
    if (!target) target = options.find(el => norm(el.innerText).includes(tnorm) || tnorm.includes(norm(el.innerText)));
    if (!target) target = options[0];
    const picked = (target.innerText || '').trim();
    const fallback = picked !== targetText;

    // fiber 체인에서 selectOption 찾기
    const fiberKey = Object.keys(target).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return { ok: false, error: 'no reactFiber' };
    let fiber = target[fiberKey];

    let selectOption = null;
    let optionData = null;
    let found = null;
    let count = 0;
    while (fiber && count < 30) {
      const mp = fiber.memoizedProps;
      if (mp && typeof mp.selectOption === 'function' && mp.data) {
        selectOption = mp.selectOption;
        optionData = mp.data;
        found = { elementType: typeof fiber.elementType === 'string' ? fiber.elementType : (fiber.elementType?.displayName || fiber.elementType?.name || 'unknown'), depth: count };
        break;
      }
      fiber = fiber.return;
      count++;
    }

    if (!selectOption) return { ok: false, error: 'selectOption not found in fiber chain', picked };

    // 호출!
    try {
      selectOption(optionData);
      return { ok: true, picked, fallback, fiber: found, optionData: { value: optionData.value, label: optionData.label } };
    } catch (e) {
      return { ok: false, error: 'selectOption throw: ' + e.message };
    }
  }, { targetText });

  await sleep(800);
  return res;
}

// 테스트
(async () => {
  const draftId = '764211';
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113`;

  const { browser, page } = await login({ slowMo: 80 });
  try {
    console.log('[1] nav');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    const selects = await discoverSelects(page);
    const cat = selects.find(s => s.label === '카테고리');
    console.log(`[2] 카테고리 inputId: ${cat.inputId}`);

    console.log('[3] selectOptionViaFiber 호출');
    const r = await selectOptionViaFiber(page, cat.inputId, '포트폴리오 홈페이지');
    console.log(`   결과: ${JSON.stringify(r)}`);

    // UI 확인
    await sleep(1500);
    const ui = await page.evaluate(() => [...document.querySelectorAll('[class*="singleValue"]')].map(el => (el.innerText || '').trim()));
    console.log(`[4] singleValues after: ${JSON.stringify(ui)}`);

    // 저장 → persist 검증
    console.log('\n[5] 저장');
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded();
    await sleep(500);
    await btn.click({ force: true });
    await sleep(8000);

    console.log('[6] reload 후 verify');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const verify = await page.evaluate(() => [...document.querySelectorAll('[class*="singleValue"]')].map(el => (el.innerText || '').trim()));
    console.log(`   singleValues: ${JSON.stringify(verify)}`);
    const ok = verify.includes('포트폴리오 홈페이지');
    console.log(`\n${ok ? '✅ PERSIST 성공' : '❌ PERSIST 실패'}`);
  } finally {
    await browser.close().catch(() => {});
  }
})();

module.exports = { selectOptionViaFiber };
