#!/usr/bin/env node
/**
 * 서비스별 CTR > CVR > ROI > ROAS 통합 funnel 분석기
 *  - kmong_cpc_daily(노출/클릭) + kmong_inquiries(문의) + kmong_orders(주문) 조인
 *  - 각 단계별 승자와 공통 패턴 추출 → funnel-insights.json 저장
 *  - performance-playbook 이 이 JSON을 읽어 프롬프트 블록 생성
 *
 *  cron: 매일 오전 11시 권장 (광고 성과 데이터 업데이트 직후)
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('./lib/supabase');

const WINDOW_DAYS = 90;
const OUT_PATH = path.join(__dirname, 'funnel-insights.json');

async function main() {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  console.log(`=== 전환 funnel 분석 (${since} ~ 현재) ===`);

  // 1) CPC 집계
  const { data: cpc } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, title_text, thumbnail_hash, impressions, clicks, cpc_cost')
    .gte('date', since)
    .limit(10000);

  const byProd = {};
  for (const r of (cpc || [])) {
    const k = r.product_id || 'null';
    if (!byProd[k]) byProd[k] = { imp: 0, clk: 0, cost: 0, titles: new Set() };
    byProd[k].imp += r.impressions || 0;
    byProd[k].clk += r.clicks || 0;
    byProd[k].cost += r.cpc_cost || 0;
    if (r.title_text) byProd[k].titles.add(r.title_text);
  }

  // 2) 문의 집계
  const { data: inq } = await supabase
    .from('kmong_inquiries')
    .select('product_id')
    .gte('inquiry_date', since + 'T00:00:00')
    .limit(5000);
  const inqByProd = {};
  for (const r of (inq || [])) inqByProd[r.product_id || 'null'] = (inqByProd[r.product_id || 'null'] || 0) + 1;

  // 3) 주문 집계 (매출/결제 건)
  const { data: ord } = await supabase.from('kmong_orders').select('product_id, amount, status, package_type, service_name').limit(2000);
  const ordByProd = {};
  for (const r of (ord || [])) {
    const k = r.product_id || 'null';
    if (!ordByProd[k]) ordByProd[k] = { count: 0, revenue: 0, service_name: r.service_name, packages: new Set() };
    ordByProd[k].count += 1;
    if (/거래완료|completed|paid|done/.test(r.status || '')) ordByProd[k].revenue += r.amount || 0;
    if (r.package_type) ordByProd[k].packages.add(r.package_type);
  }

  // 4) funnel 통합
  const all = new Set([...Object.keys(byProd), ...Object.keys(inqByProd), ...Object.keys(ordByProd)]);
  const rows = [];
  for (const p of all) {
    const x = byProd[p] || { imp: 0, clk: 0, cost: 0, titles: new Set() };
    const inqN = inqByProd[p] || 0;
    const o = ordByProd[p] || { count: 0, revenue: 0 };
    const ctr = x.imp ? x.clk / x.imp * 100 : 0;
    const cvr_click_to_inq = x.clk ? inqN / x.clk * 100 : 0;
    const cvr_inq_to_order = inqN ? o.count / inqN * 100 : 0;
    const roi = x.cost ? (o.revenue - x.cost) / x.cost * 100 : (o.revenue > 0 ? 9999 : 0);
    const roas = x.cost ? o.revenue / x.cost * 100 : 0;
    rows.push({
      product_id: p,
      title: [...x.titles][0] || o.service_name || '',
      impressions: x.imp,
      clicks: x.clk,
      ctr: +ctr.toFixed(2),
      cost: x.cost,
      inquiries: inqN,
      cvr_click_to_inq: +cvr_click_to_inq.toFixed(1),
      orders: o.count,
      revenue: o.revenue,
      cvr_inq_to_order: +cvr_inq_to_order.toFixed(1),
      roi: +roi.toFixed(0),
      roas: +roas.toFixed(0),
    });
  }

  // 5) 단계별 상위 3 추출
  const pickTop = (metric, filter) => {
    let list = rows.filter(filter);
    list.sort((a, b) => b[metric] - a[metric]);
    return list.slice(0, 3);
  };
  const leaders = {
    ctr: pickTop('ctr', r => r.impressions >= 100),
    cvr_click_to_inq: pickTop('cvr_click_to_inq', r => r.clicks >= 5),
    cvr_inq_to_order: pickTop('cvr_inq_to_order', r => r.inquiries >= 2),
    roi: pickTop('roi', r => r.cost >= 1000),
    roas: pickTop('roas', r => r.cost >= 1000),
    revenue: pickTop('revenue', r => r.revenue > 0),
  };

  // 6) 출력
  console.log('\n[단계별 상위 서비스]');
  for (const [metric, top] of Object.entries(leaders)) {
    console.log(`\n▼ ${metric}`);
    for (const r of top) console.log(`  ${r.product_id.padEnd(14)} ${String(r[metric]).padStart(6)} | ${(r.title || '').slice(0, 40)}`);
  }

  // 7) 저장
  const out = {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    since,
    rows: rows.sort((a, b) => b.roas - a.roas),
    leaders,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n저장: ${OUT_PATH}`);
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
