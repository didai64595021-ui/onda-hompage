/**
 * 크몽 대화 요약기 — 장기 스레드에서 맥락 희석·동문서답 방지
 *  - thread 메시지 ≥6개일 때 Haiku로 구조화 요약
 *  - 목적: 원문 history 대신 요약 블록을 프롬프트에 주입 → 토큰 절약 + Claude 집중도 상승
 *  - 추출: funnel_stage, customer_snapshot, our_commitments, open_items, red_flags
 *
 *  ※ thread 길이 6 미만이면 요약 불필요 (원문 그대로 쓰는 게 더 정확)
 */
const { askClaude } = require('./claude-max');

const THRESHOLD = 6;

const SYSTEM = `당신은 크몽 판매 대화의 요약 전문가입니다. 고객-판매자 대화 스레드를 구조화해서 JSON 출력.

반드시 아래 필드를 채우세요:
- funnel_stage: 'greeting' | 'spec_gathering' | 'quote_presented' | 'negotiation' | 'ready_to_close' | 'post_order' | 'complaint'
- customer_snapshot: 고객이 누구인지 한 줄 요약 (업종/규모/현재 상태)
- customer_needs: string[] — 고객이 원하는 것 (가격대, 기능, 스타일)
- our_commitments: string[] — 판매자(우리)가 이미 약속한 구체 수치/조건 (예: "DELUXE 20만원 안내", "5일 완성 약속", "서브페이지 +5만원 제안")
- open_items: string[] — 아직 확정되지 않은 항목 (고객 결정 대기, 추가 정보 필요)
- red_flags: string[] — 주의점 (환불 언급, 경쟁사 비교, 예산 부족 신호, 컴플레인)

오직 JSON 한 객체만 출력. 마크다운/설명 없이.`;

/**
 * @param {object} opts
 * @param {Array<{role, content}>} opts.thread - 전체 대화 스레드
 * @param {string} [opts.gigTitle]
 * @returns {Promise<{ok, summary?, shouldUse?, error?}>}
 *   shouldUse: thread 길이가 THRESHOLD 미만이면 false (요약 불필요)
 */
async function summarizeConversation({ thread = [], gigTitle = '' }) {
  if (!Array.isArray(thread) || thread.length < THRESHOLD) {
    return { ok: true, shouldUse: false, reason: `thread ${thread.length} < ${THRESHOLD}` };
  }

  // 요약 대상: 최신 2개는 원문 유지하고 그 이전만 요약 (최신은 프롬프트에 있을 것)
  const toSummarize = thread.slice(0, -2);
  if (toSummarize.length < 3) {
    return { ok: true, shouldUse: false, reason: '요약할 이전 메시지 부족' };
  }

  const userMsg = `[서비스 페이지: ${gigTitle || '(미상)'}]

[대화 스레드 — 오래된 → 최신순]
${toSummarize.map((m, i) =>
  `${i + 1}. ${m.role === 'assistant' ? '[판매자]' : '[고객]'} ${String(m.content || '').slice(0, 300)}`
).join('\n')}

위 대화를 JSON으로 요약하세요.`;

  try {
    const r = await askClaude({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      model: 'haiku',
      max_tokens: 800,
      temperature: 0.1,
    });
    if (!r.ok) return { ok: false, error: r.error };

    const parsed = safeJsonParse(r.text);
    if (!parsed) return { ok: false, error: `JSON 파싱 실패: ${r.text?.slice(0, 160)}` };

    return {
      ok: true,
      shouldUse: true,
      summary: normalize(parsed),
      model: r.model,
      summarized: toSummarize.length,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function normalize(j) {
  const arr = (x) => Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : [];
  const STAGES = ['greeting', 'spec_gathering', 'quote_presented', 'negotiation', 'ready_to_close', 'post_order', 'complaint'];
  return {
    funnel_stage: STAGES.includes(j.funnel_stage) ? j.funnel_stage : 'spec_gathering',
    customer_snapshot: typeof j.customer_snapshot === 'string' ? j.customer_snapshot.slice(0, 300) : '',
    customer_needs: arr(j.customer_needs),
    our_commitments: arr(j.our_commitments),
    open_items: arr(j.open_items),
    red_flags: arr(j.red_flags),
  };
}

function safeJsonParse(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch { return null; }
}

/**
 * 메인 프롬프트에 주입할 요약 블록 생성
 */
function formatSummaryForPrompt(summary, summarizedCount = 0) {
  if (!summary) return '';
  const lines = [];
  lines.push(`[대화 맥락 요약 — 이전 ${summarizedCount}개 메시지 정리]`);
  lines.push(`• 퍼널 단계: ${summary.funnel_stage}`);
  if (summary.customer_snapshot) lines.push(`• 고객: ${summary.customer_snapshot}`);
  if (summary.customer_needs.length) {
    lines.push(`• 고객 니즈:`);
    summary.customer_needs.forEach(n => lines.push(`    - ${n}`));
  }
  if (summary.our_commitments.length) {
    lines.push(`• 🔒 우리가 이미 약속한 것 (답변 일관성 유지 위해 번복 금지):`);
    summary.our_commitments.forEach(c => lines.push(`    - ${c}`));
  }
  if (summary.open_items.length) {
    lines.push(`• 미정 항목 (고객 응답 대기 또는 결정 필요):`);
    summary.open_items.forEach(o => lines.push(`    - ${o}`));
  }
  if (summary.red_flags.length) {
    lines.push(`• 🚩 주의점:`);
    summary.red_flags.forEach(f => lines.push(`    - ${f}`));
  }
  return lines.join('\n');
}

module.exports = { summarizeConversation, formatSummaryForPrompt, THRESHOLD };
