#!/usr/bin/env node
/**
 * 월간 광고 지출 한도 모니터
 * - 이번 달 누적 CPC 비용 합산
 * - kmong_settings에서 한도/임계치/자동정지 설정 조회
 * - 90% 초과 → 텔레그램 경고
 * - 100% 초과 + auto_stop → 전체 광고 OFF
 *
 * PM2 크론: 매 2시간 (0 xx/2 xx xx xx)
 */

const fs = require('fs');
const path = require('path');
const { supabase } = require('./lib/supabase');
const { toggleAd } = require('./toggle-ad');
const { PRODUCT_MAP } = require('./lib/product-map');
const { notifyTyped } = require('./lib/notify-filter');
const notify = (m) => notifyTyped('budget', m); // 이 파일의 모든 notify 호출은 예산 관련

// 월 시작 — 기본은 매월 1일. settings.monthly_anchor_date 가 정의되어 있고
// "현재 월 안의 날짜"이면 그 날짜를 우선 사용 (사용자 사이클 변경 시 1회성 anchor용).
// 다음 달 1일이 되면 anchor가 과거가 되므로 자동으로 default(매월 1일)로 복귀.
function getMonthStart(monthlyAnchorDate) {
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  if (monthlyAnchorDate && /^\d{4}-\d{2}-\d{2}$/.test(monthlyAnchorDate)) {
    // anchor가 default(이번 달 1일) 이후면 그걸 사용
    if (monthlyAnchorDate >= defaultStart) return monthlyAnchorDate;
  }
  return defaultStart;
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
    dailyBudget: parseInt(settings.daily_budget || '0', 10),
    weeklyBudget: parseInt(settings.weekly_budget || '0', 10),
    monthlyBudget: parseInt(settings.monthly_budget || '500000', 10),
    monthlyAnchorDate: settings.monthly_anchor_date || null,
    // 서비스당 일일 한도 (단일 서비스 폭발 방지, 2026-04-29 신설 — corp-seo 4/27 ₩35,940 사건)
    dailyBudgetPerService: parseInt(settings.daily_budget_per_service || '0', 10),
    alertThreshold: parseFloat(settings.budget_alert_threshold || '0.9'),
    autoStop: settings.auto_stop_on_budget === 'true',
    aiAutoManage: settings.ai_auto_manage === 'true',
    serviceModes,
  };
}

async function getMonthlySpend(monthlyAnchorDate) {
  const monthStart = getMonthStart(monthlyAnchorDate);

  const { data, error } = await supabase
    .from('kmong_cpc_daily')
    .select('cpc_cost')
    .gte('date', monthStart);

  if (error) throw new Error(`CPC 조회 실패: ${error.message}`);

  return (data || []).reduce((sum, row) => sum + (row.cpc_cost || 0), 0);
}

function getToday() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getWeekStart() {
  // 월~일 주간 (KST). 월요일 00:00 KST에 reset.
  // Why: 사용자 요청 (2026-05-01) — 토~금 → 월~일 사이클로 변경
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const day = kst.getUTCDay(); // 0=일, 1=월, ..., 6=토
  const daysFromMon = day === 0 ? 6 : day - 1; // 월=0, 화=1, ..., 일=6
  const weekStart = new Date(kst);
  weekStart.setUTCDate(kst.getUTCDate() - daysFromMon);
  return weekStart.toISOString().split('T')[0];
}

// 2026-05-06: 일간 실지출 = 비즈머니 일별 사용액 (실시간 크롤 ground-truth)
//   kmong_cpc_daily는 야간 2회만 수집되어 하루 중 한도 초과 못 잡음 → kmong_bizmoney_daily_spend 우선
async function getDailySpend() {
  const today = getToday();
  // 1순위: kmong_bizmoney_daily_spend (매시간 크롤, 실시간 ground-truth)
  const { data: biz } = await supabase
    .from('kmong_bizmoney_daily_spend')
    .select('spent')
    .eq('date', today)
    .maybeSingle();
  if (biz && biz.spent != null) return biz.spent;
  // Fallback: kmong_cpc_daily (야간 2회만 수집, 미수집 시 0)
  const { data, error } = await supabase
    .from('kmong_cpc_daily')
    .select('cpc_cost')
    .eq('date', today);
  if (error) throw new Error(`일간 CPC 조회 실패: ${error.message}`);
  return (data || []).reduce((sum, row) => sum + (row.cpc_cost || 0), 0);
}

