#!/usr/bin/env node
/**
 * 크몽 광고 소재(타이틀) 변경 RPA
 * - /seller/click-up에서 특정 서비스의 광고 타이틀을 변경
 * - 사용: node change-creative.js <product_id> "<new_title>"
 * - 대시보드/자동화에서 모듈로 호출 가능
 */

const { login, saveErrorScreenshot } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');
const { closeModals } = require('./lib/modal-handler');
const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';

/**
 * 광고 소재 변경
 * @param {string} productId - product_id (예: 'onepage')
 * @param {string} newTitle - 새 광고 타이틀
 * @returns {Promise<{success: boolean, message: string, oldTitle?: string}>}
 */
async function changeCreative(productId, newTitle) {
  if (!productId || !newTitle) {
    throw new Error('사용법: node change-creative.js <product_id> "<new_title>"');
  }

  let browser;
  try {
    console.log(`=== 소재 변경: ${productId} → "${newTitle.substring(0, 30)}..." ===`);

    const result = await login({ slowMo: 200 });
    browser = result.browser;
    const page = result.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeModals(page);

    // 테이블에서 해당 서비스 행 찾기
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();
    let targetRowIdx = -1;

    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const cells = row.locator('td');
      if (await cells.count() < 8) continue;
      const serviceName = await cells.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
      if (matchProductId(serviceName) === productId) {
        targetRowIdx = i;
        console.log(`[찾음] ${serviceName} → ${productId} (행 ${i})`);
        break;
      }
    }

    if (targetRowIdx < 0) {
      const msg = `소재 변경 실패: ${productId} 서비스를 찾을 수 없음`;
      notify(msg);
      await browser.close();
      return { success: false, message: msg };
    }

    // "상세 보기" 또는 "변경" 버튼 클릭
    const row = tableRows.nth(targetRowIdx);
    const changeBtn = row.locator('button:has-text("변경"), button:has-text("상세 보기")').first();

    if (!await changeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await browser.close();
      return { success: false, message: '변경 버튼을 찾을 수 없음' };
    }

    await closeModals(page);
    await changeBtn.click({ force: true });
    await page.waitForTimeout(3000);
    await closeModals(page);

    // 타이틀 입력 필드 찾기 (모달 또는 새 페이지)
    const titleInput = page.locator('input[placeholder*="타이틀"], input[placeholder*="제목"], input[placeholder*="광고"], textarea[placeholder*="타이틀"], input[name*="title"]').first();

    if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const oldTitle = await titleInput.inputValue();
      await titleInput.clear();
      await titleInput.fill(newTitle);
      await page.waitForTimeout(1000);

      // 저장/확인 버튼
      const saveBtn = page.locator('button:has-text("저장"), button:has-text("확인"), button:has-text("적용"), button[type="submit"]').first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(3000);
      }

      // 변경 이력 저장
      await supabase.from('kmong_creative_changes').insert({
        product_id: productId,
        change_date: new Date().toISOString().split('T')[0],
        change_type: 'title',
        old_value: oldTitle,
        new_value: newTitle,
      }).catch(() => {});

      const msg = `소재 변경 완료: ${productId} | "${oldTitle.substring(0, 20)}" → "${newTitle.substring(0, 20)}"`;
      console.log(`[완료] ${msg}`);
      notify(msg);
      await browser.close();
      return { success: true, message: msg, oldTitle };
    }

    // 타이틀 필드가 없으면 → 크몽이 편집 페이지로 리다이렉트했을 수 있음
    console.log(`[폴백] 타이틀 필드 미발견 — 편집 페이지 확인 (URL: ${page.url()})`);
    await saveErrorScreenshot(page, 'creative-no-title-field');

    // 편집 페이지에서 서비스 제목 변경 시도
    const gigTitleInput = page.locator('input[name*="title"], input[placeholder*="서비스"], textarea[name*="title"]').first();
    if (await gigTitleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const oldTitle = await gigTitleInput.inputValue();
      await gigTitleInput.clear();
      await gigTitleInput.fill(newTitle);

      const saveBtn = page.locator('button:has-text("저장"), button:has-text("수정"), button[type="submit"]').first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(3000);
      }

      const msg = `서비스 제목 변경: ${productId} | "${oldTitle.substring(0, 20)}" → "${newTitle.substring(0, 20)}"`;
      notify(msg);
      await browser.close();
      return { success: true, message: msg, oldTitle };
    }

    await saveErrorScreenshot(page, 'creative-fail');
    await browser.close();
    return { success: false, message: '타이틀 입력 필드를 찾을 수 없음' };

  } catch (err) {
    const msg = `소재 변경 실패: ${err.message}`;
    console.error(`[에러] ${msg}`);
    notify(msg);
    if (browser) await browser.close();
    return { success: false, message: msg };
  }
}

module.exports = { changeCreative };

if (require.main === module) {
  const [,, productId, newTitle] = process.argv;
  if (!productId || !newTitle) {
    console.log('사용법: node change-creative.js <product_id> "<new_title>"');
    console.log('예: node change-creative.js onepage "소상공인 맞춤 원페이지 제작"');
    process.exit(1);
  }
  changeCreative(productId, newTitle).then(r => process.exit(r.success ? 0 : 1));
}
