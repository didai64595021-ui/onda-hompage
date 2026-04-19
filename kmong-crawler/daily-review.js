#!/usr/bin/env node
/**
 * 일일 자가 심의 봇 — 매일 08:30 크론
 * Claude 분신 2명 (분석가 + 비판검토) 대화 → 최종 결정 → 자동 조치
 *
 * 결정별 자동 조치:
 *   hold           → 텔레그램 요약만
 *   re_run_ad_bot  → ad-bot-run.js --apply 즉시 실행
 *   raise_budget   → kmong_ad_budget 업데이트 (target value)
 *   lower_budget   → kmong_ad_budget 업데이트 (신중)
 *   pause_product  → toggle-ad.js <id> off (심각한 경우만)
 *   alert_only     → 텔레그램 강조 알림, 조치 X (사람 판단 필요)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { spawn } = require('child_process');
const { supabase } = require('./lib/supabase');
const { notifyTyped } = require('./lib/notify-filter');
const { loadServiceMetrics, loadActiveBudget } = require('./lib/ad-bot-metrics');
const { runDailyReview } = require('./lib/daily-review-judge');

async function loadRecentActions(days = 7) {
  const since = new Date(); since.setDate(since.getDate() - days);
  const { data } = await supabase.from('kmong_ad_bot_actions')
    .select('product_id, action_type, action_date, after_state, reasoning, applied')
    .gte('action_date', since.toISOString().slice(0, 10))
    .order('action_date', { ascending: false });
  return data || [];
}

async function applyDecision(decision) {
  const { action, target, value, reason } = decision;
  const log = { action, target, value, reason, at: new Date().toISOString() };

  if (action === 'hold' || action === 'alert_only') return { executed: false, log };

  if (action === 're_run_ad_bot') {
    spawn('node', ['ad-bot-run.js', '--apply'], {
      cwd: __dirname, detached: true, stdio: 'ignore', env: process.env,
    }).unref();
    return { executed: true, log };
  }

  if (action === 'raise_budget' || action === 'lower_budget') {
    if (!value || value <= 0) return { executed: false, log: { ...log, skipped: 'invalid_value' } };
    const { data: row } = await supabase.from('kmong_ad_budget').select('*').eq('active', true).limit(1).maybeSingle();
    if (!row) return { executed: false, log: { ...log, skipped: 'no_budget_row' } };
    const { error } = await supabase.from('kmong_ad_budget').update({
      budget_amount: value,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    return { executed: !error, log: { ...log, prev: row.budget_amount, new: value, error: error?.message } };
  }

  if (action === 'pause_product') {
    if (!target) return { executed: false, log: { ...log, skipped: 'no_target' } };
    spawn('node', ['toggle-ad.js', target, 'off'], {
      cwd: __dirname, detached: true, stdio: 'ignore', env: process.env,
    }).unref();
    return { executed: true, log };
  }

  return { executed: false, log: { ...log, skipped: 'unknown_action' } };
}

async function main() {
  const start = Date.now();
  console.log('=== 일일 자가 심의 시작 ===');

  const metrics = await loadServiceMetrics(30);
  if (!metrics.length) { console.log('[중단] 메트릭 없음'); return; }

  // 객단가 / 매출 파생 지표 추가 (Opus 판단 재료)
  for (const m of metrics) {
    m.avg_order_value_30d = m.orders_30d > 0 ? Math.round(m.revenue_30d / m.orders_30d) : 0;
    m.cost_per_order_30d = m.orders_30d > 0 ? Math.round(m.cost_30d / m.orders_30d) : null;
    m.net_profit_30d = m.revenue_30d - m.cost_30d;
  }

  const budgetRows = await loadActiveBudget();
  const budget = budgetRows[0] || { budget_type: 'weekly', budget_amount: 100000 };
  const recentActions = await loadRecentActions(7);

  const r = await runDailyReview({ metrics, budget, recentActions });
  if (!r.ok) {
    notifyTyped('error', `일일 심의 실패 (${r.step}): ${r.error?.slice(0, 200)}`);
    process.exit(1);
  }

  const decisions = r.critic.final_decisions || [];
  const executions = [];
  for (const d of decisions) {
    const ex = await applyDecision(d);
    executions.push(ex);
  }

  // 심의 로그 저장
  try {
    const { error } = await supabase.from('kmong_ad_bot_actions').insert([{
      product_id: 'ALL',
      action_type: 'daily_review',
      action_date: new Date().toISOString().slice(0, 10),
      before_state: { observations: r.analyst.observations, anomalies: r.analyst.anomalies },
      after_state: { decisions, executions },
      reasoning: r.critic.summary,
      applied: executions.some(e => e.executed),
      suggested_by: 'claude-opus-4-7 (2-stage)',
    }]);
    if (error) console.log('[log 실패]', error.message);
  } catch (e) { console.log('[log 실패]', e.message); }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const lines = [
    `🧠 <b>일일 자가 심의</b> (${r.critic.confidence || '?'} confidence)`,
    `  분석: ${r.analyst.verdict_summary || '-'}`,
    `  검토: ${r.critic.summary || '-'}`,
    '',
    ...(r.analyst.anomalies?.length ? ['⚠️ <b>이상 탐지</b>',
      ...r.analyst.anomalies.slice(0, 5).map(a => `  • [${a.severity || '?'}] ${a.product_id || '-'} ${a.type}: ${a.detail?.slice(0, 120)}`),
      ''] : []),
    '📋 <b>결정/조치</b>',
    ...decisions.slice(0, 8).map((d, i) => {
      const ex = executions[i];
      const mark = ex?.executed ? '✅' : (d.action === 'hold' || d.action === 'alert_only' ? '•' : '⏸');
      return `  ${mark} ${d.action}${d.target ? ` (${d.target})` : ''}${d.value ? ` → ${d.value}` : ''} — ${d.reason?.slice(0, 140)}`;
    }),
    '',
    `<i>Claude 2단 $${r.cost_total_usd?.toFixed(4)} · ${elapsed}초</i>`,
  ].filter(Boolean);
  const msg = lines.join('\n');
  console.log(msg);
  notifyTyped('report', msg);
}

main().catch(e => { console.error(e); notifyTyped('error', `일일 심의 크래시: ${e.message}`); process.exit(1); });