async function getWeeklySpend() {
  const weekStart = getWeekStart();
  // 2026-05-06: 비즈머니 ground-truth 우선 (실시간), kmong_cpc_daily fallback
  const { data: biz } = await supabase
    .from('kmong_bizmoney_daily_spend')
    .select('spent')
    .gte('date', weekStart);
  if (biz && biz.length) {
    return biz.reduce((sum, r) => sum + (r.spent || 0), 0);
  }
  const { data, error } = await supabase
    .from('kmong_cpc_daily')
    .select('cpc_cost')
    .gte('date', weekStart);
  if (error) throw new Error(`주간 CPC 조회 실패: ${error.message}`);
  return (data || []).reduce((sum, row) => sum + (row.cpc_cost || 0), 0);
}

// 서비스별 오늘 지출 (단일 서비스 폭발 방지용, 2026-04-29 신설)
async function getServiceDailySpend() {
  const today = getToday();
  const { data, error } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, cpc_cost')
    .eq('date', today);
  if (error) throw new Error(`서비스별 일간 CPC 조회 실패: ${error.message}`);
  const spendByService = {};
  for (const row of (data || [])) {
    spendByService[row.product_id] = (spendByService[row.product_id] || 0) + (row.cpc_cost || 0);
  }
  return spendByService;
}

async function getServiceSpendAndPerformance(monthlyAnchorDate) {
  const monthStart = getMonthStart(monthlyAnchorDate);
  const { data: cpcData, error } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, cpc_cost, ctr, clicks, impressions')
    .gte('date', monthStart);
  if (error) throw new Error(`서비스별 CPC 조회 실패: ${error.message}`);

  const { data: roiData } = await supabase
    .from('kmong_roi_analysis')
    .select('product_id, roi_pct, revenue, cost')
    .order('period_end', { ascending: false })
    .limit(50);

  // 서비스별 집계
  const stats = {};
  for (const row of (cpcData || [])) {
    if (!stats[row.product_id]) {
      stats[row.product_id] = { spend: 0, ctrSum: 0, clicks: 0, impressions: 0, count: 0, roi: 0 };
    }
    stats[row.product_id].spend += (row.cpc_cost || 0);
    stats[row.product_id].ctrSum += parseFloat(row.ctr || 0);
    stats[row.product_id].clicks += (row.clicks || 0);
    stats[row.product_id].impressions += (row.impressions || 0);
    stats[row.product_id].count++;
  }

  // ROI 매핑
  for (const roi of (roiData || [])) {
    if (stats[roi.product_id]) {
      stats[roi.product_id].roi = roi.roi_pct || 0;
    }
  }

  // 평균 CTR 계산
  for (const [pid, s] of Object.entries(stats)) {
    s.avgCtr = s.count > 0 ? s.ctrSum / s.count : 0;
  }

  return stats;
}

