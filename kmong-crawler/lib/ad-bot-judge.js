/**
 * 광고 봇 — Claude Opus 4.7 판단 래퍼
 * 입력: 서비스별 메트릭 배열 + 예산 설정 + 우선순위
 * 출력: 서비스별 희망 CPC 조정 제안 JSON
 */

const { askClaude } = require('./claude-max');

const SYSTEM_PROMPT = `당신은 크몽(kmong) CPC 광고 최적화 전문가입니다.
셀러의 지난 30일 서비스별 성과 데이터와 예산 설정을 보고,
각 서비스의 "희망 클릭 비용(CPC)"을 조정해야 합니다.

## 조정 규칙
1. 목표 우선순위: ROI > CVR(문의/주문) > CTR
2. 예산 한도: 제시된 일예산을 초과해선 안 됨
3. 희망 CPC 범위: min_cpc / max_cpc 경계 엄수
4. 희망가 = 추천가 분포의 25%~75% 백분위 안에서 조정 권장
5. 클릭은 많은데 문의/주문 없음 → CPC 낮춤
6. 노출은 많은데 클릭 없음 → 키워드 문제 (CPC 조정만으로 해결 X, 재검토 필요 플래그)
7. ROI > 100%인 서비스 → CPC 상향으로 노출 확대
8. ROI < 0%이면서 30일 지출 큰 서비스 → CPC 하향 (노출 축소)

## 출력 포맷
반드시 JSON 한 덩어리만. 설명 문장 없이. 다음 스키마:
{
  "actions": [
    {
      "product_id": "string",
      "current_desired_cpc": number,
      "suggested_desired_cpc": number,
      "change_pct": number,
      "priority": 1-5,
      "confidence": "high|medium|low",
      "reasoning": "한 문장, 80자 이하"
    }
  ],
  "overall_note": "전체 상황 한 줄 요약"
}

변경이 불필요한 서비스도 suggested = current 로 반드시 포함 (reasoning에 '유지 사유').`;

function buildUserMessage(metrics, budget) {
  return `## 예산 설정
${JSON.stringify(budget, null, 2)}

## 서비스별 메트릭 (지난 30일)
${JSON.stringify(metrics, null, 2)}

위 데이터를 바탕으로 각 서비스의 suggested_desired_cpc를 결정하세요.`;
}

async function judgeAdjustments(metrics, budget) {
  if (!metrics.length) return { ok: false, error: '메트릭 없음' };

  const userMsg = buildUserMessage(metrics, budget);
  const r = await askClaude({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
    model: 'opus',
    max_tokens: 16384,
  });
  if (!r.ok) return { ok: false, error: r.error, status: r.status };

  let parsed;
  try {
    const m = r.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : r.text);
  } catch (e) {
    return { ok: false, error: `JSON 파싱 실패: ${e.message}`, raw: r.text.slice(0, 500) };
  }

  if (!Array.isArray(parsed.actions)) return { ok: false, error: 'actions 배열 없음', raw: parsed };

  // 가드레일 적용: min_cpc / max_cpc 범위 내로 clip + 변화율 ±50% 이내로 제한
  const maxChangePct = 50;
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
  }

  return { ok: true, judgment: parsed, usage: r.usage };
}

module.exports = { judgeAdjustments, SYSTEM_PROMPT };
