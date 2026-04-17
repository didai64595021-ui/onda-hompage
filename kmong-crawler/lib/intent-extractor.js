/**
 * 크몽 문의 의도 추출기 (Intent Extractor)
 *  - 고객 메시지 + 대화 히스토리 → 구조화된 JSON 의도
 *  - Haiku 빠른 호출 (~1~2초, 저비용)로 "무엇을 묻는지" 먼저 못박음
 *  - 결과를 메인 답변 프롬프트 최상단에 주입 → 맥락 이탈/동문서답 방지
 *
 *  반환 스키마:
 *  {
 *    primary_intent: 'price' | 'timing' | 'feature_ask' | 'revision' | 'platform_migration'
 *                  | 'portfolio_request' | 'short_reply' | 'clarification' | 'spec_confirm'
 *                  | 'complaint' | 'other',
 *    explicit_questions: string[],         // 고객이 명시적으로 물어본 질문
 *    customer_facts: string[],              // 고객이 제공한 사실/맥락 (업종, 페이지수, 참고사이트 등)
 *    implicit_needs: string[],              // 명시하진 않았지만 짚어야 할 니즈
 *    must_address: string[],                // 답변이 반드시 커버해야 할 포인트
 *    avoid: string[],                       // 피해야 할 내용 (이미 답한 것, 오해 소지)
 *    is_short_reply: boolean,               // "네?" "ㅎㅇ" 같은 짧은 반문
 *    sentiment: 'positive' | 'neutral' | 'concerned' | 'frustrated' | 'angry',
 *    requires_human: boolean,               // 사람 응대 필수 (컴플레인/법적 이슈/환불 등)
 *    urgency: 'low' | 'medium' | 'high',    // 응답 긴급도 (시한·결정 신호)
 *    confidence: 'high' | 'medium' | 'low', // 의도 파악 자신도
 *    reasoning: string,                     // 왜 이렇게 판단했는지 (디버그용)
 *  }
 */
const { askClaude } = require('./claude-max');

const SYSTEM = `당신은 크몽 판매자의 답변 보조자입니다. 고객 메시지를 읽고 "무엇을 답해야 하는지"를 구조화합니다.
답변을 생성하지 말고, 오직 JSON만 출력하세요.

반드시 고려할 것:
1. 고객이 명시적으로 물어본 질문 vs 암시한 니즈를 분리
2. 고객이 제공한 사실(업종/규모/참고 사이트/기존 플랫폼)은 답변에 그대로 인용되어야 함
3. 직전 대화 히스토리가 있으면 "이미 답한 것"은 avoid 에 넣고, "못 답한 것"은 must_address에 넣기
4. "네?" "ㅎㅇ" "?" 같은 1~3자 반문은 is_short_reply=true, primary_intent=clarification
5. 단순 인사("안녕하세요")만 있고 질문 없으면 primary_intent=other + must_address는 "고객 업종/용도 되묻기"

primary_intent 분류:
- price: 견적/가격/비용/얼마
- timing: 기간/며칠/언제/일정
- feature_ask: 특정 기능 가능한지 (카카오/인스타/예약/CMS 등)
- revision: 수정/변경/횟수
- platform_migration: 아임웹/카페24/워드프레스/기존 사이트 이전
- portfolio_request: 포트폴리오/사례/견본 요청
- short_reply: 매우 짧은 반문 ("네?" 등)
- clarification: 우리 답변 이해 안 감, 추가 설명 요구
- spec_confirm: 우리 제안 확인/동의/결제 의사
- complaint: 컴플레인/불만/환불·취소 요청/법적 언급
- other: 막연한 문의, 업종/용도 물어봐야 함

sentiment 판정:
- positive: 긍정/감사/기대
- neutral: 정보 요청 위주, 감정 없음
- concerned: 우려·의심 (품질/비용/기간 걱정)
- frustrated: 반복 설명 요구/답답함/혼란
- angry: 명확한 불만/화남/요구

requires_human=true 조건 (하나라도 해당):
- primary_intent === 'complaint'
- sentiment in ['frustrated', 'angry']
- confidence === 'low' AND 메시지 길이 30자 이상 (의도 불명확한 긴 메시지)
- 환불/취소/법적/세무 관련 언급
- 기존 주문 변경·이미 결제 건 수정 요구

urgency 판정:
- high: "지금", "오늘", "내일", "급해요", "빨리" 명시 또는 주문 이미 진행 중
- medium: 일주일~한 달 내 결정 신호
- low: 일반 탐색 단계

반드시 JSON 객체 하나만 출력. 마크다운 코드블럭 없이, 앞뒤 설명 없이.`;

