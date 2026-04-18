#!/usr/bin/env node
/**
 * 크몽 일별 리포트 — 매일 08:00 KST
 * 전날(KST 기준) 00:00~23:59 데이터 요약.
 *
 * 실행 순서:
 *  1) 비즈머니 실크롤 + DB 저장 (당일 잔액 스냅샷)
 *  2) 섹션별 빌더로 리포트 텍스트 조립
 *  3) 텔레그램 'report' 타입으로 송신
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { refreshBizmoney } = require('./lib/bizmoney');
const { refreshMonthlySpend } = require('./lib/monthly-spend');
const { notifyTyped } = require('./lib/notify-filter');
const {
  buildBizmoneySection,
  buildInquirySection,
  buildCpcSection,
  buildOrderSection,
  buildProfitsSection,
  buildGigStatusSection,
  buildBottleneckSection,
  buildCronSection,
  buildDashboardFooter,
} = require('./lib/report-sections');

const KST_OFFSET_MS = 9 * 3600 * 1000;

function kstYesterdayDateStr() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstYesterday = new Date(kstNow.getTime() - 24 * 3600 * 1000);
  return kstYesterday.toISOString().slice(0, 10);
}

async function run() {
  const startTime = Date.now();
  const targetDate = kstYesterdayDateStr();
  console.log(`=== 크몽 일별 리포트 시작 (대상: ${targetDate} KST) ===`);

  // 1) 비즈머니 실크롤 (오늘 잔액 스냅샷 저장)
  let bizmoneyNote = '';
  try {
    const r = await refreshBizmoney();
    console.log(`[비즈머니] ${r.total?.toLocaleString()}원 저장`);
  } catch (err) {
    bizmoneyNote = `\n⚠️ 비즈머니 크롤 실패: ${err.message}`;
    console.error('[비즈머니] 실패:', err.message);
  }

  // 1-b) 월간 광고 지출 실크롤 (이번 달 총액 갱신 → 리포트에 반영)
  try {
    const r = await refreshMonthlySpend();
    console.log(`[월간 지출] ${r.totalCost.toLocaleString()}원 갱신`);
  } catch (err) {
    console.error('[월간 지출] 실패:', err.message);
  }

  // 2) 섹션 조립
  const sections = await Promise.all([
    buildBizmoneySection(),
    buildInquirySection(targetDate, targetDate),
    buildCpcSection(targetDate, targetDate),
    buildOrderSection(targetDate, targetDate),
    buildProfitsSection(targetDate, targetDate),
    buildGigStatusSection(),
    buildBottleneckSection(targetDate, targetDate),
    buildCronSection(targetDate),
  ]);

  const header = `📊 <b>크몽 일별 리포트</b>\n<b>${targetDate}</b> (KST)`;
  const body = sections.join('\n\n');
  const footer = `\n<i>생성: ${new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')} KST · ${((Date.now() - startTime) / 1000).toFixed(1)}초</i>`;

  const message = `${header}\n\n${body}${bizmoneyNote}\n${buildDashboardFooter()}${footer}`;

  // 3) 송신
  notifyTyped('report', message);
  console.log('=== 리포트 송신 완료 ===');
  console.log(message);
}

run().catch((err) => {
  console.error('[일별 리포트 실패]', err);
  notifyTyped('error', `일별 리포트 생성 실패: ${err.message}`);
  process.exit(1);
});
