const fs = require('fs');
const path = require('path');

// .env 수동 파싱
function loadEnv(envPath) {
  const result = {};
  try {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      result[key] = val;
    }
  } catch {}
  return result;
}

const envVars = loadEnv(path.join(__dirname, '.env'));

const COMMON_ENV = {
  NODE_ENV: 'production',
  KMONG_EMAIL: envVars.KMONG_EMAIL || '',
  KMONG_PW: envVars.KMONG_PW || '',
  SUPABASE_URL: envVars.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: envVars.SUPABASE_SERVICE_ROLE_KEY || '',
  TELEGRAM_BOT_TOKEN: envVars.TELEGRAM_BOT_TOKEN || '',
  OPENAI_API_KEY: envVars.OPENAI_API_KEY || '',
};

module.exports = {
  apps: [
    // === Phase 0: 세션 갱신 (크롤러보다 5분 먼저) ===
    {
      name: 'kmong-refresh-session',
      script: './refresh-session.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '55 1,3,5,7,9,11,13,15,17,19,21,23 * * *',  // 크롤러 5분 전 (홀수시 55분)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 1: 크롤러 ===
    {
      name: 'kmong-crawl-cpc',
      script: './crawl-cpc.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 */2 * * *',  // 2시간마다 (정시)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-crawl-inbox',
      script: './crawl-inbox.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '*/2 * * * *',  // 2분마다 — 신규 문의 빠른 감지 (옵션 A: 워스트 2-3분)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-crawl-orders',
      script: './crawl-orders.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '4 */2 * * *',  // 2시간마다 (+4분, inbox 다음)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-crawl-profits',
      script: './crawl-profits.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 9 * * *',  // 매일 오전 9시
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-crawl-gig-status',
      script: './crawl-gig-status.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '6 */2 * * *',  // 2시간마다 (+6분, orders 다음)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 2: 자동 분석 + 자동 답장 ===
    {
      name: 'kmong-analyze-daily',
      script: './analyze-daily.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 9 * * *',  // 매일 오전 9시
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-auto-reply',
      script: './auto-reply.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '1-59/5 * * * *',  // 5분마다 (+1분, inbox 직후) — 빠른 응답
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-send-reply',
      script: './send-reply.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '*/30 * * * *',  // 30분마다
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-followup-nudge',
      script: './followup-nudge.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 10 * * *',  // 매일 오전 10시 (영업시간 내 1회)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 3: AI 콘텐츠 생성 + A/B 테스트 ===
    {
      name: 'kmong-content-gen',
      script: './run-content-gen.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 10 * * *',  // 매일 오전 10시
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-ab-eval',
      script: './run-ab-eval.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 21 * * *',  // 매일 오후 9시
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 4: 학습 루프 ===
    {
      name: 'kmong-learning-loop',
      script: './run-learning-loop.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 6 * * 1',  // 매주 월요일 오전 6시
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 6: 예산 모니터 + 명령 처리기 ===
    {
      name: 'kmong-budget-monitor',
      script: './budget-monitor.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '10 */2 * * *',  // 2시간마다 (+10분, CPC 크롤 후)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-command-processor',
      script: './command-processor.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '*/5 * * * *',  // 5분마다
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 7: 시간대별 광고 스케줄러 ===
    {
      name: 'kmong-ad-scheduler',
      script: './ad-scheduler.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '*/30 * * * *',  // 30분마다
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 5: 텔레그램 봇 (상시 구동) ===
    {
      name: 'kmong-telegram-bot',
      script: './telegram-bot.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: { ...COMMON_ENV },
    },
  ],
};
