#!/usr/bin/env node
/**
 * 크몽 서비스 변경 사항 확인 스크린샷
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const path = require('path');

async function verify() {
  let browser;
  try {
    const result = await login({ slowMo: 300 });
    browser = result.browser;
    const page = result.page;

    // 편집 페이지 이동
    await page.goto('https://kmong.com/my-gigs/edit/662105?rootCategoryId=2&subCategoryId=203&thirdCategoryId=20312', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.waitForTimeout(5000);
    await closeModals(page);

    // 상단 제목 섹션 스크린샷
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'verify-insta-core-title.png'),
      fullPage: false,
    });
    console.log('[스크린샷] verify-insta-core-title.png');

    // 현재 제목 확인
    const titleInput = page.locator('input[placeholder*="제목"]').first();
    if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const title = await titleInput.inputValue();
      console.log('[현재 제목]', title);
    }

    // 태그 확인
    const tagChips = page.locator('.flex.w-fit.items-center.justify-center');
    const tagCount = await tagChips.count();
    console.log(`[현재 태그] ${tagCount}개`);
    for (let i = 0; i < tagCount; i++) {
      const text = await tagChips.nth(i).textContent().catch(() => '');
      console.log(`  "${text?.trim()}"`);
    }

    // 풀페이지 스크린샷
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'verify-insta-core-full.png'),
      fullPage: true,
    });
    console.log('[스크린샷] verify-insta-core-full.png (fullpage)');

    // 실제 서비스 페이지도 확인
    await page.goto('https://kmong.com/gig/662105', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'verify-insta-core-live.png'),
      fullPage: false,
    });
    console.log('[스크린샷] verify-insta-core-live.png (실제 서비스 페이지)');

    const liveTitle = await page.locator('h1').first().textContent().catch(() => '');
    console.log('[실제 서비스 제목]', liveTitle?.trim());

    await browser.close();
    console.log('\n[확인 완료]');
  } catch (err) {
    console.error('[에러]', err.message);
    if (browser) await browser.close();
  }
}

verify();
