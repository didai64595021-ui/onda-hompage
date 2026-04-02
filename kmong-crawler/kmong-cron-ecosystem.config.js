module.exports = {
  apps: [
    {
      name: 'kmong-crawl-cpc',
      script: './crawl-cpc.js',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler',
      cron_restart: '0 9 * * *',  // 매일 오전 9시
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
      cron_restart: '0 */4 * * *',  // 4시간마다
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
      cron_restart: '0 10 * * *',  // 매일 오전 10시
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
