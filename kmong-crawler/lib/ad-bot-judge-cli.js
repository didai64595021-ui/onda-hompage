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

## 원칙
- CPC 변경은 하루 ±20% 이내 (점진)
- 주 예산 관리: week_cost + 남은 일수 × 예상일지출이 budget_amount 넘을 듯하면 CPC 낮춤. week_cost가 낮고 여유면 CPC 높여 클릭 확보
- ROI/CVR/CTR은 모두 "_30d" 값 기준으로 평가 (표본 크기 충분)
- 키워드 타겟: gig_title 의도와 직결되는 키워드 enable, 무관한 것 disable (각 5개 이내)
- 변경 없어도 모든 서비스 포함 (suggested=current + reasoning='유지')

## 출력 — JSON 한 덩어리만, 다른 텍스트 금지
{
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

function applyGuardrails(parsed, budget, maxChangePct = 20) {
  if (!Array.isArray(parsed.actions)) return parsed;
  for (const a of parsed.actions) {
    const cur = a.current_desired_cpc || 0;
    const sug = a.suggested_desired_cpc || cur;
    let clipped = sug;
    if (budget.min_cpc != null) clipped = Math.max(clipped, budget.min_cpc);
    if (budget.max_cpc != null) clipped = Math.min(clipped, budget.max_cpc);
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

    const judged = applyGuardrails(parsed, budget);
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
