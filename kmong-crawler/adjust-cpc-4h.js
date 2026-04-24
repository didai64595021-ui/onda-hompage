#!/usr/bin/env node
/**
 * 4시간 단위 CPC 동적 조정 모듈
 *
 * 흐름:
 *   1) 현재 KST 시간대 weight 로드 (hourly-weights.js)
 *   2) weight=0 OFF 시간대면 즉시 종료 (ad-scheduler가 광고 자체 OFF)
 *   3) 7일 메트릭 + 예산 로드 (기존 ad-bot 인프라 재사용)
 *   4) Opus 4.7 (CLI → API → rule fallback) 판단
 *   5) ±25퍼 가드 + 시간 weight 곱 + min/max CPC 클립
 *   6) DB 로그 + Playwright 자동 적용
 *   7) 텔레그램 plain text 보고 + 추가 전략 제안
 *
 * cron: 0 *​/4 * * * (00,04,08,12,16,20 KST)
 * 옵션: --dry-run (적용 안 함), --rule (Opus 우회)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { spawn } = require('child_process');
const { supabase } = require('./lib/supabase');
const { loadServiceMetrics, loadActiveBudget } = require('./lib/ad-bot-metrics');
const { judgeAdjustments } = require('./lib/ad-bot-judge');
const { judgeAdjustmentsCli } = require('./lib/ad-bot-judge-cli');
const { ruleBasedJudge } = require('./lib/ad-bot-rule-fallback');
const { applyServiceAction } = require('./lib/ad-bot-apply');
const { matchProductId } = require('./lib/product-map');
const { login } = require('./lib/login');
const { getCurrentHourWeight, getKstHour, isHourOff, loadHourlyWeights } = require('./lib/hourly-weights');
const { evaluatePreviousCycle, loadRecentLearning } = require('./lib/cpc-learning-feedback');

const GUARD_PCT = 25;

function notifyPlain(text) {
  return new Promise((resolve) => {
    const child = spawn('node', ['/home/onda/scripts/telegram-sender.js', text], { stdio: 'ignore' });
    child.on('close', resolve);
    setTimeout(resolve, 8000);
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: !args.includes('--dry-run'),
    ruleOnly: args.includes('--rule') || args.includes('--rule-only'),
  };
}

async function logAction(row) {
  const { data, error } = await supabase.from('kmong_ad_bot_actions').insert([row]).select('id').single();
  if (error) console.log('[WARN] log insert 실패:', error.message);
  return data?.id;
}

async function updateActionApplied(id, result) {
  if (!id) return;
  // after_state의 제안값(desired_cpc, change_pct 등) 보존 + apply_result 별도 저장
  // (학습 피드백이 after_state.desired_cpc 참조, 덮어쓰면 기록 망가짐)
  const { data: existing } = await supabase.from('kmong_ad_bot_actions').select('after_state').eq('id', id).single();
  const mergedAfterState = { ...(existing?.after_state || {}), apply_result: result };
  const { error } = await supabase.from('kmong_ad_bot_actions')
    .update({ applied: result.ok, applied_at: new Date().toISOString(), after_state: mergedAfterState })
    .eq('id', id);
  if (error) console.log('[WARN] log update 실패:', error.message);
}

async function main() {
  const startTime = Date.now();
  const args = parseArgs();
  const kstHour = getKstHour();
  const hourWeight = await getCurrentHourWeight();
  const hourOff = await isHourOff();
  const weightsPayload = await loadHourlyWeights();

  console.log(`=== adjust-cpc-4h ${args.apply ? '(자동적용)' : '(dry-run)'} | KST ${kstHour}시 weight=${hourWeight} ===`);

  if (hourOff) {
    console.log('[스킵] OFF 시간대 → ad-scheduler가 광고 OFF 처리, CPC 조정 불필요');
    await notifyPlain(`adjust-cpc-4h 스킵 (KST ${kstHour}시 OFF 시간대)`);
    return;
  }

  // 0) 자동학습: 직전 사이클 결과 평가
  const evalResult = await evaluatePreviousCycle();
  console.log(`[학습 평가] 직전 사이클 ${evalResult.evaluated}건 result_metrics 갱신`);

  // 0-bis) 지난 7일 동일 시간대 학습 기록 로드
  const learningRecords = await loadRecentLearning(kstHour, 7);
  console.log(`[학습 로드] 지난 7일 KST ${kstHour}시 조정 기록 ${learningRecords.length}건`);

  // 1) 메트릭 (7일)
  const metrics = await loadServiceMetrics(7);
  console.log(`[메트릭] 서비스 ${metrics.length}개`);
  if (!metrics.length) { console.log('[중단] 분석 대상 없음'); return; }

  // 2) 예산 + cycle_context (Opus에 시간대 맥락 + 학습 기록 주입)
  const budgetRows = await loadActiveBudget();
  const budget = budgetRows[0] || {
    budget_type: 'daily', budget_amount: 16400, priority: 'roi', min_cpc: 500, max_cpc: 5000,
  };
  budget.cycle_context = {
    current_kst_hour: kstHour,
    current_hour_weight: hourWeight,
    high_cvr_hours: weightsPayload.high_cvr_hours,
    low_cvr_hours: weightsPayload.low_cvr_hours,
    off_hours: weightsPayload.off_hours,
    guardrail_pct: GUARD_PCT,
    instruction: '이 시간대 weight와 학습 기록을 참고해 판단할 것. weight는 참고용 맥락이지 곱셈 계수가 아님. 볼륨 부족이면 저가치 시간대라도 상향 가능. 학습 기록에서 지난번 효과를 확인하고 반대 방향 회전(요요) 방지.',
    learning_records: learningRecords,
  };
  console.log(`[예산+맥락] ${JSON.stringify(budget, null, 2).slice(0, 500)}...`);

  // 3) 판단 체인
  let j, judgeSource = 'opus-4-7 (cli)';
  if (args.ruleOnly) {
    j = ruleBasedJudge(metrics, budget); judgeSource = 'rule-based';
  } else {
    const cliR = await judgeAdjustmentsCli(metrics, budget);
    if (cliR.ok) j = cliR.judgment;
    else {
      console.log('[Opus CLI 실패 → API 시도]', cliR.error?.slice(0, 80));
      const apiR = await judgeAdjustments(metrics, budget);
      if (apiR.ok) { j = apiR.judgment; judgeSource = 'opus-4-7 (api)'; }
      else {
        console.log('[API도 실패 → rule fallback]', apiR.error?.slice(0, 80));
        j = ruleBasedJudge(metrics, budget); judgeSource = 'rule-based (opus-fallback)';
      }
    }
  }
  console.log(`[판단:${judgeSource}] ${j.actions.length}건 / ${j.overall_note}`);

  // 4) ±25% 가드만 적용 (weight 곱셈 제거 — Opus가 cycle_context 보고 이미 반영)
  for (const a of j.actions) {
    const cur = a.current_desired_cpc || 0;
    let sug = a.suggested_desired_cpc || cur;

    // ±25퍼 가드 (요요 방지 최후 안전장치)
    if (cur > 0) {
      const upper = Math.floor(cur * (1 + GUARD_PCT / 100) / 10) * 10;
      const lower = Math.ceil(cur * (1 - GUARD_PCT / 100) / 10) * 10;
      sug = Math.max(lower, Math.min(upper, sug));
    }

    // min/max
    if (budget.min_cpc != null) sug = Math.max(sug, budget.min_cpc);
    if (budget.max_cpc != null) sug = Math.min(sug, budget.max_cpc);
    sug = Math.round(sug / 10) * 10;

    a.suggested_desired_cpc = sug;
    a.change_pct = cur > 0 ? +(((sug - cur) / cur) * 100).toFixed(1) : 0;
    a.hour_weight_context = hourWeight;
  }

  // 5) DB 로그
  const actionDate = new Date().toISOString().slice(0, 10);
  const logged = [];
  for (const a of j.actions) {
    const id = await logAction({
      product_id: a.product_id,
      action_type: 'adjust_cpc_4h',
      action_date: actionDate,
      before_state: { desired_cpc: a.current_desired_cpc, kst_hour: kstHour, hour_weight: hourWeight },
      after_state: {
        desired_cpc: a.suggested_desired_cpc,
        change_pct: a.change_pct,
        kw_enable: a.keywords_to_enable || [],
        kw_disable: a.keywords_to_disable || [],
        guardrail: GUARD_PCT,
      },
      reasoning: a.reasoning,
      metrics_snapshot: metrics.find(m => m.product_id === a.product_id),
      budget_input: budget.budget_amount,
      applied: false,
    });
    logged.push({ ...a, logId: id });
  }

  // 6) 적용
  let appliedCount = 0;
  let applyErrors = [];
  if (args.apply) {
    const { browser, page } = await login({ slowMo: 150 });
    try {
      await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      try {
        const b = page.locator('button:has-text("확인")').first();
        if (await b.isVisible({ timeout: 1500 }).catch(() => false)) await b.click();
      } catch {}

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
      console.log(`[라이브 매핑] ${Object.keys(pidToServiceName).length}개`);

      const changes = logged.filter(a =>
        a.current_desired_cpc !== a.suggested_desired_cpc ||
        (a.keywords_to_enable || []).length > 0 ||
        (a.keywords_to_disable || []).length > 0
      );
      console.log(`[적용] 변경 대상 ${changes.length}/${logged.length}`);
      for (const a of changes) {
        const serviceName = pidToServiceName[a.product_id];
        if (!serviceName) {
          console.log(`[스킵] ${a.product_id} 라이브 리스트 없음`);
          applyErrors.push(`${a.product_id}: not in live list`);
          continue;
        }
        try {
          const res = await applyServiceAction(page, serviceName, {
            suggested_desired_cpc: a.suggested_desired_cpc,
            keywords_to_enable: a.keywords_to_enable,
            keywords_to_disable: a.keywords_to_disable,
          });
          console.log(`  [${a.product_id}] ${a.current_desired_cpc} -> ${a.suggested_desired_cpc} (${a.change_pct >= 0 ? '+' : ''}${a.change_pct}%): ${res.ok ? 'OK' : 'FAIL ' + (res.error || '')}`);
          await updateActionApplied(a.logId, res);
          if (res.ok) appliedCount += 1;
          else applyErrors.push(`${a.product_id}: ${res.error || 'unknown'}`);
          await page.waitForTimeout(1500);
        } catch (err) {
          console.log(`  [${a.product_id}] 예외: ${err.message}`);
          applyErrors.push(`${a.product_id}: ${err.message}`);
        }
      }
    } finally {
      await browser.close();
    }
  }

  // 7) 텔레그램 보고
  const nextHour = (kstHour + 4) % 24;
  const weightLabel = hourWeight === 1 ? '평시' : hourWeight > 1 ? `고가치 +${Math.round((hourWeight - 1) * 100)}퍼` : `저가치 -${Math.round((1 - hourWeight) * 100)}퍼`;
  const lines = [
    `4시간 CPC 자동조정 ${args.apply ? '적용' : 'dry-run'} - KST ${kstHour}시 [${weightLabel}]`,
    `판단: ${judgeSource} / 제안 ${j.actions.length}건 / 적용 성공 ${appliedCount}건${applyErrors.length ? ' / 실패 ' + applyErrors.length : ''}`,
    `예산: ${budget.budget_amount.toLocaleString()}원/${budget.budget_type} (priority=${budget.priority})`,
    '',
    '주요 조정',
    ...j.actions.slice(0, 8).map(a => {
      const sign = a.change_pct >= 0 ? '+' : '';
      return `  ${a.product_id}: ${a.current_desired_cpc} -> ${a.suggested_desired_cpc}원 [${sign}${a.change_pct}퍼]`;
    }),
    '',
    j.overall_note ? `요약: ${j.overall_note}` : '',
    '',
    '추가 전략 제안',
    `- 시간대 weight ${hourWeight} 곱셈 적용중 (HIGH ${(weightsPayload.high_cvr_hours || []).join(',')} / OFF ${(weightsPayload.off_hours || []).join(',')})`,
    `- 가드 ±${GUARD_PCT}퍼 1회 변동폭 (점진 안정성 확보)`,
    `- 다음 사이클: ${nextHour}시 KST`,
    applyErrors.length ? `- 실패 케이스 점검: ${applyErrors.slice(0, 3).join(' | ')}` : '- 모든 적용 성공',
  ].filter(Boolean);
  await notifyPlain(lines.join('\n'));

  console.log(`\n[OK] adjust-cpc-4h ${((Date.now() - startTime) / 1000).toFixed(1)}초`);
}

main().catch(async (err) => {
  console.error('[치명적]', err);
  await notifyPlain('adjust-cpc-4h 치명적 실패: ' + err.message);
  process.exit(1);
});
