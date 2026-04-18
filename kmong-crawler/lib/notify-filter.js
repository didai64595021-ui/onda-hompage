/**
 * 크몽 봇 알림 정책 모듈
 * 기존 lib/telegram.js의 notify()를 감싸 타입별 필터링 수행.
 *
 * 정책 (2026-04-18 사용자 확정):
 *   - crawl (크롤 완료/결과 카운트), toggle (광고 ON/OFF 개별): 텔레그램 X, 콘솔만
 *   - inquiry (문의 도착), reply (자동답변 생성/발송), budget (예산 초과),
 *     error (에러), report (일/주/월 리포트): 통과
 *
 * 기존 각 스크립트의 notify() 호출을 notifyTyped(type, message)로 교체.
 */

const { notify, sendCard } = require('./telegram');

const SUPPRESSED_TYPES = new Set(['crawl', 'toggle']);

const PASS_TYPES = new Set([
  'inquiry',
  'reply',
  'budget',
  'error',
  'report',
  'session',
  'command',
]);

function shouldSend(type) {
  if (SUPPRESSED_TYPES.has(type)) return false;
  if (PASS_TYPES.has(type)) return true;
  // 알 수 없는 타입은 기본 통과 (보수적)
  return true;
}

/**
 * 타입별 알림 전송.
 * 'report' 타입은 장문이라 sendCard(재시도/HTML fallback) 경로로 송신.
 * @param {string} type - crawl|toggle|inquiry|reply|budget|error|report|session|command
 * @param {string} message
 */
function notifyTyped(type, message) {
  if (!shouldSend(type)) {
    console.log(`[알림 스킵:${type}] ${String(message).slice(0, 80)}`);
    return;
  }
  // 리포트는 길고 HTML이 많아 sendCard(재시도+fallback)로 보내야 안정적
  if (type === 'report') {
    sendCard(message).catch((e) => console.error(`[report send] ${e.message}`));
    return;
  }
  notify(message);
}

/**
 * 카드(버튼 포함) 전송 — inquiry 답변 승인 카드 등.
 * 카드는 항상 전송 (타입 필터 우회).
 */
async function sendTypedCard(type, message, replyMarkup, chatId) {
  // 카드는 항상 notify (문의 승인 카드는 반드시 보여야 함)
  return sendCard(message, replyMarkup, chatId);
}

/**
 * 현재 정책 조회 (디버깅/리포트용).
 */
function getPolicy() {
  return {
    suppressed: Array.from(SUPPRESSED_TYPES),
    passed: Array.from(PASS_TYPES),
  };
}

module.exports = {
  notifyTyped,
  sendTypedCard,
  shouldSend,
  getPolicy,
  SUPPRESSED_TYPES,
  PASS_TYPES,
};
