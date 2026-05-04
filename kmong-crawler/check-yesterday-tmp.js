require('dotenv').config({ path: __dirname + '/.env' });
const { supabase } = require('./lib/supabase');

(async () => {
  // 1) settings 테이블 — 예산 관련 키 모두
  const { data: settings, error: se } = await supabase
    .from('kmong_settings')
    .select('key, value, updated_at')
    .or('key.ilike.%budget%,key.ilike.%anchor%,key.ilike.%auto_stop%');
  console.log('=== kmong_settings (budget 관련) ===');
  console.log('err:', se?.message || 'OK');
  for (const r of settings || []) {
    console.log(`  ${r.key} = ${r.value}  (updated ${r.updated_at?.slice(0, 16)})`);
  }

  // 2) 최근 7일 광고지출 — 실측
  const today = new Date();
  const since = new Date(today.getTime() - 8 * 86400000).toISOString().slice(0, 10);
  console.log(`\n=== 최근 8일 일별 광고지출 (>=${since}) ===`);
  const { data: cpc } = await supabase
    .from('kmong_cpc_daily')
    .select('date, cpc_cost, product_id')
    .gte('date', since)
    .order('date', { ascending: false });
  const byDate = {};
  for (const r of cpc || []) {
    if (!byDate[r.date]) byDate[r.date] = 0;
    byDate[r.date] += r.cpc_cost || 0;
  }
  for (const [d, sum] of Object.entries(byDate).sort().reverse()) {
    console.log(`  ${d}: ${sum.toLocaleString()}원`);
  }

  // 3) 이번 달 누계 (anchor 적용)
  const { data: anchorRow } = await supabase
    .from('kmong_settings')
    .select('value')
    .eq('key', 'monthly_anchor_date')
    .maybeSingle();
  const anchor = parseInt(anchorRow?.value || '1', 10);
  console.log(`\n[monthly_anchor_date] = ${anchor}일 기준`);
  const now = new Date();
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), anchor);
  if (now < cycleStart) cycleStart.setMonth(cycleStart.getMonth() - 1);
  const cycleStartStr = cycleStart.toISOString().slice(0, 10);
  console.log(`이번 사이클 시작: ${cycleStartStr}`);
  const { data: cycle } = await supabase
    .from('kmong_cpc_daily')
    .select('cpc_cost')
    .gte('date', cycleStartStr);
  const monthSum = (cycle || []).reduce((a, r) => a + (r.cpc_cost || 0), 0);
  console.log(`이번 사이클 광고비 누계: ${monthSum.toLocaleString()}원`);

  // 4) bizmoney 잔액 최근값
  const { data: biz } = await supabase
    .from('kmong_bizmoney_history')
    .select('total, available, crawled_at')
    .order('crawled_at', { ascending: false })
    .limit(3);
  console.log('\n=== bizmoney 최근 ===');
  for (const r of biz || []) console.log(`  ${r.crawled_at?.slice(0, 16)} total=${r.total?.toLocaleString()} available=${r.available?.toLocaleString()}`);
})();
