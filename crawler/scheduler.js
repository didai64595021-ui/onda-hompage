// 매일 22:00 자동 실행 스케줄러
const { execSync } = require('child_process');

function getKSTHour() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getHours();
}

function run() {
  const hour = getKSTHour();
  if (hour >= 22 || hour === 23) {
    console.log(`[${new Date().toISOString()}] 🚀 크롤링 시작 (KST ${hour}시)`);
    try {
      execSync('node crawl.js', { cwd: __dirname, stdio: 'inherit', timeout: 7200000 });
    } catch (e) {
      console.error('크롤링 에러:', e.message);
    }
  }
}

// 매 시간 체크
setInterval(() => {
  const hour = getKSTHour();
  if (hour === 22) run(); // 22시에만 시작 (1회)
}, 3600000);

// 즉시 체크
const hour = getKSTHour();
console.log(`⏰ 스케줄러 시작 (현재 KST ${hour}시). 매일 22시에 크롤링 실행.`);
if (hour >= 22) run();
