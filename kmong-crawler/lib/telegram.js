const { execSync } = require('child_process');

/**
 * openclaw system event로 텔레그램 알림 전송
 * @param {string} message - 알림 메시지
 */
function notify(message) {
  try {
    const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    execSync(`openclaw system event --text "${escaped}" --mode now`, {
      timeout: 3000,
      stdio: 'pipe',
    });
  } catch (err) {
    console.error(`[텔레그램 실패] ${err.message}`);
  }
}

module.exports = { notify };
