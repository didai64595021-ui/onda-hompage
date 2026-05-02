require('dotenv').config({ path: __dirname + '/.env' });
const { supabase } = require('./lib/supabase');

(async () => {
  // 0) profits_transactions 스키마 확인 (모든 컬럼 노출)
  const { data: any1 } = await supabase
    .from('kmong_profits_transactions')
    .select('*')
    .limit(2);
  console.log('[profits_transactions sample columns]');
  console.log(any1 && any1[0] ? Object.keys(any1[0]).join(', ') : '(no rows in table)');
  console.log('---first2rows---');
  console.log(JSON.stringify(any1, null, 2));

  // 1) profits_transactions 어제자
  console.log('\n=== profits_transactions 2026-05-01 (created_at) ===');
  const { data: p1 } = await supabase
    .from('kmong_profits_transactions')
    .select('*')
    .gte('created_at', '2026-05-01T00:00:00+09:00')
    .lte('created_at', '2026-05-02T00:00:00+09:00');
  console.log('rows:', p1?.length || 0);
  if (p1?.length) console.log(JSON.stringify(p1.slice(0, 3), null, 2));

  // 2) profits_transactions 최근 30일
  console.log('\n=== profits_transactions 최근 30일 (created_at) ===');
  const { data: p2 } = await supabase
    .from('kmong_profits_transactions')
    .select('*')
    .gte('created_at', '2026-04-01')
    .order('id', { ascending: false })
    .limit(50);
  console.log('rows:', p2?.length || 0);
  for (const r of (p2 || []).slice(0, 20)) {
    console.log(`  id=${r.id} created=${r.created_at?.slice(0,16)} status=${r.status} profit=${r.profit_amount} actual=${r.actual_amount} title=${(r.gig_title || '').slice(0,30)}`);
  }

  // 3) 전체 kmong_orders 최근 30일 (계약건 점검용)
  console.log('\n=== orders 최근 30일 ===');
  const { data: ord } = await supabase
    .from('kmong_orders')
    .select('*')
    .gte('order_date', '2026-04-01')
    .order('order_date', { ascending: false });
  for (const r of (ord || [])) {
    console.log(`  ${r.order_date?.slice(0,10)} ${r.order_id} ${r.status} ${r.amount?.toLocaleString()}원 buyer=${r.buyer_name} pid=${r.product_id} svc=${(r.service_name || '').slice(0,30)}`);
  }
})();
