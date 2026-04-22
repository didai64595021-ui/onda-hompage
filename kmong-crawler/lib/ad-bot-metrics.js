/**
 * 광고 봇 — 서비스별 메트릭 수집
 * 출력: 지난 30일 ROI / CVR / CTR / 비용 / 매출 / 문의/주문 / 추천가 분포 / 현재 희망 CPC
 * 판단 모듈이 이 결과를 그대로 Opus 4.7에 주입
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase } = require('./supabase');
const { getWeekSpent } = require('./bizmoney');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function weekStartISO() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const offset = day === 0 ? 6 : day - 1; // 월요일 시작
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

async function loadServiceMetrics(days = 30) {
  const start = daysAgo(days);
  const end = daysAgo(0);
  const weekStart = weekStartISO();

  const [cpcRes, weekCpcRes, kwRes, cfgRes, sugRes, inqRes, ordRes, gigRes] = await Promise.all([
    supabase.from('kmong_cpc_daily').select('product_id,date,impressions,clicks,cpc_cost').gte('date', start).lte('date', end),
    supabase.from('kmong_cpc_daily').select('product_id,date,cpc_cost').gte('date', weekStart).lte('date', end),
    supabase.from('kmong_ad_keyword_daily').select('product_id,keyword,impressions,clicks,total_cost').gte('date', start).lte('date', end),
    supabase.from('kmong_ad_config_daily').select('product_id,desired_cpc,daily_budget').order('date', { ascending: false }).limit(200),
    supabase.from('kmong_ad_bid_suggestion').select('product_id,keyword,suggested_cpc,captured_at').order('captured_at', { ascending: false }).limit(1000),
    supabase.from('kmong_inquiries').select('product_id,created_at').gte('created_at', start),
    supabase.from('kmong_profits_transactions').select('product_id,profit_amount,status,transaction_date').gte('transaction_date', start).lte('transaction_date', end),
    supabase.from('kmong_gig_status').select('product_id,gig_title,status,crawled_at').order('crawled_at', { ascending: false }).limit(200),
  ]);

  // 서비스별 집계
  const svc = {};
  const ensure = (pid) => {
    if (!svc[pid]) svc[pid] = {
      product_id: pid,
      gig_title: null,
      period_days: days,
      week_start: weekStart,
      impressions_30d: 0, clicks_30d: 0, cost_30d: 0,
      week_cost: 0,
      inquiries_30d: 0, orders_30d: 0, revenue_30d: 0,
      desired_cpc: null, daily_budget: null,
      keywords_top: [], keywords_bottom: [],
      suggested_cpc_stats: null,
      suggested_keywords: [],
    };
    return svc[pid];
  };

  // 서비스명 (가장 최근 스냅샷)
  const seenGig = new Set();
  for (const g of (gigRes.data || [])) {
    if (seenGig.has(g.product_id)) continue;
    seenGig.add(g.product_id);
    const s = ensure(g.product_id);
    s.gig_title = g.gig_title;
  }

  // 주간 누적 지출 (서비스별) — 기존처럼 kmong_cpc_daily 기반 proxy
  for (const r of (weekCpcRes.data || [])) {
    const s = ensure(r.product_id);
    s.week_cost += r.cpc_cost || 0;
  }

  // === 주간 실지출 ground-truth 보정 ===
  // kmong_bizmoney_daily_spend.spent 합계가 크몽이 자체 집계한 실지출(= 단일 truth).
  // click-up 크롤의 서비스별 week_cost 합 ≠ 비즈머니 실지출 이면 비즈머니 값 기준으로
  // 서비스별 비율 리스케일. product-map 오매칭/UTC 버그 오염이 있어도 총합은 정확해짐.
  const weekTruth = await getWeekSpent();
  const proxySum = Object.values(svc).reduce((a, s) => a + (s.week_cost || 0), 0);
  if (weekTruth && weekTruth.total > 0 && proxySum > 0 && Math.abs(weekTruth.total - proxySum) / Math.max(weekTruth.total, 1) > 0.1) {
    const scale = weekTruth.total / proxySum;
    for (const s of Object.values(svc)) s.week_cost = Math.round((s.week_cost || 0) * scale);
  }
  // proxy가 0인데 실지출은 있음 → 균등 배분 (서비스 active 중에서만 나중에 judge가 조정)
  if (proxySum === 0 && weekTruth && weekTruth.total > 0) {
    const activeSvcs = Object.values(svc);
    if (activeSvcs.length > 0) {
      const per = Math.round(weekTruth.total / activeSvcs.length);
      for (const s of activeSvcs) s.week_cost = per;
    }
  }
  // 전체 주간 실지출 요약값 — judge prompt에서 참조 가능
  const weekTotalActual = weekTruth?.total || 0;
  const weekByDateActual = weekTruth?.byDate || {};

  for (const r of (cpcRes.data || [])) {
    const s = ensure(r.product_id);
    s.impressions_30d += r.impressions || 0;
    s.clicks_30d += r.clicks || 0;
    s.cost_30d += r.cpc_cost || 0;
  }

  // 현재 설정 (최신 1건)
  const latestCfg = {};
  for (const c of (cfgRes.data || [])) if (!latestCfg[c.product_id]) latestCfg[c.product_id] = c;
  for (const [pid, c] of Object.entries(latestCfg)) {
    const s = ensure(pid);
    s.desired_cpc = c.desired_cpc;
    s.daily_budget = c.daily_budget;
  }

  // 문의
  for (const i of (inqRes.data || [])) {
    if (!i.product_id) continue;
    const s = ensure(i.product_id);
    s.inquiries_30d += 1;
  }

  // 주문/매출
  for (const o of (ordRes.data || [])) {
    if (!o.product_id) continue;
    const s = ensure(o.product_id);
    if (o.status === '완료' || o.status === 'completed') {
      s.orders_30d += 1;
      s.revenue_30d += o.profit_amount || 0;
    }
  }

  // 키워드별 성과 집계 → TOP3 클릭 + BOTTOM3 노출많은데 클릭0
  const kwAgg = {};
  for (const r of (kwRes.data || [])) {
    const k = `${r.product_id}|${r.keyword}`;
    if (!kwAgg[k]) kwAgg[k] = { product_id: r.product_id, keyword: r.keyword, impressions: 0, clicks: 0, cost: 0 };
    kwAgg[k].impressions += r.impressions || 0;
    kwAgg[k].clicks += r.clicks || 0;
    kwAgg[k].cost += r.total_cost || 0;
  }
  const byPid = {};
  for (const k of Object.values(kwAgg)) {
    if (!byPid[k.product_id]) byPid[k.product_id] = [];
    byPid[k.product_id].push(k);
  }
  for (const [pid, list] of Object.entries(byPid)) {
    const s = ensure(pid);
    s.keywords_top = [...list].filter(k => k.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 5).map(k => ({ keyword: k.keyword, impressions: k.impressions, clicks: k.clicks, cost: k.cost, ctr: k.impressions > 0 ? +(k.clicks / k.impressions * 100).toFixed(2) : 0 }));
    s.keywords_bottom = [...list].filter(k => k.impressions >= 10 && k.clicks === 0).sort((a, b) => b.impressions - a.impressions).slice(0, 5).map(k => ({ keyword: k.keyword, impressions: k.impressions }));
  }

  // 추천가 분포 (서비스별 최신 스냅샷) + 추천 키워드 전체 목록 (타겟 적합성 판단용)
  const sugByPid = {};
  for (const r of (sugRes.data || [])) {
    if (!sugByPid[r.product_id]) sugByPid[r.product_id] = {};
    if (!sugByPid[r.product_id][r.keyword]) sugByPid[r.product_id][r.keyword] = r.suggested_cpc;
  }
  for (const [pid, kwMap] of Object.entries(sugByPid)) {
    const s = ensure(pid);
    const entries = Object.entries(kwMap).filter(([, v]) => v != null);
    const prices = entries.map(([, v]) => v).sort((a, b) => a - b);
    if (!prices.length) continue;
    s.suggested_cpc_stats = {
      count: prices.length,
      min: prices[0],
      max: prices[prices.length - 1],
      median: prices[Math.floor(prices.length / 2)],
      p25: prices[Math.floor(prices.length * 0.25)],
      p75: prices[Math.floor(prices.length * 0.75)],
    };
    s.suggested_keywords = entries.map(([keyword, suggested_cpc]) => ({ keyword, suggested_cpc })).sort((a, b) => b.suggested_cpc - a.suggested_cpc);
  }

  // 파생 지표 계산 (모두 30일 기준 명시)
  for (const s of Object.values(svc)) {
    s.ctr_30d = s.impressions_30d > 0 ? +(s.clicks_30d / s.impressions_30d * 100).toFixed(2) : 0;
    s.cvr_inquiry_30d = s.clicks_30d > 0 ? +(s.inquiries_30d / s.clicks_30d * 100).toFixed(2) : 0;
    s.cvr_order_30d = s.inquiries_30d > 0 ? +(s.orders_30d / s.inquiries_30d * 100).toFixed(2) : 0;
    s.cpa_30d = s.orders_30d > 0 ? Math.round(s.cost_30d / s.orders_30d) : null;
    s.roi_30d = s.cost_30d > 0 ? +(((s.revenue_30d - s.cost_30d) / s.cost_30d) * 100).toFixed(1) : null;
    s.roas_30d = s.cost_30d > 0 ? +((s.revenue_30d / s.cost_30d) * 100).toFixed(1) : null;
  }

  const results = Object.values(svc).filter(s => s.desired_cpc != null);
  // ground-truth 요약을 각 서비스에 붙여 judge가 전체 주간 실지출 + 일자별 분포 참조 가능
  for (const s of results) {
    s.week_total_actual = weekTotalActual;
    s.week_by_date_actual = weekByDateActual;
    s.week_start_actual = weekTruth?.weekStart;
  }
  return results;
}

async function loadActiveBudget(productId = null) {
  let q = supabase.from('kmong_ad_budget').select('*').eq('active', true);
  if (productId) q = q.or(`product_id.eq.${productId},product_id.is.null`);
  const { data } = await q;
  return data || [];
}

module.exports = { loadServiceMetrics, loadActiveBudget };
