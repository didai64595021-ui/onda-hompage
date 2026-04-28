const https = require('https');

// 기본 chat_id — 환경변수 우선, 없으면 현재 운영 그룹 ID 사용
// 슈퍼그룹 업그레이드 시 텔레그램 응답의 migrate_to_chat_id 로 자동 fallback
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003990823637';

// 마이그레이션 응답에서 새 chat_id 추출
function _extractMigratedChatId(body) {
  try {
    const j = JSON.parse(body);
    const m = j && j.parameters && j.parameters.migrate_to_chat_id;
    return m ? String(m) : null;
  } catch {
    return null;
  }
}

// 단일 sendMessage POST — 결과 콜백
function _postSendMessage(token, chatId, text, parseMode, onResult) {
  const payload = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;
  const data = JSON.stringify(payload);
  const req = https.request(
    {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => onResult(null, res.statusCode, body));
    }
  );
  req.on('error', (e) => onResult(e, 0, ''));
  req.write(data);
  req.end();
}

/**
 * 텔레그램 Bot API 직접 호출로 알림 전송
 * (openclaw system event 방식 제거 — 게이트웨이 의존 없음)
 * @param {string} message - 알림 메시지
 */
function notify(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error('[텔레그램] TELEGRAM_BOT_TOKEN 없음 — 알림 스킵');
      return;
    }

    _postSendMessage(token, DEFAULT_CHAT_ID, message, 'HTML', (err, status, body) => {
      if (err) {
        console.error('[텔레그램 notify]', err.code || '', err.message || '(no message)');
        return;
      }
      if (status === 200) {
        console.log('[텔레그램] 알림 전송 완료');
        return;
      }
      // 슈퍼그룹 업그레이드: 새 ID로 1회 자동 재시도
      const migrated = status === 400 ? _extractMigratedChatId(body) : null;
      if (migrated) {
        console.warn(`[텔레그램] 슈퍼그룹 마이그레이션 감지 → 새 chat_id ${migrated} 로 재시도 (이전: ${DEFAULT_CHAT_ID})`);
        _postSendMessage(token, migrated, message, 'HTML', (e2, s2, b2) => {
          if (s2 === 200) console.log('[텔레그램] 알림 전송 완료 (마이그레이션 fallback)');
          else console.error(`[텔레그램] 마이그레이션 fallback 실패 HTTP ${s2}: ${(b2 || '').slice(0, 300)}`);
        });
        return;
      }
      console.error(`[텔레그램] HTTP ${status}: ${body}`);
    });
  } catch (err) {
    console.error(`[텔레그램 실패] ${err.message}`);
  }
}

/**
 * 인라인 키보드 카드 전송 (callback_query 트리거용)
 * @param {string} message - 본문 (HTML)
 * @param {object} replyMarkup - 텔레그램 reply_markup 객체. 예: { inline_keyboard: [[{text:'발송', callback_data:'send_41'}]] }
 * @param {string} chatId - 채팅 ID (기본: ONDA 서버 그룹)
 */
// 단일 텔레그램 sendMessage 호출 — socket timeout + 단일 시도
function _sendOnce({ chatId, text, replyMarkup, parseMode = 'HTML', timeoutMs = 12000 }) {
  return new Promise((resolve) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) { resolve({ ok: false, error: 'NO_TOKEN' }); return; }
    const payload = { chat_id: chatId, text, disable_web_page_preview: true };
    if (parseMode) payload.parse_mode = parseMode;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org', port: 443,
      path: `/bot${token}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, (res) => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) { try { resolve(JSON.parse(body)); } catch { resolve({ ok: true, body }); } return; }
        // HTML 파싱 실패는 재시도 가치 없음 → 호출자에게 신호
        const parseErr = res.statusCode === 400 && /can't parse|parse error/i.test(body);
        // 슈퍼그룹 마이그레이션: 새 chat_id 추출 → 호출자가 갱신해서 재시도
        const migrateTo = res.statusCode === 400 ? _extractMigratedChatId(body) : null;
        resolve({ ok: false, status: res.statusCode, body: body.slice(0, 500), parseErr, migrateTo });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('SOCKET_TIMEOUT')); });
    req.on('error', (e) => { resolve({ ok: false, error: `${e.code || ''} ${e.message || ''}`.trim() || 'UNKNOWN' }); });
    req.write(data); req.end();
  });
}

/**
 * 인라인 키보드 카드 전송 (callback_query 트리거용)
 * - socket timeout 12s
 * - 네트워크 실패 시 자동 재시도 3회 (지수 backoff: 1s, 2s, 4s)
 * - HTML 파싱 실패 시 plain text fallback 1회
 */
async function sendCard(message, replyMarkup, chatId = DEFAULT_CHAT_ID) {
  // Telegram sendMessage text 4096자 제한
  let safeText = message;
  const HARD_LIMIT = 4000;
  if (Buffer.byteLength(safeText, 'utf-8') > HARD_LIMIT) {
    while (Buffer.byteLength(safeText, 'utf-8') > HARD_LIMIT - 60) safeText = safeText.slice(0, -50);
    safeText += '\n\n⚠️ (길이 초과로 일부 잘림)';
  }

  let activeChatId = chatId;
  let lastResult;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await _sendOnce({ chatId: activeChatId, text: safeText, replyMarkup, parseMode: 'HTML' });
    lastResult = r;
    if (r.ok) { console.log(`[텔레그램 카드] 전송 완료${attempt > 1 ? ` (attempt ${attempt}/3)` : ''}`); return r; }
    if (r.parseErr) {
      console.error('[텔레그램 카드] HTML 파싱 실패 → plain text fallback');
      const fb = await _sendOnce({ chatId: activeChatId, text: safeText.replace(/<[^>]+>/g, ''), replyMarkup, parseMode: null });
      if (fb.ok) console.log('[텔레그램 카드] plain text fallback 성공');
      else console.error(`[텔레그램 카드 fallback] ${fb.error || fb.status} ${fb.body || ''}`.slice(0, 300));
      return fb;
    }
    if (r.migrateTo) {
      console.warn(`[텔레그램 카드] 슈퍼그룹 마이그레이션 감지 → 새 chat_id ${r.migrateTo} 로 재시도 (이전: ${activeChatId})`);
      activeChatId = r.migrateTo;
      continue; // attempt 소진하지 않고 즉시 재시도
    }
    console.error(`[텔레그램 카드] attempt ${attempt}/3 실패: ${r.error || `HTTP ${r.status}`}`);
    if (attempt < 3) await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
  }
  console.error(`[텔레그램 카드] 최종 실패 — resend-card.js로 복구 가능: node scripts/resend-card.js <id>`);
  return lastResult || { ok: false, error: 'UNKNOWN' };
}

module.exports = { notify, sendCard };
