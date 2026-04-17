/**
 * 크몽 답변 봇 — 실제 결제(전환) 또는 고참여 고객 답변만 우선 학습
 *  - 1차: kmong_orders(completed) + buyer_name → 그 고객의 sent inquiry 답변
 *  - 2차(프록시): thread 5+ 장기 대화 고객의 답변 ("engagement high" 신호)
 *     * 현재 crawl-orders 버그로 buyer_name이 UI 라벨로 저장되는 이슈가 있어 1차 미작동
 *     * 2차 프록시가 실용적 대체재 — 진지하게 대화한 고객 답변만 학습
 *  - 풀 부족 시 호출자가 기존 semantic-similar/키워드 매칭으로 폴백
 */
const { supabase } = require('./supabase');

// 캐시 — converted customer name 목록 (하루 1회 갱신)
const CACHE = { customers: null, ts: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function getConvertedCustomerNames() {
  if (CACHE.customers && (Date.now() - CACHE.ts) < CACHE_TTL) {
    return CACHE.customers;
  }

  // 1차: orders 테이블의 실제 거래완료 buyer_name
  const { data } = await supabase
    .from('kmong_orders')
    .select('buyer_name, amount, status')
    .in('status', ['completed', 'paid', '완료', '결제완료', '거래완료', 'done'])
    .not('amount', 'is', null)
    .limit(200);

  // 불량 데이터 필터 (크롤러 버그: '세금계산서 정보', '상세 보기' 같은 UI 라벨 저장됨)
  // 크몽 크롤러 버그로 저장된 UI 라벨 필터 — 접두사 매칭 (값이 뒤에 붙어도 걸러냄)
  const invalidPatterns = /^(세금계산서|상세\s*보기|결제|환불|주문|null|undefined|-)/i;
  const orderNames = [...new Set((data || [])
    .map(o => o.buyer_name)
    .filter(n => n && !invalidPatterns.test(String(n).trim()))
  )];

  // 2차 프록시: thread 5+ 장기 대화 고객 — engagement high 신호
  const { data: longThreadCustomers } = await supabase.rpc('exec_sql', {
    sql: `SELECT customer_name FROM kmong_inquiries WHERE customer_name IS NOT NULL GROUP BY customer_name HAVING COUNT(*) >= 5 ORDER BY MAX(inquiry_date) DESC LIMIT 50`,
  }).then(r => r).catch(() => ({ data: null }));

  let proxyNames = [];
  if (longThreadCustomers && Array.isArray(longThreadCustomers)) {
    proxyNames = longThreadCustomers.map(r => r.customer_name).filter(Boolean);
  } else {
    // RPC 없으면 직접 집계 — 상위 활성 고객 조회
    const { data: activeCustomers } = await supabase
      .from('kmong_inquiries')
      .select('customer_name, inquiry_date')
      .order('inquiry_date', { ascending: false })
      .limit(300);
    if (activeCustomers) {
      const counts = {};
      for (const r of activeCustomers) {
        if (!r.customer_name) continue;
        counts[r.customer_name] = (counts[r.customer_name] || 0) + 1;
      }
      proxyNames = Object.entries(counts)
        .filter(([, c]) => c >= 5)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
        .slice(0, 50);
    }
  }

  const names = [...new Set([...orderNames, ...proxyNames])];
  CACHE.customers = names;
  CACHE.ts = Date.now();
  return names;
}

/**
 * 전환 완료 고객의 과거 sent 답변 풀 조회
 * @param {string} [productId]
 * @param {number} [limit=20]
 */
async function getConvertedInquiryPool(productId, limit = 20) {
  const names = await getConvertedCustomerNames();
  if (names.length === 0) return [];

  let query = supabase
    .from('kmong_inquiries')
    .select('id, product_id, customer_name, message_content, auto_reply_text, inquiry_date')
    .in('customer_name', names)
    .eq('auto_reply_status', 'sent')
    .not('auto_reply_text', 'is', null)
    .order('inquiry_date', { ascending: false })
    .limit(limit);
  if (productId) {
    // 같은 product 를 먼저 (limit의 절반 정도 할당)
    const half = Math.ceil(limit / 2);
    const { data: same } = await supabase
      .from('kmong_inquiries')
      .select('id, product_id, customer_name, message_content, auto_reply_text, inquiry_date')
      .in('customer_name', names)
      .eq('auto_reply_status', 'sent')
      .eq('product_id', productId)
      .not('auto_reply_text', 'is', null)
      .order('inquiry_date', { ascending: false })
      .limit(half);
    const rest = limit - (same?.length || 0);
    if (rest > 0) {
      const { data: others } = await query.limit(rest * 2);
      const seen = new Set((same || []).map(r => r.id));
      const merged = [...(same || [])];
      for (const r of (others || [])) {
        if (seen.has(r.id)) continue;
        merged.push(r);
        if (merged.length >= limit) break;
      }
      return merged;
    }
    return same || [];
  }
  const { data } = await query;
  return data || [];
}

/**
 * 전환 답변 요약 메트릭 (로깅/telegram 카드용)
 */
async function getConversionStats() {
  const names = await getConvertedCustomerNames();
  return { convertedCustomerCount: names.length };
}

module.exports = { getConvertedCustomerNames, getConvertedInquiryPool, getConversionStats };
