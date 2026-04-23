// 환경변수는 시작 시 셸에서 주입 (하드코딩 금지)
// 실행: source /home/onda/claude-bg/.env && pm2 start relay-ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'telegram-claude-relay',
    script: 'npx',
    args: 'tsx /home/onda/projects/onda-hompage/workers/telegram-claude-relay.ts',
    cwd: '/home/onda/projects/onda-hompage',
    env: {
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
      TELEGRAM_RELAY_CHAT_IDS: process.env.TELEGRAM_CHAT_ID || '-1003753252286',
      CLAUDE_RELAY_WORKSPACE: '/home/onda/projects/onda-ad',
      HOME: '/home/onda',
      PATH: process.env.PATH,
    },
    max_restarts: 10,
    restart_delay: 5000,
    autorestart: true,
  }],
};
