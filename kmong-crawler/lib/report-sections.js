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
const { getLatestMonthlySpend } = require('./monthly-spend');
const { getProfitStats, getLatestProfitsSummary } = require('./profits');

const KST_OFFSET_MS = 9 * 3600 * 1000;

function fmtWon(n) {
  if (n == null) return '(미확인)';
  const abs = Math.abs(n).toLocaleString();
  return n < 0 ? `-${abs}원` : `${abs}원`;
}

/**
 * 리포트 하단 공통 footer — 대시보드 UI 링크.
 * URL은 onda-web Cloudflare tunnel. 변경 시 이 한 곳만 수정.
 */
const DASHBOARD_URL = 'https://deluxe-opponents-debut-meters.trycloudflare.com';

function buildDashboardFooter() {
  return `\n🔗 <b>전체 데이터 대시보드</b>\n  <a href="${DASHBOARD_URL}">${DASHBOARD_URL}</a>`;
}

function fmtKstRange(dateStr) {
  return { start: `${dateStr}T00:00:00+09:00`, end: `${dateStr}T23:59:59.999+09:00` };
}

/**
 * 비즈머니 섹션 — 현재 잔액만 표시 (충전 필요 시점 판단용, 2026-04-18 사용자 정의).
 * 변동 추이는 생략.
 */
async function buildBizmoneySection() {
  const current = await getLatestSavedBalance();
  if (current?.bizmoney_balance == null) {
    return '💰 <b>비즈머니</b>: (데이터 없음)';
  }
  return `💰 <b>비즈머니</b>: ${fmtWon(current.bizmoney_balance)} <i>(${current.date} 기준)</i>`;
}

/**
 * 문의 섹션.
 */
async function buildInquirySection(startDate, endDate) {
  const stats = await getInquiryStats(startDate, endDate);
  const reply = await getReplySentStats(startDate, endDate);

  const lines = [`📨 <b>문의</b> (${startDate}${startDate === endDate ? '' : ` ~ ${endDate}`})`];
  // "객수" = 최초문의 기준 신규 고객 (사용자 정의 2026-04-18)
  lines.push(`  신규 객수: <b>${stats.newCustomers}명</b> (활동 고객 ${stats.uniqueCustomers}명 · 메시지 ${stats.messageCount}건)`);
  lines.push(`  자동답변 생성: ${reply.generated}건 / 발송: ${reply.sent}건`);
  if (stats.customers.length > 0 && startDate === endDate) {
    lines.push(`  고객 상세:`);
    for (const c of stats.customers.slice(0, 10)) {
      const koName = await getGigKoreanName(c.productId);
      const mark = c.isNew ? '🆕' : '🔁';
      lines.push(`    ${mark} ${c.customer} (${c.messageCount}회, ${koName})`);
    }
  }
  return lines.join('\n');
}

/**
 * CPC 지출 섹션.
 */
async function buildCpcSection(startDate, endDate, opts = {}) {
  const { data } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, impressions, clicks, cpc_cost, ctr')
    .gte('date', startDate)
    .lte('date', endDate);

  const rows = data || [];
  const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  const clicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
  let cost = rows.reduce((s, r) => s + (r.cpc_cost || 0), 0);
  const ctrAvg = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';

  const lines = ['💸 <b>광고(CPC)</b>'];
  lines.push(`  DB 합계 (${startDate}${startDate === endDate ? '' : `~${endDate}`}): ${fmtWon(cost)}`);
  lines.push(`  노출 ${impressions.toLocaleString()} · 클릭 ${clicks.toLocaleString()} · CTR ${ctrAvg}%`);

  // 월간 범위면 어드민 실측값도 표시 (오차 교차확인)
  if (opts.showMonthlyReal) {
    const real = await getLatestMonthlySpend();
    if (real?.total_ad_cost != null) {
      lines.push(`  <b>어드민 실측 (이번 달): ${fmtWon(real.total_ad_cost)}</b> ← 정확값`);
    }
  }
  return lines.join('\n');
}

/**
 * 주문 섹션 — 주문 접수 건수만 표시 (금액은 수익금 섹션으로 분리, 사용자 정의 2026-04-18).
 * 소스: kmong_profits_transactions (profits_history 페이지 기반, 단일 truth).
 */
async function buildOrderSection(startDate, endDate) {
  const stats = await getProfitStats(startDate, endDate);
  return [
    '🛒 <b>주문 접수</b>',
    `  전체 ${stats.ordersTotal}건 (완료 ${stats.ordersCompleted} · 진행중 ${stats.ordersInProgress} · 취소 ${stats.ordersCancelled})`,
  ].join('\n');
}

/**
 * 수익금 섹션 — "내 돈" 기준.
 * profits_history 페이지의 profit_amount = 크몽 수수료(~20%) 이미 제외된 값.
 * 광고비는 별도 항목 (차감 안 됨). 순이익 계산은 monthly-report에서 별도.
 */
async function buildProfitsSection(startDate, endDate, opts = {}) {
  const stats = await getProfitStats(startDate, endDate);
  const lines = ['💵 <b>수익금</b> <i>(크몽 수수료 제외 · 광고비는 별도)</i>'];
  lines.push(`  완료 확정: ${fmtWon(stats.profitCompleted)} (실거래 ${fmtWon(stats.actualCompleted)})`);
  if (stats.profitInProgress > 0) {
    lines.push(`  진행중 (미확정): ${fmtWon(stats.profitInProgress)}`);
  }

  // 월간/월말 리포트에서만 누적 잔액 표시
  if (opts.showBalance) {
    const summary = await getLatestProfitsSummary();
    if (summary) {
      lines.push(`  <i>출금가능 ${fmtWon(summary.available_profit)} / 예상 ${fmtWon(summary.expected_profit)} / 출금완료 ${fmtWon(summary.withdrawn_profit)}</i>`);
    }
  }
  return lines.join('\n');
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
  DASHBOARD_URL,
  buildDashboardFooter,
  buildBizmoneySection,
  buildInquirySection,
  buildCpcSection,
  buildOrderSection,
  buildProfitsSection,
  buildGigStatusSection,
  buildBottleneckSection,
  buildCronSection,
};
