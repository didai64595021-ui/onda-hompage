#!/usr/bin/env node
/**
 * 크몽 클릭업 광고 ON/OFF 토글 제어
 * - 특정 서비스의 광고를 켜거나 끄는 스크립트
 * - 사용: node toggle-ad.js <product_id> <on|off>
 * - 대시보드 역방향 제어용으로 모듈화
 */

const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';
const TOGGLE_LOG_FILE = path.join(__dirname, 'cookies', 'toggle-notify-log.json');

// 중복 알림 방지: 같은 서비스+액션이 30분 이내 반복이면 알림 스킵
function shouldNotifyToggle(productId, action) {
  try {
    const log = fs.existsSync(TOGGLE_LOG_FILE) ? JSON.parse(fs.readFileSync(TOGGLE_LOG_FILE, 'utf-8')) : {};
    const key = `${productId}-${action}`;
    const lastTime = log[key] ? new Date(log[key]).getTime() : 0;
    if (Date.now() - lastTime < 30 * 60 * 1000) return false;
    log[key] = new Date().toISOString();
    fs.writeFileSync(TOGGLE_LOG_FILE, JSON.stringify(log, null, 2));
    return true;
  } catch {
    return true;
  }
}

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
      console.log(`[경고] ${msg} (간헐적 페이지 로딩 문제 — 알림 스킵)`);
      await browser.close();
      return { success: false, message: msg };
    }

    // 현재 토글 상태 확인
    let toggleCell = targetRow.locator('td').first();
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
      // 이미 원하는 상태면 알림 스킵 (스팸 방지)
      await browser.close();
      return { success: true, message: msg };
    }

    // 토글 클릭 + reload 검증 + 재시도 (백엔드 반영 확인, 2026-04-29 신설)
    // 배경: 클릭만 하면 시각적으로만 OFF로 보이고 백엔드 미반영 사례 발생 → reload 후 isChecked() 재확인 필수
    const MAX_RETRIES = 3;
    let attempt = 0;
    let verifiedState = currentState;
    let activeCell = toggleCell;

    const findCellByPid = async () => {
      const rs = page.locator('table tbody tr');
      const cnt = await rs.count();
      for (let i = 0; i < cnt; i++) {
        const r = rs.nth(i);
        const cs = r.locator('td');
        if (await cs.count() < 3) continue;
        const svc = await cs.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
        if (matchProductId(svc) === productId) return cs.nth(0);
      }
      return null;
    };

    const readState = async (cell) => {
      try {
        const inp = cell.locator('input[type="checkbox"], input[role="switch"]').first();
        if (await inp.count() > 0) return await inp.isChecked();
        const el = cell.locator('[class*="toggle"], [class*="switch"]').first();
        if (await el.count() > 0) {
          const cls = await el.getAttribute('class') || '';
          return cls.includes('on') || cls.includes('active') || cls.includes('checked');
        }
      } catch {}
      return null;
    };

    while (attempt < MAX_RETRIES && verifiedState !== targetState) {
      attempt++;

      // 토글 클릭
      const clickTarget = activeCell.locator('.react-switch-handle, input[type="checkbox"], input[role="switch"], [class*="toggle"], [class*="switch"], label').first();
      await clickTarget.click({ force: true });
      await page.waitForTimeout(2000);

      // 확인 모달 처리 (크몽 SweetAlert2 — OFF: "중단하기", ON: "시작하기")
      try {
        const confirmBtn = page.locator(
          '.swal2-popup .swal2-confirm, ' +
          'button:has-text("중단하기"), ' +
          'button:has-text("시작하기"), ' +
          'button:has-text("확인"), ' +
          'button:has-text("네"), ' +
          'button:has-text("OK")'
        ).first();
        if (await confirmBtn.isVisible({ timeout: 2000 })) {
          const btnText = await confirmBtn.innerText().catch(() => '');
          await confirmBtn.click();
          console.log(`[모달확정] "${btnText}" 클릭`);
          await page.waitForTimeout(1500);
        } else {
          console.log(`[경고] 확정 모달 못 찾음 — 백엔드 미반영 가능`);
        }
      } catch {}

      // 페이지 reload — 백엔드 반영 강제 확인
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      try {
        await page.evaluate(() => {
          const m = document.querySelector('.kmong-modal-root');
          if (m) m.remove();
        });
      } catch {}

      // 행 재탐색 + 상태 검증
      activeCell = await findCellByPid();
      if (!activeCell) {
        console.log(`[검증실패] ${productId}: reload 후 행 못 찾음`);
        break;
      }
      const newState = await readState(activeCell);
      verifiedState = newState !== null ? newState : !targetState;
      console.log(`[검증 ${attempt}/${MAX_RETRIES}] ${productId}: 실제=${verifiedState ? 'ON' : 'OFF'}, 목표=${action.toUpperCase()}`);

      if (verifiedState === targetState) break;
      if (attempt < MAX_RETRIES) {
        console.log(`[재시도] ${productId}: ${attempt}/${MAX_RETRIES} 실패 — 2초 후 재시도`);
        await page.waitForTimeout(2000);
      }
    }

    const success = verifiedState === targetState;
    const msg = success
      ? `광고 토글 검증 완료: ${productId} → ${action.toUpperCase()} (${attempt}회 시도)`
      : `광고 토글 검증 실패: ${productId} 목표=${action.toUpperCase()} 실제=${verifiedState ? 'ON' : 'OFF'} (${attempt}회 재시도)`;
    console.log(`[${success ? '완료' : '실패'}] ${msg}`);
    if (shouldNotifyToggle(productId, success ? action : 'fail')) {
      notify(msg);
    } else {
      console.log('[알림 스킵] 30분 내 중복 토글 알림');
    }

    await browser.close();
    return { success, message: msg, verifiedState };

  } catch (err) {
    const msg = `광고 토글 실패: ${err.message}`;
    console.error(`[에러] ${msg}`);
    if (shouldNotifyToggle(productId, 'error')) {
      notify(msg);
    }
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
