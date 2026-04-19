#!/usr/bin/env node
/**
 * A/B 실험 모니터 — 매일 실행
 * - state='measuring' 실험 중 measurement_days 경과한 것만 판정
 * - Opus가 variant_a vs variant_b 성과 비교 → winner 결정
 * - winner='b' → variant_a 광고 OFF (패자 광고 중단)
 * - winner='a' → variant_b 광고 OFF + 상품 일정 대기 후 삭제 후보
 * - tie/inconclusive → 측정 연장 or 둘 다 유지
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { spawn } = require('child_process');
const { supabase } = require('./lib/supabase');
const { notifyTyped } = require('./lib/notify-filter');
const { loadServiceMetrics } = require('./lib/ad-bot-metrics');

const SYSTEM_COMPARE = `당신은 A/B 실험 결과 판정자입니다. variant_a(원본) vs variant_b(신규) 30일 성과 비교.

## 판정 기준 (우선순위)
1. ROAS — B/A 차이 ≥ 30% + 각각 매출 발생 → 확실한 winner
2. 주문 건수 — 둘 다 3건+ → 주문 많은 쪽
3. CVR(문의→주문) — 양쪽 문의 5건+ → CVR 높은 쪽
4. CTR + 클릭 — 매출 0이어도 CTR 차이 뚜렷하면 임시 winner
5. 위 모두 부족 (표본 작음) → inconclusive + measurement_days +14 연장 권고

## 출력 JSON
{
  "winner": "a|b|tie|inconclusive",
  "reasoning": "1-2문장 근거",
  "action": "switch_to_b|keep_a|extend_measurement|both_live",
  "confidence": "high|medium|low"
}`;

function runClaude(system, prompt, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const proc = spawn('claude', [
      '-p', '--model', 'opus', '--output-format', 'json',
      '--append-system-prompt', system, '--no-session-persistence',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    const t = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    proc.stdin.write(prompt); proc.stdin.end();
  });
}

async function judgeWinner(exp, metricsA, metricsB) {
  const userMsg = `## 실험 id=${exp.id}\n가설: ${exp.hypothesis}\n측정 시작: ${exp.measurement_start_at}\n경과: ${exp.measurement_days}일\n\n## Variant A (원본 ${exp.variant_a_product_id})\n${JSON.stringify(metricsA, null, 2)}\n\n## Variant B (신규 ${exp.variant_b_product_id})\n${JSON.stringify(metricsB, null, 2)}\n\nwinner JSON 리턴.`;
  const r = await runClaude(SYSTEM_COMPARE, userMsg);
  if (r.code !== 0) return { ok: false, error: r.stderr.slice(0, 200) };
  try {
    const env = JSON.parse(r.stdout);
    if (env.is_error) return { ok: false, error: env.result };
    const m = env.result.match(/\{[\s\S]*\}/);
    return { ok: true, judgment: JSON.parse(m ? m[0] : env.result), cost_usd: env.total_cost_usd };
  } catch (e) { return { ok: false, error: 'parse: ' + e.message }; }
}

async function main() {
  const start = Date.now();
  console.log('=== A/B 실험 모니터 ===');
  const now = new Date();

  const { data: experiments } = await supabase.from('kmong_ab_experiments')
    .select('*').eq('state', 'measuring');
  if (!experiments?.length) { console.log('[중단] measuring 실험 없음'); return; }

  const metrics = await loadServiceMetrics(30);
  const byPid = Object.fromEntries(metrics.map(m => [m.product_id, m]));

  const reports = [];
  for (const exp of experiments) {
    const elapsed = exp.measurement_start_at ? (now - new Date(exp.measurement_start_at)) / (86400000) : 0;
    if (elapsed < (exp.measurement_days || 30)) {
      console.log(`[${exp.id}] 측정 중 ${elapsed.toFixed(1)}/${exp.measurement_days}일`);
      continue;
    }
    const mA = byPid[exp.variant_a_product_id];
    const mB = byPid[exp.variant_b_product_id];
    if (!mA || !mB) {
      console.log(`[${exp.id}] 메트릭 누락 — skip`);
      continue;
    }
    const judge = await judgeWinner(exp, mA, mB);
    if (!judge.ok) { console.log(`[${exp.id}] 판정 실패:`, judge.error); continue; }
    const j = judge.judgment;

    let actionTaken = null;
    if (j.action === 'switch_to_b' && exp.variant_a_product_id) {
      spawn('node', ['toggle-ad.js', exp.variant_a_product_id, 'off'], { cwd: __dirname, detached: true, stdio: 'ignore', env: process.env }).unref();
      actionTaken = 'switched_to_b';
    } else if (j.action === 'keep_a' && exp.variant_b_product_id) {
      spawn('node', ['toggle-ad.js', exp.variant_b_product_id, 'off'], { cwd: __dirname, detached: true, stdio: 'ignore', env: process.env }).unref();
      actionTaken = 'kept_a';
    } else if (j.action === 'both_live') {
      actionTaken = 'both_live';
    } else if (j.action === 'extend_measurement') {
      await supabase.from('kmong_ab_experiments').update({
        measurement_days: (exp.measurement_days || 30) + 14,
      }).eq('id', exp.id);
      reports.push(`🧪 exp ${exp.id}: 연장 +14일 (${j.reasoning})`);
      continue;
    }

    await supabase.from('kmong_ab_experiments').update({
      state: 'concluded',
      winner: j.winner,
      verdict_reasoning: j.reasoning,
      action_taken: actionTaken,
      concluded_at: now.toISOString(),
      metrics_a: mA, metrics_b: mB,
    }).eq('id', exp.id);

    reports.push(`🏁 exp ${exp.id} — ${j.winner.toUpperCase()} 승 (${j.confidence})\n  ${j.reasoning}\n  → ${actionTaken}`);
  }

  if (reports.length) notifyTyped('report', `🧪 <b>A/B 실험 모니터</b>\n\n${reports.join('\n\n')}\n\n<i>${((Date.now()-start)/1000).toFixed(1)}초</i>`);
  else console.log('[완료] 판정 대상 없음');
}

main().catch(e => { console.error(e); notifyTyped('error', `A/B 모니터 크래시: ${e.message}`); process.exit(1); });
