/**
 * 크몽 답변 자기검증기 (Reply Verifier)
 *  - 생성된 답변이 intent.must_address / explicit_questions / customer_facts 를 커버하는지 Haiku로 체크
 *  - 커버율 70% 미만이면 regen 트리거 (1회 한정)
 *  - 목적: 동문서답/맥락 이탈 방지 — Claude 메인이 요구사항 일부를 빠뜨리면 잡아냄
 */
const { askClaude } = require('./claude-max');

const SYSTEM = `당신은 크몽 답변 품질 검사관입니다. 고객 의도(must-cover 목록)와 실제 답변 본문을 비교해서 빠진 게 있는지 JSON으로 보고하세요.

판정 기준:
- 명시 질문(explicit_questions): 답변이 그 질문에 대한 구체적인 답(Yes/No + 근거, 가격, 기간 등)을 제공했는가
- 커버 포인트(must_address): 답변에 해당 주제가 의미 있게 언급됐는가
- 고객 제공 사실(customer_facts): 답변이 그 사실을 인용/반영했는가

약식 답변("가능합니다", "예") 만으로는 "답했다"고 인정하지 마세요. 근거나 다음 스텝이 붙어야 OK.

오직 JSON 한 객체만 출력. 마크다운 없이.
스키마:
{
  "covered": string[],       // 커버된 포인트 원문
  "missing": string[],       // 빠뜨린 포인트 원문
  "off_topic": string[],     // 답변에 있지만 고객이 묻지 않은 내용 (노이즈)
  "coverage_ratio": number,  // 0.0 ~ 1.0
  "verdict": "pass" | "fail",// 0.7 이상 = pass
  "reason": string           // 한 줄 판단 근거
}`;

/**
 * @param {object} opts
 * @param {object} opts.intent - extractIntent 결과
 * @param {string} opts.replyText - 생성된 답변
 * @param {string} [opts.customerMessage] - 원 고객 메시지 (판단 보조)
 * @returns {Promise<{ok, verdict, coverage_ratio, missing, off_topic, reason, error?}>}
 */
async function verifyReply({ intent, replyText, customerMessage = '' }) {
  if (!intent || !replyText) return { ok: false, error: 'intent/replyText 누락' };

  // 체크할 포인트가 거의 없으면 통과 처리 (막연한 문의 등)
  const checkPoints = [
    ...(intent.explicit_questions || []).map(q => `[명시질문] ${q}`),
    ...(intent.must_address || []).map(m => `[커버포인트] ${m}`),
    ...(intent.customer_facts || []).map(f => `[고객사실] ${f}`),
  ];
  if (checkPoints.length === 0) {
    return { ok: true, verdict: 'pass', coverage_ratio: 1.0, missing: [], off_topic: [], reason: '체크포인트 없음 (short_reply/other)' };
  }

  const userMsg = `[고객 원 메시지]
${String(customerMessage || '').slice(0, 400)}

[의도 요약]
주요 의도: ${intent.primary_intent}${intent.is_short_reply ? ' (짧은 반문)' : ''}

[반드시 커버해야 할 포인트]
${checkPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

[생성된 답변]
${replyText}

각 포인트별로 답변이 커버했는지 판정하고 JSON 반환.`;

  try {
    const r = await askClaude({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      model: 'haiku',
      max_tokens: 600,
      temperature: 0.1,
    });
    if (!r.ok) return { ok: false, error: r.error };

    const parsed = safeJsonParse(r.text);
    if (!parsed) return { ok: false, error: `JSON 파싱 실패: ${r.text?.slice(0, 160)}` };

    const ratio = typeof parsed.coverage_ratio === 'number'
      ? Math.max(0, Math.min(1, parsed.coverage_ratio))
      : ((parsed.covered || []).length / Math.max(1, checkPoints.length));
    const verdict = parsed.verdict === 'pass' || ratio >= 0.7 ? 'pass' : 'fail';

    return {
      ok: true,
      verdict,
      coverage_ratio: ratio,
      covered: arr(parsed.covered),
      missing: arr(parsed.missing),
      off_topic: arr(parsed.off_topic),
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
      model: r.model,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function arr(x) {
  return Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : [];
}

function safeJsonParse(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch { return null; }
}

module.exports = { verifyReply };
