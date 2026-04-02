module.exports = {
  apps: [
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
  ],
};
