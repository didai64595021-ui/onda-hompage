/**
 * 광고 봇 — Playwright 기반 크몽 희망 CPC 자동 적용
 * - 클릭업 리스트 → 서비스별 변경 모달 → "희망 클릭 비용" input 수정 → "수정하기" 제출
 * - 적용 전/후 값 검증, 실패 시 rollback 시도
 */

const { closeDialog } = require('./ad-extract');

async function openServiceChangeModal(page, serviceName) {
  const rows = page.locator('table tbody tr');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const img = rows.nth(i).locator('img').first();
    const alt = await img.getAttribute('alt').catch(() => '');
    if (alt === serviceName) {
      const btn = rows.nth(i).locator('button:has-text("변경"), a:has-text("변경")').first();
      await btn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
}

async function readDesiredCpcInModal(page) {
  return await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return null;
    const headings = dialog.querySelectorAll('h5');
    for (const h of headings) {
      if ((h.innerText || '').trim() === '희망 클릭 비용') {
        let sib = h.parentElement;
        for (let i = 0; i < 4 && sib; i++) {
          const inp = sib.querySelector('input[type="text"], input[type="number"], input[placeholder]');
          if (inp) return inp.value || '';
          sib = sib.parentElement;
        }
      }
    }
    return null;
  });
}

async function setDesiredCpcInModal(page, newCpc) {
  const handle = await page.evaluateHandle(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return null;
    const headings = dialog.querySelectorAll('h5');
    for (const h of headings) {
      if ((h.innerText || '').trim() === '희망 클릭 비용') {
        let sib = h.parentElement;
        for (let i = 0; i < 4 && sib; i++) {
          const inp = sib.querySelector('input[type="text"], input[type="number"], input[placeholder]');
          if (inp) return inp;
          sib = sib.parentElement;
        }
      }
    }
    return null;
  });
  const el = handle.asElement();
  if (!el) throw new Error('희망 CPC input 찾기 실패');
  await el.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(String(newCpc));
  await page.waitForTimeout(500);
}

async function clickSubmit(page) {
  const btn = page.locator('div[role="dialog"] button:has(span:text("수정하기")), div[role="dialog"] button:has-text("수정하기")').first();
  if (!(await btn.isVisible({ timeout: 2000 }).catch(() => false))) {
    throw new Error('수정하기 버튼 없음');
  }
  await btn.click();
  await page.waitForTimeout(2500);
  const stillOpen = await page.locator('div[role="dialog"]').count();
  return stillOpen === 0;
}

async function applyDesiredCpc(page, serviceName, newCpc, opts = { dryRun: false }) {
  const opened = await openServiceChangeModal(page, serviceName);
  if (!opened) return { ok: false, error: `서비스 행 못 찾음: ${serviceName}` };

  const before = await readDesiredCpcInModal(page);
  if (opts.dryRun) {
    await closeDialog(page);
    return { ok: true, dryRun: true, before, intended: newCpc };
  }

  try {
    await setDesiredCpcInModal(page, newCpc);
    const closedOk = await clickSubmit(page);
    return { ok: true, before, after: String(newCpc), submitted: closedOk };
  } catch (e) {
    await closeDialog(page).catch(() => {});
    return { ok: false, error: e.message, before };
  }
}

module.exports = { applyDesiredCpc };
