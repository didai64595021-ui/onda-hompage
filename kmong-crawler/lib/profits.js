/**
 * 크몽 수익금(실수익, 수수료 제외) 집계 모듈
 *
 * 기준 (사용자 정의 2026-04-18):
 *   - "매출"은 실 거래금액이 아닌 **수익금(profit_amount)** 으로 표시 — 수수료는 내 돈 아님
 *   - 소스: kmong_profits_transactions (크롤 경로: /seller/profits_history)
 *   - 상태: 'completed' or '완료' 인 row만 수익 인식 (진행중/취소 제외)
 *
 * status 값 주의: crawl-profits.js는 "완료"/"진행중"/"취소"로 저장 (한국어).
 * 기존 kmong_orders 테이블은 리포트에서 더 이상 매출 계산에 사용하지 않음.
 */

const { supabase } = require('./supabase');

const COMPLETED_STATUSES = ['완료', '거래완료', 'completed'];

function _dayRange(dateStr) {
  return {
    start: `${dateStr}T00:00:00+09:00`,
    end: `${dateStr}T23:59:59.999+09:00`,
  };
}

/**
 * 특정 날짜 범위의 수익금(완료 기준) + 주문 집계.
 * @param {string} startDate YYYY-MM-DD (KST)
 * @param {string} endDate   YYYY-MM-DD (KST)
 * @returns {Promise<{
 *   ordersTotal: number, ordersCompleted: number, ordersInProgress: number, ordersCancelled: number,
 *   profitCompleted: number, profitInProgress: number,
 *   actualCompleted: number,
 *   rows: Array
 * }>}
 */
async function getProfitStats(startDate, endDate) {
  const startIso = `${startDate}T00:00:00+09:00`;
  const endIso = `${endDate}T23:59:59.999+09:00`;

  const { data, error } = await supabase
    .from('kmong_profits_transactions')
    .select('order_number, order_date, actual_amount, profit_amount, status')
    .gte('order_date', startIso)
    .lte('order_date', endIso)
    .order('order_date', { ascending: false });

  if (error) {
    console.error(`[profits] 조회 실패: ${error.message}`);
    return {
      ordersTotal: 0, ordersCompleted: 0, ordersInProgress: 0, ordersCancelled: 0,
      profitCompleted: 0, profitInProgress: 0, actualCompleted: 0, rows: [],
    };
  }

  const rows = data || [];
  let profitCompleted = 0;
  let profitInProgress = 0;
  let actualCompleted = 0;
  let ordersCompleted = 0;
  let ordersInProgress = 0;
  let ordersCancelled = 0;

  for (const r of rows) {
    if (COMPLETED_STATUSES.includes(r.status)) {
      profitCompleted += r.profit_amount || 0;
      actualCompleted += r.actual_amount || 0;
      ordersCompleted++;
    } else if (r.status === '진행중' || r.status === '작업중') {
      profitInProgress += r.profit_amount || 0;
      ordersInProgress++;
    } else if (r.status === '취소') {
      ordersCancelled++;
    }
  }

  return {
    ordersTotal: rows.length,
    ordersCompleted,
    ordersInProgress,
    ordersCancelled,
    profitCompleted,
    profitInProgress,
    actualCompleted,
    rows,
  };
}

/**
 * profits_history 최신 요약 (출금 가능 / 예상 / 출금 완료) 조회.
 */
async function getLatestProfitsSummary() {
  const { data } = await supabase
    .from('kmong_profits_summary')
    .select('available_profit, expected_profit, withdrawn_profit, crawled_at')
    .order('crawled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * 월별 수익(완료 기준) 히스토리 조회 — 월간 리포트 트렌드용.
 */
async function getMonthlyProfitHistory(months = 12) {
  const { data } = await supabase
    .from('kmong_profits_monthly')
    .select('term, completed_amount, canceled_amount')
    .order('term', { ascending: false })
    .limit(months);
  return (data || []).sort((a, b) => a.term.localeCompare(b.term));
}

module.exports = {
  getProfitStats,
  getLatestProfitsSummary,
  getMonthlyProfitHistory,
  COMPLETED_STATUSES,
};
