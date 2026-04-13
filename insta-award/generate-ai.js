const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });

// .env 수동 파싱
const envContent = fs.readFileSync('/home/onda/.env', 'utf-8');
const envMatch = envContent.match(/OPENAI_API_KEY=(.+)/);
const OPENAI_KEY = envMatch ? envMatch[1].trim() : '';
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1); }

// === OpenAI 이미지 생성 ===
async function generateImage(prompt, filename) {
  console.log(`  AI 이미지 생성 중: ${filename}...`);

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
    }),
  });

  const data = await resp.json();

  if (data.error) {
    console.error('  API 에러:', data.error.message);
    return null;
  }

  // gpt-image-1은 b64_json으로 반환
  if (data.data && data.data[0]) {
    const imgData = data.data[0].b64_json || data.data[0].url;

    if (data.data[0].b64_json) {
      const buf = Buffer.from(data.data[0].b64_json, 'base64');
      const imgPath = path.join(OUT, filename);
      fs.writeFileSync(imgPath, buf);
      console.log(`  ✓ AI 이미지 저장: ${filename} (${Math.round(buf.length/1024)}KB)`);
      return imgPath;
    } else if (data.data[0].url) {
      // URL 방식이면 다운로드
      const imgResp = await fetch(data.data[0].url);
      const buf = Buffer.from(await imgResp.arrayBuffer());
      const imgPath = path.join(OUT, filename);
      fs.writeFileSync(imgPath, buf);
      console.log(`  ✓ AI 이미지 저장: ${filename} (${Math.round(buf.length/1024)}KB)`);
      return imgPath;
    }
  }

  console.error('  이미지 데이터 없음');
  return null;
}


