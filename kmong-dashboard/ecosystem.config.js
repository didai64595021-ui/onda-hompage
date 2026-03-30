module.exports = {
  apps: [
    {
      name: 'kmong-daily-crawl',
      script: '/home/onda/projects/onda-hompage/kmong-dashboard/crawler/daily-crawl.js',
      cron_restart: '0 23 * * *',  // 매일 23:00
      autorestart: false,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/home/onda/logs/kmong-crawl-error.log',
      out_file: '/home/onda/logs/kmong-crawl-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};
