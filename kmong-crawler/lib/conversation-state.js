/**
 * 크몽 대화 상태 분류기 (Conversation State Classifier)
 *  - 고객 메시지 + 대화 히스토리 → 응답 모드 결정
 *  - 목적: "자동생성만 하고 맥락 파악 못하는 봇" 문제 해결
 *    (#78 케이스: 고객 "미팅 후 회신" → 봇이 포트폴리오+재견적 push)
 *
 *  반환 스키마:
 *  {
 *    ball_in_court: 'us' | 'customer' | 'both',
 *    response_mode: 'minimal_ack' | 'active_reply' | 'close_push' | 'wait_our_turn' | 'human_needed',
 *    stage: 'discovery' | 'quoting' | 'negotiating' | 'standby' | 'post_deal' | 'dispute',
 *    customer_signal: 'waiting' | 'asking' | 'deciding' | 'complaining' | 'neutral',
 *    our_last_promise: string | null,       // 직전에 우리가 한 약속/제공
 *    should_reply: boolean,                 // false면 답변 생성 자체 스킵
 *    reasoning: string,
 *  }
 *
 *  response_mode 매핑:
 *   - minimal_ack: 고객이 "미팅 후 회신"·"검토 후 연락"·"내부 확인" — 공이 고객에게, 간단 인정만
 *   - active_reply: 고객이 질문하거나 논의 진행 중 — 풀 답변 (기본값)
 *   - close_push: heat≥70 + 가격/계약 결정 신호 — CTA 강조
 *   - wait_our_turn: 우리가 고객에게 보내야 할 자료가 있음 — 약속 이행
 *   - human_needed: 컴플레인/환불/법적 — 자동 답변 금지, 알림만
 */
const { askClaude } = require('./claude-max');

const SYSTEM = `당신은 크몽 판매자의 대화 상태 분류기입니다. 고객 메시지 + 직전 대화를 읽고 "지금 이 대화가 어떤 상태인지"를 JSON으로 판단합니다.
답변을 생성하지 말고, 오직 JSON만 출력하세요.

★ 핵심 판단 — ball_in_court (공이 누구에게 있나) ★
대화의 "다음 행동 의무"가 누구에게 있는지 판단:
- customer: 고객이 다음 행동을 약속함. 우리는 기다리면 됨
  예) "미팅 후 회신드리겠습니다", "검토해보고 연락드릴게요", "내부 확인 후 답변"
  예) "알겠습니다 :)", "네 감사합니다" (우리 제안에 대한 수락성 응답, 질문 없음)
- us: 고객이 우리 행동을 기다림
  예) 고객이 질문함 / 우리가 약속한 자료 미전달 / 견적 요청 후 대기
- both: 양쪽 모두 움직일 수 있음 (일반적 논의 진행)

★ response_mode 결정 ★
1. minimal_ack: ball_in_court=customer AND 고객 메시지가 "대기/감사/수용" 성격
   → 1~2문장 따뜻한 인정만. CTA·포트폴리오·견적·추가 제안 금지
   → 트리거 키워드: "회신드리", "연락드리", "미팅 후", "검토 후", "확인 후", "나중에", "천천히", "알겠습니다", "감사합니다" (질문 없음)

2. active_reply: 고객이 질문·논의·스펙 조율 중 (기본값)
   → 풀 답변 생성

3. close_push: 가격·결제·계약 결정 신호 ("결제할게요", "진행할게요", "몇 만원에 가능?")
   → CTA 강하게, 다음 스텝 명확히

4. wait_our_turn: 직전 우리 답변에 약속(자료/견적/이미지) 있는데 아직 안 보냄
   → 자료 보낼 수 있으면 보내고, 없으면 언제까지 보낼지 명확히

5. human_needed: 컴플레인/환불/취소/법적/세무/기존 결제 건 변경
   → should_reply=false. 자동 답변 금지

★ 중요 판단 규칙 ★
- 직전 우리 메시지가 견적/포트폴리오/계획을 이미 보냈고, 고객이 "확인하고 연락"이라 하면 → minimal_ack (절대 재견적 금지)
- 고객 메시지가 20자 이하 + 감사/수용 표현이면 → minimal_ack 강하게 의심
- 고객이 질문 부호(?), 구체 요청("~해주세요", "~가능한가요") 있으면 → active_reply
- 메시지에 "미팅", "검토", "회의", "회신" 단어가 "후"와 함께 나오면 → minimal_ack 거의 확정
- 감정이 frustrated/angry이거나 "환불", "취소", "법적" 키워드 → human_needed

★ our_last_promise 추출 ★
직전 assistant 메시지에서 우리가 "보내드릴게요", "전달드리겠습니다", "준비해서" 류로 약속한 게 있으면 그 내용을 요약. 없으면 null.

반드시 JSON 객체 하나만 출력. 마크다운 코드블럭 금지, 설명 금지.`;

