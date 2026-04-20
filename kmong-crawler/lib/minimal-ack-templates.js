/**
 * Minimal-ack 템플릿 (대기 수용 모드)
 *  - 고객이 "미팅 후 회신"·"검토 후 연락"·"알겠습니다" 류로 공을 우리한테 넘기지 않은 상태
 *  - Opus 호출 스킵. 고정 템플릿 중 맥락에 맞게 선택
 *  - 원칙: 1~2문장 / 따뜻함 / 이모지 :) 하나 OK / CTA·포트폴리오·견적·질문 금지
 *
 *  트리거 시나리오별 분기:
 *   - meeting_wait: "미팅 후 회신" — 미팅 잘 다녀오시라는 인사
 *   - review_wait: "검토 후 연락" - 편하게 보시라는 인사
 *   - acknowledge: "알겠습니다"·"감사합니다" - 수락 확인
 *   - general_standby: 그 외 대기성
 */

const TEMPLATES = {
  meeting_wait: [
    '네 대표님! 내부 미팅 잘 다녀오세요 :)\n편하게 회신 주시면 됩니다.',
    '네넵, 좋은 미팅 되시길 바랄게요! 기다리고 있겠습니다.',
    '네 알겠습니다 :) 미팅 후 천천히 연락 주세요.',
  ],
  review_wait: [
    '네 편하게 검토 부탁드립니다 :) 궁금하신 점 생기면 언제든 메시지 주세요.',
    '네넵 천천히 확인해보시고 연락 주세요. 기다리고 있겠습니다!',
    '알겠습니다 :) 검토 후 편하게 답변 주시면 됩니다.',
  ],
  acknowledge: [
    '네 감사합니다 :)',
    '넵 알겠습니다. 추가로 궁금하신 점 있으시면 언제든 말씀해주세요!',
    '네넵! 편하게 연락 주세요 :)',
  ],
  general_standby: [
    '네 알겠습니다 :) 편하게 연락 주세요!',
    '넵 기다리고 있겠습니다. 필요하신 부분 있으시면 말씀해주세요!',
    '네 감사합니다 :) 언제든 편하게 메시지 주세요.',
  ],
};

/**
 * 메시지 + 대화 상태 보고 시나리오 판별
 */
function detectScenario(messageContent = '', state = {}) {
  const msg = String(messageContent).toLowerCase().trim();

  // 미팅/회의 후 회신
  if (/미팅|회의|내부\s*(검토|확인|회의|미팅)/.test(msg) && /후|이후|끝나고|다녀오|마치고/.test(msg)) {
    return 'meeting_wait';
  }
  if (/회신\s*(드리|하겠|할게|드릴|예정)|연락\s*(드리|하겠|할게|드릴|예정)/.test(msg) && /미팅|회의|검토|확인|이후|후|나중/.test(msg)) {
    return 'meeting_wait';
  }

  // 검토 후 연락
  if (/검토|확인/.test(msg) && /(후|이후|하고|해보고)/.test(msg)) {
    return 'review_wait';
  }

  // 단순 수락/감사
  if (/알겠습니다|감사합니다|네넵|네 네|알겠어요|고맙습니다|땡큐|ok|오케이/.test(msg) && msg.length < 50) {
    return 'acknowledge';
  }

  return 'general_standby';
}

/**
 * 맥락에 맞는 minimal_ack 답변 선택
 *  @param {object} opts
 *  @param {string} opts.messageContent - 고객 메시지
 *  @param {object} [opts.state] - conversation-state 결과
 *  @param {string} [opts.customerName] - 고객 이름 (호칭 치환용 — 현재 안 씀, 크몽은 닉네임이라 '대표님' 기본)
 *  @returns {{ text: string, scenario: string, template_index: number }}
 */
function selectMinimalAck({ messageContent = '', state = null } = {}) {
  const scenario = detectScenario(messageContent, state);
  const pool = TEMPLATES[scenario] || TEMPLATES.general_standby;

  // 같은 고객에게 매번 같은 템플릿 나오지 않게 랜덤 — 대화 ID가 있으면 해시 기반 (재현성), 없으면 random
  const idx = Math.floor(Math.random() * pool.length);
  return {
    text: pool[idx],
    scenario,
    template_index: idx,
  };
}

module.exports = { selectMinimalAck, detectScenario, TEMPLATES };
