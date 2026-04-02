#!/usr/bin/env node
/**
 * 시간대별 광고 스케줄러
 * - 매 30분마다 PM2 크론으로 실행
 * - 현재 시간(KST) + 요일 기준으로 광고 ON/OFF 결정
 * - kmong_ad_schedule 테이블에서 해당 시간대/요일 조회
 * - 예산 초과 시 무조건 OFF (budget-monitor 연동)
 *
 * PM2 크론: */30 * * * *
 */

const { supabase } = require('./lib/supabase');
const { toggleAd } = require('./toggle-ad');
const { PRODUCT_MAP } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

function getKST() {
  const now = new Date();
  // KST = UTC + 9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    hour: kst.getUTCHours(),
    day: kst.getUTCDay(), // 0=일, 6=토
    date: kst.toISOString().split('T')[0],
  };
}

async function getSettings() {
  const { data, error } = await supabase
    .from('kmong_settings')
    .select('key, value');

  if (error) throw new Error(`설정 조회 실패: ${error.message}`);

  const settings = {};
  (data || []).forEach(row => { settings[row.key] = row.value; });

  return {
    monthlyBudget: parseInt(settings.monthly_budget || '500000', 10),
    autoStop: settings.auto_stop_on_budget === 'true',
    testMode: settings.test_mode === 'true',
    autoOptimize: settings.auto_optimize_schedule === 'true',
  };
}

async function getMonthlySpend() {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('kmong_cpc_daily')
    .select('cpc_cost')
    .gte('date', monthStart);

  if (error) throw new Error(`CPC 조회 실패: ${error.message}`);
  return (data || []).reduce((sum, row) => sum + (row.cpc_cost || 0), 0);
}

async function getScheduleSlot(day, hour) {
  const { data, error } = await supabase
    .from('kmong_ad_schedule')
    .select('enabled, mode')
    .eq('day_of_week', day)
    .eq('hour', hour)
    .single();

  if (error || !data) return { enabled: false, mode: 'off' };
  return data;
}

async function setAllAds(action) {
  const results = [];
  for (const product of PRODUCT_MAP) {
    try {
      const result = await toggleAd(product.id, action);
      results.push({ id: product.id, ...result });
      console.log(`[광고 ${action.toUpperCase()}] ${product.id}: ${result.message}`);
    } catch (err) {
      console.error(`[광고 ${action.toUpperCase()} 실패] ${product.id}: ${err.message}`);
      results.push({ id: product.id, success: false, message: err.message });
    }
  }
  return results;
}

async function autoOptimize() {
  // 시간대별 성과에서 CTR > 평균 1.5배 + 클릭 10회 이상인 시간대 자동 ON
  const { data: perfData } = await supabase
    .from('kmong_hourly_performance')
    .select('hour, day_of_week, ctr, clicks')
    .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  if (!perfData || perfData.length < 10) {
    console.log('[자동최적화] 데이터 부족 (최소 10건 필요)');
    return;
  }

  // 시간대별 평균 CTR + 총 클릭
  const hourlyStats = {};
  for (const row of perfData) {
    const key = `${row.day_of_week}-${row.hour}`;
    if (!hourlyStats[key]) hourlyStats[key] = { ctrSum: 0, clickSum: 0, count: 0, day: row.day_of_week, hour: row.hour };
    hourlyStats[key].ctrSum += parseFloat(row.ctr || 0);
    hourlyStats[key].clickSum += (row.clicks || 0);
    hourlyStats[key].count++;
  }

  const allCtrs = Object.values(hourlyStats).map(s => s.ctrSum / s.count);
  const avgCtr = allCtrs.reduce((a, b) => a + b, 0) / allCtrs.length;
  const threshold = avgCtr * 1.5;

  let optimized = 0;
  for (const [key, stats] of Object.entries(hourlyStats)) {
    const slotCtr = stats.ctrSum / stats.count;
    if (slotCtr > threshold && stats.clickSum >= 10) {
      const { error } = await supabase
        .from('kmong_ad_schedule')
        .update({ enabled: true, mode: 'on', note: `자동최적화: CTR ${slotCtr.toFixed(2)}% > 평균 ${avgCtr.toFixed(2)}%` })
        .eq('day_of_week', stats.day)
        .eq('hour', stats.hour);

      if (!error) optimized++;
    }
  }

  if (optimized > 0) {
    console.log(`[자동최적화] ${optimized}개 시간대 ON 전환`);
    notify(`📊 광고 자동최적화: ${optimized}개 시간대 ON 전환 (CTR 기준)`);
  }
}

async function main() {
  const startTime = Date.now();

  try {
    console.log('=== 시간대별 광고 스케줄러 시작 ===');

    const kst = getKST();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    console.log(`[현재] ${kst.date} ${dayNames[kst.day]}요일 ${kst.hour}시 (KST)`);

    // 1. 설정 조회
    const settings = await getSettings();

    // 2. 예산 잔여 확인 — 10% 미만이면 무조건 OFF
    const totalSpend = await getMonthlySpend();
    const budgetRatio = totalSpend / settings.monthlyBudget;
    const budgetPct = (budgetRatio * 100).toFixed(1);
    console.log(`[예산] ₩${totalSpend.toLocaleString()} / ₩${settings.monthlyBudget.toLocaleString()} (${budgetPct}%)`);

    if (budgetRatio >= 0.9) {
      console.log('[예산] 90% 이상 소진 → 전체 광고 OFF');
      notify(`⛔ 스케줄러: 예산 ${budgetPct}% 소진 → 전체 광고 OFF`);
      await setAllAds('off');
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n=== 스케줄러 완료 (${elapsed}초) — 예산 초과 OFF ===`);
      return;
    }

    // 3. 자동 최적화 (설정 ON 시)
    if (settings.autoOptimize) {
      await autoOptimize();
    }

    // 4. 현재 시간대 스케줄 조회
    const slot = await getScheduleSlot(kst.day, kst.hour);
    console.log(`[스케줄] ${dayNames[kst.day]} ${kst.hour}시 → enabled=${slot.enabled}, mode=${slot.mode}`);

    // 5. 테스트 모드 처리
    if (slot.mode === 'test' && !settings.testMode) {
      console.log('[스킵] 테스트 슬롯이지만 test_mode=false');
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n=== 스케줄러 완료 (${elapsed}초) ===`);
      return;
    }

    // 6. 이전 상태와 비교 → 변경 시에만 Playwright 실행 (리소스 절약)
    const { data: prevState } = await supabase
      .from('kmong_settings')
      .select('value')
      .eq('key', 'last_ad_state')
      .single();

    const currentAction = slot.enabled ? 'on' : 'off';
    const prevAction = prevState?.value || 'unknown';

    if (currentAction === prevAction) {
      console.log(`[스킵] 상태 변경 없음 (${currentAction}) — 브라우저 미실행`);
    } else {
      console.log(`[실행] 광고 ${prevAction} → ${currentAction} (Playwright 실행)`);
      await setAllAds(currentAction);

      // 상태 저장
      await supabase
        .from('kmong_settings')
        .upsert({ key: 'last_ad_state', value: currentAction, updated_at: new Date().toISOString() }, { onConflict: 'key' });

      if (currentAction === 'on') {
        notify(`📢 스케줄러: ${dayNames[kst.day]} ${kst.hour}시 광고 ON (mode: ${slot.mode})`);
      } else {
        notify(`🔕 스케줄러: ${dayNames[kst.day]} ${kst.hour}시 광고 OFF`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 스케줄러 완료 (${elapsed}초) ===`);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`스케줄러 실패: ${err.message}`);
    process.exit(1);
  }
}

main();
