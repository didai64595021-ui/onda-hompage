/**
 * 크몽 비즈머니 잔액 크롤 + 저장 모듈
 * URL: https://kmong.com/seller/bizmoney
 * 파싱 기준: innerText에서 "총 비즈머니" 라벨 다음 라인의 금액
 *
 * 저장: kmong_daily_analysis 테이블 (일별 잔액 스냅샷)
 */

const { supabase } = require('./supabase');
const { login } = require('./login');

const BIZMONEY_URL = 'https://kmong.com/seller/bizmoney';

/**
 * 비즈머니 페이지를 크롤해 잔액 breakdown 반환.
 * 호출자가 로그인된 page를 제공하면 재사용, 없으면 신규 로그인.
 * @param {object} opts
 * @param {import('playwright').Page} [opts.page] - 기존 로그인된 페이지
 * @returns {Promise<{total:number, recharge:number, accumulated:number, expiring7d:number, raw:string}>}
 */
async function fetchBizmoneyBalance(opts = {}) {
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
    await page.goto(BIZMONEY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // "총 비즈머니" 라벨을 기준으로 파싱 (DOM 구조가 변해도 innerText는 유지되는 경향)
    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const lines = bodyText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const pickAmountAfter = (label) => {
        const i = lines.findIndex((l) => l === label || l.startsWith(label + '\t') || l.startsWith(label + ' '));
        if (i === -1) return null;
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const m = lines[j].match(/([\d,]+)\s*원/);
          if (m) return parseInt(m[1].replace(/,/g, ''), 10);
        }
        return null;
      };

      return {
        total: pickAmountAfter('총 비즈머니'),
        recharge: pickAmountAfter('충전 비즈머니'),
        accumulated: pickAmountAfter('적립 비즈머니'),
        expiring7d: pickAmountAfter('일주일 내 소멸 예정'),
        raw: lines.slice(0, 80).join(' | '),
      };
    });

    if (result.total === null) {
      throw new Error('"총 비즈머니" 라벨을 찾지 못함 — 페이지 구조 변경 가능성');
    }

    return result;
  } finally {
    if (ownSession && browser) {
      await browser.close();
    }
  }
}

/**
 * 오늘자 비즈머니 잔액을 DB에 upsert.
 * kmong_daily_analysis 테이블에 KST 기준 날짜로 저장.
 * @param {number} total
 * @param {number} recharge
 * @param {number} accumulated
 */
async function saveBizmoneyBalance({ total, recharge, accumulated, expiring7d }) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dateKst = kstNow.toISOString().slice(0, 10);

  // 기존 kmong_daily_analysis 테이블의 bizmoney_balance 컬럼 재활용
  // 같은 날짜 레코드가 이미 있으면 balance만 업데이트, 없으면 최소 레코드로 insert.
  const { data: existing } = await supabase
    .from('kmong_daily_analysis')
    .select('id')
    .eq('date', dateKst)
    .maybeSingle();

  let error;
  if (existing) {
    const r = await supabase
      .from('kmong_daily_analysis')
      .update({ bizmoney_balance: total })
      .eq('date', dateKst);
    error = r.error;
  } else {
    const r = await supabase
      .from('kmong_daily_analysis')
      .insert({ date: dateKst, bizmoney_balance: total });
    error = r.error;
  }

  if (error) {
    console.error(`[bizmoney] DB 저장 실패: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true, date: dateKst, total };
}

/**
 * 과거 N일간 잔액 변동 추이 조회 (리포트 트렌드용).
 */
async function getBalanceHistory(days = 7) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const startKst = new Date(kstNow.getTime() - days * 24 * 3600 * 1000);
  const startDate = startKst.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('kmong_daily_analysis')
    .select('date, bizmoney_balance')
    .gte('date', startDate)
    .not('bizmoney_balance', 'is', null)
    .order('date', { ascending: true });

  if (error) {
    console.error(`[bizmoney] 히스토리 조회 실패: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * 특정 날짜의 잔액 조회.
 */
async function getBalanceOnDate(dateStr) {
  const { data, error } = await supabase
    .from('kmong_daily_analysis')
    .select('*')
    .eq('date', dateStr)
    .maybeSingle();

  if (error) {
    console.error(`[bizmoney] 조회 실패 (${dateStr}): ${error.message}`);
    return null;
  }
  return data;
}

/**
 * 최신 저장된 잔액 반환 (DB 우선, 없으면 null).
 * 리포트에서 실시간 크롤 없이 최근값만 필요할 때 사용.
 */
async function getLatestSavedBalance() {
  const { data, error } = await supabase
    .from('kmong_daily_analysis')
    .select('date, bizmoney_balance')
    .not('bizmoney_balance', 'is', null)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

/**
 * 크롤 + 저장을 한 번에 수행.
 * @returns {Promise<{total, recharge, accumulated, saved}>}
 */
async function refreshBizmoney(opts = {}) {
  const balance = await fetchBizmoneyBalance(opts);
  const saved = await saveBizmoneyBalance(balance);
  return { ...balance, saved };
}

module.exports = {
  BIZMONEY_URL,
  fetchBizmoneyBalance,
  saveBizmoneyBalance,
  getBalanceHistory,
  getBalanceOnDate,
  getLatestSavedBalance,
  refreshBizmoney,
};
