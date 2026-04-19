/**
 * 크몽 클릭업 광고 모달 파싱 유틸
 * - 변경 모달 (추천 입찰가 + 희망 CPC + 일 예산 + 종료일)
 * - 상세 모달 (검색어별 성과 테이블)
 * - 부모 페이지 날짜 필터 제어 (React controlled input native setter)
 * Selector 근거: probe-out/ad-modal-dump.json, probe 분석 에이전트 결과 (2026-04-19)
 */

function parseNum(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[,%원건회\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * 상세 모달 키워드 테이블 파싱
 * 컬럼: 검색어 | 노출 수 | 클릭 수 | 평균 클릭 비용 | 총 비용
 */
async function extractKeywordTable(page) {
  return await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return { error: 'no-dialog', rows: [] };
    const rows = dialog.querySelectorAll('table tbody tr');
    const out = [];
    for (const r of rows) {
      const tds = r.querySelectorAll('td');
      if (tds.length < 5) continue;
      const txt = (el) => (el?.innerText || el?.textContent || '').trim();
      out.push({
        keyword: txt(tds[0]),
        impressions: txt(tds[1]),
        clicks: txt(tds[2]),
        avg_cpc: txt(tds[3]),
        total_cost: txt(tds[4]),
      });
    }
    return { rows: out };
  }).then(result => {
    if (result.error) throw new Error(`상세 모달 파싱 실패: ${result.error}`);
    return result.rows.map(r => ({
      keyword: r.keyword,
      impressions: parseNum(r.impressions),
      clicks: parseNum(r.clicks),
      avg_cpc: parseNum(r.avg_cpc),
      total_cost: parseNum(r.total_cost),
    }));
  });
}

/**
 * 변경 모달 추천 키워드/입찰가 테이블 + 현재 설정 파싱
 */
async function extractChangeModal(page) {
  return await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return { error: 'no-dialog' };

    // 추천 키워드 row: label[has checkbox] 부모 div 구조
    // 실측 (modal-change.html): 각 row = <div class="mt-2 flex ..."><label>...<p>keyword<span>HOT</span></p>...</label><p>금액원</p></div>
    const suggestions = [];
    const labels = dialog.querySelectorAll('label:has(input[data-testid="checkbox"])');
    const seen = new Set();
    for (const label of labels) {
      const row = label.parentElement;
      if (!row) continue;
      const kwEl = label.querySelector('p');
      const priceEl = Array.from(row.children).find(c => c.tagName === 'P');
      if (!kwEl || !priceEl) continue;
      const rawKw = (kwEl.textContent || '').replace(/HOT/gi, '').trim();
      const priceText = (priceEl.textContent || '').trim();
      if (!/원/.test(priceText)) continue;
      const price = parseInt(priceText.replace(/[^0-9]/g, ''), 10);
      if (!rawKw || isNaN(price) || price <= 0) continue;
      if (seen.has(rawKw)) continue;
      seen.add(rawKw);
      const checkbox = label.querySelector('input[data-testid="checkbox"]');
      suggestions.push({
        keyword: rawKw,
        suggested_cpc: price,
        selected: checkbox ? !!checkbox.checked : false,
      });
    }

    // 현재 설정 추출 — h5 텍스트 앵커
    function findInputByLabel(labelText) {
      const headings = dialog.querySelectorAll('h5');
      for (const h of headings) {
        if ((h.innerText || '').trim() === labelText) {
          let sib = h.parentElement;
          for (let i = 0; i < 4 && sib; i++) {
            const input = sib.querySelector('input[type="text"], input[type="number"], input[placeholder]');
            if (input) {
              return {
                value: input.value || '',
                placeholder: input.placeholder || '',
                disabled: input.disabled || false,
              };
            }
            sib = sib.parentElement;
          }
        }
      }
      return null;
    }

    function findToggleByLabel(labelText, nearbyText = '설정하지 않음') {
      const headings = dialog.querySelectorAll('h5');
      for (const h of headings) {
        if ((h.innerText || '').trim() === labelText) {
          let container = h.parentElement;
          for (let i = 0; i < 4 && container; i++) {
            const spans = container.querySelectorAll('span');
            for (const s of spans) {
              if ((s.innerText || '').trim() === nearbyText) {
                const cb = s.closest('label')?.querySelector('input[type="checkbox"]');
                if (cb) return { checked: !!cb.checked };
              }
            }
            container = container.parentElement;
          }
        }
      }
      return null;
    }

    const desiredCpcRaw = findInputByLabel('희망 클릭 비용');
    const dailyBudgetRaw = findInputByLabel('일 예산');
    const endDateRaw = findInputByLabel('광고 종료일');
    const dailyBudgetToggle = findToggleByLabel('일 예산');
    const endDateToggle = findToggleByLabel('광고 종료일');

    return {
      suggestions,
      desired_cpc_raw: desiredCpcRaw?.value || '',
      daily_budget_raw: dailyBudgetRaw?.value || '',
      daily_budget_unset: !!dailyBudgetToggle?.checked,
      end_date_raw: endDateRaw?.value || '',
      end_date_unset: !!endDateToggle?.checked,
    };
  }).then(result => {
    if (result.error) throw new Error(`변경 모달 파싱 실패: ${result.error}`);
    return {
      suggestions: result.suggestions,
      desired_cpc: parseNum(result.desired_cpc_raw),
      daily_budget: result.daily_budget_unset ? null : parseNum(result.daily_budget_raw),
      end_date: result.end_date_unset ? null : (result.end_date_raw || null),
    };
  });
}

/**
 * 부모 페이지 날짜 필터 설정 (React controlled input)
 * startDate, endDate 동일 날짜 (일별 백필)
 */
async function setParentDate(page, dateStr) {
  const result = await page.evaluate((targetDate) => {
    const inputs = document.querySelectorAll('main input[type="date"], input[type="date"]');
    if (inputs.length < 2) return { error: `date input 부족: ${inputs.length}개` };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const inp of [inputs[0], inputs[1]]) {
      setter.call(inp, targetDate);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    return { ok: true, start: inputs[0].value, end: inputs[1].value };
  }, dateStr);
  if (result.error) throw new Error(`날짜 설정 실패: ${result.error}`);
  await page.waitForTimeout(1500);
  return result;
}

/**
 * 모달 닫기 (우선순위: data-testid → 닫기 버튼 → Escape)
 */
async function closeDialog(page) {
  const closeBtn = page.locator('div[role="dialog"] button[data-testid="close-button"]').first();
  if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await closeBtn.click().catch(() => {});
  } else {
    const textClose = page.locator('div[role="dialog"] button:has-text("닫기")').first();
    if (await textClose.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textClose.click().catch(() => {});
    } else {
      await page.keyboard.press('Escape');
    }
  }
  await page.waitForTimeout(800);
}

/**
 * 일자 range 헬퍼: 오늘(기준일) 기준 N일 전부터 어제까지 YYYY-MM-DD 배열
 */
function getBackfillDates(days, baseDate = new Date()) {
  const out = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

module.exports = {
  parseNum,
  extractKeywordTable,
  extractChangeModal,
  setParentDate,
  closeDialog,
  getBackfillDates,
};
