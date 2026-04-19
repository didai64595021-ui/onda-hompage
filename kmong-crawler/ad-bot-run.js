#!/usr/bin/env node
/**
 * 크몽 광고 최적화 봇 오케스트레이터
 * - 일 1회 실행 (cron)
 * - Phase 1: 메트릭 수집 (지난 30일)
 * - Phase 2: Claude Opus 4.7 판단 → 서비스별 희망 CPC 제안
 * - Phase 3: kmong_ad_bot_actions 로그 (pending)
 * - Phase 4: --apply 옵션 시 Playwright로 실제 적용 → log status = applied
 *
 * 사용법:
 *   node ad-bot-run.js                 # dry-run (제안만, DB 로그만)
 *   node ad-bot-run.js --apply         # 실제 크몽 UI에 적용
 *   node ad-bot-run.js --service ID    # 특정 서비스만
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { notifyTyped } = require('./lib/notify-filter');
const { loadServiceMetrics, loadActiveBudget } = require('./lib/ad-bot-metrics');
const { judgeAdjustments } = require('./lib/ad-bot-judge');
const { judgeAdjustmentsCli } = require('./lib/ad-bot-judge-cli');
const { ruleBasedJudge } = require('./lib/ad-bot-rule-fallback');
const { applyServiceAction } = require('./lib/ad-bot-apply');
const { matchProductId } = require('./lib/product-map');
const { login } = require('./lib/login');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    service: args.indexOf('--service') >= 0 ? args[args.indexOf('--service') + 1] : null,
    ruleOnly: args.includes('--rule') || args.includes('--rule-only'),
    dryRun: !args.includes('--apply'),
  };
}

async function logAction(row) {
  const { data, error } = await supabase.from('kmong_ad_bot_actions').insert([row]).select('id').single();
  if (error) console.log('[WARN] bot_actions insert 실패:', error.message);
  return data?.id;
}

async function updateActionApplied(id, result) {
  if (!id) return;
  const { error } = await supabase.from('kmong_ad_bot_actions')
    .update({ applied: result.ok, applied_at: new Date().toISOString(), after_state: result })
    .eq('id', id);
  if (error) console.log('[WARN] bot_actions update 실패:', error.message);
}

async function main() {
  const startTime = Date.now();
  const args = parseArgs();
  console.log(`=== 크몽 광고 봇 ${args.apply ? '(적용 모드)' : '(dry-run)'} ===`);
  const actionDate = new Date().toISOString().slice(0, 10);

  // 1) 메트릭 수집
  let metrics = await loadServiceMetrics(30);
  if (args.service) metrics = metrics.filter(m => m.product_id === args.service);
  console.log(`[메트릭] 서비스 ${metrics.length}개 로드`);
  if (!metrics.length) { console.log('[중단] 분석할 서비스 없음'); return; }

  // 2) 예산 로드
  const budgetRows = await loadActiveBudget();
  const budget = budgetRows[0] || { budget_type: 'daily', budget_amount: 5000, priority: 'roi', min_cpc: 500, max_cpc: 5000 };
  console.log(`[예산] ${JSON.stringify(budget)}`);

  // 3) 판단 체인: Claude CLI(Opus) → 외부 API(Opus) → 룰베이스
  //    --rule-only 는 룰만
  let j, judgeSource = 'opus-4-7 (cli)';
  if (args.ruleOnly) {
    j = ruleBasedJudge(metrics, budget);
    judgeSource = 'rule-based';
  } else {
    const cliR = await judgeAdjustmentsCli(metrics, budget);
    if (cliR.ok) {
      j = cliR.judgment;
      console.log(`[Opus CLI] ${cliR.duration_ms}ms · cost $${cliR.cost_usd?.toFixed(4)} · Max 한도 차감`);
    } else {
      console.log('[Opus CLI 실패 → 외부 API 시도]', cliR.error?.slice(0, 80));
      const apiR = await judgeAdjustments(metrics, budget);
      if (apiR.ok) { j = apiR.judgment; judgeSource = 'opus-4-7 (api)'; }
      else {
        console.log('[외부 API도 실패 → 룰베이스 폴백]', apiR.error?.slice(0, 80));
        j = ruleBasedJudge(metrics, budget);
        judgeSource = 'rule-based (opus-fallback)';
      }
    }
  }
  console.log(`[판단:${judgeSource}] ${j.actions.length}개 제안 / ${j.overall_note}`);

  // 4) DB 로그 (pending)
  const logged = [];
  for (const a of j.actions) {
    const id = await logAction({
      product_id: a.product_id,
      action_type: 'adjust_cpc_and_keywords',
      action_date: actionDate,
      before_state: { desired_cpc: a.current_desired_cpc },
      after_state: {
        desired_cpc: a.suggested_desired_cpc,
        keywords_to_enable: a.keywords_to_enable || [],
        keywords_to_disable: a.keywords_to_disable || [],
        reasoning: a.reasoning,
        priority: a.priority,
        confidence: a.confidence,
        guardrail_applied: !!a.guardrail_applied,
      },
      reasoning: a.reasoning,
      metrics_snapshot: metrics.find(m => m.product_id === a.product_id),
      budget_input: budget.budget_amount,
      applied: false,
    });
    logged.push({ ...a, logId: id });
  }

  // 5) 실제 적용 (--apply 시)
  let appliedCount = 0;
  if (args.apply) {
    const { browser, page } = await login({ slowMo: 150 });
    await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    try { const b = page.locator('button:has-text("확인")').first(); if (await b.isVisible({ timeout: 1500 }).catch(()=>false)) await b.click(); } catch {}
    await page.waitForTimeout(800);

    // 실제 크몽 리스트에서 현재 서비스명 → product_id 매핑 (DB gig_title은 잘못 매핑돼 있을 수 있음)
    const liveList = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      return Array.from(rows).map((r, i) => ({ rowIndex: i, serviceName: r.querySelector('img')?.getAttribute('alt') || '' }));
    });
    const pidToServiceName = {};
    for (const r of liveList) {
      if (!r.serviceName) continue;
      const pid = matchProductId(r.serviceName);
      if (pid && !pidToServiceName[pid]) pidToServiceName[pid] = r.serviceName;
    }
    console.log(`[라이브 매핑] ${Object.keys(pidToServiceName).length}개 product_id → serviceName`);

    const changes = logged.filter(a =>
      a.current_desired_cpc !== a.suggested_desired_cpc ||
      (a.keywords_to_enable || []).length > 0 ||
      (a.keywords_to_disable || []).length > 0
    );
    console.log(`[적용] 변경 대상 ${changes.length}개`);
    for (const a of changes) {
      const serviceName = pidToServiceName[a.product_id];
      if (!serviceName) { console.log(`[스킵] ${a.product_id} 라이브 리스트에 없음`); continue; }
      const res = await applyServiceAction(page, serviceName, {
        suggested_desired_cpc: a.suggested_desired_cpc,
        suggested_daily_budget: a.suggested_daily_budget,
        keywords_to_enable: a.keywords_to_enable,
        keywords_to_disable: a.keywords_to_disable,
      });
      const kwSummary = res.kwResults ? ` / 키워드 ${res.kwResults.filter(r => r.ok && r.toggled).length}토글` : '';
      console.log(`  [${a.product_id}] ${a.current_desired_cpc} → ${a.suggested_desired_cpc}원${kwSummary}: ${res.ok ? 'OK' : 'FAIL'} ${res.error || ''}`);
      await updateActionApplied(a.logId, res);
      if (res.ok) appliedCount += 1;
      await page.waitForTimeout(1500);
    }
    await browser.close();
  }

  // 6) 텔레그램 요약
  const lines = [
    `🤖 <b>크몽 광고 봇 ${args.apply ? '적용' : 'dry-run'}</b>`,
    `  예산 ${budget.budget_amount.toLocaleString()}원/${budget.budget_type} · 우선순위 ${budget.priority}`,
    `  제안 ${j.actions.length}건 / 변경 ${j.actions.filter(a => a.current_desired_cpc !== a.suggested_desired_cpc).length}건${args.apply ? ` / 적용 성공 ${appliedCount}` : ''}`,
    '',
    '📋 <b>주요 조정</b> (점진 ±20% 가드, 주 예산 기준)',
    ...j.actions.slice(0, 8).map(a => {
      const kwEn = (a.keywords_to_enable || []).length ? ` +kw:${a.keywords_to_enable.slice(0,3).join(',')}` : '';
      const kwDis = (a.keywords_to_disable || []).length ? ` -kw:${a.keywords_to_disable.slice(0,3).join(',')}` : '';
      return `  • ${a.product_id}: ${a.current_desired_cpc}→${a.suggested_desired_cpc}원(${a.change_pct >= 0 ? '+' : ''}${a.change_pct}%)${kwEn}${kwDis}\n    ${a.reasoning}`;
    }),
    '',
    `💬 ${j.overall_note}`,
    `<i>생성: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${((Date.now() - startTime) / 1000).toFixed(1)}초</i>`,
  ];
  notifyTyped('report', lines.join('\n'));
  console.log(lines.join('\n'));
}

main().catch(err => {
  console.error('[치명적 에러]', err);
  notifyTyped('error', `광고 봇 크래시: ${err.message}`);
  process.exit(1);
});
