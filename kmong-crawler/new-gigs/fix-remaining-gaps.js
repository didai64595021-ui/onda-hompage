/**
 * 확인된 실제 빈 필드만 타겟 fill
 *   N01: 기술 수준 = 중급
 *   N04: 카테고리 = 서비스 상품
 *   N10: 채널 = 네이버, 서비스 = 홈페이지 (마케팅·광고 카테고리)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { fillReactSelect, discoverSelects } = require('./create-gig.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function navTo(page, draftId, sub, third) {
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}${third ? `&thirdCategoryId=${third}` : ''}`;
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await page.evaluate(u => { window.location.href = u; }, url);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(4000);
}

async function fillByLabel(page, label, value) {
  const map = await discoverSelects(page);
  const slot = map.find(s => s.label === label);
  if (!slot) return { ok: false, error: `${label} slot 없음` };
  return await fillReactSelect(page, slot.inputId, value, label);
}

async function save(page) {
  await page.evaluate(() => {
    document.querySelectorAll('input,textarea').forEach(el => {
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await sleep(2000);
  const btn = page.locator('button:has-text("임시 저장하기")').last();
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(600);
  await btn.click({ force: true });
  await sleep(8000);
  return true;
}

(async () => {
  const { browser, page } = await login({ slowMo: 80 });
  const results = [];
  try {
    // N01 — 기술 수준
    console.log('\n=== N01 아임웹 (기술 수준) ===');
    await navTo(page, '764206', '639', '63901');
    const r1 = await fillByLabel(page, '기술 수준', '중급');
    console.log(`   ${JSON.stringify(r1)}`);
    const ok1 = await save(page);
    results.push({ id: 'N01', r: r1, saved: ok1 });

    // N04 — 카테고리
    console.log('\n=== N04 노션 (카테고리) ===');
    await navTo(page, '764212', '660', '66001');
    // 노션 카테고리의 '카테고리' select 옵션 뭔지 모름 — 첫 dropdown 열어서 수집
    const m = await discoverSelects(page);
    const catSlot = m.find(s => s.label === '카테고리');
    if (catSlot) {
      // 컨트롤 클릭해서 옵션 보기
      const r4 = await fillReactSelect(page, catSlot.inputId, '노션', '카테고리');
      console.log(`   ${JSON.stringify(r4)}`);
      results.push({ id: 'N04-cat', r: r4 });
    } else {
      console.log('   카테고리 slot 없음');
      results.push({ id: 'N04-cat', r: { ok: false, error: 'slot not found' } });
    }
    const ok4 = await save(page);
    results.push({ id: 'N04', saved: ok4 });

    // N10 — 채널, 서비스
    console.log('\n=== N10 301 (채널 + 서비스) ===');
    await navTo(page, '764217', '634', '');
    const r10a = await fillByLabel(page, '채널', '네이버');
    console.log(`   채널: ${JSON.stringify(r10a)}`);
    await sleep(1500);
    const r10b = await fillByLabel(page, '서비스', '홈페이지');
    console.log(`   서비스: ${JSON.stringify(r10b)}`);
    const ok10 = await save(page);
    results.push({ id: 'N10', r_ch: r10a, r_srv: r10b, saved: ok10 });

    console.log('\n=== 결과 ===');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
})();
