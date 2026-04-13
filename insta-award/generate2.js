const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'output');

// ===================================================================
// POST 04 - 숫자로 증명 (글래스카드 + 네온 글로우)
// ===================================================================
const html_04 = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width: 1080px; height: 1080px;
  background: linear-gradient(155deg, #080812 0%, #0c1018 40%, #0a0e16 100%);
  font-family: 'Noto Sans KR', sans-serif;
  overflow: hidden; position: relative;
}
.bg-glow1 {
  position: absolute; width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(0,200,150,0.07) 0%, transparent 65%);
  top: -100px; left: -100px;
}
.bg-glow2 {
  position: absolute; width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 65%);
  bottom: -50px; right: -50px;
}
.header {
  text-align: center; padding-top: 40px;
}
.label {
  font-family: 'Montserrat'; font-size: 20px; font-weight: 800;
  color: #00c896; letter-spacing: 4px;
}
.header h1 {
  font-size: 58px; font-weight: 900; color: #fff; margin-top: 8px;
}

.grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 22px; padding: 40px 50px 0;
}
.stat-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 24px; padding: 44px 30px;
  text-align: center; position: relative;
  backdrop-filter: blur(20px);
  overflow: hidden;
}
.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, rgba(0,200,150,0.4), transparent);
}
.stat-card .number {
  font-family: 'Montserrat'; font-size: 86px; font-weight: 900;
  color: #00c896;
  text-shadow: 0 0 40px rgba(0,200,150,0.25);
  line-height: 1;
}
.stat-card .number-kr {
  font-size: 76px; font-weight: 900;
  color: #00c896;
  text-shadow: 0 0 40px rgba(0,200,150,0.25);
  line-height: 1;
}
.stat-card .stat-label {
  font-size: 30px; font-weight: 900; color: #fff;
  margin-top: 16px;
}
.stat-card .stat-sub {
  font-size: 18px; font-weight: 700; color: #666;
  margin-top: 6px;
}

.bottom-text {
  position: absolute; bottom: 100px; width: 100%; text-align: center;
  font-size: 22px; font-weight: 700; color: #888;
}
.cta-btn {
  position: absolute; bottom: 35px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, #00c896, #00a67d);
  padding: 14px 48px; border-radius: 40px;
  color: #080812; font-size: 24px; font-weight: 900;
  box-shadow: 0 8px 30px rgba(0,200,150,0.25);
}
</style></head><body>
  <div class="bg-glow1"></div>
  <div class="bg-glow2"></div>
  <div class="header">
    <div class="label">WHY ONDA?</div>
    <h1>숫자로 증명합니다</h1>
  </div>
  <div class="grid">
    <div class="stat-card">
      <div class="number">84+</div>
      <div class="stat-label">제작 사례</div>
      <div class="stat-sub">다양한 업종</div>
    </div>
    <div class="stat-card">
      <div class="number-kr">5일</div>
      <div class="stat-label">평균 납기</div>
      <div class="stat-sub">빠른 제작</div>
    </div>
    <div class="stat-card">
      <div class="number">100%</div>
      <div class="stat-label">반응형</div>
      <div class="stat-sub">모든 기기 대응</div>
    </div>
    <div class="stat-card">
      <div class="number">4.9</div>
      <div class="stat-label">만족도</div>
      <div class="stat-sub">크몽 평점</div>
    </div>
  </div>
  <div class="bottom-text">온다마케팅과 함께한 사장님들의 결과</div>
  <div class="cta-btn">무료 상담</div>
