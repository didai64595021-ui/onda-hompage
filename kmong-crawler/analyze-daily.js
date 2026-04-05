#!/usr/bin/env node
/**
 * 크몽 Phase 2 — 일간 분석 리포트 (매일 오전 9시)
 * 1. 어제 vs 그제 CPC 데이터 비교
 * 2. 서비스별 병목 진단
 * 3. ROI 계산
 * 4. 이상 감지
 * 5. 비즈머니 잔액 예측
 * 6. 텔레그램 리포트 발송
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');
const {
  analyzeFunnel,
  detectBottleneck,
  calculateROI,
  detectAnomalies,
  predictBizMoney,
  generateRecommendations,
  analyzeAllServices,
  getDateRange,
} = require('./lib/analyzer');

function formatNumber(n) {
  return n.toLocaleString('ko-KR');
}

function changeText(current, previous) {
  if (!previous || previous === 0) return '';
  const change = ((current - previous) / previous * 100);
  const sign = change >= 0 ? '+' : '';
  return ` (전일 대비 ${sign}${change.toFixed(0)}%)`;
}

async function analyzeDaily() {
  const startTime = Date.now();

  try {
    console.log('=== 크몽 일간 분석 리포트 시작 ===');

    // 1. 어제 전체 퍼널 분석
    const yesterday = await analyzeFunnel(null, 1);
    const dayBefore = await analyzeFunnel(null, 2);

    // 전일 대비 계산 (2일 분석에서 1일 분석을 빼서 그제 값 추정)
    const prevClicks = Math.max(0, (dayBefore.clicks || 0) - (yesterday.clicks || 0));
    const prevInquiries = Math.max(0, (dayBefore.inquiries || 0) - (yesterday.inquiries || 0));

    // 2. 서비스별 분석
    const serviceAnalyses = await analyzeAllServices(1);

    // 3. 이상치 감지
    const anomalies = await detectAnomalies();

    // 4. 비즈머니 예측
    const { data: recentCpc } = await supabase
      .from('kmong_cpc_daily')
      .select('cpc_cost')
      .gte('date', getDateRange(7).start)
      .lte('date', getDateRange(1).end);

    const totalCost7d = (recentCpc || []).reduce((s, r) => s + (r.cpc_cost || 0), 0);
    const dailyAvgSpend = Math.round(totalCost7d / 7);

    // 비즈머니 잔액은 CPC 페이지에서 가져오기 어려우므로 추정 (수동 입력 또는 크롤링 추가 필요)
    // 임시: 최근 7일 평균 소진으로만 계산
    const estimatedBalance = 101300; // TODO: 실제 잔액은 크롤러 or 수동 업데이트
    const bizMoneyPred = predictBizMoney(estimatedBalance, dailyAvgSpend);

    // 5. 추천 액션
    const recommendations = generateRecommendations(serviceAnalyses);

    // 6. 리포트 생성
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}`;

    let report = `크몽 일간 리포트 (${dateStr})\n\n`;

    // 어제 성과
    report += `어제 성과\n`;
    report += `• 클릭 ${formatNumber(yesterday.clicks)}건${changeText(yesterday.clicks, prevClicks)}\n`;
    report += `• 문의 ${formatNumber(yesterday.inquiries)}건 / 결제 ${formatNumber(yesterday.orders)}건\n`;
    report += `• 광고비 ${formatNumber(yesterday.adCost)}원 / 매출 ${formatNumber(yesterday.revenue)}원\n`;
    if (yesterday.adCost > 0 && yesterday.revenue > 0) {
      const roi = ((yesterday.revenue - yesterday.adCost) / yesterday.adCost * 100).toFixed(0);
      report += `• ROI: ${formatNumber(parseInt(roi))}%\n`;
    }

    // 서비스별 병목 진단
    if (serviceAnalyses.length > 0) {
      report += `\n서비스별 병목 진단\n`;
      for (const sa of serviceAnalyses) {
        const bn = detectBottleneck(sa);
        report += `${bn.emoji} ${sa.productId}: CTR ${sa.ctr}%`;
        if (sa.clicks > 0) report += ` → 문의 ${sa.inquiryRate}%`;
        if (sa.inquiries > 0) report += ` → 결제 ${sa.payRate}%`;
        if (bn.level !== 'ok') report += ` (${bn.message})`;
        else report += ` (정상)`;
        report += `\n`;
      }
    }

    // 이상치
    if (anomalies.length > 0) {
      report += `\n이상 감지\n`;
      for (const a of anomalies) {
        report += `• ${a.productId} ${a.metric} ${a.direction}: ${a.prev} → ${a.curr} (${a.changePercent > 0 ? '+' : ''}${a.changePercent}%)\n`;
      }
    }

    // 비즈머니
    report += `\n비즈머니 잔액: ${formatNumber(estimatedBalance)}원 (약 ${bizMoneyPred.daysLeft}일 남음)\n`;

    // AI 추천
    if (recommendations.length > 0) {
      report += `\nAI 추천 액션\n`;
      recommendations.forEach((r, i) => {
        report += `${i + 1}. ${r}\n`;
      });
    }

    console.log('\n--- 리포트 ---');
    console.log(report);

    // 7. Supabase에 분석 결과 저장
    const analysisDate = getDateRange(1).end;
    const bottlenecks = serviceAnalyses.map(sa => ({
      productId: sa.productId,
      ...detectBottleneck(sa),
    }));

    const { error: saveErr } = await supabase
      .from('kmong_daily_analysis')
      .upsert({
        date: analysisDate,
        total_impressions: yesterday.impressions,
        total_clicks: yesterday.clicks,
        total_inquiries: yesterday.inquiries,
        total_orders: yesterday.orders,
        total_revenue: yesterday.revenue,
        total_ad_cost: yesterday.adCost,
        roi: yesterday.adCost > 0 ? parseFloat(((yesterday.revenue - yesterday.adCost) / yesterday.adCost * 100).toFixed(2)) : 0,
        bizmoney_balance: estimatedBalance,
        bizmoney_days_left: bizMoneyPred.daysLeft,
        bottlenecks,
        recommendations,
        report_sent: true,
      }, { onConflict: 'date' });

    if (saveErr) {
      console.error(`[Supabase 저장 실패] ${saveErr.message}`);
    } else {
      console.log('[Supabase] 일간 분석 저장 완료');
    }

    // 8. 텔레그램 발송
    notify(report);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 일간 분석 완료 (${elapsed}초) ===`);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 일간 분석 실패: ${err.message}`);
    process.exit(1);
  }
}

analyzeDaily();
