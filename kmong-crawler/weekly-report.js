#!/usr/bin/env node
/**
 * 크몽 주간 리포트 — 매주 일요일 08:00 KST
 * 대상: 지난 월요일(KST) 00:00 ~ 지난 일요일(KST) 23:59
 * (= 스크립트 실행 시점이 "이번 주 일요일 아침"이라고 가정)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { supabase } = require('./lib/supabase');
const { getGigKoreanName } = require('./lib/gig-name');
const { notifyTyped } = require('./lib/notify-filter');
const {
  fmtWon,
  buildBizmoneySection,
  buildInquirySection,
  buildCpcSection,
  buildOrderSection,
  buildProfitsSection,
  buildBottleneckSection,
  buildDashboardFooter,
} = require('./lib/report-sections');
const { getWeekStats } = require('./lib/inquiry-stats');
const { getBalanceHistory } = require('./lib/bizmoney');

const KST_OFFSET_MS = 9 * 3600 * 1000;

function kstTodayStr() {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 실행 시점 기준 "지난 주"의 월~일 범위 (KST).
 * 일요일 08:00에 실행한다고 가정: 지난 주 일요일은 '오늘-7', 지난 주 월요일은 '오늘-13' (근사).
 * 정확히: 오늘이 일요일이면 range = [오늘-7, 오늘-1].
 */
function getLastWeekRange() {
  const today = new Date(kstTodayStr() + 'T00:00:00+09:00');
  const end = new Date(today.getTime() - 24 * 3600 * 1000); // 어제 (지난 주 일요일 가정)
  const start = new Date(end.getTime() - 6 * 24 * 3600 * 1000); // 지난 주 월요일
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * 주간 일자별 문의/매출 트렌드.
 */
async function buildDailyTrend(startDate, endDate) {
  const weekStats = await getWeekStats();
  const inDaily = weekStats.daily.filter((d) => d.date >= startDate && d.date <= endDate);

  const { data: ordData } = await supabase
    .from('kmong_orders')
    .select('order_date, amount, status')
    .gte('order_date', startDate)
    .lte('order_date', endDate);
  const revByDate = {};
  for (const r of ordData || []) {
    if (r.status !== '거래완료') continue;
    revByDate[r.order_date] = (revByDate[r.order_date] || 0) + (r.amount || 0);
  }

  const { data: cpcData } = await supabase
    .from('kmong_cpc_daily')
    .select('date, cpc_cost, impressions, clicks')
    .gte('date', startDate)
    .lte('date', endDate);
  const cpcByDate = {};
  for (const r of cpcData || []) {
    if (!cpcByDate[r.date]) cpcByDate[r.date] = { cost: 0, impressions: 0, clicks: 0 };
    cpcByDate[r.date].cost += r.cpc_cost || 0;
    cpcByDate[r.date].impressions += r.impressions || 0;
    cpcByDate[r.date].clicks += r.clicks || 0;
  }

  const lines = ['📈 <b>일자별 트렌드</b>'];
  lines.push('  <code>날짜       객수 메시지  CPC지출  매출    </code>');
  // 날짜 문자열 직접 조작 (시간대 오프셋 버그 회피)
  let cursor = startDate;
  while (cursor <= endDate) {
    const d = cursor;
    const inq = inDaily.find((x) => x.date === d);
    const cpc = cpcByDate[d] || { cost: 0 };
    const rev = revByDate[d] || 0;
    const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T12:00:00Z').getUTCDay()];
    const line = `  <code>${d.slice(5)}(${dow})  ${String(inq?.uniqueCustomers || 0).padStart(3)}  ${String(inq?.messages || 0).padStart(4)}  ${fmtWon(cpc.cost).padStart(8)}  ${fmtWon(rev).padStart(8)}</code>`;
    lines.push(line);
    const next = new Date(d + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return lines.join('\n');
}

async function run() {
  const startTime = Date.now();
  const { startDate, endDate } = getLastWeekRange();
  console.log(`=== 주간 리포트 (${startDate} ~ ${endDate}) ===`);

  const sections = await Promise.all([
    buildBizmoneySection(),
    buildInquirySection(startDate, endDate),
    buildCpcSection(startDate, endDate),
    buildOrderSection(startDate, endDate),
    buildProfitsSection(startDate, endDate),
    buildBottleneckSection(startDate, endDate),
    buildDailyTrend(startDate, endDate),
  ]);

  const header = `📅 <b>크몽 주간 리포트</b>\n<b>${startDate} ~ ${endDate}</b> (KST)`;
  const body = sections.join('\n\n');
  const footer = `\n<i>생성: ${new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')} KST · ${((Date.now() - startTime) / 1000).toFixed(1)}초</i>`;

  const message = `${header}\n\n${body}\n${buildDashboardFooter()}${footer}`;
  notifyTyped('report', message);
  console.log('=== 주간 리포트 송신 완료 ===');
  console.log(message);
}

run().catch((err) => {
  console.error('[주간 리포트 실패]', err);
  notifyTyped('error', `주간 리포트 생성 실패: ${err.message}`);
  process.exit(1);
});
