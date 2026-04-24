#!/usr/bin/env node
/**
 * 시간대별 광고 스케줄러
 * - 매 30분마다 PM2 크론으로 실행
 * - 현재 시간(KST) + 요일 기준으로 광고 ON/OFF 결정
 * - kmong_ad_schedule 테이블에서 해당 시간대/요일 조회
 * - 예산 초과 시 무조건 OFF (budget-monitor 연동)
 *
 * PM2 크론: 매 30분 실행
 */

const fs = require('fs');
const path = require('path');
const { supabase } = require('./lib/supabase');
const { toggleAd } = require('./toggle-ad');
const { PRODUCT_MAP } = require('./lib/product-map');
const { notifyTyped } = require('./lib/notify-filter');
const { isHourOff } = require('./lib/hourly-weights');

function getKST() {
  const now = new Date();
  const kstStr = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
  const kst = new Date(kstStr);
  return {
    hour: kst.getHours(),
    day: kst.getDay(), // 0=일, 6=토
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

  // ai_service_modes: 서비스별 자동/수동 + 전략 설정
  let serviceModes = {};
  try {
    if (settings.ai_service_modes) serviceModes = JSON.parse(settings.ai_service_modes);
  } catch(e) { /* 파싱 실패 시 빈 객체 */ }

  return {
    monthlyBudget: parseInt(settings.monthly_budget || '500000', 10),
    dailyBudget: parseInt(settings.daily_budget || '0', 10),
    weeklyBudget: parseInt(settings.weekly_budget || '0', 10),
    autoStop: settings.auto_stop_on_budget === 'true',
    testMode: settings.test_mode === 'true',
    autoOptimize: settings.auto_optimize_schedule === 'true',
    aiAutoManage: settings.ai_auto_manage === 'true',
    serviceModes,
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

async function getScheduleSlot(day, hour, productId) {
  // 1. 서비스별 레코드 조회
  const { data: specific } = await supabase
    .from('kmong_ad_schedule')
    .select('enabled, mode, product_id')
    .eq('day_of_week', day)
    .eq('hour', hour)
    .eq('product_id', productId)
    .single();

  if (specific) return specific;

  // 2. 폴백: product_id='all' 전체 설정
  const { data: fallback } = await supabase
    .from('kmong_ad_schedule')
    .select('enabled, mode, product_id')
    .eq('day_of_week', day)
    .eq('hour', hour)
    .eq('product_id', 'all')
    .single();

  if (fallback) return fallback;
  return { enabled: false, mode: 'off', product_id: 'all' };
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
        .eq('hour', stats.hour)
        .eq('product_id', 'all');

      if (!error) optimized++;
    }
  }

  if (optimized > 0) {
    console.log(`[자동최적화] ${optimized}개 시간대 ON 전환`);
    notifyTyped('toggle', `📊 광고 자동최적화: ${optimized}개 시간대 ON 전환 (CTR 기준)`);
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
      // 중복 알림 방지: 파일 기반 1시간 쿨다운 체크
      const alertFlagFile = path.join(__dirname, 'cookies', 'budget-alert-sent.json');
      let shouldAlert = true;
      try {
        const flag = JSON.parse(fs.readFileSync(alertFlagFile, 'utf-8'));
        const sentAt = new Date(flag.sentAt);
        if (Date.now() - sentAt.getTime() < 24 * 60 * 60 * 1000) {
          shouldAlert = false;
          console.log('[예산] 최근 24시간 내 이미 알림 전송 — 중복 스킵');
        }
      } catch {}
      if (shouldAlert) {
        notifyTyped('budget', `⛔ 스케줄러: 예산 ${budgetPct}% 소진 → 전체 광고 OFF`);
        fs.writeFileSync(alertFlagFile, JSON.stringify({ sentAt: new Date().toISOString() }));
      }
      // 예산 초과 시 광고 OFF는 6시간마다만 실행 (매 30분 실행은 리소스 낭비)
      const offFlagFile = path.join(__dirname, 'cookies', 'budget-off-executed.json');
      let shouldOff = true;
      try {
        const flag = JSON.parse(fs.readFileSync(offFlagFile, 'utf-8'));
        const execAt = new Date(flag.executedAt);
        if (Date.now() - execAt.getTime() < 6 * 60 * 60 * 1000) {
          shouldOff = false;
          console.log('[예산] 최근 6시간 내 이미 OFF 실행 — 스킵');
        }
      } catch {}
      if (shouldOff) {
        await setAllAds('off');
        fs.writeFileSync(offFlagFile, JSON.stringify({ executedAt: new Date().toISOString() }));
      }
      // 예산 초과 OFF 상태를 DB에 기록 → 다음 실행에서 재토글 방지
      for (const product of PRODUCT_MAP) {
        try {
          await supabase
            .from('kmong_settings')
            .upsert({ key: `last_ad_state_${product.id}`, value: 'off', updated_at: new Date().toISOString() }, { onConflict: 'key' });
        } catch {}
      }
      console.log('[예산] 전체 서비스 상태 DB에 off 기록 완료');
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n=== 스케줄러 완료 (${elapsed}초) — 예산 초과 OFF ===`);
      return;
    }

    // 3. AI 자동관리 체크
    console.log(`[AI] 자동관리: ${settings.aiAutoManage ? 'ON' : 'OFF'} | 자동최적화: ${settings.autoOptimize ? 'ON' : 'OFF'}`);

    // 4. 자동 최적화 (자동관리 ON 또는 자동최적화 ON 시)
    if (settings.aiAutoManage || settings.autoOptimize) {
      await autoOptimize();
    }

    // 5. 서비스별 개별 스케줄 조회 + 상태 비교
    const changedProducts = []; // 상태가 변경된 서비스만 수집

    for (const product of PRODUCT_MAP) {
      // AI 자동관리가 ON이고 해당 서비스가 수동모드이면 스킵
      const svcMode = settings.serviceModes[product.id];
      if (settings.aiAutoManage && svcMode && svcMode.auto === false) {
        console.log(`[스킵] ${product.id}: 수동모드 — AI 스케줄 제외`);
        continue;
      }

      const slot = await getScheduleSlot(kst.day, kst.hour, product.id);
      let currentAction = (slot.enabled && (slot.mode !== 'test' || settings.testMode)) ? 'on' : 'off';

      // AI 자동관리 + 전략별 시간대 보정
      if (settings.aiAutoManage && svcMode) {
        const strategy = svcMode.strategy || 'balanced';
        // 절약 모드: 비핵심 시간대(0-7시, 22-24시) 자동 OFF
        if (strategy === 'saving' && (kst.hour < 8 || kst.hour >= 22)) {
          currentAction = 'off';
          console.log(`[전략] ${product.id}: 절약모드 → 비핵심시간 OFF`);
        }
        // 방어 모드: 새벽(0-6시) OFF
        if (strategy === 'defense' && kst.hour < 6) {
          currentAction = 'off';
          console.log(`[전략] ${product.id}: 방어모드 → 새벽시간 OFF`);
        }
        // 공격 모드: 스케줄 OFF여도 피크시간(9-12, 14-18)에 강제 ON
        if (strategy === 'attack' && ((kst.hour >= 9 && kst.hour <= 12) || (kst.hour >= 14 && kst.hour <= 18))) {
          currentAction = 'on';
          console.log(`[전략] ${product.id}: 공격모드 → 피크시간 강제 ON`);
        }
      }

      // 시간대 weight=0 강제 OFF (hourly-cvr-analyzer.js가 결정)
      // Why: 새벽/저CVR 시간대 예산 낭비 차단. 사용자 결정 (2026-04-24).
      // strategy attack의 강제 ON보다 우선 — 실데이터로 학습된 OFF가 우선순위 최상
      try {
        if (await isHourOff(kst.hour)) {
          currentAction = 'off';
          console.log(`[weight] ${product.id}: 저CVR 시간대(${kst.hour}시) 강제 OFF`);
        }
      } catch (e) { /* hourly_weights 조회 실패 시 무시 */ }

      // 서비스별 이전 상태 조회
      const stateKey = `last_ad_state_${product.id}`;
      const { data: prevState } = await supabase
        .from('kmong_settings')
        .select('value')
        .eq('key', stateKey)
        .single();

      const prevAction = prevState?.value || 'unknown';
      const strategyLabel = (svcMode?.strategy || 'balanced').toUpperCase();

      console.log(`[스케줄] ${product.id}: ${dayNames[kst.day]} ${kst.hour}시 → ${currentAction} (이전: ${prevAction}, 전략: ${strategyLabel}, source: ${slot.product_id})`);

      if (currentAction !== prevAction) {
        changedProducts.push({ id: product.id, action: currentAction, mode: slot.mode, stateKey });
      }
    }

    // 5. 변경된 서비스만 Playwright 실행 (1세션으로 순차 처리)
    if (changedProducts.length === 0) {
      console.log('[스킵] 전체 서비스 상태 변경 없음 — 브라우저 미실행');
    } else {
      console.log(`[실행] ${changedProducts.length}개 서비스 상태 변경 (Playwright 실행)`);
      for (const cp of changedProducts) {
        try {
          const result = await toggleAd(cp.id, cp.action);
          console.log(`[광고 ${cp.action.toUpperCase()}] ${cp.id}: ${result.message}`);
        } catch (err) {
          console.error(`[광고 ${cp.action.toUpperCase()} 실패] ${cp.id}: ${err.message}`);
        }

        // 서비스별 상태 저장
        try {
          await supabase
            .from('kmong_settings')
            .upsert({ key: cp.stateKey, value: cp.action, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        } catch {}
      }

      const onList = changedProducts.filter(p => p.action === 'on').map(p => p.id);
      const offList = changedProducts.filter(p => p.action === 'off').map(p => p.id);
      let msg = `스케줄러 ${dayNames[kst.day]} ${kst.hour}시:`;
      if (onList.length > 0) msg += ` ON[${onList.join(',')}]`;
      if (offList.length > 0) msg += ` OFF[${offList.join(',')}]`;
      notifyTyped('toggle', msg);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 스케줄러 완료 (${elapsed}초) ===`);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notifyTyped('error', `스케줄러 실패: ${err.message}`);
    process.exit(1);
  }
}

main();
