/**
 * 광고 봇 — Claude Opus 4.7 판단 래퍼 (v2: 점진 상승 + 키워드 타겟 조정)
 * 입력: 서비스별 메트릭(제목/주간지출/추천키워드 포함) + 예산 설정
 * 출력: 서비스별 CPC 점진 조정 + 키워드 선택/해제 제안 JSON
 */

const { askClaude } = require('./claude-max');

const SYSTEM_PROMPT = `당신은 크몽(kmong) CPC 광고 최적화 전문가입니다.
셀러의 서비스별 성과 + 예산 + 추천 키워드 풀을 보고,
(1) 희망 CPC 점진 조정과 (2) 서비스 타겟에 맞는 키워드 선택/해제를 결정해야 합니다.

## 핵심 원칙 — 점진 상승
한 번에 CPC를 크게 올리면 입찰 경쟁에서 노출 볼륨이 폭증해 예산을 순식간에 소진합니다.
**CPC 변경은 하루 ±20% 이내**. 그 이상 조정이 필요해도 여러 날 나눠서.
오늘은 목표치 방향으로 한 걸음만.

## 주간 예산 관리
입력에 budget_type='weekly', budget_amount가 있으면 주 단위 예산.
- week_cost = 이번 주(월~오늘) 이미 지출한 금액
- 남은 예산 = budget_amount - week_cost
- 남은 일수 = 7 - 경과일수
- 일 허용 지출 = 남은 예산 / 남은 일수
- 서비스별 허용 지출 = 일 허용 지출을 ROI 높은 순으로 가중 분배
- 현재 서비스의 지난 일평균 지출 > 허용치 → CPC 낮춰서 볼륨 억제
- 지난 일평균 지출 < 허용치 × 0.7 → CPC 올려서 볼륨 확대 (±20% 내)

## 키워드 타겟 조정 — 서비스 gig_title 기준
gig_title(예: "홈페이지 모바일 깨짐 24시간 안에 해결")의 핵심 의도를 분석하고,
suggested_keywords 리스트에서:
- **keywords_to_enable**: 서비스 핵심 의도와 직결되는 키워드 (고의도 검색어)
- **keywords_to_disable**: 서비스와 관련 낮은 키워드 (예: 홈페이지 수리 서비스에 "프로그래밍")
둘 다 5개 이내로 제한. 확신 없으면 빈 배열.

## 출력 JSON 스키마 (이외 텍스트 금지)
{
  "actions": [
    {
      "product_id": "string",
      "gig_title": "string (참고용)",
      "current_desired_cpc": number,
      "suggested_desired_cpc": number,
      "change_pct": number,
      "week_cost": number,
      "week_budget_share": number,
      "keywords_to_enable": ["kw1", "kw2"],
      "keywords_to_disable": ["kw3"],
      "priority": 1-5,
      "confidence": "high|medium|low",
      "reasoning": "한 줄, 100자 이하. 왜 이 방향으로 점진 조정하는지 + 키워드 판단 근거"
    }
  ],
  "overall_note": "전체 상황 + 주간 예산 소진 전망 한 줄"
}

변경 없어도 모든 서비스 포함 (suggested=current, 키워드 빈 배열, reasoning에 유지 사유).`;

function buildUserMessage(metrics, budget) {
  return `## 예산
${JSON.stringify(budget, null, 2)}

## 서비스별 메트릭 (지난 ${metrics[0]?.days || 30}일, 이번 주 지출 포함)
${JSON.stringify(metrics, null, 2)}

위를 바탕으로 각 서비스의 CPC 점진 조정 + 키워드 선택/해제를 JSON 한 덩어리로 리턴하세요.`;
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

  // 가드레일: min/max clip + 변화율 ±20% 이내로 강제 (프롬프트와 이중 안전장치)
  const maxChangePct = 20;
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

    // 키워드 액션 배열 sanity: 5개 이내로 trim
    if (Array.isArray(a.keywords_to_enable)) a.keywords_to_enable = a.keywords_to_enable.slice(0, 5);
    else a.keywords_to_enable = [];
    if (Array.isArray(a.keywords_to_disable)) a.keywords_to_disable = a.keywords_to_disable.slice(0, 5);
    else a.keywords_to_disable = [];
  }

  return { ok: true, judgment: parsed, usage: r.usage };
}

module.exports = { judgeAdjustments, SYSTEM_PROMPT };
