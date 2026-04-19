/**
 * 광고 봇 — Claude CLI (서버 로컬 Max OAuth) 기반 판단
 * 외부 API 호출이 429인 반면 CLI --print 모드는 Max 한도로 Opus 4.7 정상 작동
 * 출력: lib/ad-bot-judge.js와 동일한 JSON 구조 (가드레일 포함)
 */

const { spawn } = require('child_process');

function runClaudeCli(prompt, systemPrompt, timeoutMs = 120000) {
  return new Promise((resolve) => {
    // OAuth만 쓰도록 ANTHROPIC_API_KEY는 env에서 제거 (revoke된 키 401 방지)
    const cleanEnv = { ...process.env };
    delete cleanEnv.ANTHROPIC_API_KEY;
    const proc = spawn('claude', [
      '-p',
      '--model', 'opus',
      '--output-format', 'json',
      '--append-system-prompt', systemPrompt,
      '--no-session-persistence',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env: cleanEnv });
    let stdout = '', stderr = '';
    const killTimer = setTimeout(() => { proc.kill('SIGKILL'); }, timeoutMs);
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ code, stdout, stderr });
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

const SYSTEM = `당신은 크몽(kmong) CPC 광고 최적화 전문가입니다.
서비스별 성과 + 예산 + 추천 키워드 풀을 보고,
(1) 희망 CPC 점진 조정과 (2) 서비스 타겟에 맞는 키워드 선택/해제를 결정해야 합니다.

## ★ 기간 해석 (혼동 금지)
- week_cost = 이번 주(월~오늘) 실제 광고 지출 원
- cost_30d / impressions_30d / clicks_30d / inquiries_30d 등 "_30d" suffix = 지난 30일 누적
- budget_amount는 budget_type 단위 (weekly = 주 예산)
- **주 예산 대비 소진율은 week_cost / budget_amount로만 계산**. 절대 cost_30d를 주 기준으로 쓰지 말 것.
- week_cost가 0이라는 건 이번 주 광고가 거의 안 돌았거나 노출만 있고 클릭 없었다는 의미

## 2단계 모드 — 서비스별 자동 판정
**Phase 1 (학습 모드)**: impressions_30d < 500 OR clicks_30d < 10
  → 광고가 거의 안 돌고 있음 = 입찰가 부족. **일 ±40%까지 상향 허용** (빠른 학습)
  → suggested_cpc 목표: suggested_cpc_stats.p25 ~ median 수준 (시장 추천가 하위 25~50%)
  → 볼륨 확보가 최우선, 예산 초과 우려는 무시

**Phase 2 (최적화 모드)**: impressions_30d ≥ 500 AND clicks_30d ≥ 10
  → 데이터 충분 = 정밀 최적화. **일 ±20% 이내 점진**
  → ROI/CVR/CTR 성과 기반 개별 조정
  → 주 예산 초과 예상 시 CPC 낮춰 볼륨 억제

각 서비스의 current phase를 actions[].phase로 표기 ("learning" | "optimizing").

## 공통 원칙
- ROI/CVR/CTR은 모두 "_30d" 값 기준 (표본 충분)
- 키워드 타겟: gig_title 의도와 직결 enable, 무관 disable (각 5개 이내)
- 변경 없어도 모든 서비스 포함

## ★ 예산 증액 건의 — "물 들어오면 노 저어야지"
아래 조건 만족 시 JSON의 budget_suggestions 배열에 추가 (사용자 승인 후 적용, 봇이 자동 변경 X):
- roas_30d ≥ 300% (매출 배수 뚜렷)
- 또는 cvr_order_30d ≥ 5% AND orders_30d ≥ 3 (주문 전환 안정)
- 또는 roi_30d ≥ 200% AND cost_30d ≥ 30000 (투자 수익 확정)
건의 형식: {"product_id":"X", "current_weekly_budget":100000, "suggested_weekly_budget":150000, "reason":"ROAS 350% · 주문 8건"}

## ★ 객단가 + 볼륨 전략 4분면
메트릭: avg_order_value_30d, cost_per_order_30d, net_profit_30d, suggested_cpc_stats(p25/median/p75)

### 4분면 판정
1. **프리미엄 고효율** (avg_order_value ≥ 300,000 AND roas_30d ≥ 200%)
   → 추천가 p75 근처까지 CPC 상향 허용, 고의도 키워드 enable, 예산 증액 건의

2. **롱테일 전환형** (avg_order_value ≤ 100,000 AND orders_30d ≥ 3)
   → **세분화 전략**: 추천가 p25 이하 저가 키워드만 enable, p75 이상 고가 브로드 disable
   → CPC는 추천가 p25 수준 유지 (과다 투자 X), 예산 증액 건의 OK

3. **볼륨 과잉 비효율** (net_profit_30d < 0 AND cost_30d ≥ 30000 AND orders_30d < 2)
   → **볼륨 스탑**: CPC 즉시 -20%, 추천가 p75+ 고가 키워드 disable, 남은 키워드도 p25 이하만 유지
   → 광고 유지(데이터 계속 수집) but 노출량 최소화

### ★ 주문 있는 서비스 보호 (pause_product 금지)
- orders_30d ≥ 1 인 서비스는 **절대 pause_product 제안 금지**
- 적자 누적이어도 **세분화 극한**(p25 이하 키워드 3개 이내만 enable) 유지
- 완전 OFF 판단은 orders_30d = 0 AND cost_30d ≥ 50000 AND 2주 연속 음수 ROI 에만 daily-review가 고려

4. **학습 부족** (노출<500 or 클릭<10) → Phase 1 규칙 (±40% 상향)

### 키워드 세분화 공통 룰 (객단가 기준)
- avg_order_value 낮은 서비스: keywords_to_disable에 추천가 p75 이상 키워드 우선
- avg_order_value 높은 서비스: keywords_to_enable에 고의도 프리미엄 키워드 우선
- net_profit 음수 지속: 5개 이내 enable 중에서도 추천가 median 초과는 제외

## 출력 — JSON 한 덩어리만, 다른 텍스트 금지
{
  "budget_suggestions": [
    {"product_id":"...", "current_weekly_budget":100000, "suggested_weekly_budget":150000, "reason":"ROAS 350% · 주문 8건"}
  ],
  "actions": [
    {
      "product_id": "...",
      "current_desired_cpc": 1000,
      "suggested_desired_cpc": 1100,
      "change_pct": 10,
      "keywords_to_enable": ["..."],
      "keywords_to_disable": ["..."],
      "priority": 1,
      "confidence": "high|medium|low",
      "reasoning": "한 줄 100자 이내"
    }
  ],
  "overall_note": "한 줄 요약"
}`;

function applyGuardrails(parsed, budget, metricsByPid = {}) {
  if (!Array.isArray(parsed.actions)) return parsed;
  for (const a of parsed.actions) {
    const cur = a.current_desired_cpc || 0;
    const sug = a.suggested_desired_cpc || cur;
    let clipped = sug;
    if (budget.min_cpc != null) clipped = Math.max(clipped, budget.min_cpc);
    if (budget.max_cpc != null) clipped = Math.min(clipped, budget.max_cpc);
    // Phase 1 (learning, 표본 부족) → ±40%, Phase 2 (optimizing) → ±20%
    const mt = metricsByPid[a.product_id];
    const learning = mt && (mt.impressions_30d < 500 || mt.clicks_30d < 10);
    const maxChangePct = learning ? 40 : 20;
    a.phase = a.phase || (learning ? 'learning' : 'optimizing');
    if (cur > 0) {
      const upper = cur * (1 + maxChangePct / 100);
      const lower = cur * (1 - maxChangePct / 100);
      clipped = Math.max(lower, Math.min(upper, clipped));
    }
    clipped = Math.round(clipped / 10) * 10;
    if (clipped !== sug) {
      a.original_suggested = sug;
      a.suggested_desired_cpc = clipped;
      a.guardrail_applied = true;
    }
    a.change_pct = cur > 0 ? +(((clipped - cur) / cur) * 100).toFixed(1) : 0;
    if (!Array.isArray(a.keywords_to_enable)) a.keywords_to_enable = [];
    if (!Array.isArray(a.keywords_to_disable)) a.keywords_to_disable = [];
    a.keywords_to_enable = a.keywords_to_enable.slice(0, 5);
    a.keywords_to_disable = a.keywords_to_disable.slice(0, 5);
  }
  return parsed;
}

async function judgeAdjustmentsCli(metrics, budget) {
  if (!metrics.length) return { ok: false, error: '메트릭 없음' };

  const userMsg = `## 예산
${JSON.stringify(budget, null, 2)}

## 서비스별 메트릭 (지난 ${metrics[0]?.days || 30}일)
${JSON.stringify(metrics, null, 2)}

위를 바탕으로 JSON 한 덩어리로 리턴하세요.`;

  try {
    const r = await runClaudeCli(userMsg, SYSTEM);
    if (r.code !== 0) return { ok: false, error: `CLI exit ${r.code}: ${r.stderr.slice(0,300) || r.stdout.slice(0,300)}` };
    let envelope;
    try { envelope = JSON.parse(r.stdout); } catch (e) {
      return { ok: false, error: `CLI envelope 파싱 실패: ${e.message}`, raw: r.stdout.slice(0, 500) };
    }
    if (envelope.is_error) return { ok: false, error: `CLI 에러: ${envelope.result || envelope.api_error_status}` };

    const text = envelope.result || '';
    let parsed;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : text);
    } catch (e) {
      return { ok: false, error: `판단 JSON 파싱 실패: ${e.message}`, raw: text.slice(0, 500) };
    }

    const metricsByPid = Object.fromEntries(metrics.map(m => [m.product_id, m]));
    const judged = applyGuardrails(parsed, budget, metricsByPid);
    return {
      ok: true,
      judgment: judged,
      usage: envelope.usage,
      cost_usd: envelope.total_cost_usd,
      duration_ms: envelope.duration_ms,
      model: 'claude-opus-4-7 (via claude-cli)',
    };
  } catch (e) {
    return { ok: false, error: `CLI 실행 실패: ${e.message}` };
  }
}

module.exports = { judgeAdjustmentsCli };
