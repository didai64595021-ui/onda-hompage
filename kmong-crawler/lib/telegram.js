const https = require('https');

/**
 * 텔레그램 Bot API 직접 호출로 알림 전송
 * (openclaw system event 방식 제거 — 게이트웨이 의존 없음)
 * @param {string} message - 알림 메시지
 */
function notify(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = '-1003753252286'; // ONDA 서버 그룹

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

module.exports = { notify };
