/**
 * 매일 자가 심의 — Claude 2단 (분석가 + 비판검토)
 * Step 1: 분석 Claude → 변화 감지 + 이상 탐지 + 조치 후보 JSON
 * Step 2: 비판 Claude → Step 1 재검토 + 반박/보강 + 최종 결정 JSON
 *
 * 결정 action_type: 'hold' | 're_run_ad_bot' | 'raise_budget' | 'lower_budget'
 *                   | 'pause_product' | 'alert_only'
 */

const { spawn } = require('child_process');

const SYSTEM_ANALYST = `당신은 크몽 광고 데이터 분석가입니다.
어제/지난 3일/지난 7일/지난 30일 성과를 보고 변화 감지 + 이상 탐지 + 조치 후보를 JSON으로 출력합니다.

## 감지 포인트
1. 노출/클릭/CTR/CVR/ROAS 급변 (±30% 이상)
2. 특정 서비스 비정상 (CPC 급상승, 소진 0원, Phase 정체)
3. 주 예산 소진 속도 (남은 일수 대비 과속/저속)
4. 문의/주문 건수 추세 (상승/하락/정체)
5. 객단가(avg_order_value_30d) 대비 광고비(cost_per_order_30d) 효율 — 롱테일 전략 필요 여부
6. net_profit_30d 음수 + 30일 지출 3만+ → 적자 누적, pause_product 또는 lower_budget 후보

## 출력 JSON (텍스트 금지)
{
  "observations": ["관찰 1", "관찰 2", ...],
  "anomalies": [{"product_id":"...", "type":"cpc_spike|zero_impressions|ctr_drop|...", "severity":"high|med|low", "detail":"..."}],
  "candidate_actions": [
    {"action":"hold|re_run_ad_bot|raise_budget|lower_budget|pause_product|alert_only", "target":"product_id or null", "value": number or null, "reason":"..."}
  ],
  "verdict_summary": "전체 한줄 평"
}`;

const SYSTEM_CRITIC = `당신은 비판적 검토자입니다. 분석가의 조치 후보를 재검토합니다.
다음 기준으로 반박/보강/승인:

## 검토 기준
1. 표본 크기 충분한가 (노출 100+ 없으면 판단 불가 → 대기 권고)
2. 단일 날 변동인지 추세인지 (노이즈 vs 시그널)
3. 조치 위험도: pause_product/lower_budget은 매출 리스크 → 확실한 근거 필요
4. raise_budget은 ROAS 300%+ 증거 필요 (Opus 프롬프트 기준)
5. hold(관망)이 가장 안전한 기본값

## 출력 JSON
{
  "agreed": true|false,
  "objections": ["반박 1", ...],
  "final_decisions": [
    {"action":"hold|re_run_ad_bot|raise_budget|lower_budget|pause_product|alert_only", "target":"...", "value":..., "reason":"..."}
  ],
  "confidence": "high|medium|low",
  "summary": "최종 요약 1~2줄 (사용자 텔레그램용)"
}

모든 조치를 반드시 승인할 필요 없음. 의심되면 hold/alert_only로 downgrade. 확실하지 않으면 사람에게 물어보도록 alert_only 권고.`;

function runClaude(systemPrompt, userMsg, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const proc = spawn('claude', [
      '-p', '--model', 'opus', '--output-format', 'json',
      '--append-system-prompt', systemPrompt, '--no-session-persistence',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    const t = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    proc.stdin.write(userMsg); proc.stdin.end();
  });
}

function parseEnvelope(stdout) {
  let env;
  try { env = JSON.parse(stdout); } catch (e) { return { ok: false, error: 'envelope: ' + e.message }; }
  if (env.is_error) return { ok: false, error: 'is_error: ' + env.result };
  try {
    const m = env.result.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : env.result);
    return { ok: true, parsed, cost_usd: env.total_cost_usd, duration_ms: env.duration_ms };
  } catch (e) { return { ok: false, error: 'JSON: ' + e.message, raw: env.result?.slice(0, 300) }; }
}

async function runDailyReview(context) {
  const userMsg = `## 서비스별 메트릭 (30일 + 주간)\n${JSON.stringify(context.metrics, null, 2)}

## 예산 설정\n${JSON.stringify(context.budget, null, 2)}

## 최근 봇 조치 이력 (지난 7일)\n${JSON.stringify(context.recentActions, null, 2)}

위를 바탕으로 관찰/이상/조치후보 JSON으로 리턴.`;

  // Step 1: 분석
  const r1 = await runClaude(SYSTEM_ANALYST, userMsg);
  if (r1.code !== 0) return { ok: false, step: 'analyst', error: r1.stderr.slice(0, 200) };
  const p1 = parseEnvelope(r1.stdout);
  if (!p1.ok) return { ok: false, step: 'analyst', error: p1.error };

  // Step 2: 비판 검토
  const criticMsg = `## 원 메트릭\n${JSON.stringify(context.metrics.map(m => ({ product_id: m.product_id, gig_title: m.gig_title, ctr_30d: m.ctr_30d, cvr_inquiry_30d: m.cvr_inquiry_30d, cost_30d: m.cost_30d, week_cost: m.week_cost, impressions_30d: m.impressions_30d, clicks_30d: m.clicks_30d, roi_30d: m.roi_30d })), null, 2)}

## 분석가 제안 (검토 대상)\n${JSON.stringify(p1.parsed, null, 2)}

위 분석가 제안을 비판적으로 검토해 반박/보강/확정. 의심되면 hold/alert_only로 downgrade.`;

  const r2 = await runClaude(SYSTEM_CRITIC, criticMsg);
  if (r2.code !== 0) return { ok: false, step: 'critic', error: r2.stderr.slice(0, 200), analyst: p1.parsed };
  const p2 = parseEnvelope(r2.stdout);
  if (!p2.ok) return { ok: false, step: 'critic', error: p2.error, analyst: p1.parsed };

  return {
    ok: true,
    analyst: p1.parsed,
    critic: p2.parsed,
    cost_total_usd: (p1.cost_usd || 0) + (p2.cost_usd || 0),
    duration_ms: (p1.duration_ms || 0) + (p2.duration_ms || 0),
  };
}

module.exports = { runDailyReview };
