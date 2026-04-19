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
  // React controlled input — native value setter + input/change 이벤트로 state commit
  const ok = await page.evaluate((val) => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return { ok: false, reason: 'no dialog' };
    const headings = dialog.querySelectorAll('h5');
    for (const h of headings) {
      if ((h.innerText || '').trim() !== '희망 클릭 비용') continue;
      let sib = h.parentElement;
      for (let i = 0; i < 4 && sib; i++) {
        const inp = sib.querySelector('input[placeholder*="10원"], input[type="text"]:not([disabled])');
        if (inp) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, String(val));
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('blur', { bubbles: true }));
          return { ok: true, placeholder: inp.placeholder, value: inp.value };
        }
        sib = sib.parentElement;
      }
    }
    return { ok: false, reason: 'CPC input 못 찾음' };
  }, newCpc);
  if (!ok.ok) throw new Error(`희망 CPC 설정 실패: ${ok.reason}`);
  await page.waitForTimeout(600);
}

async function setDailyBudgetInModal(page, newBudget) {
  // 1) "일 예산" 섹션의 "설정하지 않음" 체크가 켜져 있으면 해제
  const unsetUnchecked = await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return false;
    const h5s = dialog.querySelectorAll('h5');
    for (const h of h5s) {
      if ((h.innerText || '').trim() !== '일 예산') continue;
      let box = h.parentElement;
      for (let i = 0; i < 4 && box; i++) {
        const spans = box.querySelectorAll('span');
        for (const s of spans) {
          if ((s.innerText || '').trim() === '설정하지 않음') {
            const cb = s.closest('label')?.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) { cb.click(); return true; }
            return false;
          }
        }
        box = box.parentElement;
      }
    }
    return false;
  });
  if (unsetUnchecked) await page.waitForTimeout(500);

  // 2) 일 예산 input 찾아서 값 입력
  const handle = await page.evaluateHandle(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return null;
    const h5s = dialog.querySelectorAll('h5');
    for (const h of h5s) {
      if ((h.innerText || '').trim() !== '일 예산') continue;
      let box = h.parentElement;
      for (let i = 0; i < 4 && box; i++) {
        const inp = box.querySelector('input[placeholder*="1,000원"], input[type="text"]:not([disabled])');
        if (inp) return inp;
        box = box.parentElement;
      }
    }
    return null;
  });
  const el = handle.asElement();
  if (!el) throw new Error('일 예산 input 없음');
  await el.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(String(newBudget));
  await page.waitForTimeout(400);
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

/**
 * 변경 모달에서 현재 추천 키워드별 선택 상태 읽기
 * (변경 모달이 이미 열려 있을 때만 호출)
 */
async function readKeywordSelections(page) {
  return await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return [];
    const labels = dialog.querySelectorAll('label:has(input[data-testid="checkbox"])');
    const out = [];
    for (const label of labels) {
      const row = label.parentElement;
      if (!row) continue;
      const kwEl = label.querySelector('p');
      const priceEl = Array.from(row.children).find(c => c.tagName === 'P');
      if (!kwEl || !priceEl) continue;
      const rawKw = (kwEl.textContent || '').replace(/HOT/gi, '').trim();
      const priceText = (priceEl.textContent || '').trim();
      if (!/원/.test(priceText)) continue;
      const cb = label.querySelector('input[data-testid="checkbox"]');
      if (!rawKw) continue;
      out.push({ keyword: rawKw, suggested_cpc: parseInt(priceText.replace(/[^0-9]/g, ''), 10), selected: !!cb?.checked });
    }
    return out;
  });
}

/**
 * 특정 키워드 체크박스 클릭 (현재 상태와 targetChecked 다르면 toggle)
 */
async function toggleKeywordCheckboxes(page, actions) {
  const current = await readKeywordSelections(page);
  const result = [];
  for (const act of actions) {
    const target = current.find(c => c.keyword === act.keyword);
    if (!target) { result.push({ keyword: act.keyword, ok: false, reason: 'not found' }); continue; }
    if (target.selected === act.enable) { result.push({ keyword: act.keyword, ok: true, skipped: true }); continue; }
    try {
      const clicked = await page.evaluate((kw) => {
        const dialog = document.querySelector('div[role="dialog"]');
        const labels = dialog?.querySelectorAll('label:has(input[data-testid="checkbox"])');
        for (const label of labels || []) {
          const kwEl = label.querySelector('p');
          if (!kwEl) continue;
          const txt = (kwEl.textContent || '').replace(/HOT/gi, '').trim();
          if (txt === kw) {
            const cb = label.querySelector('input[data-testid="checkbox"]');
            if (cb) { cb.click(); return true; }
          }
        }
        return false;
      }, act.keyword);
      await page.waitForTimeout(200);
      result.push({ keyword: act.keyword, ok: clicked, toggled: true });
    } catch (e) {
      result.push({ keyword: act.keyword, ok: false, error: e.message });
    }
  }
  return result;
}

/**
 * 종합 적용: 모달 열기 → 현재 상태 읽기 → 키워드 토글 → CPC 수정 → 제출
 * action = { suggested_desired_cpc, keywords_to_enable, keywords_to_disable }
 */
async function applyServiceAction(page, serviceName, action, opts = { dryRun: false }) {
  const opened = await openServiceChangeModal(page, serviceName);
  if (!opened) return { ok: false, error: `서비스 행 못 찾음: ${serviceName}` };

  const beforeCpc = await readDesiredCpcInModal(page);
  const beforeKw = await readKeywordSelections(page);

  if (opts.dryRun) {
    await closeDialog(page);
    return { ok: true, dryRun: true, beforeCpc, beforeKwCount: beforeKw.length, plannedAction: action };
  }

  try {
    const kwActions = [
      ...(action.keywords_to_enable || []).map(k => ({ keyword: k, enable: true })),
      ...(action.keywords_to_disable || []).map(k => ({ keyword: k, enable: false })),
    ];
    const kwResults = kwActions.length ? await toggleKeywordCheckboxes(page, kwActions) : [];

    if (action.suggested_desired_cpc != null && String(action.suggested_desired_cpc) !== String(parseInt((beforeCpc || '').replace(/[^0-9]/g, ''), 10))) {
      await setDesiredCpcInModal(page, action.suggested_desired_cpc);
    }

    if (action.suggested_daily_budget != null && action.suggested_daily_budget > 0) {
      try { await setDailyBudgetInModal(page, action.suggested_daily_budget); }
      catch (e) { console.log('  [일예산 설정 실패]', e.message); }
    }

    const closedOk = await clickSubmit(page);
    return { ok: true, beforeCpc, afterCpc: action.suggested_desired_cpc, afterBudget: action.suggested_daily_budget, kwResults, submitted: closedOk };
  } catch (e) {
    await closeDialog(page).catch(() => {});
    return { ok: false, error: e.message, beforeCpc };
  }
}

module.exports = { applyDesiredCpc, readKeywordSelections, toggleKeywordCheckboxes, applyServiceAction, openServiceChangeModal };
