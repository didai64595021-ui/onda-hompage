module.exports = {
  apps: [
    // === Phase 1: 크롤러 ===
    {
      name: 'kmong-crawl-cpc',
      script: './crawl-cpc.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 */2 * * *',  // 2시간마다
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'kmong-crawl-inbox',
      script: './crawl-inbox.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 */2 * * *',  // 2시간마다
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'kmong-crawl-orders',
      script: './crawl-orders.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 */2 * * *',  // 2시간마다
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    // === Phase 2: 자동 분석 + 자동 답장 ===
    {
      name: 'kmong-analyze-daily',
      script: './analyze-daily.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 9 * * *',  // 매일 오전 9시
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'kmong-auto-reply',
      script: './auto-reply.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 */2 * * *',  // 2시간마다 (inbox 크롤러 직후)
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'kmong-send-reply',
      script: './send-reply.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '*/30 * * * *',  // 30분마다 (승인 확인)
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
