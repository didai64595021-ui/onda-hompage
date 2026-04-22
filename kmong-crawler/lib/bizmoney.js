/**
 * 크몽 비즈머니 잔액 + 일별 실지출 크롤 모듈
 * URL: https://kmong.com/seller/bizmoney
 *
 * 저장:
 *  - kmong_daily_analysis.bizmoney_balance — 오늘자 총잔액 스냅샷
 *  - kmong_bizmoney_daily_spend — "비즈머니 일별 내역" 테이블 (최근 15일)
 *    컬럼: 날짜 | 충전 | 적립 | 환급 | 사용 | 환불 | 만료 | 상환
 *    "사용" 컬럼이 일일 광고 실지출 ground-truth. week_cost 계산에 사용.
 */

const { supabase } = require('./supabase');
const { login } = require('./login');

const BIZMONEY_URL = 'https://kmong.com/seller/bizmoney';

/**
 * "-1,610" / "200,000" / "-" → 정수. 사용(spent) 컬럼은 음수 문자열이지만 양수로 저장.
 */
function parseMoney(s) {
  if (!s || s === '-') return 0;
  const n = parseInt(String(s).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * "2026.04.22" → "2026-04-22"
 */
function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

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

/**
 * /seller/bizmoney 페이지의 "비즈머니 일별 내역" 테이블 파싱.
 * 테이블은 진입 시 최근 15일이 기본 표시됨 (별도 날짜 필터 UI 없음).
 * 헤더 순서: 날짜 | 충전 | 적립 | 환급 | 사용 | 환불 | 만료 | 상환
 * @returns {Promise<Array<{date,spent,recharge,accrued,refunded,refund_canceled,expired,repaid,raw_row}>>}
 */
async function fetchDailySpendTable(opts = {}) {
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
    await page.waitForTimeout(4000);

    const rows = await page.evaluate(() => {
      const out = [];
      const tables = document.querySelectorAll('table');
      for (const tbl of tables) {
        const headers = Array.from(tbl.querySelectorAll('thead th, thead td')).map(h => (h.innerText || '').trim());
        if (!headers.includes('날짜') || !headers.includes('사용')) continue;
        const idx = (name) => headers.indexOf(name);
        const trs = tbl.querySelectorAll('tbody tr');
        for (const tr of trs) {
          const tds = Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || '').trim());
          if (!tds.length) continue;
          out.push({
            date: tds[idx('날짜')],
            recharge: tds[idx('충전')],
            accrued: tds[idx('적립')],
            refunded: tds[idx('환급')],
            spent: tds[idx('사용')],
            refund_canceled: tds[idx('환불')],
            expired: tds[idx('만료')],
            repaid: tds[idx('상환')],
            raw: tds.join(' | '),
          });
        }
        break;
      }
      return out;
    });

    if (!rows.length) {
      throw new Error('비즈머니 일별 내역 테이블을 찾지 못함 — 페이지 구조 변경 가능성');
    }

    return rows.map(r => ({
      date: parseDate(r.date),
      spent: parseMoney(r.spent),
      recharge: parseMoney(r.recharge),
      accrued: parseMoney(r.accrued),
      refunded: parseMoney(r.refunded),
      refund_canceled: parseMoney(r.refund_canceled),
      expired: parseMoney(r.expired),
      repaid: parseMoney(r.repaid),
      raw_row: r.raw,
    })).filter(r => r.date);
  } finally {
    if (ownSession && browser) await browser.close();
  }
}

/**
 * 일별 실지출 테이블을 Supabase kmong_bizmoney_daily_spend 로 upsert.
 * @returns {Promise<{ok, upserted, error?}>}
 */
async function saveDailySpendTable(rows) {
  if (!rows || !rows.length) return { ok: true, upserted: 0 };
  const payload = rows.map(r => ({
    date: r.date,
    spent: r.spent,
    recharge: r.recharge,
    accrued: r.accrued,
    refunded: r.refunded,
    refund_canceled: r.refund_canceled,
    expired: r.expired,
    repaid: r.repaid,
    raw_row: r.raw_row,
    crawled_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('kmong_bizmoney_daily_spend')
    .upsert(payload, { onConflict: 'date' });
  if (error) {
    console.error('[bizmoney daily] upsert 실패:', error.message);
    return { ok: false, upserted: 0, error: error.message };
  }
  return { ok: true, upserted: payload.length };
}

/**
 * 주간 실지출 합계 (이번 주 월~오늘, KST).
 * ad-bot-metrics의 week_cost ground-truth로 사용.
 */
async function getWeekSpent() {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const day = kstNow.getUTCDay(); // 0=Sun, 1=Mon, ...
  const offset = day === 0 ? 6 : day - 1;
  const weekStart = new Date(kstNow.getTime() - offset * 24 * 3600 * 1000);
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const todayDate = kstNow.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('kmong_bizmoney_daily_spend')
    .select('date, spent')
    .gte('date', weekStartDate)
    .lte('date', todayDate);
  if (error) {
    console.error('[bizmoney daily] week 조회 실패:', error.message);
    return { weekStart: weekStartDate, total: 0, byDate: {}, error: error.message };
  }
  const byDate = {};
  let total = 0;
  for (const r of data || []) {
    byDate[r.date] = r.spent;
    total += r.spent || 0;
  }
  return { weekStart: weekStartDate, total, byDate };
}

/**
 * 최근 N일 일별 지출 조회.
 */
async function getRecentDailySpend(days = 30) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const startKst = new Date(kstNow.getTime() - days * 24 * 3600 * 1000);
  const startDate = startKst.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('kmong_bizmoney_daily_spend')
    .select('date, spent')
    .gte('date', startDate)
    .order('date', { ascending: true });
  if (error) return [];
  return data || [];
}

module.exports = {
  BIZMONEY_URL,
  fetchBizmoneyBalance,
  saveBizmoneyBalance,
  getBalanceHistory,
  getBalanceOnDate,
  getLatestSavedBalance,
  refreshBizmoney,
  fetchDailySpendTable,
  saveDailySpendTable,
  getWeekSpent,
  getRecentDailySpend,
};
