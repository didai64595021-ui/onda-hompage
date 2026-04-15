const https = require('https');

/**
 * 텔레그램 Bot API 직접 호출로 알림 전송
 * (openclaw system event 방식 제거 — 게이트웨이 의존 없음)
 * @param {string} message - 알림 메시지
 */
function notify(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = '-1003738825402'; // KMONG 그룹

    if (!token) {
      console.error('[텔레그램] TELEGRAM_BOT_TOKEN 없음 — 알림 스킵');
      return;
    }

    const data = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });

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
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.error(`[텔레그램] HTTP ${res.statusCode}: ${body}`);
          } else {
            console.log('[텔레그램] 알림 전송 완료');
          }
        });
      }
    );

    req.on('error', (e) => console.error('[텔레그램]', e.message));
    req.write(data);
    req.end();
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
function sendCard(message, replyMarkup, chatId = '-1003738825402') {
  return new Promise((resolve) => {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) { console.error('[텔레그램] TELEGRAM_BOT_TOKEN 없음'); resolve({ ok: false }); return; }
      const data = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', reply_markup: replyMarkup, disable_web_page_preview: true });
      const req = https.request({ hostname: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let body = ''; res.on('data', c => body += c);
        res.on('end', () => {
          try { const j = JSON.parse(body); resolve(j); } catch { resolve({ ok: false, body }); }
        });
      });
      req.on('error', (e) => { console.error('[텔레그램 카드]', e.message); resolve({ ok: false, error: e.message }); });
      req.write(data); req.end();
    } catch (err) { console.error('[텔레그램 카드]', err.message); resolve({ ok: false, error: err.message }); }
  });
}

module.exports = { notify, sendCard };