</body></html>`;


// ===================================================================
// POST 05 - 프로세스 타임라인 (네온 라인 + 글래스)
// ===================================================================
const html_05 = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width: 1080px; height: 1080px;
  background: linear-gradient(160deg, #0a0a12 0%, #0d1117 100%);
  font-family: 'Noto Sans KR', sans-serif;
  overflow: hidden; position: relative;
}
.bg-glow {
  position: absolute; width: 800px; height: 800px;
  background: radial-gradient(circle, rgba(0,200,150,0.04) 0%, transparent 60%);
  top: 50%; left: 50%; transform: translate(-50%,-50%);
}
.header {
  text-align: center; padding-top: 30px;
}
.label {
  font-family: 'Montserrat'; font-size: 20px; font-weight: 800;
  color: #00c896; letter-spacing: 4px;
}
.header h1 { font-size: 62px; font-weight: 900; color: #fff; margin-top: 6px; }
.header .sub { font-size: 26px; font-weight: 700; color: #888; margin-top: 8px; }

.timeline {
  position: relative; padding: 30px 0 0 180px; margin-top: 10px;
}
/* 세로 라인 */
.timeline::before {
  content: ''; position: absolute; left: 178px; top: 50px; bottom: 80px;
  width: 3px;
  background: linear-gradient(180deg, #00c896, rgba(0,200,150,0.15));
  border-radius: 2px;
}

.step {
  display: flex; align-items: flex-start; gap: 28px;
  margin-bottom: 22px; position: relative;
}
.step-num {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #00c896, #00a67d);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Montserrat'; font-size: 20px; font-weight: 800;
  color: #0a0a12; flex-shrink: 0;
  box-shadow: 0 0 20px rgba(0,200,150,0.3);
  z-index: 2;
}
.step-content {
  flex: 1; padding-top: 2px;
}
.step-content .step-title {
  font-size: 34px; font-weight: 900; color: #fff;
  display: flex; align-items: center; gap: 16px;
}
.step-content .step-day {
  display: inline-block;
  background: rgba(0,200,150,0.12); border: 1px solid rgba(0,200,150,0.25);
  padding: 4px 16px; border-radius: 8px;
  font-size: 17px; font-weight: 800; color: #00c896;
  backdrop-filter: blur(10px);
}
.step-content .step-desc {
  font-size: 19px; font-weight: 700; color: #777; margin-top: 6px;
}

.cta-btn {
  position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, #00c896, #00a67d);
  padding: 16px 52px; border-radius: 50px;
  color: #0a0a12; font-size: 26px; font-weight: 900;
  box-shadow: 0 8px 30px rgba(0,200,150,0.25);
}
</style></head><body>
  <div class="bg-glow"></div>
  <div class="header">
    <div class="label">PROCESS</div>
    <h1>5일이면 완성</h1>
    <div class="sub">심플한 제작 과정</div>
  </div>
  <div class="timeline">
    <div class="step">
      <div class="step-num">01</div>
      <div class="step-content">
        <div class="step-title">상담 <span class="step-day">당일</span></div>
        <div class="step-desc">요구사항 파악 / 업종 스타일 논의</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">02</div>
      <div class="step-content">
        <div class="step-title">기획 <span class="step-day">1일</span></div>
        <div class="step-desc">레이아웃 설계 / 콘텐츠 구성</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">03</div>
      <div class="step-content">
        <div class="step-title">디자인 <span class="step-day">2~3일</span></div>
        <div class="step-desc">시안 제작 / 피드백 반영</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">04</div>
      <div class="step-content">
        <div class="step-title">개발 <span class="step-day">3~4일</span></div>
        <div class="step-desc">코딩 + CMS / 반응형 적용</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">05</div>
      <div class="step-content">
        <div class="step-title">납품 <span class="step-day">5일</span></div>
        <div class="step-desc">최종 검수 / 도메인 연결</div>
      </div>
    </div>
  </div>
  <div class="cta-btn">무료 상담 시작하기</div>
</body></html>`;


async function run() {
  const browser = await chromium.launch();
  const posts = [
    { name: '04_stats', html: html_04 },
    { name: '05_process', html: html_05 },
  ];
  for (const { name, html } of posts) {
    console.log(`[${name}] 생성 중...`);
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    const hp = path.join(OUT, `${name}.html`);
    fs.writeFileSync(hp, html);
    await page.goto(`file://${hp}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const op = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: op, type: 'png' });
    console.log(`  ✓ ${name}.png (${Math.round(fs.statSync(op).size/1024)}KB)`);
    await page.close();
  }
  await browser.close();
  console.log('완료!');
}
run().catch(e => { console.error(e); process.exit(1); });
