#!/usr/bin/env node
/**
 * 크몽 비즈머니 일별 실지출 크롤러
 * - /seller/bizmoney "비즈머니 일별 내역" 테이블 (최근 15일 자동 표시)
 * - kmong_bizmoney_daily_spend 테이블에 upsert
 * - 부가: 총잔액 스냅샷도 kmong_daily_analysis.bizmoney_balance 에 저장
 *
 * 배경: kmong_cpc_daily 는 click-up 크롤 + product-map 매칭 기반이라 오염 가능.
 *       비즈머니 페이지는 크몽이 자체 집계하는 단일 truth (/seller/bizmoney).
 *       이 값이 주간/일일 예산 판단의 ground-truth.
 *
 * cron: 매일 05:45 KST (ad-bot-run 06:00 직전)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
const {
  fetchBizmoneyBalance,
  saveBizmoneyBalance,
  fetchDailySpendTable,
  saveDailySpendTable,
} = require('./lib/bizmoney');
const { notifyTyped } = require('./lib/notify-filter');

(async () => {
  const startTime = Date.now();
  let browser;
  try {
    console.log('=== 크몽 비즈머니 일별 실지출 크롤러 ===');
    const session = await login({ slowMo: 150 });
    browser = session.browser;
    const page = session.page;

    // 1) 일별 내역 테이블 (최근 15일)
    const rows = await fetchDailySpendTable({ page });
    const saved = await saveDailySpendTable(rows);
    const spentDays = rows.filter(r => r.spent > 0);
    console.log(`[일별] 총 ${rows.length}행 파싱 / 지출 발생 ${spentDays.length}일 / upsert ${saved.upserted}건`);
    for (const r of spentDays.slice(0, 5)) {
      console.log(`  ${r.date}: 사용 ${r.spent.toLocaleString()}원 / 충전 ${r.recharge.toLocaleString()}원`);
    }

    // 2) 총잔액 스냅샷 (기존 로직 유지)
    const balance = await fetchBizmoneyBalance({ page });
    const balanceSaved = await saveBizmoneyBalance(balance);
    console.log(`[잔액] 총 ${balance.total?.toLocaleString()}원 / 충전 ${balance.recharge?.toLocaleString()}원 / 일주일 내 소멸 ${balance.expiring7d?.toLocaleString()}원`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 비즈머니 크롤: 일별 ${rows.length}행 (지출 ${spentDays.length}일) / 잔액 ${balance.total?.toLocaleString()}원 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notifyTyped('crawl', msg);

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('[에러]', err.message);
    notifyTyped('error', `크몽 비즈머니 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
