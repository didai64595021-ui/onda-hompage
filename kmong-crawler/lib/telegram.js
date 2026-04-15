const https = require('https');

/**
 * 텔레그램 Bot API 직접 호출로 알림 전송
 * (openclaw system event 방식 제거 — 게이트웨이 의존 없음)
 * @param {string} message - 알림 메시지
 */
function notify(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = '-5018738099'; // KMONG 그룹

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

    req.on('error', (e) => console.error('[텔레그램 notify]', e.code || '', e.message || '(no message)'));
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
function sendCard(message, replyMarkup, chatId = '-5018738099') {
  return new Promise((resolve) => {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) { console.error('[텔레그램 카드] TELEGRAM_BOT_TOKEN 없음'); resolve({ ok: false }); return; }
      // Telegram sendMessage text 제한 4096자 — 초과 시 자르고 잘렸음 표시
      let safeText = message;
      const HARD_LIMIT = 4000;
      if (Buffer.byteLength(safeText, 'utf-8') > HARD_LIMIT) {
        while (Buffer.byteLength(safeText, 'utf-8') > HARD_LIMIT - 60) safeText = safeText.slice(0, -50);
        safeText += '\n\n⚠️ (길이 초과로 일부 잘림)';
      }
      const data = JSON.stringify({ chat_id: chatId, text: safeText, parse_mode: 'HTML', reply_markup: replyMarkup, disable_web_page_preview: true });
      const req = https.request({ hostname: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let body = ''; res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.error(`[텔레그램 카드] HTTP ${res.statusCode}: ${body.slice(0, 500)}`);
            // HTML 파싱 실패 시 plain text fallback 1회 재시도
            if (res.statusCode === 400 && /can't parse|parse error/i.test(body)) {
              console.error('[텔레그램 카드] HTML 파싱 실패 → plain text 재시도');
              const fbData = JSON.stringify({ chat_id: chatId, text: safeText.replace(/<[^>]+>/g, ''), reply_markup: replyMarkup, disable_web_page_preview: true });
              const fb = https.request({ hostname: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(fbData) } }, (fbRes) => {
                let fbBody = ''; fbRes.on('data', c => fbBody += c);
                fbRes.on('end', () => {
                  if (fbRes.statusCode !== 200) console.error(`[텔레그램 카드 fallback] HTTP ${fbRes.statusCode}: ${fbBody.slice(0, 300)}`);
                  else console.log('[텔레그램 카드] plain text 재시도 성공');
                  try { resolve(JSON.parse(fbBody)); } catch { resolve({ ok: false, body: fbBody }); }
                });
              });
              fb.on('error', (e) => { console.error('[텔레그램 카드 fb]', e.message); resolve({ ok: false, error: e.message }); });
              fb.write(fbData); fb.end();
              return;
            }
          } else {
            console.log('[텔레그램 카드] 전송 완료');
          }
          try { const j = JSON.parse(body); resolve(j); } catch { resolve({ ok: false, body }); }
        });
      });
      req.on('error', (e) => { console.error('[텔레그램 카드 req.error]', e.code || '', e.message || '(no message)', e.stack?.split('\n')[0] || ''); resolve({ ok: false, error: `${e.code || ''} ${e.message || ''}` }); });
      req.write(data); req.end();
    } catch (err) { console.error('[텔레그램 카드 outer]', err.code || '', err.message || '(no message)', err.stack?.split('\n')[0] || ''); resolve({ ok: false, error: `${err.code || ''} ${err.message || ''}` }); }
  });
}

module.exports = { notify, sendCard };
