// PM2 ecosystem — 크몽 신규 6개 상품 등록 작업 23시 자동 재개 트리거
// 등록: pm2 start /home/onda/projects/onda-hompage/kmong-crawler/new-gigs/resume-ecosystem.config.js
// 확인: pm2 list | grep kmong-newgigs-resume
// 삭제: pm2 delete kmong-newgigs-resume
//
// cron_restart '0 23 8 4 *' = 매년 4월 8일 23:00 KST 실행 (시스템 TZ Asia/Seoul)
// 본 작업은 1회용이므로 23시 1회 실행 후 사용자가 수동으로 pm2 delete 권장.
// autorestart: false 이므로 스크립트 종료 후 stopped 상태로 머무름.

module.exports = {
  apps: [
    {
      name: 'kmong-newgigs-resume',
      script: '/home/onda/projects/onda-hompage/kmong-crawler/new-gigs/resume-trigger.sh',
      interpreter: 'bash',
      cwd: '/home/onda/projects/onda-hompage/kmong-crawler/new-gigs',
      cron_restart: '0 23 8 4 *', // 4월 8일 23:00 KST 1회
      autorestart: false,
      max_restarts: 1,
      out_file: '/home/onda/logs/kmong-newgigs-resume-out.log',
      error_file: '/home/onda/logs/kmong-newgigs-resume-err.log',
      time: true,
      env: {
        TZ: 'Asia/Seoul',
        NODE_ENV: 'production',
      },
    },
  ],
};