async function distributeBudget(settings, totalSpend) {
  if (!settings.aiAutoManage) return;

  const stats = await getServiceSpendAndPerformance(settings.monthlyAnchorDate);
  const serviceIds = Object.keys(stats);
  if (serviceIds.length === 0) {
    console.log('[예산분배] 서비스별 데이터 없음 — 분배 스킵');
    return;
  }

  const remainingBudget = settings.monthlyBudget - totalSpend;
  if (remainingBudget <= 0) {
    console.log('[예산분배] 잔여 예산 없음');
    return;
  }

  // ROI 기반 가중치 계산 (ROI가 높을수록 더 많은 예산)
  let totalWeight = 0;
  const weights = {};
  for (const [pid, s] of Object.entries(stats)) {
    const svcMode = settings.serviceModes[pid];
    // 수동모드 서비스 제외
    if (svcMode && svcMode.auto === false) continue;

    // ROI 가중치 (최소 0.5, 최대 3.0)
    let roiWeight = Math.max(0.5, Math.min(3.0, (s.roi || 50) / 100));

    // CTR 보정: CTR < 1%이면 감축 (가중치 * 0.5)
    if (s.avgCtr < 1) roiWeight *= 0.5;
    // CTR > 5%이면 보너스 (가중치 * 1.3)
    else if (s.avgCtr > 5) roiWeight *= 1.3;

    // 전략별 보정
    const strategy = svcMode?.strategy || 'balanced';
    if (strategy === 'attack') roiWeight *= 1.5;
    else if (strategy === 'saving') roiWeight *= 0.6;
    else if (strategy === 'defense') roiWeight *= 0.8;

    weights[pid] = roiWeight;
    totalWeight += roiWeight;
  }

  if (totalWeight === 0) return;

  // 서비스별 예산 할당
  const allocations = {};
  for (const [pid, weight] of Object.entries(weights)) {
    const allocation = Math.round(remainingBudget * (weight / totalWeight));
    allocations[pid] = allocation;
    const s = stats[pid];
    console.log(`[예산분배] ${pid}: ₩${allocation.toLocaleString()} (ROI:${(s.roi||0).toFixed(0)}% CTR:${(s.avgCtr||0).toFixed(1)}% 가중:${weight.toFixed(2)})`);
  }

  // Supabase에 분배 결과 저장
  await supabase.from('kmong_settings').upsert(
    { key: 'budget_allocation', value: JSON.stringify(allocations), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );

  // CTR 기반 자동 OFF: CTR < 0.5%이고 충분한 노출(100+) 있는 서비스 경고
  const lowPerformers = [];
  for (const [pid, s] of Object.entries(stats)) {
    if (s.avgCtr < 0.5 && s.impressions > 100) {
      lowPerformers.push(`${pid}(CTR:${s.avgCtr.toFixed(2)}%)`);
    }
  }
  if (lowPerformers.length > 0) {
    const msg = `⚠️ 저효율 서비스 감지: ${lowPerformers.join(', ')} — 예산 감축 적용됨`;
    console.log(`[예산분배] ${msg}`);
    notify(msg);
  }

  return allocations;
}

async function stopAllAds() {
  // 6시간 쿨다운: 이미 최근 OFF 실행했으면 스킵 (매 2시간 Playwright 14회 로그인 방지)
  const offFlagFile = path.join(__dirname, 'cookies', 'budget-off-executed.json');
  try {
    const flag = JSON.parse(fs.readFileSync(offFlagFile, 'utf-8'));
    const execAt = new Date(flag.executedAt);
    if (Date.now() - execAt.getTime() < 6 * 60 * 60 * 1000) {
      console.log('[예산] 최근 6시간 내 이미 OFF 실행 — 스킵');
      return [];
    }
  } catch {}

  const results = [];
  for (const product of PRODUCT_MAP) {
    try {
      const result = await toggleAd(product.id, 'off');
      results.push({ id: product.id, ...result });
      console.log(`[광고 OFF] ${product.id}: ${result.message}`);
    } catch (err) {
      console.error(`[광고 OFF 실패] ${product.id}: ${err.message}`);
      results.push({ id: product.id, success: false, message: err.message });
    }
  }
  fs.writeFileSync(offFlagFile, JSON.stringify({ executedAt: new Date().toISOString() }));
  return results;
}

// 비즈머니 잔액 < 임계치 시 텔레그램 알림 (2026-05-02 신설)
// 사용자 부재 시 충전 잊으면 광고 ON 거부 → 매출 손실. 자동 조기 경보.
const BIZMONEY_LOW_THRESHOLD = 100000;     // ₩100K 미만 → 경고
const BIZMONEY_CRITICAL_THRESHOLD = 50000; // ₩50K 미만 → 긴급
const BIZMONEY_ALERT_LOG = path.join(__dirname, 'cookies', 'bizmoney-alert-log.json');

async function checkBizmoneyAlert() {
  try {
    const { data } = await supabase
      .from('kmong_daily_analysis')
      .select('date, bizmoney_balance')
      .not('bizmoney_balance', 'is', null)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || data.bizmoney_balance == null) return;
    const balance = data.bizmoney_balance;

    // 6시간 내 같은 레벨 알림은 스킵 (스팸 방지)
    let lastLog = {};
    try { lastLog = JSON.parse(fs.readFileSync(BIZMONEY_ALERT_LOG, 'utf-8')); } catch {}
    const level = balance < BIZMONEY_CRITICAL_THRESHOLD ? 'critical'
                : balance < BIZMONEY_LOW_THRESHOLD ? 'low'
                : 'ok';
    if (level === 'ok') return;
    const lastTime = lastLog[level] ? new Date(lastLog[level]).getTime() : 0;
    if (Date.now() - lastTime < 6 * 60 * 60 * 1000) return;

    const fmt = n => n.toLocaleString('ko-KR');
    const msg = level === 'critical'
      ? `🚨 비즈머니 잔액 ₩${fmt(balance)} (긴급) — 광고 ON 거부 임박, 즉시 충전 필요\nhttps://kmong.com/seller/bizmoney`
      : `⚠️ 비즈머니 잔액 ₩${fmt(balance)} (₩${fmt(BIZMONEY_LOW_THRESHOLD)} 미만) — 충전 권장\nhttps://kmong.com/seller/bizmoney`;
    notifyTyped('budget', msg);
    lastLog[level] = new Date().toISOString();
    try { fs.writeFileSync(BIZMONEY_ALERT_LOG, JSON.stringify(lastLog, null, 2)); } catch {}
  } catch (e) {
    console.error('[비즈머니 알림 체크 실패]', e.message);
  }
}

