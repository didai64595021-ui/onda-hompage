require('dotenv').config({ path: __dirname + '/.env' });
const { supabase } = require('./lib/supabase');

(async () => {
  // 1) 최근 14일 상품별 CPC 추이
  const { data: cpc } = await supabase
    .from('kmong_cpc_daily')
    .select('date, product_id, clicks, impressions, cpc_cost')
    .gte('date', '2026-04-22')
    .order('date', { ascending: false });

  // by product
  const byProduct = {};
  for (const r of cpc || []) {
    const p = r.product_id || '(unknown)';
    if (!byProduct[p]) byProduct[p] = { clicks: 0, impressions: 0, cost: 0, days: new Set() };
    byProduct[p].clicks += r.clicks || 0;
    byProduct[p].impressions += r.impressions || 0;
    byProduct[p].cost += r.cpc_cost || 0;
    byProduct[p].days.add(r.date);
  }

  console.log('=== 최근 14일 상품별 누계 ===');
  console.log('상품              일수  노출    클릭   CTR    광고비');
  const rows = Object.entries(byProduct).map(([p, v]) => ({
    p, days: v.days.size, imp: v.impressions, clk: v.clicks, ctr: v.impressions > 0 ? (v.clicks / v.impressions * 100).toFixed(2) : '0.00', cost: v.cost
  })).sort((a, b) => b.imp - a.imp);
  for (const r of rows) {
    console.log(`  ${r.p.padEnd(15)} ${String(r.days).padStart(3)}  ${String(r.imp).padStart(6)}  ${String(r.clk).padStart(4)}  ${String(r.ctr).padStart(5)}%  ${r.cost.toLocaleString().padStart(7)}`);
  }

  // 2) 같은 기간 전 14일 비교 (4/8~4/21)
  const { data: cpcPrev } = await supabase
    .from('kmong_cpc_daily')
    .select('date, product_id, clicks, impressions')
    .gte('date', '2026-04-08').lte('date', '2026-04-21');
  const prev = {};
  for (const r of cpcPrev || []) {
    const p = r.product_id || '(unknown)';
    if (!prev[p]) prev[p] = { imp: 0, clk: 0 };
    prev[p].imp += r.impressions || 0;
    prev[p].clk += r.clicks || 0;
  }

  console.log('\n=== 추세 비교 (이전 14일 → 최근 14일) ===');
  console.log('상품              prev 클릭→ now 클릭  Δ%   prev 노출→ now 노출  Δ%');
  for (const r of rows) {
    const pv = prev[r.p] || { imp: 0, clk: 0 };
    const dClk = pv.clk > 0 ? ((r.clk - pv.clk) / pv.clk * 100).toFixed(0) : (r.clk > 0 ? '+∞' : '0');
    const dImp = pv.imp > 0 ? ((r.imp - pv.imp) / pv.imp * 100).toFixed(0) : (r.imp > 0 ? '+∞' : '0');
    console.log(`  ${r.p.padEnd(15)}  ${String(pv.clk).padStart(4)} → ${String(r.clk).padStart(4)}  ${String(dClk).padStart(4)}%   ${String(pv.imp).padStart(6)} → ${String(r.imp).padStart(6)}  ${String(dImp).padStart(4)}%`);
  }

  // 3) 키워드 단위 — 최근 7일 가장 많이 입찰한 키워드와 성과
  console.log('\n=== 최근 7일 키워드별 (있다면 kmong_keyword_daily) ===');
  const { data: kw, error: kwErr } = await supabase
    .from('kmong_keyword_daily')
    .select('*')
    .gte('date', '2026-04-30')
    .order('impressions', { ascending: false })
    .limit(30);
  if (kwErr) console.log('  err:', kwErr.message);
  else {
    console.log(`  rows=${kw?.length || 0}`);
    for (const r of (kw || []).slice(0, 20)) {
      console.log(`  ${r.date} ${r.product_id} kw="${r.keyword}" imp=${r.impressions} clk=${r.clicks} cost=${r.cpc_cost}`);
    }
  }

  // 4) 키워드 풀 / 발견 결과
  const fs = require('fs');
  const path = require('path');
  try {
    const pool = JSON.parse(fs.readFileSync(path.join(__dirname, 'discovery-keyword-pool.json'), 'utf-8'));
    console.log('\n=== discovery-keyword-pool.json (요약) ===');
    if (Array.isArray(pool)) console.log(`  array length: ${pool.length}, sample:`, pool.slice(0, 5));
    else console.log('  keys:', Object.keys(pool).slice(0, 20));
  } catch (e) { console.log('keyword pool 읽기 실패:', e.message); }

  try {
    const passed = JSON.parse(fs.readFileSync(path.join(__dirname, 'discovery-passed.json'), 'utf-8'));
    console.log('\n=== discovery-passed.json (합격 키워드/카테고리) ===');
    if (Array.isArray(passed)) {
      console.log(`  array length: ${passed.length}`);
      console.log('  최근 5:', JSON.stringify(passed.slice(-5), null, 2));
    } else {
      console.log('  keys:', Object.keys(passed).slice(0, 30));
    }
  } catch (e) { console.log('discovery-passed 읽기 실패:', e.message); }

  try {
    const cdpassed = JSON.parse(fs.readFileSync(path.join(__dirname, 'category-discovery-passed.json'), 'utf-8'));
    console.log('\n=== category-discovery-passed.json (요약) ===');
    if (Array.isArray(cdpassed)) console.log(`  array length: ${cdpassed.length}`);
    else console.log('  keys:', Object.keys(cdpassed).slice(0, 30));
  } catch (e) { console.log('category-discovery-passed 읽기 실패:', e.message); }
})();
