/**
 * CPC 사이클 자동학습 피드백
 *
 * 구조: 기존 kmong_ad_bot_actions 테이블 재활용 (신규 테이블 X)
 *   - action_type='adjust_cpc_4h' 필터
 *   - before_state.desired_cpc / kst_hour / hour_weight
 *   - after_state.desired_cpc / change_pct
 *   - result_metrics: 4시간 후 실측 (이번 모듈이 평가해서 채움)
 *
 * 흐름:
 *   1) 매 4시간 사이클 시작 → evaluatePreviousCycle()
 *      직전 4시간 사이클 row들을 찾아 result_metrics 채움 (해당 기간 cpc_daily)
 *   2) loadRecentLearning(hour) → Opus에 "지난 7일 동일 시간대 학습 기록" 주입
 *   3) Opus가 "지난번 이 시간대에 +25% 했더니 비용만 늘고 문의 안 늘었음" 판단 가능
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase } = require('./supabase');

const ACTION_TYPE = 'adjust_cpc_4h';

/**
 * 직전 4시간 사이클의 결과를 측정해 result_metrics 업데이트
 * "이 사이클에서 CPC 조정한 결과, 다음 4시간 동안 노출/클릭/비용이 어떻게 변했나"
 */
async function evaluatePreviousCycle() {
  const now = new Date();
  // 4~8시간 전 사이클 row 조회 (이번 사이클은 4시간 전 사이클의 '4시간 후' 시점)
  const from = new Date(now.getTime() - 8 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() - 3.5 * 3600 * 1000).toISOString();

  const { data: prevCycles } = await supabase
    .from('kmong_ad_bot_actions')
    .select('id, product_id, created_at, before_state, after_state, result_metrics')
    .eq('action_type', ACTION_TYPE)
    .is('result_evaluated_at', null)
    .gte('created_at', from)
    .lte('created_at', to);

  if (!prevCycles || prevCycles.length === 0) return { evaluated: 0 };

  // 오늘+어제 cpc_daily 로드 (시간 단위 데이터 없어 일 단위 proxy)
  const today = now.toISOString().slice(0, 10);
  const yest = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: cpcRows } = await supabase
    .from('kmong_cpc_daily')
    .select('product_id, date, impressions, clicks, cpc_cost')
    .in('date', [today, yest]);

  const cpcByPid = {};
  for (const r of cpcRows || []) {
    if (!cpcByPid[r.product_id]) cpcByPid[r.product_id] = [];
    cpcByPid[r.product_id].push(r);
  }

  let evaluated = 0;
  for (const cycle of prevCycles) {
    const rows = cpcByPid[cycle.product_id] || [];
    const totalImp = rows.reduce((a, r) => a + (r.impressions || 0), 0);
    const totalClk = rows.reduce((a, r) => a + (r.clicks || 0), 0);
    const totalCost = rows.reduce((a, r) => a + (r.cpc_cost || 0), 0);
    const result = {
      evaluated_window: '~24h-proxy',
      impressions: totalImp,
      clicks: totalClk,
      cpc_cost: totalCost,
      ctr: totalImp > 0 ? +(totalClk / totalImp * 100).toFixed(2) : null,
      note: 'cpc_daily 일단위 proxy (시간 단위 데이터 부재)',
    };
    await supabase
      .from('kmong_ad_bot_actions')
      .update({ result_metrics: result, result_evaluated_at: new Date().toISOString() })
      .eq('id', cycle.id);
    evaluated += 1;
  }
  return { evaluated, total: prevCycles.length };
}

/**
 * 지난 7일간 "동일 KST 시간대" 조정 기록 로드
 * Opus 프롬프트에 주입 → "이 시간대에 지난번 이렇게 했더니 이런 결과" 학습
 */
async function loadRecentLearning(currentKstHour, days = 7) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('kmong_ad_bot_actions')
    .select('product_id, created_at, before_state, after_state, result_metrics')
    .eq('action_type', ACTION_TYPE)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!data) return [];
  return data
    .filter(r => r.before_state?.kst_hour === currentKstHour)
    .map(r => ({
      at: r.created_at,
      product_id: r.product_id,
      hour: r.before_state?.kst_hour,
      weight: r.before_state?.hour_weight,
      cpc_before: r.before_state?.desired_cpc,
      cpc_after: r.after_state?.desired_cpc,
      change_pct: r.after_state?.change_pct,
      next_ctr: r.result_metrics?.ctr,
      next_clicks: r.result_metrics?.clicks,
      next_cost: r.result_metrics?.cpc_cost,
    }))
    .slice(0, 30);
}

module.exports = { evaluatePreviousCycle, loadRecentLearning, ACTION_TYPE };
