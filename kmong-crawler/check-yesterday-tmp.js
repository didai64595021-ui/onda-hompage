require('dotenv').config({ path: __dirname + '/.env' });
const { supabase } = require('./lib/supabase');

const DOW = ['일','월','화','수','목','금','토'];
function dow(dateStr) {
  return DOW[new Date(dateStr + 'T00:00:00+09:00').getUTCDay()];
}

(async () => {
  // 1) 최근 14일 일별 클릭 합계
  const { data: cpc } = await supabase
    .from('kmong_cpc_daily')
    .select('date, clicks, impressions, cpc_cost, product_id')
    .gte('date', '2026-04-22')
    .order('date', { ascending: false });

  const byDate = {};
  for (const r of cpc || []) {
    if (!byDate[r.date]) byDate[r.date] = { clicks: 0, impressions: 0, cost: 0 };
    byDate[r.date].clicks += r.clicks || 0;
    byDate[r.date].impressions += r.impressions || 0;
    byDate[r.date].cost += r.cpc_cost || 0;
  }

  console.log('=== 최근 14일 일별 CPC ===');
  console.log('날짜       요일 클릭 노출    광고비');
  for (const [d, v] of Object.entries(byDate).sort().reverse()) {
    console.log(`  ${d} ${dow(d)}  ${String(v.clicks).padStart(3)}  ${String(v.impressions).padStart(5)}  ${v.cost.toLocaleString().padStart(7)}원`);
  }

  // 2) 31 클릭 후보일 찾기
  const candidates = Object.entries(byDate).filter(([d, v]) => v.clicks >= 25 && v.clicks <= 40);
  console.log('\n=== 25~40 클릭 후보일 ===');
  for (const [d, v] of candidates) {
    console.log(`  ${d} (${dow(d)}) clicks=${v.clicks}`);
  }

  // 3) 각 후보일 문의 카운트
  console.log('\n=== 후보일별 문의(kmong_inquiries) ===');
  for (const [d] of candidates) {
    const start = `${d}T00:00:00+09:00`;
    const end = `${d}T23:59:59.999+09:00`;
    const { data: inqs, count } = await supabase
      .from('kmong_inquiries')
      .select('id, kmong_inquiry_id, customer_name, inquiry_date, created_at, deleted_at, auto_reply_status', { count: 'exact' })
      .gte('inquiry_date', start)
      .lte('inquiry_date', end)
      .order('inquiry_date', { ascending: false });
    console.log(`  ${d} (${dow(d)}): inquiry_date 기준 ${count || 0}건`);
    for (const i of inqs || []) {
      console.log(`    - id=${i.id} kmong=${i.kmong_inquiry_id} ${i.customer_name} inq=${i.inquiry_date?.slice(0,16)} created=${i.created_at?.slice(0,16)} status=${i.auto_reply_status} deleted=${i.deleted_at}`);
    }
    // created_at 기준으로도 (혹시 inquiry_date 없는 row 대비)
    const { count: countByCreated } = await supabase
      .from('kmong_inquiries')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', end);
    console.log(`    (created_at 기준 ${countByCreated || 0}건)`);
  }

  // 4) kmong_inquiries 컬럼 확인 (deleted_at이나 audit이 있는지)
  console.log('\n=== kmong_inquiries 스키마 샘플 ===');
  const { data: sample } = await supabase
    .from('kmong_inquiries')
    .select('*')
    .order('id', { ascending: false })
    .limit(1);
  if (sample?.[0]) console.log('columns:', Object.keys(sample[0]).join(', '));

  // 5) 최근 14일 inquiry_date 분포
  const { data: allInqs } = await supabase
    .from('kmong_inquiries')
    .select('inquiry_date, created_at')
    .gte('created_at', '2026-04-20T00:00:00+09:00')
    .order('inquiry_date', { ascending: false });
  console.log(`\n=== 최근 inquiry 14일 분포 (총 ${allInqs?.length || 0}건) ===`);
  const inqByDate = {};
  for (const r of allInqs || []) {
    const d = (r.inquiry_date || r.created_at).slice(0, 10);
    inqByDate[d] = (inqByDate[d] || 0) + 1;
  }
  for (const [d, c] of Object.entries(inqByDate).sort().reverse()) {
    console.log(`  ${d} ${dow(d)}: ${c}건`);
  }
})();