async function main() {
  const startTime = Date.now();

  try {
    console.log('=== 광고 지출 모니터 시작 ===');

    const settings = await getSettings();
    const fmt = n => n.toLocaleString('ko-KR');

    // 비즈머니 잔액 조기 경보 (2026-05-02 신설)
    await checkBizmoneyAlert();

    // 일/주/월 지출 조회 (monthly_anchor_date 적용 — 사용자 사이클 anchor 1회성 우선)
    const [dailySpend, weeklySpend, monthlySpend] = await Promise.all([
      getDailySpend(),
      getWeeklySpend(),
      getMonthlySpend(settings.monthlyAnchorDate),
    ]);

    console.log(`[설정] AI 자동관리: ${settings.aiAutoManage ? 'ON' : 'OFF'} | 자동정지: ${settings.autoStop ? 'ON' : 'OFF'}`);
    console.log(`[예산] 일: ₩${fmt(dailySpend)} / ₩${fmt(settings.dailyBudget)} | 주: ₩${fmt(weeklySpend)} / ₩${fmt(settings.weeklyBudget)} | 월: ₩${fmt(monthlySpend)} / ₩${fmt(settings.monthlyBudget)}`);

    const monthlyRatio = settings.monthlyBudget > 0 ? monthlySpend / settings.monthlyBudget : 0;
    const monthlyPct = (monthlyRatio * 100).toFixed(1);

    // === 일간 예산 체크 ===
    if (settings.dailyBudget > 0) {
      const dailyRatio = dailySpend / settings.dailyBudget;
      const dailyPct = (dailyRatio * 100).toFixed(1);
      if (dailyRatio >= 1.0) {
        const msg = `🚨 일간 광고비 한도 초과!\n지출: ₩${fmt(dailySpend)} / 한도: ₩${fmt(settings.dailyBudget)} (${dailyPct}%)`;
        notify(msg);
        if (settings.autoStop || settings.aiAutoManage) {
          console.log('[자동정지] 일간 예산 초과 → 전체 광고 OFF');
          notify('⛔ 일간 예산 초과 → 전체 광고 자동 OFF');
          await stopAllAds();
        }
      } else if (dailyRatio >= settings.alertThreshold) {
        notify(`⚠️ 일간 광고비 ${dailyPct}% 도달 (₩${fmt(dailySpend)} / ₩${fmt(settings.dailyBudget)})`);
      }
    }

    // === 서비스별 일일 한도 체크 (단일 서비스 폭발 방지, 2026-04-29 신설) ===
    // 배경: 4/27 corp-seo 단독 ₩35,940 폭발 (전체 51%) → 서비스당 한도 도입
    if (settings.dailyBudgetPerService > 0) {
      const serviceDailySpend = await getServiceDailySpend();
      const offenders = Object.entries(serviceDailySpend)
        .filter(([, spend]) => spend >= settings.dailyBudgetPerService)
        .map(([pid, spend]) => ({ pid, spend }));
      if (offenders.length > 0) {
        const limitFmt = fmt(settings.dailyBudgetPerService);
        const lines = offenders.map(o => `  - ${o.pid}: ₩${fmt(o.spend)}`);
        notify(`🚨 서비스별 일일 한도 ₩${limitFmt} 초과 → 자동 OFF\n${lines.join('\n')}`);
        for (const { pid } of offenders) {
          try {
            const result = await toggleAd(pid, 'off');
            console.log(`[한도초과 OFF] ${pid}: ${result?.message || 'done'}`);
          } catch (err) {
            console.error(`[한도초과 OFF 실패] ${pid}: ${err.message}`);
          }
        }
      } else {
        const top = Object.entries(serviceDailySpend).sort((a, b) => b[1] - a[1])[0];
        if (top) console.log(`[정상] 서비스별 한도 ₩${fmt(settings.dailyBudgetPerService)} 내 (최고: ${top[0]} ₩${fmt(top[1])})`);
      }
    }

    // === 주간 예산 체크 ===
    if (settings.weeklyBudget > 0) {
      const weeklyRatio = weeklySpend / settings.weeklyBudget;
      const weeklyPct = (weeklyRatio * 100).toFixed(1);
      if (weeklyRatio >= 1.0) {
        const msg = `🚨 주간 광고비 한도 초과!\n지출: ₩${fmt(weeklySpend)} / 한도: ₩${fmt(settings.weeklyBudget)} (${weeklyPct}%)`;
        notify(msg);
        if (settings.autoStop || settings.aiAutoManage) {
          console.log('[자동정지] 주간 예산 초과 → 전체 광고 OFF');
          notify('⛔ 주간 예산 초과 → 전체 광고 자동 OFF');
          await stopAllAds();
        }
      } else if (weeklyRatio >= settings.alertThreshold) {
        notify(`⚠️ 주간 광고비 ${weeklyPct}% 도달 (₩${fmt(weeklySpend)} / ₩${fmt(settings.weeklyBudget)})`);
      }
    }

    // === 월간 예산 체크 ===
    // 알림은 ad-scheduler에서만 발송 (budget-monitor는 stopAllAds만 처리, race condition 방지)
    if (monthlyRatio >= 1.0) {
      console.log(`[예산] 월간 ${monthlyPct}% 소진 — ad-scheduler가 알림 담당, 여기서는 OFF만 처리`);
      if (settings.autoStop) {
        console.log('[자동정지] 전체 광고 OFF 실행...');
        await stopAllAds();
        console.log('[자동정지] 전체 광고 OFF 완료');
      } else {
        console.log('[정보] 자동정지 OFF — 수동 처리 필요');
      }
    } else if (monthlyRatio >= settings.alertThreshold) {
      const remaining = settings.monthlyBudget - monthlySpend;
      const msg = `⚠️ 월간 광고비 ${monthlyPct}% 도달!\n지출: ₩${fmt(monthlySpend)} / 한도: ₩${fmt(settings.monthlyBudget)}\n잔여: ₩${fmt(remaining)}`;
      notify(msg);
    } else {
      console.log(`[정상] 월간 예산 범위 내 (${monthlyPct}%)`);
    }

    // === ROI/CTR 기반 예산 분배 (AI 자동관리 ON 시) ===
    if (settings.aiAutoManage) {
      console.log('[예산분배] ROI/CTR 기반 서비스별 예산 분배 실행...');
      await distributeBudget(settings, monthlySpend);
    }

    // 테스트 모드 자동 전환
    const now = new Date();
    const dayOfMonth = now.getDate();
    const isSecondHalf = dayOfMonth >= 15;

    if (monthlyRatio < 0.5 && isSecondHalf) {
      await supabase.from('kmong_settings').upsert({ key: 'test_mode', value: 'true' }, { onConflict: 'key' });
      console.log(`[테스트모드] ON — 예산 여유(${monthlyPct}%) + 월 하반기`);
    } else if (monthlyRatio >= 0.9) {
      await supabase.from('kmong_settings').upsert({ key: 'test_mode', value: 'false' }, { onConflict: 'key' });
      await supabase.from('kmong_ad_schedule').update({ enabled: false, mode: 'off' }).eq('mode', 'test');
      console.log(`[테스트모드] OFF — 예산 부족(${monthlyPct}%), 테스트 슬롯 전부 OFF`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 예산 모니터 완료 (${elapsed}초) ===`);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notifyTyped('error', `예산 모니터 실패: ${err.message}`);
    process.exit(1);
  }
}

main();
