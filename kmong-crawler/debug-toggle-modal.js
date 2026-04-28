#!/usr/bin/env node
/**
 * 광고 OFF 토글 후 뜨는 모달 정체 파악용 디버그 스크립트
 * - 한 광고(corp-seo)만 OFF 토글 클릭
 * - 클릭 직후 5초 대기 + 모든 button/모달 HTML 덤프
 * - 어떤 selector로 매칭되는지 확인
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');

const TARGET_PID = process.argv[2] || 'corp-seo';
const CLICK_UP_URL = 'https://kmong.com/seller/click-up';

async function main() {
  let browser;
  try {
    console.log(`=== 디버그: ${TARGET_PID} OFF 토글 후 모달 정체 파악 ===`);
    const session = await login({ slowMo: 200 });
    browser = session.browser;
    const page = session.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 진입 시 안내 모달 닫기
    try {
      await page.evaluate(() => {
        const m = document.querySelector('.kmong-modal-root');
        if (m) m.remove();
      });
    } catch {}
    await page.waitForTimeout(1500);

    // 행 찾기
    const rows = page.locator('table tbody tr');
    const rc = await rows.count();
    let target = null;
    for (let i = 0; i < rc; i++) {
      const row = rows.nth(i);
      const cs = row.locator('td');
      if (await cs.count() < 3) continue;
      const svc = await cs.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
      if (matchProductId(svc) === TARGET_PID) {
        target = { cell: cs.nth(0), svc, status: await cs.nth(2).innerText().catch(() => '') };
        break;
      }
    }

    if (!target) {
      console.log(`[실패] ${TARGET_PID} 행 못 찾음`);
      await browser.close();
      return;
    }
    console.log(`[찾음] ${target.svc} | 상태: ${target.status}`);

    // 토글 클릭 직전 상태
    const beforeChecked = await target.cell.locator('input[type="checkbox"], input[role="switch"]').first().isChecked().catch(() => null);
    console.log(`[클릭 전] isChecked = ${beforeChecked}`);

    // 토글 클릭
    const clickT = target.cell.locator('.react-switch-handle, input[type="checkbox"], input[role="switch"], [class*="toggle"], [class*="switch"], label').first();
    await clickT.click({ force: true });
    console.log(`[클릭 완료]`);
    await page.waitForTimeout(2500);

    // === 디버그 캡처 ===
    console.log('\n=== 클릭 직후 페이지 상태 (모달 미처리 상태) ===');

    // 1) 가시 button 모두
    const visibleBtns = await page.$$eval('button', els =>
      els.filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
      }).map(e => ({
        text: (e.innerText || '').trim().slice(0, 60),
        cls: (e.className || '').slice(0, 100),
        ariaLabel: e.getAttribute('aria-label') || '',
        rect: e.getBoundingClientRect().toJSON ? null : { w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height },
      })).filter(b => b.text || b.ariaLabel)
    );
    console.log('[가시 buttons]');
    visibleBtns.forEach((b, i) => console.log(`  ${i + 1}. "${b.text}" | aria="${b.ariaLabel}" | cls="${b.cls.slice(0, 60)}"`));

    // 2) 모달 컨테이너들
    const modals = await page.$$eval(
      '.kmong-modal-root, [role="dialog"], [role="alertdialog"], .modal, [class*="Modal"], [class*="modal"]',
      els => els.map(e => ({
        tag: e.tagName,
        cls: (e.className || '').slice(0, 120),
        role: e.getAttribute('role') || '',
        innerText: (e.innerText || '').trim().slice(0, 300),
        visible: e.offsetParent !== null,
      })).filter(m => m.visible)
    );
    console.log('\n[가시 모달들]');
    modals.forEach((m, i) => {
      console.log(`  ${i + 1}. <${m.tag}> role="${m.role}" cls="${m.cls.slice(0, 60)}"`);
      console.log(`     innerText: ${m.innerText.replace(/\s+/g, ' ').slice(0, 200)}`);
    });

    // 3) 토글 상태 (클릭 후, 모달 처리 전)
    const afterClickChecked = await target.cell.locator('input[type="checkbox"], input[role="switch"]').first().isChecked().catch(() => null);
    console.log(`\n[클릭 후 모달 처리 전] isChecked = ${afterClickChecked}`);

    // 4) 페이지 스크린샷
    await page.screenshot({ path: '/tmp/kmong-toggle-modal-debug.png', fullPage: false });
    console.log(`[스크린샷] /tmp/kmong-toggle-modal-debug.png`);

    // 모달 처리 시도 - 우리 코드가 어떤 buttong을 누르는지
    console.log('\n=== 모달 selector 매칭 테스트 ===');
    for (const selector of [
      'button:has-text("확인")',
      'button:has-text("네")',
      'button:has-text("OK")',
      '.kmong-modal-root button',
      '[role="dialog"] button',
      'button:has-text("중지")',
      'button:has-text("끄기")',
      'button:has-text("적용")',
      'button:has-text("저장")',
      'button:has-text("취소")',
      'button:has-text("아니오")',
    ]) {
      const matches = await page.locator(selector).count();
      if (matches > 0) {
        const visibleCount = await page.locator(selector).filter({ hasText: /\S/ }).count();
        const firstText = await page.locator(selector).first().innerText().catch(() => '');
        console.log(`  ${selector} → ${matches}개 매칭 (visible: ${visibleCount}) | first text: "${firstText.slice(0, 30)}"`);
      }
    }

    // 추가 대기 후 자동 사라지는 모달 vs 유지되는 모달 확인
    await page.waitForTimeout(3000);
    const stillVisibleModals = await page.$$eval(
      '.kmong-modal-root, [role="dialog"]',
      els => els.filter(e => e.offsetParent !== null).length
    );
    console.log(`\n[3초 후] 가시 모달 수: ${stillVisibleModals}`);

    await browser.close();
  } catch (err) {
    console.error('[에러]', err.message);
    if (browser) await browser.close().catch(() => {});
  }
}

main();
