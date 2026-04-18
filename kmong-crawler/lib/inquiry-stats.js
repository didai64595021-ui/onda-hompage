/**
 * 크몽 문의 통계 모듈
 * kmong_inquiries 테이블에서 고유 고객 수(추가된 객수) / 메시지 수 / 답변 상태별 집계.
 *
 * 이전 analyzer.js의 `.length` 방식은 같은 고객의 연속 메시지를 중복 카운트.
 * "추가된 객수" = 고유 customer_name 수로 재정의.
 */

const { supabase } = require('./supabase');

const KST_OFFSET_MS = 9 * 3600 * 1000;

/**
 * KST 기준 날짜 문자열 반환 (YYYY-MM-DD).
 */
function kstDate(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * KST 기준 N일 전 00:00 ISO (UTC 변환된 쿼리용).
 */
function kstDayStart(yyyyMmDd) {
  // YYYY-MM-DD KST 00:00 = UTC (해당날짜 -1일) 15:00
  const d = new Date(yyyyMmDd + 'T00:00:00+09:00');
  return d.toISOString();
}

function kstDayEnd(yyyyMmDd) {
  const d = new Date(yyyyMmDd + 'T23:59:59.999+09:00');
  return d.toISOString();
}

/**
 * 각 customer_name의 DB 전체 최초 inquiry_date 조회 (캐시).
 * "객수 = 최초문의 기준"을 위해 필요.
 */
let _firstInquiryCache = { map: null, fetchedAt: 0 };
const FIRST_INQ_TTL_MS = 5 * 60 * 1000;

async function loadFirstInquiryMap() {
  const now = Date.now();
  if (_firstInquiryCache.map && now - _firstInquiryCache.fetchedAt < FIRST_INQ_TTL_MS) {
    return _firstInquiryCache.map;
  }
  const { data, error } = await supabase
    .from('kmong_inquiries')
    .select('customer_name, inquiry_date')
    .order('inquiry_date', { ascending: true });
  const map = new Map();
  if (error) {
    console.error(`[inquiry-stats] 최초문의 캐시 실패: ${error.message}`);
  } else {
    for (const r of data || []) {
      if (!r.customer_name) continue;
      if (!map.has(r.customer_name)) map.set(r.customer_name, r.inquiry_date);
    }
  }
  _firstInquiryCache = { map, fetchedAt: now };
  return map;
}

/**
 * 특정 날짜 범위의 문의 집계.
 * 중요: "uniqueCustomers"는 기간 내 메시지 보낸 고유 고객 (기존고객 포함)
 *       "newCustomers" (객수)는 **최초문의가 기간 내**인 고객 (신규만) — 사용자 정의
 * @param {string} startDate YYYY-MM-DD (KST)
 * @param {string} endDate   YYYY-MM-DD (KST, 포함)
 * @returns {Promise<{messageCount, uniqueCustomers, newCustomers, customers, byStatus, byProduct, rows}>}
 */
async function getInquiryStats(startDate, endDate) {
  const { data, error } = await supabase
    .from('kmong_inquiries')
    .select('id, customer_name, inquiry_date, auto_reply_status, status, product_id, message_content')
    .gte('inquiry_date', kstDayStart(startDate))
    .lte('inquiry_date', kstDayEnd(endDate))
    .order('inquiry_date', { ascending: false });

  if (error) {
    console.error(`[inquiry-stats] 조회 실패: ${error.message}`);
    return {
      messageCount: 0,
      uniqueCustomers: 0,
      newCustomers: 0,
      customers: [],
      byStatus: {},
      byProduct: {},
      rows: [],
      error: error.message,
    };
  }

  const rows = data || [];
  const custSet = new Set();
  const byStatus = {};
  const byProduct = {};

  for (const r of rows) {
    if (r.customer_name) custSet.add(r.customer_name);
    const st = r.auto_reply_status || 'none';
    byStatus[st] = (byStatus[st] || 0) + 1;
    const pid = r.product_id || '(미분류)';
    byProduct[pid] = (byProduct[pid] || 0) + 1;
  }

  // 신규 고객 판정 — DB 전체에서 최초문의가 이 기간 안인 사람만
  const firstInqMap = await loadFirstInquiryMap();
  const newCustomerSet = new Set();
  for (const cust of custSet) {
    const firstDate = firstInqMap.get(cust);
    if (!firstDate) continue;
    const firstKst = kstDate(firstDate);
    if (firstKst >= startDate && firstKst <= endDate) newCustomerSet.add(cust);
  }

  // 고객별 상세 (첫 메시지 + 신규여부)
  const custMap = new Map();
  for (const r of rows) {
    if (!r.customer_name) continue;
    if (!custMap.has(r.customer_name)) {
      custMap.set(r.customer_name, {
        customer: r.customer_name,
        productId: r.product_id,
        firstInquiry: r.inquiry_date,
        messageCount: 0,
        firstMessage: (r.message_content || '').slice(0, 60),
        isNew: newCustomerSet.has(r.customer_name),
      });
    }
    custMap.get(r.customer_name).messageCount++;
  }

  return {
    messageCount: rows.length,
    uniqueCustomers: custSet.size,
    newCustomers: newCustomerSet.size,
    customers: Array.from(custMap.values()),
    byStatus,
    byProduct,
    rows,
  };
}

/**
 * 어제(KST) 문의 집계.
 */
async function getYesterdayStats() {
  const now = new Date();
  const todayKst = kstDate(now);
  const yKst = new Date(new Date(todayKst + 'T00:00:00+09:00').getTime() - 24 * 3600 * 1000);
  const yStr = kstDate(yKst);
  const stats = await getInquiryStats(yStr, yStr);
  return { date: yStr, ...stats };
}

/**
 * 지난 7일(KST) 일자별 문의 집계.
 */
async function getWeekStats() {
  const todayKst = kstDate();
  const todayDate = new Date(todayKst + 'T00:00:00+09:00');
  const sevenDaysAgo = new Date(todayDate.getTime() - 7 * 24 * 3600 * 1000);
  const startStr = kstDate(sevenDaysAgo);
  const endStr = kstDate(new Date(todayDate.getTime() - 24 * 3600 * 1000)); // 어제까지

  const stats = await getInquiryStats(startStr, endStr);

  // 일자별 분해
  const daily = {};
  for (const r of stats.rows) {
    const d = kstDate(r.inquiry_date);
    if (!daily[d]) daily[d] = { messages: 0, customers: new Set() };
    daily[d].messages++;
    if (r.customer_name) daily[d].customers.add(r.customer_name);
  }
  const dailyArr = Object.entries(daily)
    .map(([date, v]) => ({ date, messages: v.messages, uniqueCustomers: v.customers.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { startDate: startStr, endDate: endStr, ...stats, daily: dailyArr };
}

/**
 * 특정 월(KST) 문의 집계.
 * @param {number} year 예: 2026
 * @param {number} month 1-12
 */
async function getMonthStats(year, month) {
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const stats = await getInquiryStats(startStr, endStr);

  // 일자별
  const daily = {};
  for (const r of stats.rows) {
    const d = kstDate(r.inquiry_date);
    if (!daily[d]) daily[d] = { messages: 0, customers: new Set() };
    daily[d].messages++;
    if (r.customer_name) daily[d].customers.add(r.customer_name);
  }
  const dailyArr = Object.entries(daily)
    .map(([date, v]) => ({ date, messages: v.messages, uniqueCustomers: v.customers.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { year, month, startDate: startStr, endDate: endStr, ...stats, daily: dailyArr };
}

/**
 * 자동답변 발송 실적 집계 (status='approved' 또는 replied).
 */
async function getReplySentStats(startDate, endDate) {
  const { data, error } = await supabase
    .from('kmong_inquiries')
    .select('id, customer_name, auto_reply_status, inquiry_date')
    .gte('inquiry_date', kstDayStart(startDate))
    .lte('inquiry_date', kstDayEnd(endDate))
    .in('auto_reply_status', ['approved', 'sent', 'replied']);

  if (error) return { generated: 0, sent: 0, error: error.message };
  const sent = (data || []).length;

  // 생성된(approved 포함)
  const { data: gen } = await supabase
    .from('kmong_inquiries')
    .select('id')
    .gte('inquiry_date', kstDayStart(startDate))
    .lte('inquiry_date', kstDayEnd(endDate))
    .not('auto_reply_text', 'is', null);

  return { generated: (gen || []).length, sent };
}

module.exports = {
  kstDate,
  kstDayStart,
  kstDayEnd,
  getInquiryStats,
  getYesterdayStats,
  getWeekStats,
  getMonthStats,
  getReplySentStats,
  loadFirstInquiryMap,
};
