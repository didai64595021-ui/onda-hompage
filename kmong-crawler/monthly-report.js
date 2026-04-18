#!/usr/bin/env node
/**
 * 크몽 월간 리포트 — 매달 말일 08:00 KST
 * 대상: 해당 월 1일 00:00 ~ 말일 23:59 (KST)
 *
 * 크론은 매달 28/29/30/31일 08:00에 실행되도록 설정하되,
 * 실행 시점이 "실제 이번 달 말일"인지 확인 후 진행 (아니면 조용히 종료).
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { supabase } = require('./lib/supabase');
const { notifyTyped } = require('./lib/notify-filter');
const {
  fmtWon,
  buildInquirySection,
  buildCpcSection,
  buildOrderSection,
  buildBottleneckSection,
} = require('./lib/report-sections');
const { getMonthStats } = require('./lib/inquiry-stats');
const { getBalanceHistory } = require('./lib/bizmoney');

const KST_OFFSET_MS = 9 * 3600 * 1000;

function kstNow() {
  return new Date(Date.now() + KST_OFFSET_MS);
}

/**
 * 해당 월의 첫째 날 / 말일 (KST).
 */
function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, lastDay };
}

/**
 * 오늘이 이번 달 말일(KST)인지 확인.
 */
function isLastDayOfMonth() {
  const now = kstNow();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  return now.getUTCMonth() !== tomorrow.getUTCMonth();
}

/**
 * 주차별 요약 테이블 (월 1~7 / 8~14 / 15~21 / 22~말일).
 */
async function buildWeeklyBreakdown(year, month, lastDay) {
  const { data: ords } = await supabase
    .from('kmong_orders')
    .select('order_date, amount, status')
    .gte('order_date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('order_date', `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);

  const { data: cpcs } = await supabase
    .from('kmong_cpc_daily')
    .select('date, cpc_cost')
    .gte('date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('date', `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);

  const monthStats = await getMonthStats(year, month);

  const weeks = [
    { label: '1~7일', from: 1, to: 7 },
    { label: '8~14일', from: 8, to: 14 },
    { label: '15~21일', from: 15, to: 21 },
    { label: `22~${lastDay}일`, from: 22, to: lastDay },
  ];

  const lines = ['📅 <b>주차별 요약</b>'];
  lines.push('  <code>기간       객수  CPC지출    매출      </code>');
  for (const w of weeks) {
    const customers = new Set();
    let cpcCost = 0;
    let revenue = 0;
    for (const r of monthStats.rows) {
      const day = parseInt(r.inquiry_date.slice(8, 10), 10);
      if (day >= w.from && day <= w.to && r.customer_name) customers.add(r.customer_name);
    }
    for (const r of cpcs || []) {
      const day = parseInt(r.date.slice(8, 10), 10);
      if (day >= w.from && day <= w.to) cpcCost += r.cpc_cost || 0;
    }
    for (const r of ords || []) {
      const day = parseInt(r.order_date.slice(8, 10), 10);
      if (day >= w.from && day <= w.to && r.status === '거래완료') revenue += r.amount || 0;
    }
    lines.push(`  <code>${w.label.padEnd(10)} ${String(customers.size).padStart(3)}  ${fmtWon(cpcCost).padStart(9)}  ${fmtWon(revenue).padStart(9)}</code>`);
  }
  return lines.join('\n');
}

/**
 * 월간 순이익 = 거래완료 매출 - CPC 지출.
 */
async function buildProfitSection(year, month, lastDay) {
  const { data: ords } = await supabase
    .from('kmong_orders')
    .select('amount, status')
    .gte('order_date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('order_date', `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`)
    .eq('status', '거래완료');
  const revenue = (ords || []).reduce((s, r) => s + (r.amount || 0), 0);

  const { data: cpcs } = await supabase
    .from('kmong_cpc_daily')
    .select('cpc_cost')
    .gte('date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('date', `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  const adCost = (cpcs || []).reduce((s, r) => s + (r.cpc_cost || 0), 0);

  const profit = revenue - adCost;
  const roi = adCost > 0 ? ((profit / adCost) * 100).toFixed(1) : 'N/A';
  return [
    '📊 <b>월간 수익</b>',
    `  매출 (거래완료): ${fmtWon(revenue)}`,
    `  광고비 (CPC): ${fmtWon(adCost)}`,
    `  순이익: ${fmtWon(profit)}${adCost > 0 ? ` (ROI ${roi}%)` : ''}`,
  ].join('\n');
}

/**
 * 비즈머니 월간 변동.
 */
async function buildBizmoneyMonth(year, month, lastDay) {
  const hist = await getBalanceHistory(45);
  const inRange = hist.filter((h) => {
    const y = parseInt(h.date.slice(0, 4), 10);
    const m = parseInt(h.date.slice(5, 7), 10);
    return y === year && m === month;
  });
  const lines = ['💰 <b>비즈머니 월간 변동</b>'];
  if (inRange.length === 0) {
    lines.push('  (이번 달 기록 없음)');
    return lines.join('\n');
  }
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  lines.push(`  월초 (${first.date}): ${fmtWon(first.bizmoney_balance)}`);
  lines.push(`  월말 (${last.date}): ${fmtWon(last.bizmoney_balance)}`);
  const diff = (last.bizmoney_balance || 0) - (first.bizmoney_balance || 0);
  const arrow = diff < 0 ? '▼' : diff > 0 ? '▲' : '━';
  lines.push(`  변동: ${arrow} ${fmtWon(Math.abs(diff))}`);
  return lines.join('\n');
}

async function run() {
  const opts = process.argv.slice(2);
  const force = opts.includes('--force');

  if (!force && !isLastDayOfMonth()) {
    console.log('[월간 리포트] 오늘은 말일이 아닙니다. 조용히 종료 (--force로 강제 실행).');
    process.exit(0);
  }

  const startTime = Date.now();
  const now = kstNow();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const { start, end, lastDay } = monthRange(year, month);
  console.log(`=== 월간 리포트 (${start} ~ ${end}) ===`);

  const sections = await Promise.all([
    buildBizmoneyMonth(year, month, lastDay),
    buildProfitSection(year, month, lastDay),
    buildInquirySection(start, end),
    buildCpcSection(start, end),
    buildOrderSection(start, end),
    buildBottleneckSection(start, end),
    buildWeeklyBreakdown(year, month, lastDay),
  ]);

  const header = `🗓️ <b>크몽 월간 리포트</b>\n<b>${year}년 ${month}월</b> (${start} ~ ${end})`;
  const body = sections.join('\n\n');
  const footer = `\n<i>생성: ${new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')} KST · ${((Date.now() - startTime) / 1000).toFixed(1)}초</i>`;

  const message = `${header}\n\n${body}${footer}`;
  notifyTyped('report', message);
  console.log('=== 월간 리포트 송신 완료 ===');
  console.log(message);
}

run().catch((err) => {
  console.error('[월간 리포트 실패]', err);
  notifyTyped('error', `월간 리포트 생성 실패: ${err.message}`);
  process.exit(1);
});
