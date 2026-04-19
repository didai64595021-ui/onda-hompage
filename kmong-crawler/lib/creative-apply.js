/**
 * 크몽 소재 변경 Playwright 제출
 * - 제목(title) / 부제(subtitle) / 상세설명(description): 서비스 수정 페이지 접근
 * - 썸네일(thumbnail): 대표 이미지 교체
 * - 제출 성공 시 → kmong_creative_queue.state = 'submitted'
 *
 * 크몽 구조 (2026-04 실측 기준):
 *   /seller/gigs/edit/:gigId (또는 /mygig/:id/edit)
 *   제목 input / 부제 input / TipTap 에디터
 *   "저장"/"심사요청" 버튼
 *
 * 주의: 심사 요청은 사용자 승인된 큐(proposed → queued after review)만.
 *       자동 심사 요청은 risky → 이 함수는 '임시저장'만. 실제 심사 요청은 별도 --submit-for-review 플래그.
 */

const { closeDialog } = require('./ad-extract');

async function gotoGigEdit(page, gigId) {
  const url = `https://kmong.com/mygig/${gigId}/edit`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  try { const b = page.locator('button:has-text("확인")').first(); if (await b.isVisible({ timeout: 1500 }).catch(()=>false)) await b.click(); } catch {}
}

/**
 * 제목 수정 (React controlled input — native setter)
 */
async function applyTitle(page, newTitle) {
  const ok = await page.evaluate((val) => {
    const inputs = document.querySelectorAll('input[type="text"]');
    for (const inp of inputs) {
      const ph = (inp.placeholder || '').toLowerCase();
      const name = (inp.name || '').toLowerCase();
      const label = inp.closest('label')?.textContent || '';
      if (/제목|title/.test(ph) || /title/.test(name) || /제목/.test(label)) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, val);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inp.dispatchEvent(new Event('blur', { bubbles: true }));
        return { ok: true, placeholder: inp.placeholder };
      }
    }
    return { ok: false };
  }, newTitle);
  if (!ok.ok) throw new Error('제목 input 찾기 실패');
  await page.waitForTimeout(500);
  return ok;
}

async function applySubtitle(page, newSub) {
  const ok = await page.evaluate((val) => {
    const inputs = document.querySelectorAll('input[type="text"], textarea');
    for (const inp of inputs) {
      const ph = (inp.placeholder || '').toLowerCase();
      if (/부제|요약|한줄|subtitle/.test(ph)) {
        const setter = Object.getOwnPropertyDescriptor(inp.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, val);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }
    }
    return { ok: false };
  }, newSub);
  if (!ok.ok) throw new Error('부제 input 찾기 실패');
  await page.waitForTimeout(500);
}

/**
 * 저장 / 심사요청 — forReview=true면 심사요청, false면 임시저장
 */
async function clickSave(page, forReview = false) {
  const selector = forReview
    ? 'button:has-text("심사"), button:has-text("검수"), button:has-text("제출")'
    : 'button:has-text("임시저장"), button:has-text("저장")';
  const btn = page.locator(selector).first();
  if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
    throw new Error(`${forReview ? '심사요청' : '임시저장'} 버튼 없음`);
  }
  await btn.click();
  await page.waitForTimeout(3000);
  // SweetAlert 확인
  const confirm = page.locator('.swal2-container button:has-text("확인"), .swal2-confirm').first();
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click();
  await page.waitForTimeout(1500);
  return true;
}

/**
 * 통합 적용
 * action = { gigId, element_type, after_value, for_review? }
 */
async function applyCreativeChange(page, action) {
  await gotoGigEdit(page, action.gigId);

  let detail = {};
  if (action.element_type === 'title') detail = await applyTitle(page, action.after_value);
  else if (action.element_type === 'subtitle') detail = await applySubtitle(page, action.after_value);
  else throw new Error(`element_type ${action.element_type} 미지원 (추후 thumbnail/description 추가)`);

  const saved = await clickSave(page, !!action.for_review);
  return { ok: true, detail, submitted_for_review: !!action.for_review, saved };
}

module.exports = { applyCreativeChange, gotoGigEdit, applyTitle, applySubtitle, clickSave };
