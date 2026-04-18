/**
 * 크몽 광고(CPC) 월간 지출 실크롤 모듈
 * URL: https://kmong.com/seller/click-up
 * 필터: "이번 달" 버튼 클릭 → 테이블 총비용 합산
 *
 * 배경:
 *   - kmong_cpc_daily의 일자별 값은 "어제" 필터로 수집 → 정확도 높지만
 *     과거 "지난 7일 필터 default" 버그로 일부 row 오염 가능성 있음.
 *   - 월간 총 지출은 크몽 어드민의 "이번 달" 필터값이 단일 truth.
 *   - 이 모듈이 월별 실측값을 주기적으로 저장 → 월간 리포트는 이 값 사용.
 *
 * 저장: kmong_daily_analysis.total_ad_cost (월 단위 아니지만, 가장 최근 실측값을
 *      오늘 날짜 레코드의 total_ad_cost에 upsert — 리포트 시 조회)
 *
 * 더 나은 스키마는 kmong_monthly_spend 테이블 신설이지만, 기존 컬럼 재활용.
 */

const { supabase } = require('./supabase');
const { login } = require('./login');
const { matchProductId } = require('./product-map');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';

/**
 * "이번 달" 필터로 크몽 click-up 페이지 크롤 → 제품별 지출 + 총합 반환.
 */
async function fetchMonthlySpend(opts = {}) {
  let page = opts.page;
  let browser;
  let ownSession = false;

  if (!page) {
    const session = await login();
    browser = session.browser;
    page = session.page;
    ownSession = true;
  }

  try {
    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);

    // 진입 모달 닫기
    try {
      const m = page.locator('button:has-text("확인")').first();
      if (await m.isVisible({ timeout: 2000 }).catch(() => false)) {
        await m.click();
        await page.waitForTimeout(800);
      }
    } catch { /* ignore */ }

    // "이번 달" 필터 클릭
    const monthFilter = page.locator('a.rounded-full:has-text("이번 달"), a:has-text("이번 달")').first();
    if (!(await monthFilter.isVisible({ timeout: 5000 }).catch(() => false))) {
      throw new Error('"이번 달" 필터 버튼을 찾을 수 없음');
    }
    await monthFilter.click();
    await page.waitForTimeout(2500);

    // 활성 필터 검증
    const active = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a.rounded-full')).find((el) => (el.className || '').includes('bg-gray-900'));
      return a?.innerText.trim() || null;
    });
    if (active !== '이번 달') {
      throw new Error(`"이번 달" 필터 적용 실패 — 현재 활성: ${active}`);
    }

    // 테이블 파싱
    const rows = await page.evaluate(() => {
      const trs = document.querySelectorAll('table tbody tr');
      const result = [];
      trs.forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 8) return;
        const nameImg = tds[1].querySelector('img');
        const name = nameImg?.alt || '';
        const impressions = parseInt((tds[4].textContent || '').replace(/[^\d]/g, ''), 10) || 0;
        const clicks = parseInt((tds[5].textContent || '').replace(/[^\d]/g, ''), 10) || 0;
        const cost = parseInt((tds[7].textContent || '').replace(/[^\d]/g, ''), 10) || 0;
        result.push({ name, impressions, clicks, cost });
      });
      return result;
    });

    const perProduct = rows
      .map((r) => ({ ...r, productId: matchProductId(r.name) }))
      .filter((r) => r.productId);
    const totalCost = perProduct.reduce((s, r) => s + r.cost, 0);
    const totalImpressions = perProduct.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = perProduct.reduce((s, r) => s + r.clicks, 0);

    return { totalCost, totalImpressions, totalClicks, perProduct };
  } finally {
    if (ownSession && browser) await browser.close();
  }
}

/**
 * 실측값을 DB(kmong_daily_analysis 오늘자)에 저장.
 */
async function saveMonthlySpend({ totalCost, totalImpressions, totalClicks }) {
  const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from('kmong_daily_analysis')
    .select('id')
    .eq('date', kstDate)
    .maybeSingle();

  const payload = {
    total_ad_cost: totalCost,
    total_impressions: totalImpressions,
    total_clicks: totalClicks,
  };

  let error;
  if (existing) {
    const r = await supabase.from('kmong_daily_analysis').update(payload).eq('date', kstDate);
    error = r.error;
  } else {
    const r = await supabase.from('kmong_daily_analysis').insert({ date: kstDate, ...payload });
    error = r.error;
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, date: kstDate };
}

/**
 * 최신 저장된 이번 달 지출 조회 (리포트용).
 */
async function getLatestMonthlySpend() {
  const { data } = await supabase
    .from('kmong_daily_analysis')
    .select('date, total_ad_cost, total_impressions, total_clicks')
    .not('total_ad_cost', 'is', null)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * 크롤 + 저장 원샷.
 */
async function refreshMonthlySpend(opts = {}) {
  const r = await fetchMonthlySpend(opts);
  const saved = await saveMonthlySpend(r);
  return { ...r, saved };
}

module.exports = {
  CLICK_UP_URL,
  fetchMonthlySpend,
  saveMonthlySpend,
  getLatestMonthlySpend,
  refreshMonthlySpend,
};
