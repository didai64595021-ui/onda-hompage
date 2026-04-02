const { execSync } = require('child_process');

/**
 * openclaw system event로 텔레그램 알림 전송
 * @param {string} message - 알림 메시지
 */
function notify(message) {
  try {
    const escaped = message.replace(/"/g, '\\"');
    execSync(`openclaw system event --text "${escaped}" --mode now`, {
      timeout: 15000,
      stdio: 'pipe',
    });
    console.log(`[텔레그램] ${message}`);
  } catch (err) {
    console.error(`[텔레그램 실패] ${err.message}`);
  }
}

module.exports = { notify };
