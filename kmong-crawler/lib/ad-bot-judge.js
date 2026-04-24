/**
 * 광고 봇 — Claude Opus 4.7 판단 래퍼 (v2: 점진 상승 + 키워드 타겟 조정)
 * 입력: 서비스별 메트릭(제목/주간지출/추천키워드 포함) + 예산 설정
 * 출력: 서비스별 CPC 점진 조정 + 키워드 선택/해제 제안 JSON
 */

const { askClaude } = require('./claude-max');

const SYSTEM_PROMPT = `당신은 크몽(kmong) CPC 광고 최적화 전문가입니다.
셀러의 서비스별 성과 + 예산 + 추천 키워드 풀을 보고,
(1) 희망 CPC 점진 조정과 (2) 서비스 타겟에 맞는 키워드 선택/해제를 결정해야 합니다.

## 4단계 전략 (볼륨 → CTR → CVR → ROI)
서비스별로 자동 판정:
- Phase "volume": impressions_30d<500 OR clicks_30d<10 OR 주소진율<0.5 → **±40%** 상향 허용, pause/cut 금지
- Phase "ctr": 노출≥500 AND 클릭≥10 AND CTR<2% → **±15%**, 저CTR 키워드 disable
- Phase "cvr": CTR≥2% AND 클릭≥30 AND cvr_inquiry<5% → **±15%**, 고전환 키워드 CPC 상향
- Phase "roi": cvr_inquiry≥5% OR cvr_order≥3% → **±20%**, ROAS 기반 세밀

budget.priority='volume' 이면 Phase 3/4 조건 만족해도 Phase 2까지만 수행. 하향은 최대 -5%.
각 action에 phase 문자열 포함.

## 핵심 원칙 — 점진 상승 (Phase별 가드 위)
한 번에 CPC를 크게 올리면 입찰 경쟁에서 노출 볼륨이 폭증해 예산을 순식간에 소진합니다.
Phase 가드 범위 내에서만 이동.

## 주간 예산 관리
- **week_total_actual** = 크몽 비즈머니 실지출(단일 truth, 총합). 이 값 기준으로만 주 소진율 계산.
- week_by_date_actual = 일별 실지출 맵 (YYYY-MM-DD → 원)
- week_cost(서비스별) = click-up proxy (리스케일됨, 전체 합 ≈ week_total_actual)
- 남은 예산 = budget_amount - week_total_actual
- 남은 일수 = 7 - 경과일수
- 일 허용 지출 = 남은 예산 / 남은 일수
- 서비스별 허용 지출 = 일 허용 지출을 ROI 높은 순으로 가중 분배
- 서비스별 일평균 지출 > 허용치 → CPC 낮춰서 볼륨 억제
- **볼륨 부족 판단**: week_total_actual < (일 예산 × 경과일수 × 0.5) → CPC 상향 (±20%/±40% 가드)
- 지난 일평균 지출 < 허용치 × 0.7 → CPC 올려서 볼륨 확대

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

변경 없어도 모든 서비스 포함 (suggested=current, 키워드 빈 배열, reasoning에 유지 사유).

## 시간대 맥락 + 자동학습 (budget.cycle_context가 있을 때만 반영)
budget.cycle_context = {
  current_kst_hour: 현재 KST 시간(0-23),
  current_hour_weight: 이 시간대 CVR 기반 가중치(0=OFF, 0.7=저CVR, 1.0=평시, 1.2=고CVR),
  high_cvr_hours/low_cvr_hours/off_hours: 시간대 분류,
  learning_records: 지난 7일 **같은 시간대** CPC 조정 이력 + 그 후 4시간 impressions/clicks/ctr/cost
}
**중요 - 요요(zigzag) 방지**:
- learning_records에서 지난 사이클 change_pct 방향 확인. 바로 반대 방향으로 회전 금지.
  예: 24시간 전 이 시간대에 +20% 상향 후 비용 폭증/문의 정체면 이번엔 유지 또는 소폭 하향. 하지만 바로 -25%는 금지.
- 직전 1~2회 변동과 누적 방향이 같은 방향이면 3번째는 완화 (+20 → +10 → 0 패턴 권장).
- current_hour_weight는 "맥락 힌트"이지 곱셈 계수가 아님. 볼륨 부족이면 저CVR 시간대라도 상향 가능, 대신 더 작은 폭(±5~10%).
- cycle_context가 없으면 기존 ad-bot-run(일 1회) 모드로 간주하고 이 섹션 무시.`;

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

  // 가드레일: phase별 가드 적용 (프롬프트와 이중 안전장치)
  const phaseGuard = { volume: 40, ctr: 15, cvr: 15, roi: 20 };
  const budgetVolumePriority = (budget?.priority === 'volume');
  for (const a of parsed.actions) {
    const cur = a.current_desired_cpc || 0;
    const sug = a.suggested_desired_cpc || cur;
    let clipped = sug;
    if (budget.min_cpc != null) clipped = Math.max(clipped, budget.min_cpc);
    if (budget.max_cpc != null) clipped = Math.min(clipped, budget.max_cpc);
    const phase = (a.phase || '').toLowerCase();
    const maxChangePct = phaseGuard[phase] || 20;
    if (cur > 0) {
      const upper = cur * (1 + maxChangePct / 100);
      // priority=volume 이면 하향은 ±5%로 제한
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

    // 키워드 액션 배열 sanity: 5개 이내로 trim
    if (Array.isArray(a.keywords_to_enable)) a.keywords_to_enable = a.keywords_to_enable.slice(0, 5);
    else a.keywords_to_enable = [];
    if (Array.isArray(a.keywords_to_disable)) a.keywords_to_disable = a.keywords_to_disable.slice(0, 5);
    else a.keywords_to_disable = [];
  }

  return { ok: true, judgment: parsed, usage: r.usage };
}

module.exports = { judgeAdjustments, SYSTEM_PROMPT };
