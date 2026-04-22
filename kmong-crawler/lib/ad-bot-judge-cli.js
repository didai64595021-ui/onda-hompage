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

## ★ budget.priority 의미 (가장 먼저 확인)
- priority='volume' (현재 기본): 볼륨 확보가 최우선. CPC 하향 금지 (최대 -5%), pause 금지, cut 금지.
  Phase 3/4 조건을 만족해도 Phase 2까지만 수행. 예산 초과 우려 있어도 볼륨 확보 진행.
- priority='ctr': CTR 최적화 초점. 저CTR 키워드 disable 활성.
- priority='cvr': CVR 최적화 초점. 저전환 키워드 disable + 고전환 키워드 CPC 상향.
- priority='roi': ROAS/ROI 세밀 조정. Phase 4 활성, pause 제안 가능 (본 봇은 제안만, 실제 pause는 daily-review).

## ★ 기간 해석 (혼동 금지)
- week_total_actual = 이번 주(월~오늘) **크몽 비즈머니 실지출 합계** — 단일 truth (서비스별 합계 X, 총합)
- week_by_date_actual = {YYYY-MM-DD: 원} — 실지출 일별 분포 (오늘 실지출 얼마인지 이걸로 판단)
- week_start_actual = 이번 주 시작일(월요일)
- week_cost = 서비스별 주간 지출 proxy (click-up 크롤, week_total_actual 기준으로 비율 리스케일됨)
- cost_30d / impressions_30d / clicks_30d / inquiries_30d 등 "_30d" suffix = 지난 30일 누적
- budget_amount는 budget_type 단위 (weekly = 주 예산, daily = 일 예산)
- **주/일 예산 소진율 판단은 반드시 week_total_actual 또는 week_by_date_actual[오늘] 기준**.
  절대 서비스별 week_cost 합을 실지출로 쓰지 말 것 (proxy는 오매칭 가능성 있음).
- week_total_actual이 예상보다 작다(일 예산 × 경과일 × 0.5 미만) = 볼륨 부족 → CPC 상향 고려
- week_total_actual이 주 예산에 근접 = 볼륨 과다 → 저 ROI 서비스 CPC 하향

## 4단계 전략 (볼륨 → CTR → CVR → ROI) — 서비스별 자동 판정
**budget.priority = 'volume' 인 동안에는 Phase 1~2 초점. Phase 3~4는 priority='roi' 전환 시 활성.**

### Phase 1 — 볼륨 확보 (현재 주 단계, priority=volume 기본)
조건: impressions_30d < 500 OR clicks_30d < 10 OR (주 예산 소진율 0.5 미만 AND 경과일 3일+)
행동:
  - 일 최대 +40%까지 상향 허용 (Phase1 가드)
  - suggested_cpc 목표: suggested_cpc_stats.p25 ~ median
  - 노출 적은 서비스는 고의도 키워드 enable, pause/cut 금지
  - 예산 초과 우려 무시. volume 확보가 최우선
  - actions[].phase = "volume"

### Phase 2 — CTR 최적화
조건: impressions_30d ≥ 500 AND clicks_30d ≥ 10 AND CTR_30d < 2.0%
행동:
  - CPC 변경 ±15% 이내 (소폭)
  - keywords_bottom(노출 10+ 클릭 0) 에 해당하는 키워드 disable
  - CTR 높은 키워드 유지, suggested_cpc_stats.median 이하 우량 키워드 enable
  - CPC 하향은 최소화 (볼륨 손실 방지), 상향은 시장 추천가 median까지
  - actions[].phase = "ctr"

### Phase 3 — CVR 최적화
조건: CTR_30d ≥ 2.0% AND clicks_30d ≥ 30 AND cvr_inquiry_30d < 5%
행동:
  - 문의 전환 많은 키워드 CPC 상향 (해당 키워드 대비 +15%)
  - 클릭만 많고 문의 없는 키워드 disable 우선
  - CPC ±15% 범위
  - actions[].phase = "cvr"

### Phase 4 — ROI 최적화 (priority='roi' 전환 후 활성)
조건: cvr_inquiry_30d ≥ 5% OR cvr_order_30d ≥ 3% (전환 품질 충분)
행동:
  - ROAS/ROI 기반 ±20% 세밀 조정
  - 음수 ROI 2주 지속 서비스는 daily-review가 pause 고려 (본 봇은 제안만)
  - actions[].phase = "roi"

### 자동 단계 전환
각 서비스마다 위 조건 독립 평가. 팀 전체 단계는 overall_note에 언급.
priority='volume' 이면 Phase 3~4 기준을 만족해도 Phase 2까지만 수행 (CPC 하향 금지).

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
    // Phase 가드: volume(±40%) > ctr/cvr(±15%) > roi(±20%). 기본은 서비스 지표로 추정
    const mt = metricsByPid[a.product_id];
    const volumePhase = mt && (mt.impressions_30d < 500 || mt.clicks_30d < 10);
    const budgetVolumePriority = (budget?.priority === 'volume');
    const declaredPhase = (a.phase || '').toString().toLowerCase();
    const effectivePhase = declaredPhase || (volumePhase ? 'volume' : 'ctr');
    let maxChangePct = 20;
    if (effectivePhase === 'volume') maxChangePct = 40;
    else if (effectivePhase === 'ctr' || effectivePhase === 'cvr') maxChangePct = 15;
    // priority='volume' 이면 아래로 내리는 것은 5% 이내로 제한 (볼륨 손실 방지)
    a.phase = effectivePhase;
    if (cur > 0) {
      const upper = cur * (1 + maxChangePct / 100);
      // priority='volume' 이면 하향을 ±5%로 더 빡세게 제한. 아니면 phase별 가드 동일.
      const downPct = budgetVolumePriority ? 5 : maxChangePct;
      const lower = cur * (1 - downPct / 100);
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