async function run() {
  // === 1. AI 배경 이미지 생성 ===
  console.log('\n=== Step 1: AI 배경 이미지 생성 ===');

  const bg1Path = await generateImage(
    `Premium dark tech background for web design agency promotional image.
    Abstract geometric shapes, subtle green (#00c896) neon glow lines,
    floating glass panels, dark navy-black gradient background (#0a0a12 to #1a1a2e).
    Modern, sleek, professional. NO TEXT, NO LETTERS, NO WORDS.
    Ultra clean, award-winning design aesthetic. 1024x1024.`,
    'ai_bg_hero.png'
  );

  const bg2Path = await generateImage(
    `Luxurious dark workspace mockup background for web development service.
    Elegant desk setup with multiple screens showing beautiful websites,
    soft ambient lighting with green (#00c896) accent glow,
    dark moody atmosphere, bokeh lights, premium feel.
    NO TEXT, NO LETTERS, NO WORDS, NO READABLE CONTENT on screens.
    Photorealistic, high-end commercial photography style. 1024x1024.`,
    'ai_bg_workspace.png'
  );

  if (!bg1Path && !bg2Path) {
    console.error('AI 이미지 생성 실패');
    process.exit(1);
  }

  // === 2. HTML 텍스트 오버레이 + 스크린샷 ===
  console.log('\n=== Step 2: HTML 오버레이 + 스크린샷 ===');

  const browser = await chromium.launch();

  // --- POST AI-01: 히어로 (AI 배경 + 텍스트 오버레이) ---
  if (bg1Path) {
    const bg1B64 = 'data:image/png;base64,' + fs.readFileSync(bg1Path).toString('base64');

    const html1 = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@700;800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width: 1080px; height: 1080px;
  background: url('${bg1B64}') center/cover no-repeat;
  font-family: 'Noto Sans KR', sans-serif;
  overflow: hidden; position: relative;
}
/* 다크 오버레이 (텍스트 가독성) */
.overlay {
  position: absolute; inset: 0;
  background: linear-gradient(
    180deg,
    rgba(8,8,14,0.7) 0%,
    rgba(8,8,14,0.4) 40%,
    rgba(8,8,14,0.5) 60%,
    rgba(8,8,14,0.85) 100%
  );
}
/* 상단 태그 */
.tag {
  position: absolute; top: 50px; left: 50%; transform: translateX(-50%);
  z-index: 10;
  background: rgba(0,200,150,0.15); border: 1px solid rgba(0,200,150,0.5);
  padding: 10px 32px; border-radius: 30px;
  color: #00c896; font-size: 15px; font-weight: 800;
  font-family: 'Montserrat'; letter-spacing: 4px;
  backdrop-filter: blur(20px);
}
/* 메인 타이틀 */
.title {
  position: absolute; top: 130px; width: 100%; text-align: center; z-index: 10;
}
.title h1 {
  font-size: 78px; font-weight: 900; color: #fff;
  line-height: 1.15; letter-spacing: -2px;
  text-shadow: 0 4px 30px rgba(0,0,0,0.5);
}
.title h1 span {
  color: #00c896;
  text-shadow: 0 0 40px rgba(0,200,150,0.3), 0 4px 30px rgba(0,0,0,0.5);
}

/* 중간 글래스 카드 */
.glass-card {
  position: absolute; bottom: 200px; left: 50%; transform: translateX(-50%);
  z-index: 10;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 24px; padding: 32px 60px;
  backdrop-filter: blur(30px);
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.glass-card .info {
  font-size: 24px; font-weight: 700; color: #ccc;
  letter-spacing: 1px;
}
.glass-card .highlight {
  font-size: 42px; font-weight: 900; color: #fff;
  margin-top: 8px;
}
.glass-card .highlight span { color: #00c896; }

/* 가격 */
.price-btn {
  position: absolute; bottom: 100px; left: 50%; transform: translateX(-50%);
  z-index: 10;
  background: linear-gradient(135deg, #00c896, #00a67d);
  padding: 18px 56px; border-radius: 50px;
  color: #080812; font-size: 30px; font-weight: 900;
  box-shadow: 0 8px 40px rgba(0,200,150,0.35);
}
/* 하단 */
.bottom {
  position: absolute; bottom: 40px; width: 100%; text-align: center;
  z-index: 10;
  color: #777; font-size: 18px; font-weight: 700;
}
</style></head><body>
  <div class="overlay"></div>
  <div class="tag">WEB DESIGN</div>
  <div class="title">
    <h1>당신의 사업을<br><span>프리미엄으로</span></h1>
  </div>
  <div class="glass-card">
    <div class="info">업종별 맞춤 / 반응형 / CMS 포함</div>
    <div class="highlight"><span>84개</span> 포트폴리오로 증명</div>
  </div>
  <div class="price-btn">15만원부터 시작</div>
  <div class="bottom">평균 5일 제작 / 코딩 없이 직접 수정 / 무료 상담</div>
</body></html>`;

    const page1 = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    const hp1 = path.join(OUT, 'ai01_hero.html');
    fs.writeFileSync(hp1, html1);
    await page1.goto(`file://${hp1}`, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(2000);
    await page1.screenshot({ path: path.join(OUT, 'ai01_hero.png'), type: 'png' });
    console.log('  ✓ ai01_hero.png');
    await page1.close();
  }

  // --- POST AI-02: 워크스페이스 (AI 배경 + 서비스 소개) ---
  if (bg2Path) {
    const bg2B64 = 'data:image/png;base64,' + fs.readFileSync(bg2Path).toString('base64');

    const html2 = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@700;800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width: 1080px; height: 1080px;
  background: url('${bg2B64}') center/cover no-repeat;
  font-family: 'Noto Sans KR', sans-serif;
  overflow: hidden; position: relative;
}
.overlay {
  position: absolute; inset: 0;
  background: linear-gradient(
    180deg,
    rgba(6,6,10,0.75) 0%,
    rgba(6,6,10,0.35) 35%,
    rgba(6,6,10,0.35) 55%,
    rgba(6,6,10,0.9) 100%
  );
}
.top-label {
  position: absolute; top: 45px; left: 50%; transform: translateX(-50%);
  z-index: 10;
  background: rgba(0,200,150,0.12); border: 1px solid rgba(0,200,150,0.4);
  padding: 8px 28px; border-radius: 24px;
  color: #00c896; font-size: 14px; font-weight: 800;
  font-family: 'Montserrat'; letter-spacing: 3px;
  backdrop-filter: blur(15px);
}
.title {
  position: absolute; top: 110px; width: 100%; text-align: center; z-index: 10;
}
.title h1 {
  font-size: 68px; font-weight: 900; color: #fff;
  line-height: 1.2;
  text-shadow: 0 4px 20px rgba(0,0,0,0.6);
}
.title h1 span { color: #00c896; }

/* 하단 서비스 카드 3개 */
.cards {
  position: absolute; bottom: 140px; left: 50%; transform: translateX(-50%);
  z-index: 10;
  display: flex; gap: 18px;
}
.card {
  width: 310px; padding: 28px 24px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  backdrop-filter: blur(25px);
  text-align: center;
}
.card .card-num {
  font-family: 'Montserrat'; font-size: 48px; font-weight: 900;
  color: #00c896;
  text-shadow: 0 0 30px rgba(0,200,150,0.2);
}
.card .card-title {
  font-size: 24px; font-weight: 900; color: #fff;
  margin-top: 8px;
}
.card .card-desc {
  font-size: 16px; font-weight: 700; color: #888;
  margin-top: 6px;
}

.bottom {
  position: absolute; bottom: 50px; width: 100%; text-align: center;
  z-index: 10;
}
.bottom .cta {
  display: inline-block;
  background: linear-gradient(135deg, #00c896, #00a67d);
  padding: 14px 44px; border-radius: 40px;
  color: #080812; font-size: 24px; font-weight: 900;
  box-shadow: 0 6px 30px rgba(0,200,150,0.3);
}
</style></head><body>
  <div class="overlay"></div>
  <div class="top-label">PREMIUM SERVICE</div>
  <div class="title">
    <h1>프리미엄 홈페이지<br><span>합리적인 가격으로</span></h1>
  </div>
  <div class="cards">
    <div class="card">
      <div class="card-num">5일</div>
      <div class="card-title">빠른 납기</div>
      <div class="card-desc">상담부터 납품까지</div>
    </div>
    <div class="card">
      <div class="card-num">CMS</div>
      <div class="card-title">직접 수정</div>
      <div class="card-desc">코딩 없이 관리</div>
    </div>
    <div class="card">
      <div class="card-num">100%</div>
      <div class="card-title">반응형</div>
      <div class="card-desc">모든 기기 대응</div>
    </div>
  </div>
  <div class="bottom"><div class="cta">무료 상담 시작하기</div></div>
</body></html>`;

    const page2 = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    const hp2 = path.join(OUT, 'ai02_workspace.html');
    fs.writeFileSync(hp2, html2);
    await page2.goto(`file://${hp2}`, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(2000);
    await page2.screenshot({ path: path.join(OUT, 'ai02_workspace.png'), type: 'png' });
    console.log('  ✓ ai02_workspace.png');
    await page2.close();
  }

  await browser.close();
  console.log('\n=== 전체 완료 ===');
}

run().catch(e => { console.error(e); process.exit(1); });