/**
 * @param {object} opts
 * @param {string} opts.messageContent - 현재 고객 메시지 (답변 대상)
 * @param {Array<{role, content}>} [opts.thread] - 직전 대화 (role: user|assistant)
 * @param {string} [opts.gigTitle] - 고객이 본 서비스 페이지 제목
 * @param {number} [opts.attachmentCount] - 첨부 이미지 수 (내용 분석은 메인 호출에서)
 * @param {Array<{url, title, body}>} [opts.urlSummaries] - 메시지 내 URL 요약
 * @returns {Promise<{ok: boolean, intent?: object, error?: string}>}
 */
async function extractIntent({ messageContent, thread = [], gigTitle = '', attachmentCount = 0, urlSummaries = [] }) {
  if (!messageContent || !messageContent.trim()) {
    return { ok: true, intent: emptyIntent() };
  }

  // 히스토리 블록 (최근 8개만)
  const recent = thread.slice(-9, -1);  // 현재 메시지 제외 직전 8개
  const historyBlock = recent.length > 0
    ? '\n[직전 대화 (오래된 → 최신)]\n' + recent.map((m, i) =>
        `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${String(m.content || '').slice(0, 250)}`
      ).join('\n')
    : '';

  const urlBlock = urlSummaries.length > 0
    ? '\n[고객이 보낸 URL 내용 요약]\n' + urlSummaries.map(u =>
        `- ${u.url}: ${String(u.title || '').slice(0, 80)} / ${String(u.body || '').slice(0, 200)}`
      ).join('\n')
    : '';

  const attachBlock = attachmentCount > 0
    ? `\n[첨부 이미지 ${attachmentCount}장 — 고객이 참고자료/레이아웃/스펙을 그림으로 보냄]` : '';

  const gigBlock = gigTitle ? `\n[고객이 본 서비스 페이지: ${gigTitle}]` : '';

  const userMsg = `${gigBlock}${historyBlock}${urlBlock}${attachBlock}

[지금 답변해야 할 고객 메시지]
${messageContent}

위 고객 메시지의 의도를 JSON으로 추출하세요.`;

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
    if (!parsed) return { ok: false, error: `JSON 파싱 실패: ${r.text?.slice(0, 200)}` };

    // 누락 필드 기본값 보강
    return { ok: true, intent: normalizeIntent(parsed), raw: r.text, model: r.model };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function emptyIntent() {
  return {
    primary_intent: 'other',
    explicit_questions: [],
    customer_facts: [],
    implicit_needs: [],
    must_address: ['고객 업종/용도/참고 사이트 3개 질문으로 되묻기'],
    avoid: [],
    is_short_reply: false,
    sentiment: 'neutral',
    requires_human: false,
    urgency: 'low',
    confidence: 'low',
    reasoning: 'message_content 없음',
  };
}

function normalizeIntent(j) {
  const arr = (x) => Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : [];
  const primary_intent = typeof j.primary_intent === 'string' ? j.primary_intent : 'other';
  const sentiment = ['positive','neutral','concerned','frustrated','angry'].includes(j.sentiment) ? j.sentiment : 'neutral';
  const confidence = ['high','medium','low'].includes(j.confidence) ? j.confidence : 'medium';

  // requires_human 자동 판정: intent=complaint OR sentiment in [frustrated,angry] OR (confidence=low AND 긴 메시지)
  //   모델이 requires_human 을 안 보낸 경우를 대비한 규칙 보강
  const autoHuman = primary_intent === 'complaint' ||
    ['frustrated', 'angry'].includes(sentiment);
  const requires_human = typeof j.requires_human === 'boolean' ? j.requires_human : autoHuman;

  return {
    primary_intent,
    explicit_questions: arr(j.explicit_questions),
    customer_facts: arr(j.customer_facts),
    implicit_needs: arr(j.implicit_needs),
    must_address: arr(j.must_address),
    avoid: arr(j.avoid),
    is_short_reply: Boolean(j.is_short_reply),
    sentiment,
    requires_human,
    urgency: ['low','medium','high'].includes(j.urgency) ? j.urgency : 'low',
    confidence,
    reasoning: typeof j.reasoning === 'string' ? j.reasoning.slice(0, 400) : '',
  };
}

function safeJsonParse(text) {
  if (!text) return null;
  // 마크다운 코드블럭 제거
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // 첫 { 부터 마지막 } 까지 추출
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(s.slice(first, last + 1));
  } catch { return null; }
}

