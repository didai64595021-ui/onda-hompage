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

const { supabase } = require('./lib/supabase');
const { toggleAd } = require('./toggle-ad');
const { PRODUCT_MAP } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

function getMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
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
    alertThreshold: parseFloat(settings.budget_alert_threshold || '0.9'),
    autoStop: settings.auto_stop_on_budget === 'true',
  };
}

async function getMonthlySpend() {
  const monthStart = getMonthStart();

  const { data, error } = await supabase
    .from('kmong_cpc_daily')
    .select('cpc_cost')
    .gte('date', monthStart);

  if (error) throw new Error(`CPC 조회 실패: ${error.message}`);

  return (data || []).reduce((sum, row) => sum + (row.cpc_cost || 0), 0);
}

async function stopAllAds() {
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
  return results;
}

async function main() {
  const startTime = Date.now();

  try {
    console.log('=== 월간 광고 지출 모니터 시작 ===');

    const settings = await getSettings();
    const totalSpend = await getMonthlySpend();
    const ratio = totalSpend / settings.monthlyBudget;
    const pct = (ratio * 100).toFixed(1);

    const fmt = n => n.toLocaleString('ko-KR');
    console.log(`[예산] 한도: ₩${fmt(settings.monthlyBudget)} | 지출: ₩${fmt(totalSpend)} (${pct}%)`);
    console.log(`[설정] 경고 임계치: ${(settings.alertThreshold * 100).toFixed(0)}% | 자동정지: ${settings.autoStop ? 'ON' : 'OFF'}`);

    // 100% 초과 → 자동 정지
    if (ratio >= 1.0) {
      const msg = `🚨 월간 광고비 한도 초과!\n지출: ₩${fmt(totalSpend)} / 한도: ₩${fmt(settings.monthlyBudget)} (${pct}%)`;
      notify(msg);

      if (settings.autoStop) {
        console.log('[자동정지] 전체 광고 OFF 실행...');
        notify('⛔ 예산 초과 → 전체 광고 자동 OFF 실행 중...');
        await stopAllAds();
        notify('✅ 전체 광고 OFF 완료 (예산 초과 자동정지)');
      } else {
        console.log('[정보] 자동정지 OFF — 수동 처리 필요');
      }
    }
    // 90% (임계치) 초과 → 경고
    else if (ratio >= settings.alertThreshold) {
      const remaining = settings.monthlyBudget - totalSpend;
      const msg = `⚠️ 월간 광고비 ${pct}% 도달!\n지출: ₩${fmt(totalSpend)} / 한도: ₩${fmt(settings.monthlyBudget)}\n잔여: ₩${fmt(remaining)}`;
      notify(msg);
    }
    // 정상 범위
    else {
      console.log(`[정상] 예산 범위 내 (${pct}%)`);
    }

    // 테스트 모드 자동 전환
    const now = new Date();
    const dayOfMonth = now.getDate();
    const isSecondHalf = dayOfMonth >= 15;

    if (ratio < 0.5 && isSecondHalf) {
      // 잔여 > 50% + 월 하반기 → 테스트 모드 ON
      await supabase.from('kmong_settings').upsert({ key: 'test_mode', value: 'true' }, { onConflict: 'key' });
      console.log(`[테스트모드] ON — 예산 여유(${pct}%) + 월 하반기`);
    } else if (ratio >= 0.9) {
      // 잔여 < 10% → 테스트 모드 OFF + 테스트 시간대 전부 OFF
      await supabase.from('kmong_settings').upsert({ key: 'test_mode', value: 'false' }, { onConflict: 'key' });
      await supabase.from('kmong_ad_schedule').update({ enabled: false, mode: 'off' }).eq('mode', 'test');
      console.log(`[테스트모드] OFF — 예산 부족(${pct}%), 테스트 슬롯 전부 OFF`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 예산 모니터 완료 (${elapsed}초) ===`);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`예산 모니터 실패: ${err.message}`);
    process.exit(1);
  }
}

main();
