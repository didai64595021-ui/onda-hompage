// 매일 22:00 KST 자동 실행 + API 잔량 모니터링
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_LOG_PATH = path.join(__dirname, 'output', 'api-usage.json');
const DAILY_TARGET = 20000;

function getKSTHour() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getHours();
}

function getTodayUsage() {
  try {
    const usage = JSON.parse(fs.readFileSync(API_LOG_PATH, 'utf8'));
    const today = new Date().toISOString().slice(0, 10);
    return usage[today]?.calls || 0;
  } catch { return 0; }
}

function run() {
  const used = getTodayUsage();
  const remaining = DAILY_TARGET - used;
  
  if (remaining <= 0) {
    console.log(`[${new Date().toISOString()}] ⛔ 오늘 API ${used}/${DAILY_TARGET} 소진 완료. 스킵.`);
    return;
  }

  console.log(`[${new Date().toISOString()}] 🚀 크롤링 시작 (남은 API: ${remaining})`);
  try {
    execSync('node crawl.js', { cwd: __dirname, stdio: 'inherit', timeout: 7200000 }); // 2시간 타임아웃
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ❌ 크롤링 에러:`, e.message);
  }

  const finalUsed = getTodayUsage();
  console.log(`[${new Date().toISOString()}] ✅ 완료. API 사용: ${finalUsed}/${DAILY_TARGET}`);
}

// 매 30분마다 체크 (22시~24시에만 실행)
let lastRunDate = '';
setInterval(() => {
  const hour = getKSTHour();
  const today = new Date().toISOString().slice(0, 10);
  
  // 22시~23시, 오늘 아직 안 돌렸으면 실행
  if (hour >= 22 && lastRunDate !== today) {
    lastRunDate = today;
    run();
  }
}, 1800000); // 30분

// 즉시 체크
const hour = getKSTHour();
const used = getTodayUsage();
console.log(`⏰ 스케줄러 시작 (KST ${hour}시). 오늘 API: ${used}/${DAILY_TARGET}. 매일 22시 자동 실행.`);

// 22시 이후 시작이면 즉시 실행
if (hour >= 22) {
  const today = new Date().toISOString().slice(0, 10);
  lastRunDate = today;
  run();
}