/**
 * Claude 메인 답변 프롬프트에 주입할 요약 텍스트 생성
 *  - 프롬프트 최상단에 배치해서 "이걸 반드시 답하라"는 목표를 고정
 */
function formatIntentForPrompt(intent) {
  if (!intent) return '';
  const lines = [];
  lines.push('[고객 의도 분석 결과 — 답변 전 반드시 일치시킬 것]');
  lines.push(`• 주요 의도: ${intent.primary_intent}${intent.is_short_reply ? ' (짧은 반문)' : ''} (신뢰도 ${intent.confidence})`);
  lines.push(`• 감정: ${intent.sentiment} / 긴급도: ${intent.urgency}`);
  if (intent.explicit_questions.length) {
    lines.push(`• 명시 질문 (반드시 답변):`);
    intent.explicit_questions.forEach((q, i) => lines.push(`    ${i + 1}. ${q}`));
  }
  if (intent.customer_facts.length) {
    lines.push(`• 고객 제공 사실 (답변에 인용):`);
    intent.customer_facts.forEach(f => lines.push(`    - ${f}`));
  }
  if (intent.must_address.length) {
    lines.push(`• 꼭 커버할 포인트:`);
    intent.must_address.forEach(m => lines.push(`    - ${m}`));
  }
  if (intent.implicit_needs.length) {
    lines.push(`• 암시적 니즈 (자연스럽게 언급):`);
    intent.implicit_needs.forEach(n => lines.push(`    - ${n}`));
  }
  if (intent.avoid.length) {
    lines.push(`• 피할 내용 (이미 답변했거나 오해 소지):`);
    intent.avoid.forEach(a => lines.push(`    - ${a}`));
  }
  // 감정별 톤 가이드
  if (intent.sentiment === 'concerned') {
    lines.push(`• 톤 지침: 고객이 우려·의심 상태 — 근거(포트폴리오/사례/수치)로 안심시키고 보장 포인트(수정 무제한/환불정책) 언급`);
  } else if (intent.sentiment === 'frustrated') {
    lines.push(`• 톤 지침: 고객이 답답함 상태 — 이전 답변 중 모호했던 부분을 구체적으로 재설명 + 2~3개 선택지 제시. 추가 질문 남발 금지`);
  }
  if (intent.urgency === 'high') {
    lines.push(`• 긴급도 지침: 시한 급박 — "1시간 내 견적 확정 가능" "오늘 착수 가능" 등 스피드 강조`);
  }
  return lines.join('\n');
}

/**
 * 리드 히트 스코어 0~100 계산 — Telegram 카드 우선순위 표시용
 *  - 명시 질문 수 (참여도) + customer_facts 풍부도 (진지함) + urgency + primary_intent
 *  - 히트 신호: price/spec_confirm/feature_ask, 긴급도, 구체적 facts
 *  - 콜드 신호: other/short_reply, 감정 neutral, 긴 thread 없음
 */
function computeLeadHeat(intent, { threadLength = 0, messageLength = 0 } = {}) {
  if (!intent) return { score: 0, tier: 'cold', label: '❄️ cold' };
  let s = 30; // 기본
  const hotIntents = { price: 20, spec_confirm: 25, feature_ask: 15, platform_migration: 18, timing: 15 };
  s += hotIntents[intent.primary_intent] || 0;
  if (intent.primary_intent === 'complaint') s += 30;  // 컴플레인도 hot — 빠른 대응 필요
  if (intent.primary_intent === 'other' || intent.primary_intent === 'short_reply') s -= 10;
  s += Math.min(intent.explicit_questions.length * 5, 15);
  s += Math.min(intent.customer_facts.length * 4, 12);
  if (intent.urgency === 'high') s += 20;
  else if (intent.urgency === 'medium') s += 8;
  if (intent.sentiment === 'positive') s += 5;
  if (intent.sentiment === 'frustrated' || intent.sentiment === 'angry') s += 10;  // 반드시 빠른 응대
  if (threadLength >= 5) s += 6;  // 대화 깊이
  if (messageLength >= 80) s += 5; // 구체적 문의
  if (intent.confidence === 'low') s -= 5;
  s = Math.max(0, Math.min(100, Math.round(s)));

  let tier, label;
  if (s >= 70) { tier = 'hot'; label = '🔥 hot'; }
  else if (s >= 45) { tier = 'warm'; label = '🌡️ warm'; }
  else { tier = 'cold'; label = '❄️ cold'; }
  return { score: s, tier, label };
}

module.exports = { extractIntent, formatIntentForPrompt, computeLeadHeat, emptyIntent };
