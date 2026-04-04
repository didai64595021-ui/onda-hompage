#!/usr/bin/env node
/**
 * 크몽 클릭업 광고 ON/OFF 토글 제어
 * - 특정 서비스의 광고를 켜거나 끄는 스크립트
 * - 사용: node toggle-ad.js <product_id> <on|off>
 * - 대시보드 역방향 제어용으로 모듈화
 */

const { login } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';

/**
 * 광고 토글 실행
 * @param {string} productId - product_id (예: 'onepage')
 * @param {string} action - 'on' 또는 'off'
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function toggleAd(productId, action) {
  if (!productId || !['on', 'off'].includes(action)) {
    throw new Error('사용법: node toggle-ad.js <product_id> <on|off>');
  }

  let browser;
  try {
    console.log(`=== 광고 토글: ${productId} → ${action.toUpperCase()} ===`);

    const result = await login({ slowMo: 200 });
    browser = result.browser;
    const page = result.page;

    // 클릭업 페이지 이동
    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 안내 모달이 떠 있으면 닫기 (kmong-modal-root)
    try {
      const modalClose = page.locator('.kmong-modal-root button[class*="close"], .kmong-modal-root [aria-label="close"], .kmong-modal-root [aria-label="닫기"], .kmong-modal-root button:has-text("닫기"), .kmong-modal-root button:has-text("확인")').first();
      if (await modalClose.isVisible({ timeout: 2000 })) {
        await modalClose.click();
        await page.waitForTimeout(1000);
        console.log('[모달] 안내 모달 닫김');
      }
    } catch {}

    // 모달이 여전히 있으면 ESC로 닫기
    try {
      const modalRoot = page.locator('.kmong-modal-root');
      if (await modalRoot.isVisible({ timeout: 1000 })) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        console.log('[모달] ESC로 닫김');
      }
    } catch {}

    // 모달이 여전히 남아있으면 JS로 제거
    try {
      await page.evaluate(() => {
        const modal = document.querySelector('.kmong-modal-root');
        if (modal) modal.remove();
      });
    } catch {}

    // 테이블에서 해당 서비스 행 찾기
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();
    let targetRow = null;

    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const cells = row.locator('td');
      if (await cells.count() < 8) continue;

      // 서비스명으로 매칭
      const serviceName = await cells.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
      const matched = matchProductId(serviceName);

      if (matched === productId) {
        // 쟘액 부족 상태 확인
        const statusText = await cells.nth(2).innerText().catch(() => '');
        if (statusText.includes('잔액 부족') || statusText.includes('중지')) {
          console.log(`[미지원] ${productId}: 쟨액 부족 상태 — 토글 스킵`);
          await browser.close();
          return { success: false, message: `광고 ${productId}: 쟨액 부족 (비즈머니 충전 필요)` };
        }
        targetRow = row;
        console.log(`[찾음] ${serviceName} → ${productId}`);
        break;
      }
    }

    if (!targetRow) {
      // 쟘액 부족으로 인한 테이블 구조 변화 가능성 없음
      const allStatuses = [];
      for (let i = 0; i < rowCount; i++) {
        const cells2 = tableRows.nth(i).locator('td');
        const statusText = await cells2.nth(2).innerText().catch(() => '');
        if (statusText.includes('잔액 부족')) {
          const svcName = await cells2.nth(1).locator('img').first().getAttribute('alt').catch(() => '');
          const svcId = matchProductId(svcName);
          if (svcId === productId) {
            console.log(`[미지원] ${productId}: 쟨액 부족 상태 — 토글 스킵`);
            await browser.close();
            return { success: false, message: `광고 ${productId}: 쟨액 부족 (비즈머니 충전 필요)` };
          }
        }
      }
      const msg = `광고 토글 실패: ${productId} 서비스를 찾을 수 없음`;
      notify(msg);
      await browser.close();
      return { success: false, message: msg };
    }

    // 현재 토글 상태 확인
    const toggleCell = targetRow.locator('td').first();
    let currentState = false;

    try {
      const toggleInput = toggleCell.locator('input[type="checkbox"], input[role="switch"]').first();
      if (await toggleInput.count() > 0) {
        currentState = await toggleInput.isChecked();
      } else {
        const toggleEl = toggleCell.locator('[class*="toggle"], [class*="switch"]').first();
        if (await toggleEl.count() > 0) {
          const cls = await toggleEl.getAttribute('class') || '';
          currentState = cls.includes('on') || cls.includes('active') || cls.includes('checked');
        }
      }
    } catch {}

    const targetState = action === 'on';

    if (currentState === targetState) {
      const msg = `광고 ${productId}: 이미 ${action.toUpperCase()} 상태`;
      console.log(`[스킵] ${msg}`);
      notify(msg);
      await browser.close();
      return { success: true, message: msg };
    }

    // 토글 클릭 (react-switch-handle이 bg를 가리므로 force: true 사용)
    const clickTarget = toggleCell.locator('.react-switch-handle, input[type="checkbox"], input[role="switch"], [class*="toggle"], [class*="switch"], label').first();
    await clickTarget.click({ force: true });
    await page.waitForTimeout(2000);

    // 확인 모달이 뜨면 확인 클릭
    try {
      const confirmBtn = page.locator('button:has-text("확인"), button:has-text("네"), button:has-text("OK")').first();
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    const msg = `광고 토글 완료: ${productId} → ${action.toUpperCase()}`;
    console.log(`[완료] ${msg}`);
    notify(msg);

    await browser.close();
    return { success: true, message: msg };

  } catch (err) {
    const msg = `광고 토글 실패: ${err.message}`;
    console.error(`[에러] ${msg}`);
    notify(msg);
    if (browser) await browser.close();
    return { success: false, message: msg };
  }
}

// 모듈 export (대시보드 역방향 제어용)
module.exports = { toggleAd };

// 직접 실행
if (require.main === module) {
  const [,, productId, action] = process.argv;
  if (!productId || !action) {
    console.log('사용법: node toggle-ad.js <product_id> <on|off>');
    console.log('예: node toggle-ad.js onepage off');
    process.exit(1);
  }
  toggleAd(productId, action).then(r => {
    process.exit(r.success ? 0 : 1);
  });
}
