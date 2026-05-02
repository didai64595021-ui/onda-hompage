/**
 * 매출 단일 진실 원천 (SSOT) — 2026-05-02 신설
 *
 * 모든 매출 조회는 이 모듈로 통일. 여러 곳에 흩어진 status 매칭/외부매출 합산을 한 곳에 집중.
 *
 * 사용:
 *   const { getRevenue } = require('./lib/revenue');
 *   const r = await getRevenue({ from: '2026-04-27', to: '2026-05-03' });
 *   // → { kmong, external, total, kmongCount, externalCount, byProduct, byDate }
 */

const { supabase } = require('./supabase');

// 크몽 status 정규화 — '거래완료'(한글), 'completed'(영문), '완료' 모두 매출 인식
const COMPLETED_STATUSES = ['completed', '완료', '거래완료'];

/**
 * 통합 매출 조회 (크몽 거래완료 + 외부매출)
 * @param {object} opts
 * @param {string} [opts.from] - 시작 날짜 (YYYY-MM-DD, 포함)
 * @param {string} [opts.to]   - 종료 날짜 (YYYY-MM-DD, 포함)
 * @param {string} [opts.productId] - 특정 서비스만 (생략 시 전체)
 * @returns {Promise<object>} - { kmong, external, total, kmongCount, externalCount, byProduct, byDate }
 */
async function getRevenue(opts = {}) {
  const { from, to, productId } = opts;

  // === 크몽 거래완료 ===
  let kQ = supabase.from('kmong_orders').select('product_id, amount, order_date, status, buyer_name, service_name').in('status', COMPLETED_STATUSES);
  if (from) kQ = kQ.gte('order_date', from);
  if (to)   kQ = kQ.lte('order_date', to + 'T23:59:59');
  if (productId) kQ = kQ.eq('product_id', productId);
  const { data: kRows } = await kQ;

  // === 외부매출 ===
  let eQ = supabase.from('external_revenue').select('product_id, amount, date, customer_name, channel');
  if (from) eQ = eQ.gte('date', from);
  if (to)   eQ = eQ.lte('date', to);
  if (productId) eQ = eQ.eq('product_id', productId);
  const { data: eRows } = await eQ;

  const kmong = (kRows || []).reduce((s, r) => s + (r.amount || 0), 0);
  const external = (eRows || []).reduce((s, r) => s + (r.amount || 0), 0);
  const kmongCount = (kRows || []).length;
  const externalCount = (eRows || []).length;

  // 서비스별 분해
  const byProduct = {};
  for (const r of (kRows || [])) {
    const pid = r.product_id || '_unknown';
    if (!byProduct[pid]) byProduct[pid] = { kmong: 0, external: 0, kmongCount: 0, externalCount: 0 };
    byProduct[pid].kmong += r.amount || 0;
    byProduct[pid].kmongCount += 1;
  }
  for (const r of (eRows || [])) {
    const pid = r.product_id || '_unallocated';
    if (!byProduct[pid]) byProduct[pid] = { kmong: 0, external: 0, kmongCount: 0, externalCount: 0 };
    byProduct[pid].external += r.amount || 0;
    byProduct[pid].externalCount += 1;
  }

  // 일별 분해
  const byDate = {};
  for (const r of (kRows || [])) {
    const d = (r.order_date || '').slice(0, 10);
    if (!byDate[d]) byDate[d] = { kmong: 0, external: 0 };
    byDate[d].kmong += r.amount || 0;
  }
  for (const r of (eRows || [])) {
    const d = r.date;
    if (!byDate[d]) byDate[d] = { kmong: 0, external: 0 };
    byDate[d].external += r.amount || 0;
  }

  return {
    kmong, external,
    total: kmong + external,
    kmongCount, externalCount,
    totalCount: kmongCount + externalCount,
    byProduct,
    byDate,
    raw: { kmong: kRows || [], external: eRows || [] },
  };
}

/**
 * 광고비 조회 — kmong_cpc_daily.cpc_cost 합산 (제품별/일별)
 */
async function getAdCost(opts = {}) {
  const { from, to, productId } = opts;
  let q = supabase.from('kmong_cpc_daily').select('product_id, date, cpc_cost, impressions, clicks');
  if (from) q = q.gte('date', from);
  if (to)   q = q.lte('date', to);
  if (productId) q = q.eq('product_id', productId);
  const { data } = await q;
  const total = (data || []).reduce((s, r) => s + (r.cpc_cost || 0), 0);
  const impressions = (data || []).reduce((s, r) => s + (r.impressions || 0), 0);
  const clicks = (data || []).reduce((s, r) => s + (r.clicks || 0), 0);
  const byProduct = {};
  for (const r of (data || [])) {
    const pid = r.product_id || '_unknown';
    if (!byProduct[pid]) byProduct[pid] = { cost: 0, impressions: 0, clicks: 0 };
    byProduct[pid].cost += r.cpc_cost || 0;
    byProduct[pid].impressions += r.impressions || 0;
    byProduct[pid].clicks += r.clicks || 0;
  }
  return { total, impressions, clicks, byProduct, ctr: impressions > 0 ? +(clicks / impressions * 100).toFixed(2) : 0 };
}

/**
 * 종합 손익 (매출 - 광고비) + ROI/ROAS
 */
async function getProfitSummary(opts = {}) {
  const [rev, cost] = await Promise.all([getRevenue(opts), getAdCost(opts)]);
  const profit = rev.total - cost.total;
  const roi = cost.total > 0 ? +(((profit) / cost.total) * 100).toFixed(1) : null;
  const roas = cost.total > 0 ? +((rev.total / cost.total) * 100).toFixed(1) : null;
  return { revenue: rev, cost, profit, roi, roas };
}

module.exports = {
  COMPLETED_STATUSES,
  getRevenue,
  getAdCost,
  getProfitSummary,
};
