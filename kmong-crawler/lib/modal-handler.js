/**
 * 크몽 모달/오버레이 닫기 유틸리티
 * - kmong-modal-root 모달이 클릭을 차단하므로 선제적으로 닫아야 함
 */

async function closeModals(page) {
  for (let i = 0; i < 3; i++) {
    try {
      const modal = page.locator('.kmong-modal-root');
      if (!await modal.isVisible({ timeout: 1000 }).catch(() => false)) return;

      // 1) 닫기/확인 버튼 클릭
      const closeSelectors = [
        '.kmong-modal-root button[class*="close"]',
        '.kmong-modal-root [aria-label="close"]',
        '.kmong-modal-root [aria-label="닫기"]',
        '.kmong-modal-root button:has-text("닫기")',
        '.kmong-modal-root button:has-text("확인")',
        '[role="dialog"] button[aria-label="close"]',
      ];
      let closed = false;
      for (const sel of closeSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(500);
          closed = true;
          break;
        }
      }
      if (closed) continue;

      // 2) ESC 키
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // 3) JS로 제거
      await page.evaluate(() => {
        document.querySelectorAll('.kmong-modal-root, [role="dialog"]').forEach(el => el.remove());
      });
      await page.waitForTimeout(300);
    } catch {}
  }
}

module.exports = { closeModals };
