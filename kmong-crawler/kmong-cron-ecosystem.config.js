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
      cron_restart: '55 1,3,5 * * *',  // 야간만 — 크롤러 직전 (01:55, 03:55, 05:55 KST)
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 1: 크롤러 ===
    {
      name: 'kmong-crawl-cpc',
      script: './crawl-cpc.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      // 야간만 — 02:30, 04:30 KST (사용자 비활동 시간대로 이동, 2026-04-28)
      cron_restart: '30 2,4 * * *',
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    {
      name: 'kmong-crawl-inbox',
      script: './crawl-inbox.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 2,4,6,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *',  // 영업시간 매시간(09-23 KST) + 야간 3회(02,04,06 KST) — 신규 문의 알림 지연 해결, 2026-04-29
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-crawl-orders',
      script: './crawl-orders.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '34 2,4 * * *',  // 야간 2회/일 (02:34, 04:34 KST) — inbox 다음, 2026-04-28
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
      cron_restart: '36 2,4 * * *',  // 야간 2회/일 (02:36, 04:36 KST) — orders 다음, 2026-04-28
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
      cron_restart: '30 2,4,6,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *',  // inbox 크롤 30분 후 동기 — 영업시간 매시간(09-23 KST) + 야간(02,04,06 KST), 2026-04-29
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    {
      name: 'kmong-send-reply',
      script: './send-reply.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 3,5 * * *',  // 야간 2회/일 (03:00, 05:00 KST) — auto-reply 직후 발송, 2026-04-28
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
    {
      name: 'kmong-funnel-analyze',
      script: './analyze-conversion-funnel.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 11 * * *',  // 매일 오전 11시 (광고 데이터 업데이트 후)
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
      cron_restart: '40 4 * * *',  // 야간 1회/일 (04:40 KST) — CPC 크롤 후, 2026-04-28
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
      // 광고 ON 시간대(08~02시)에만 동작 — 02~08시 OFF 정책에 맞춰 4회/일 (2026-04-29)
      cron_restart: '0 9,13,17,21 * * *',
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV },
    },
    // === Phase 7-bis: 4시간 단위 CPC 동적 조정 (2026-04-24 신설) ===
    {
      name: 'kmong-adjust-cpc-4h',
      script: './adjust-cpc-4h.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      // 광고 ON 시간대 4회 (09:05, 13:05, 17:05, 21:05) — ad-scheduler 5분 뒤 (2026-04-29)
      cron_restart: '5 9,13,17,21 * * *',
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    // === Phase 7-ter: 시간대별 CVR 분석 + weight 갱신 (2026-04-24 신설) ===
    {
      name: 'kmong-hourly-cvr-analyzer',
      script: './hourly-cvr-analyzer.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 3 * * *',  // 매일 03:00 KST
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    // === Phase 7-quater: 비승인 자동처리 (2026-04-25 신설) ===
    {
      name: 'kmong-check-rejection-daily',
      script: './check-rejection-daily.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '30 8 * * *',  // 매일 08:30 KST — daily-report(08:00) 이후
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    // === Phase 8: 리포트 (일/주/월) — 2026-04-18 신설 ===
    {
      name: 'kmong-daily-report',
      script: './daily-report.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 8 * * *',  // 매일 08:00 KST — 전날 요약
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    {
      name: 'kmong-weekly-report',
      script: './weekly-report.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 8 * * 0',  // 매주 일요일 08:00 KST — 지난 7일
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    {
      name: 'kmong-monthly-report',
      script: './monthly-report.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      // 28~31일 08:00에 매일 시도, 스크립트 내 isLastDayOfMonth() 체크로 실제 말일만 발송
      cron_restart: '0 8 28-31 * *',
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    // === Phase 9: 야간 광고 OFF / 주간 광고 ON (2026-04-29 신설) ===
    // 02:00 KST — 모든 광고 OFF (체리피커·탐색 트래픽 회피)
    {
      name: 'kmong-ads-night-off',
      script: './batch-toggle-ads.js',
      args: '--mode=all-off',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 2 * * *',
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
    },
    // 08:00 KST — 기본 정책으로 광고 복원 (corp-* ON, responsive-* OFF 유지)
    {
      name: 'kmong-ads-day-on',
      script: './batch-toggle-ads.js',
      args: '--mode=default',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 8 * * *',
      autorestart: false,
      watch: false,
      env: { ...COMMON_ENV, TZ: 'Asia/Seoul' },
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
