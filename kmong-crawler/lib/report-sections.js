/**
 * 크몽 리포트 공통 섹션 빌더
 * 일/주/월 리포트에서 공유하는 각 섹션 생성 함수.
 *
 * 모든 함수는 async + 문자열(멀티라인) 반환. 섹션 헤더 포함.
 * 빈 데이터 시 "(데이터 없음)" 같은 명시적 플레이스홀더 사용 — 숨기지 않음.
 */

const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');
const { getGigKoreanName } = require('./gig-name');
const { getBalanceOnDate, getLatestSavedBalance } = require('./bizmoney');
const { getInquiryStats, getReplySentStats } = require('./inquiry-stats');

const KST_OFFSET_MS = 9 * 3600 * 1000;

function fmtWon(n) {
  if (n == null) return '(미확인)';
  const abs = Math.abs(n).toLocaleString();
  return n < 0 ? `-${abs}원` : `${abs}원`;
}

function fmtKstRange(dateStr) {
  return { start: `${dateStr}T00:00:00+09:00`, end: `${dateStr}T23:59:59.999+09:00` };
}

/**
 * 비즈머니 섹션.
 * @param {string} targetDate — 리포트 대상 날짜 (YYYY-MM-DD, KST)
 */
async function buildBizmoneySection(targetDate) {
  const current = await getLatestSavedBalance();
  const prev = await getBalanceOnDate(targetDate);

  const lines = ['💰 <b>비즈머니</b>'];
  if (current?.bizmoney_balance != null) {
    lines.push(`  현재: ${fmtWon(current.bizmoney_balance)} (${current.date})`);
  } else {
    lines.push(`  현재: (데이터 없음)`);
  }
  if (prev?.bizmoney_balance != null && current?.bizmoney_balance != null) {
    const diff = current.bizmoney_balance - prev.bizmoney_balance;
    const arrow = diff < 0 ? '▼' : diff > 0 ? '▲' : '━';
    lines.push(`  ${targetDate} 대비: ${arrow} ${fmtWon(Math.abs(diff))}`);
  }
  return lines.join('\n');
}

/**
 * 문의 섹션.
 */
async function buildInquirySection(startDate, endDate) {
  const stats = await getInquiryStats(startDate, endDate);
  const reply = await getReplySentStats(startDate, endDate);

  const lines = [`📨 <b>문의</b> (${startDate}${startDate === endDate ? '' : ` ~ ${endDate}`})`];
  lines.push(`  신규 객수: ${stats.uniqueCustomers}명 (총 메시지 ${stats.messageCount}건)`);
  lines.push(`  자동답변 생성: ${reply.generated}건 / 발송: ${reply.sent}건`);
  if (stats.customers.length > 0 && startDate === endDate) {
    lines.push(`  고객 상세:`);
    for (const c of stats.customers.slice(0, 10)) {
      const koName = await getGigKoreanName(c.productId);
      lines.push(`    • ${c.customer} (${c.messageCount}회, ${koName})`);
    }
  }
  return lines.join('\n');
}

/**
 * CPC 지출 섹션.
 */
async function buildCpcSection(startDate, endDate) {
  const { data } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, impressions, clicks, cpc_cost, ctr')
    .gte('date', startDate)
    .lte('date', endDate);

  const rows = data || [];
  const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  const clicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
  const cost = rows.reduce((s, r) => s + (r.cpc_cost || 0), 0);
  const ctrAvg = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';

  return `💸 <b>광고(CPC)</b>\n  지출: ${fmtWon(cost)} / 노출 ${impressions.toLocaleString()} · 클릭 ${clicks.toLocaleString()} · CTR ${ctrAvg}%`;
}

/**
 * 주문·매출 섹션.
 */
async function buildOrderSection(startDate, endDate) {
  const { data } = await supabase
    .from('kmong_orders')
    .select('status, amount')
    .gte('order_date', startDate)
    .lte('order_date', endDate);

  const rows = data || [];
  const completed = rows.filter((r) => r.status === '거래완료');
  const revenue = completed.reduce((s, r) => s + (r.amount || 0), 0);
  const cancelled = rows.filter((r) => r.status === '취소').length;

  return `🛒 <b>주문</b>\n  전체 ${rows.length}건 / 거래완료 ${completed.length}건 / 취소 ${cancelled}건\n  매출(거래완료 기준): ${fmtWon(revenue)}`;
}

/**
 * 현재 서비스 상태 스냅샷 (가장 최근 크롤값, 한글명).
 */