async function classifyConversationState({ messageContent, thread = [], gigTitle = '' }) {
  if (!messageContent || !messageContent.trim()) {
    return { ok: true, state: defaultState('empty_message') };
  }

  const recent = thread.slice(-9, -1);
  const historyBlock = recent.length > 0
    ? '\n[직전 대화 (오래된 → 최신)]\n' + recent.map((m, i) =>
        `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${String(m.content || '').slice(0, 300)}`
      ).join('\n')
    : '';

  const gigBlock = gigTitle ? `\n[고객이 본 서비스 페이지: ${gigTitle}]` : '';

  const userMsg = `${gigBlock}${historyBlock}

[지금 답변해야 할 고객 메시지]
${messageContent}

위 대화의 상태를 JSON으로 분류하세요. ball_in_court / response_mode / should_reply 판단이 가장 중요합니다.`;

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
    if (!parsed) return { ok: false, error: `JSON 파싱 실패: ${r.text?.slice(0, 200)}` };

    return { ok: true, state: normalizeState(parsed), raw: r.text, model: r.model };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function defaultState(reason) {
  return {
    ball_in_court: 'both',
    response_mode: 'active_reply',
    stage: 'discovery',
    customer_signal: 'neutral',
    our_last_promise: null,
    should_reply: true,
    reasoning: reason || '기본값',
  };
}

function normalizeState(j) {
  const ball = ['us', 'customer', 'both'].includes(j.ball_in_court) ? j.ball_in_court : 'both';
  const mode = ['minimal_ack', 'active_reply', 'close_push', 'wait_our_turn', 'human_needed'].includes(j.response_mode)
    ? j.response_mode : 'active_reply';
  const stage = ['discovery', 'quoting', 'negotiating', 'standby', 'post_deal', 'dispute'].includes(j.stage)
    ? j.stage : 'discovery';
  const signal = ['waiting', 'asking', 'deciding', 'complaining', 'neutral'].includes(j.customer_signal)
    ? j.customer_signal : 'neutral';
  // should_reply 자동: human_needed면 false, 그 외 true (모델이 명시 안 했으면)
  const should_reply = typeof j.should_reply === 'boolean' ? j.should_reply : (mode !== 'human_needed');

  return {
    ball_in_court: ball,
    response_mode: mode,
    stage,
    customer_signal: signal,
    our_last_promise: typeof j.our_last_promise === 'string' && j.our_last_promise.trim() ? j.our_last_promise.slice(0, 300) : null,
    should_reply,
    reasoning: typeof j.reasoning === 'string' ? j.reasoning.slice(0, 400) : '',
  };
}

function safeJsonParse(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(s.slice(first, last + 1));
  } catch { return null; }
}

/**
 * 메인 답변 프롬프트에 주입할 상태 컨텍스트 — active_reply / close_push / wait_our_turn 모드에서만 사용
 *  (minimal_ack / human_needed는 Opus 메인 호출을 스킵하므로 이 함수가 필요 없음)
 */
function formatStateForPrompt(state) {
  if (!state) return '';
  const lines = [];
  lines.push('[대화 상태 분석]');
  lines.push(`• 공 위치: ${state.ball_in_court}${state.ball_in_court === 'customer' ? ' (고객이 먼저 움직여야 함)' : state.ball_in_court === 'us' ? ' (우리가 답변·자료 제공 필요)' : ''}`);
  lines.push(`• 응답 모드: ${state.response_mode}`);
  lines.push(`• 대화 단계: ${state.stage}`);
  if (state.our_last_promise) {
    lines.push(`• 우리가 직전에 한 약속: ${state.our_last_promise}`);
    lines.push(`  → 이 약속이 이행됐는지 확인. 미이행이면 이번 답변에 포함해야 함`);
  }
  if (state.response_mode === 'close_push') {
    lines.push(`• ★ CLOSE PUSH 모드 ★ — 구체적 다음 스텝(결제 링크/계약 시점/착수일) 명시. "문의 기다립니다" 같은 소극적 마무리 금지`);
  }
  if (state.response_mode === 'wait_our_turn') {
    lines.push(`• ★ WAIT OUR TURN 모드 ★ — 우리가 약속한 자료를 보내거나, 언제까지 보낼지 명확히 약속. 새로운 질문 던지기 전에 숙제부터 마무리`);
  }
  return lines.join('\n');
}

module.exports = { classifyConversationState, formatStateForPrompt, defaultState };
