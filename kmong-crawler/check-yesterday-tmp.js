require('dotenv').config({ path: __dirname + '/.env' });
const { supabase } = require('./lib/supabase');

const DOW = ['일','월','화','수','목','금','토'];
function dow(dateStr) {
  return DOW[new Date(dateStr + 'T00:00:00+09:00').getUTCDay()];
}

(async () => {
  // 1) inquiry_type DISTINCT
  const { data: types } = await supabase
    .from('kmong_inquiries')
    .select('inquiry_type')
    .gte('created_at', '2026-04-01');
  const typeCount = {};
  for (const r of types || []) typeCount[r.inquiry_type || '(null)'] = (typeCount[r.inquiry_type || '(null)'] || 0) + 1;
  console.log('=== inquiry_type 분포 (2026-04-01~) ===');
  for (const [t, c] of Object.entries(typeCount)) console.log(`  ${t}: ${c}건`);

  // 2) 5/3 8건 전체 출력 — 신규/재문의 구분
  console.log('\n=== 2026-05-03 created_at 기준 전 row ===');
  const { data: d503 } = await supabase
    .from('kmong_inquiries')
    .select('*')
    .gte('created_at', '2026-05-03T00:00:00+09:00')
    .lte('created_at', '2026-05-03T23:59:59.999+09:00')
    .order('created_at', { ascending: true });
  for (const r of d503 || []) {
    console.log(`  id=${r.id} type=${r.inquiry_type} cust=${r.customer_name} pid=${r.product_id} inq=${r.inquiry_date?.slice(0,16)} created=${r.created_at?.slice(0,16)} msg="${(r.message_content||'').slice(0,40)}"`);
  }

  // 3) 신규문의만 카운트 (최근 14일, 요일별)
  console.log('\n=== 신규문의 일별 (최근 14일) ===');
  const { data: newInqs } = await supabase
    .from('kmong_inquiries')
    .select('inquiry_date, created_at, inquiry_type')
    .eq('inquiry_type', '신규')
    .gte('created_at', '2026-04-22T00:00:00+09:00');
  const byDate = {};
  for (const r of newInqs || []) {
    const d = (r.inquiry_date || r.created_at).slice(0, 10);
    byDate[d] = (byDate[d] || 0) + 1;
  }
  for (const [d, c] of Object.entries(byDate).sort().reverse()) {
    console.log(`  ${d} ${dow(d)}: ${c}건`);
  }

  // 4) 만약 inquiry_type 값이 '신규'가 아닌 다른 표기면 모든 type별로
  console.log('\n=== 5/3 inquiry_type별 실측 ===');
  const tCount = {};
  for (const r of d503 || []) tCount[r.inquiry_type || '(null)'] = (tCount[r.inquiry_type || '(null)'] || 0) + 1;
  for (const [t, c] of Object.entries(tCount)) console.log(`  ${t}: ${c}건`);
})();