async function buildGigStatusSection() {
  const { data } = await supabase
    .from('kmong_gig_status')
    .select('product_id, gig_title, status, crawled_at')
    .neq('product_id', 'unknown')
    .order('crawled_at', { ascending: false });

  const latest = new Map();
  for (const r of data || []) {
    if (!latest.has(r.product_id)) latest.set(r.product_id, r);
  }

  const byStatus = {};
  for (const r of latest.values()) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  const lines = ['📦 <b>서비스 상태</b> (현재 스냅샷)'];
  lines.push(`  ${Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(' / ') || '(데이터 없음)'}`);

  // 판매중 목록 (한글명)
  const selling = Array.from(latest.values()).filter((r) => r.status === '판매중');
  if (selling.length > 0) {
    lines.push(`  판매중 ${selling.length}개:`);
    for (const r of selling.slice(0, 10)) {
      const ko = await getGigKoreanName(r.product_id);
      lines.push(`    • ${ko}`);
    }
  }
  return lines.join('\n');
}

/**
 * 병목 진단 TOP5 (CTR 낮은 순, 한글명).
 */
async function buildBottleneckSection(startDate, endDate) {
  const { data } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, impressions, clicks, cpc_cost, ctr')
    .gte('date', startDate)
    .lte('date', endDate);

  // 노출 100+ 인 것만 의미 있음
  const agg = {};
  for (const r of data || []) {
    const p = r.product_id;
    if (!agg[p]) agg[p] = { impressions: 0, clicks: 0, cost: 0 };
    agg[p].impressions += r.impressions || 0;
    agg[p].clicks += r.clicks || 0;
    agg[p].cost += r.cpc_cost || 0;
  }

  const rows = Object.entries(agg)
    .filter(([, v]) => v.impressions >= 50)
    .map(([pid, v]) => ({
      productId: pid,
      impressions: v.impressions,
      clicks: v.clicks,
      cost: v.cost,
      ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
    }))
    .sort((a, b) => a.ctr - b.ctr)
    .slice(0, 5);

  const lines = ['⚠️ <b>병목 진단 TOP5</b> (CTR 낮은 순, 노출 50+ 기준)'];
  if (rows.length === 0) {
    lines.push('  (분석 가능한 데이터 부족)');
    return lines.join('\n');
  }
  for (const r of rows) {
    const ko = await getGigKoreanName(r.productId);
    lines.push(`  • ${ko}: CTR ${r.ctr.toFixed(2)}% (노출 ${r.impressions} / 클릭 ${r.clicks})`);
  }
  return lines.join('\n');
}

/**
 * 크론 실행 현황 — DB 실데이터 기준 간접 지표.
 * PM2 로그 파일에 timestamp가 없어 정확 카운트 불가능. 대신
 * "실제 데이터가 들어왔는지"로 판정 (데이터 = 크롤 실행 증거).
 *
 * @param {string} dateStr YYYY-MM-DD (KST)
 */
async function buildCronSection(dateStr) {
  const { count: inqCount } = await supabase
    .from('kmong_inquiries')
    .select('id', { count: 'exact', head: true })
    .gte('inquiry_date', `${dateStr}T00:00:00+09:00`)
    .lte('inquiry_date', `${dateStr}T23:59:59.999+09:00`);

  const { count: cpcCount } = await supabase
    .from('kmong_cpc_daily')
    .select('id', { count: 'exact', head: true })
    .eq('date', dateStr);

  const { count: ordCount } = await supabase
    .from('kmong_orders')
    .select('order_id', { count: 'exact', head: true })
    .eq('order_date', dateStr);

  const { data: gigLatest } = await supabase
    .from('kmong_gig_status')
    .select('crawled_at')
    .order('crawled_at', { ascending: false })
    .limit(1);
  const gigLastCrawl = gigLatest?.[0]?.crawled_at || '(기록 없음)';

  const { count: replyGen } = await supabase
    .from('kmong_inquiries')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${dateStr}T00:00:00+09:00`)
    .lte('created_at', `${dateStr}T23:59:59.999+09:00`)
    .not('auto_reply_text', 'is', null);

  const { count: replySent } = await supabase
    .from('kmong_inquiries')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${dateStr}T00:00:00+09:00`)
    .lte('created_at', `${dateStr}T23:59:59.999+09:00`)
    .in('auto_reply_status', ['approved', 'sent', 'replied']);

  return [
    '🤖 <b>크론 실행 현황</b> (DB 실데이터 기준)',
    `  • 문의 크롤 → 신규 문의 ${inqCount}건 수집`,
    `  • CPC 크롤 → ${cpcCount || 0}개 서비스 데이터 갱신`,
    `  • 주문 크롤 → ${ordCount || 0}개 주문 수집`,
    `  • 서비스상태 → 마지막 크롤 ${gigLastCrawl.slice(0, 16).replace('T', ' ')} UTC`,
    `  • 자동답변 생성 → ${replyGen || 0}건`,
    `  • 답변 발송 → ${replySent || 0}건`,
  ].join('\n');
}

module.exports = {
  fmtWon,
  fmtKstRange,
  buildBizmoneySection,
  buildInquirySection,
  buildCpcSection,
  buildOrderSection,
  buildGigStatusSection,
  buildBottleneckSection,
  buildCronSection,
};
