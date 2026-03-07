/**
 * 일일 자동 크롤링 스케줄러
 * - 하루 20,000 API 소진 후 자정까지 대기
 * - 자정(KST) 넘기면 자동 재시작
 * - 무한 반복 (PM2로 관리)
 * 
 * 소요시간 계산 (33 API/분 기준):
 *   20,000 API ÷ 33/분 = ~606분 = ~10시간 6분
 *   22:00 시작 시 → 다음날 08:06경 완료
 *   하루종일 가동 시 → 완료 후 자정까지 대기 → 재시작
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_LOG_PATH = path.join(__dirname, 'output', 'api-usage.json');
const DAILY_LIMIT = 19500; // 20,000에서 여유분 500 확보
const CHECK_INTERVAL = 60_000; // 1분마다 체크

function getKSTDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getKSTHour() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours();
}

function getTodayApiCalls() {
  try {
    const log = JSON.parse(fs.readFileSync(API_LOG_PATH, 'utf8'));
    const today = getKSTDate();
    return log[today]?.calls || 0;
  } catch {
    return 0;
  }
}

function runCrawler() {
  return new Promise((resolve) => {
    const today = getKSTDate();
    const used = getTodayApiCalls();
    const remaining = Math.max(0, DAILY_LIMIT - used);
    
    if (remaining <= 0) {
      console.log(`⏸️ 오늘(${today}) API ${used}/${DAILY_LIMIT} 소진 완료. 대기 중...`);
      resolve('exhausted');
      return;
    }

    console.log(`\n🚀 크롤링 시작 — ${today} | 사용: ${used} | 남은: ${remaining}`);
    
    // run-5000.js를 자식 프로세스로 실행
    const child = execFile('node', [
      '--max-old-space-size=512',
      path.join(__dirname, 'run-5000.js')
    ], {
      cwd: __dirname,
      timeout: 12 * 60 * 60 * 1000, // 12시간 타임아웃
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      if (err) {
        console.log(`⚠️ 크롤러 종료: ${err.message}`);
      }
      if (stderr) console.error(stderr.slice(-500));
      resolve('done');
    });

    child.stdout?.on('data', (d) => process.stdout.write(d));
    child.stderr?.on('data', (d) => process.stderr.write(d));
  });
}

function msUntilMidnightKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const midnight = new Date(kst);
  midnight.setUTCHours(24, 0, 0, 0); // 다음 자정 (KST)
  return midnight.getTime() - kst.getTime();
}

async function main() {
  console.log('═'.repeat(60));
  console.log('🔄 일일 자동 크롤링 스케줄러 시작');
  console.log(`📅 오늘: ${getKSTDate()} | 일일한도: ${DAILY_LIMIT} API`);
  console.log(`⏱️ 예상 소요: ~10시간 (33 API/분 기준)`);
  console.log('═'.repeat(60));

  while (true) {
    const today = getKSTDate();
    const used = getTodayApiCalls();

    if (used >= DAILY_LIMIT) {
      // API 소진 → 자정까지 대기
      const waitMs = msUntilMidnightKST();
      const waitMin = Math.ceil(waitMs / 60000);
      console.log(`\n⏸️ [${today}] API ${used}/${DAILY_LIMIT} 소진. 자정까지 ${waitMin}분 대기...`);
      
      // 자정까지 대기 (1분마다 체크 — 날짜 바뀌면 즉시 재시작)
      while (getKSTDate() === today) {
        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
      }
      
      console.log(`\n🌅 새 날짜: ${getKSTDate()} — 크롤링 재시작!`);
      continue;
    }

    // API 남아있음 → 크롤러 실행
    await runCrawler();
    
    // 크롤러 종료 후 1분 대기 후 재확인
    await new Promise(r => setTimeout(r, 5000));
  }
}

main().catch(e => {
  console.error('❌ 스케줄러 치명적 오류:', e);
  process.exit(1);
});
