#!/usr/bin/env node
/**
 * 일회용 — 예산/소재 전략 보고서용 데이터 풀
 * 최근 30일/14일/7일 윈도우로 서비스별 CPC/주문/문의/ROI를 집계해 JSON으로 출력
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { PRODUCT_MAP } = require('./lib/product-map');

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function pullWindow(days) {
  const start = dateNDaysAgo(days);
  const end = dateNDaysAgo(0);

  const [{ data: cpc }, { data: orders }, { data: inq }] = await Promise.all([
    supabase.from('kmong_cpc_daily').select('*').gte('date', start).lte('date', end),
    supabase.from('kmong_orders').select('*').gte('order_date', start).lte('order_date', end),
    supabase.from('kmong_inquiries').select('*').gte('inquiry_date', start + 'T00:00:00').lte('inquiry_date', end + 'T23:59:59'),
  ]);

  const byProduct = {};
  const ensure = (pid) => {
    if (!byProduct[pid]) byProduct[pid] = {
      product_id: pid, impressions: 0, clicks: 0, cpc_cost: 0,
      ctr_sum: 0, ctr_n: 0, ad_on_days: 0, total_days: 0,
      inquiries: 0, orders_done: 0, orders_cancel: 0, revenue: 0, days_with_data: new Set(),
    };
    return byProduct[pid];
  };

  for (const r of (cpc || [])) {
    const p = ensure(r.product_id);
    p.impressions += r.impressions || 0;
    p.clicks += r.clicks || 0;
    p.cpc_cost += r.cpc_cost || 0;
    if (r.ctr != null) { p.ctr_sum += parseFloat(r.ctr) || 0; p.ctr_n += 1; }
    p.total_days += 1;
    if (r.ad_enabled) p.ad_on_days += 1;
    p.days_with_data.add(r.date);
  }
  for (const r of (orders || [])) {
    const p = ensure(r.product_id);
    if (r.status === '취소') p.orders_cancel += 1;
    else { p.orders_done += 1; p.revenue += r.amount || 0; }
  }
  for (const r of (inq || [])) {
    const p = ensure(r.product_id);
    p.inquiries += 1;
  }

  const out = [];
  for (const [pid, s] of Object.entries(byProduct)) {
    const ctr = s.impressions > 0 ? (s.clicks / s.impressions * 100) : 0;
    const inquiryRate = s.clicks > 0 ? (s.inquiries / s.clicks * 100) : 0;
    const payRate = s.inquiries > 0 ? (s.orders_done / s.inquiries * 100) : 0;
    const cpa = s.orders_done > 0 ? Math.round(s.cpc_cost / s.orders_done) : null;
    const roi = s.cpc_cost > 0 ? ((s.revenue - s.cpc_cost) / s.cpc_cost * 100) : null;
    const aov = s.orders_done > 0 ? Math.round(s.revenue / s.orders_done) : 0;
    out.push({
      product_id: pid,
      impressions: s.impressions,
      clicks: s.clicks,
      cpc_cost: s.cpc_cost,
      avg_cpc: s.clicks > 0 ? Math.round(s.cpc_cost / s.clicks) : 0,
      ctr_pct: parseFloat(ctr.toFixed(2)),
      inquiries: s.inquiries,
      inquiry_rate_pct: parseFloat(inquiryRate.toFixed(2)),
      orders_done: s.orders_done,
      orders_cancel: s.orders_cancel,
      pay_rate_pct: parseFloat(payRate.toFixed(2)),
      revenue: s.revenue,
      aov,
      cpa,
      roi_pct: roi != null ? parseFloat(roi.toFixed(1)) : null,
      ad_on_days: s.ad_on_days,
      total_days: s.total_days,
      days_with_data: s.days_with_data.size,
    });
  }
  return { window_days: days, start, end, services: out };
}

async function pullSettings() {
  const { data } = await supabase.from('kmong_settings').select('key, value');
  const s = {};
  (data || []).forEach(r => { s[r.key] = r.value; });
  return s;
}

async function pullGigStatus() {
  const { data } = await supabase.from('kmong_gig_status').select('*');
  return data || [];
}

async function pullCreativeChanges(days = 60) {
  const start = dateNDaysAgo(days);
  const { data } = await supabase
    .from('kmong_creative_changes')
    .select('*')
    .gte('created_at', start)
    .order('created_at', { ascending: false })
    .limit(100);
  return data || [];
}

async function pullABTests() {
  const { data } = await supabase
    .from('kmong_ab_tests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}

async function pullDailyAnalysis(days = 14) {
  const start = dateNDaysAgo(days);
  const { data } = await supabase
    .from('kmong_daily_analysis')
    .select('*')
    .gte('date', start)
    .order('date', { ascending: false });
  return data || [];
}

async function pullDailyCpcSeries(days = 30) {
  const start = dateNDaysAgo(days);
  const { data } = await supabase
    .from('kmong_cpc_daily')
    .select('date, product_id, impressions, clicks, cpc_cost, ctr, ad_enabled')
    .gte('date', start)
    .order('date', { ascending: true });
  return data || [];
}

(async () => {
  try {
    const [w7, w14, w30, settings, gigs, creatives, abTests, daily, cpcSeries] = await Promise.all([
      pullWindow(7),
      pullWindow(14),
      pullWindow(30),
      pullSettings(),
      pullGigStatus(),
      pullCreativeChanges(60),
      pullABTests(),
      pullDailyAnalysis(14),
      pullDailyCpcSeries(30),
    ]);

    console.log(JSON.stringify({
      generated_at: new Date().toISOString(),
      product_map: PRODUCT_MAP,
      windows: { w7, w14, w30 },
      settings,
      gigs,
      creative_changes: creatives,
      ab_tests: abTests,
      daily_analysis: daily,
      cpc_series_30d: cpcSeries,
    }, null, 2));
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
})();
