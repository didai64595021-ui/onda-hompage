const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });

// 포트폴리오 이미지 base64 로드
function imgB64(name) {
  const p = path.join(__dirname, '..', 'kmong-images', 'v3-portfolio', name);
  return 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64');
}

const PF = {
  cafe: imgB64('portfolio-cafe-v3.jpg'),
  clinic: imgB64('portfolio-clinic-v3.jpg'),
  nail: imgB64('portfolio-nail-v3.jpg'),
  pilates: imgB64('portfolio-pilates-v3.jpg'),
  tax: imgB64('portfolio-tax-v3.jpg'),
};

// ===================================================================
// POST 01 - 히어로 쇼케이스 (글래스모피즘 + 3D 목업)
// ===================================================================
const html_01 = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width: 1080px; height: 1080px;
  background: linear-gradient(135deg, #0a0a0f 0%, #0d1117 40%, #1a1a2e 100%);
  font-family: 'Noto Sans KR', sans-serif;
  overflow: hidden;
  position: relative;
}
/* 배경 장식 원 */
.bg-circle {
  position: absolute; border-radius: 50%;
  filter: blur(80px); opacity: 0.15;
}
.bg-c1 { width:600px; height:600px; background:#00c896; top:-200px; right:-100px; }
.bg-c2 { width:400px; height:400px; background:#6366f1; bottom:-100px; left:-50px; }
.bg-c3 { width:300px; height:300px; background:#f59e0b; bottom:200px; right:100px; opacity:0.08; }

/* 상단 태그 */
.tag {
  position: absolute; top: 40px; left: 50%; transform: translateX(-50%);
  background: rgba(0,200,150,0.15); border: 1px solid rgba(0,200,150,0.4);
  padding: 8px 28px; border-radius: 30px;
  color: #00c896; font-size: 14px; font-weight: 700;
  letter-spacing: 3px; backdrop-filter: blur(10px);
}

/* 메인 타이틀 */
.title {
  position: absolute; top: 100px; width: 100%; text-align: center;
}
.title h1 {
  font-size: 72px; font-weight: 900; color: #fff;
  line-height: 1.2; letter-spacing: -2px;
}
.title h1 span { color: #00c896; }

/* 목업 컨테이너 */
.mockups {
  position: absolute; top: 300px; width: 100%;
  display: flex; justify-content: center; gap: 20px;
  padding: 0 30px; perspective: 1200px;
}
.mockup {
  position: relative;
  background: #1a1a24;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,200,150,0.08);
  transition: transform 0.3s;
}
.mockup::before {
  content: ''; position: absolute; top:0; left:0; right:0; height: 28px;
  background: #2a2a36; border-radius: 14px 14px 0 0;
  display: flex; align-items: center;
}
.mockup::after {
  content: '● ● ●'; position: absolute; top: 6px; left: 12px;
  font-size: 10px; color: #555; letter-spacing: 4px;
}
.mockup img {
  width: 100%; height: calc(100% - 28px); margin-top: 28px;
  object-fit: cover; display: block;
}
.m1 { width: 300px; height: 380px; transform: rotateY(12deg) rotateX(-2deg); }
.m2 { width: 340px; height: 420px; transform: translateY(-20px); z-index:2;
      box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,200,150,0.12); }
.m3 { width: 300px; height: 380px; transform: rotateY(-12deg) rotateX(-2deg); }

/* 업종 태그 */
.industries {
  position: absolute; top: 750px; width: 100%;
  text-align: center; color: #aaa; font-size: 22px; font-weight: 700;
}

/* 메인 카피 */
.subtitle {
  position: absolute; top: 800px; width: 100%; text-align: center;
  font-size: 38px; font-weight: 900; color: #fff;
}

/* 가격 버튼 */
.price-btn {
  position: absolute; top: 870px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, #00c896, #00a67d);
  padding: 16px 52px; border-radius: 50px;
  color: #0a0a0f; font-size: 28px; font-weight: 900;
  box-shadow: 0 8px 30px rgba(0,200,150,0.3);
}

/* 하단 정보 */
.bottom-info {
  position: absolute; bottom: 30px; width: 100%; text-align: center;
  color: #666; font-size: 18px; font-weight: 700;
}
</style></head><body>
  <div class="bg-circle bg-c1"></div>
  <div class="bg-circle bg-c2"></div>
  <div class="bg-circle bg-c3"></div>

  <div class="tag">HOMEPAGE</div>

  <div class="title">
    <h1>당신의 사업,<br><span>이렇게 바뀝니다</span></h1>
  </div>

  <div class="mockups">
    <div class="mockup m1"><img src="${PF.cafe}"></div>
    <div class="mockup m2"><img src="${PF.clinic}"></div>
    <div class="mockup m3"><img src="${PF.nail}"></div>
  </div>

  <div class="industries">카페 / 병원 / 네일 / 필라테스 / 세무사</div>
  <div class="subtitle">업종별 맞춤 반응형 홈페이지</div>
  <div class="price-btn">15만원부터</div>
  <div class="bottom-info">84개 포트폴리오 / 평균 5일 제작 / CMS 포함</div>
</body></html>`;


// ===================================================================
// POST 02 - 가격표 (글래스 카드 + 그라데이션)
// ===================================================================
const html_02 = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@600;800&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width: 1080px; height: 1080px;
  background: linear-gradient(160deg, #0a0a10 0%, #0f1419 50%, #0a0f14 100%);
  font-family: 'Noto Sans KR', sans-serif;
  overflow: hidden; position: relative;
}
.bg-glow {
  position: absolute; width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(0,200,150,0.1) 0%, transparent 70%);
  top: 50%; left: 50%; transform: translate(-50%,-50%);
}

.header {
  text-align: center; padding-top: 35px;
}
.header .label {
  color: #00c896; font-size: 18px; font-weight: 800;
  font-family: 'Montserrat', sans-serif; letter-spacing: 3px;
}
.header h1 {
  font-size: 52px; font-weight: 900; color: #fff; margin-top: 8px;
}
.header h1 span { color: #00c896; }

.cards {
  display: flex; justify-content: center; gap: 20px;
  margin-top: 30px; padding: 0 30px;
}
.card {
  width: 310px; min-height: 680px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px; padding: 36px 28px;
  backdrop-filter: blur(20px);
  position: relative;
}
.card.featured {
  background: linear-gradient(160deg, rgba(0,200,150,0.12) 0%, rgba(0,200,150,0.04) 100%);
  border: 1px solid rgba(0,200,150,0.35);
  box-shadow: 0 20px 60px rgba(0,200,150,0.1), inset 0 1px 0 rgba(255,255,255,0.1);
  transform: translateY(-8px);
}
.card.featured .best {
  position: absolute; top: -15px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, #00c896, #00e6ac);
  color: #0a0a0f; padding: 6px 24px; border-radius: 20px;
  font-size: 13px; font-weight: 800; font-family: 'Montserrat';
  letter-spacing: 2px;
}
.card .tier {
  text-align: center; font-family: 'Montserrat'; font-size: 18px;
  font-weight: 800; color: #888; letter-spacing: 2px; margin-top: 8px;
}
.card.featured .tier { color: #00c896; }
.card .price {
  text-align: center; font-size: 46px; font-weight: 900;
  color: #fff; margin: 12px 0 4px;
}
.card .pages {
  text-align: center; font-size: 18px; color: #666; font-weight: 700;
}
.card .divider {
  height: 1px; background: rgba(255,255,255,0.08); margin: 20px 0;
}
.card.featured .divider { background: rgba(0,200,150,0.2); }
.card .features { list-style: none; }
.card .features li {
  padding: 10px 0; font-size: 20px; font-weight: 700;
  color: #999; display: flex; align-items: center; gap: 12px;
}
.card.featured .features li { color: #ddd; }
.card .features li::before {
  content: ''; width: 8px; height: 8px; border-radius: 50%;
  background: #444; flex-shrink: 0;
}
.card.featured .features li::before { background: #00c896; }

.footer {
  position: absolute; bottom: 28px; width: 100%; text-align: center;
  color: #555; font-size: 17px; font-weight: 700;
}
</style></head><body>
  <div class="bg-glow"></div>
  <div class="header">
    <div class="label">PRICING</div>
    <h1>합리적인 가격<br><span>투명한 견적</span></h1>
  </div>
  <div class="cards">
    <div class="card">
      <div class="tier">BASIC</div>
      <div class="price">15만원~</div>
      <div class="pages">원페이지</div>
      <div class="divider"></div>
      <ul class="features">
        <li>반응형 디자인</li>
        <li>모바일 최적화</li>
        <li>CMS 기본</li>
        <li>1회 수정</li>
      </ul>
    </div>
    <div class="card featured">
      <div class="best">BEST</div>
      <div class="tier">STANDARD</div>
      <div class="price">35만원~</div>
      <div class="pages">5페이지</div>
      <div class="divider"></div>
      <ul class="features">
        <li>반응형 디자인</li>
        <li>CMS 전체 기능</li>
        <li>SEO 최적화</li>
        <li>문의폼 / 지도</li>
        <li>2회 수정</li>
      </ul>
    </div>
    <div class="card">
      <div class="tier">PREMIUM</div>
      <div class="price">70만원~</div>
      <div class="pages">10페이지+</div>
      <div class="divider"></div>
      <ul class="features">
        <li>반응형 디자인</li>
        <li>CMS + 위젯</li>
        <li>SEO + 분석</li>
        <li>다국어 지원</li>
        <li>1개월 유지보수</li>
      </ul>
    </div>
  </div>
  <div class="footer">부가세 별도 / 맞춤 견적 가능 / 급행 추가 15만원</div>
</body></html>`;


// ===================================================================
// POST 03 - CMS 기능 (인터랙티브 느낌 + 글래스 오버레이)
// ===================================================================
const html_03 = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@600;800&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width: 1080px; height: 1080px;
  background: linear-gradient(145deg, #080810 0%, #0d1117 50%, #101820 100%);
  font-family: 'Noto Sans KR', sans-serif;
  overflow: hidden; position: relative;
}
.bg-circle {
  position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.12;
}
.bc1 { width:500px; height:500px; background:#00c896; top:300px; left:200px; }
.bc2 { width:300px; height:300px; background:#818cf8; top:100px; right:100px; }

.tag {
  position: absolute; top: 36px; left: 50%; transform: translateX(-50%);
  background: rgba(0,200,150,0.12); border: 1px solid rgba(0,200,150,0.3);
  padding: 7px 24px; border-radius: 24px;
  color: #00c896; font-size: 13px; font-weight: 800;
  font-family: 'Montserrat'; letter-spacing: 3px;
  backdrop-filter: blur(10px);
}
.title {
  position: absolute; top: 85px; width: 100%; text-align: center;
}
.title h1 { font-size: 78px; font-weight: 900; color: #fff; line-height: 1.15; }
.title h1 span { color: #00c896; }

/* 목업 */
.screen-wrap {
  position: absolute; top: 290px; left: 50%; transform: translateX(-50%);
  width: 860px; height: 440px;
}
.screen {
  width: 100%; height: 100%; border-radius: 16px; overflow: hidden;
  border: 2px solid #2a2a36; position: relative;
  box-shadow: 0 30px 80px rgba(0,0,0,0.5);
}
.screen-bar {
  height: 32px; background: #1e1e2a; display: flex;
  align-items: center; padding: 0 14px; gap: 8px;
}
.screen-bar .dot { width:10px; height:10px; border-radius:50%; }
.dot-r { background: #ff5f57; }
.dot-y { background: #febc2e; }
.dot-g { background: #28c840; }
.screen img {
  width: 100%; height: calc(100% - 32px); object-fit: cover;
}

/* 편집 포인트 */
.edit-point {
  position: absolute;
  display: flex; align-items: center; gap: 10px;
}
.edit-dot {
  width: 36px; height: 36px; border-radius: 50%;
  background: #00c896; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 20px rgba(0,200,150,0.4), 0 0 60px rgba(0,200,150,0.15);
  animation: pulse 2s infinite;
}
.edit-dot::after {
  content: ''; width: 12px; height: 12px; border-radius: 50%;
  background: #0a0a0f;
}
@keyframes pulse {
  0%,100% { box-shadow: 0 0 20px rgba(0,200,150,0.4); }
  50% { box-shadow: 0 0 30px rgba(0,200,150,0.6), 0 0 80px rgba(0,200,150,0.2); }
}
.edit-label {
  background: rgba(0,200,150,0.9); color: #0a0a0f;
  padding: 6px 16px; border-radius: 8px;
  font-size: 15px; font-weight: 800;
  white-space: nowrap;
}
.ep1 { top: 370px; left: 130px; }
.ep2 { top: 340px; left: 480px; }
.ep3 { top: 430px; left: 740px; }

/* 하단 */
.bottom-title {
  position: absolute; top: 770px; width: 100%; text-align: center;
  font-size: 34px; font-weight: 900; color: #fff;
}
.bottom-sub {
  position: absolute; top: 820px; width: 100%; text-align: center;
  font-size: 24px; font-weight: 700; color: #999;
}
.features-row {
  position: absolute; top: 890px; width: 100%;
  display: flex; justify-content: center; gap: 24px;
}
.feat-chip {
  background: rgba(0,200,150,0.1); border: 1px solid rgba(0,200,150,0.25);
  padding: 10px 24px; border-radius: 12px;
  color: #00c896; font-size: 20px; font-weight: 800;
  backdrop-filter: blur(10px);
}
</style></head><body>
  <div class="bg-circle bc1"></div>
  <div class="bg-circle bc2"></div>
  <div class="tag">CMS</div>
  <div class="title"><h1>코딩 없이<br><span>직접 수정</span></h1></div>

  <div class="screen-wrap">
    <div class="screen">
      <div class="screen-bar">
        <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
      </div>
      <img src="${PF.pilates}">
    </div>
  </div>

  <div class="edit-point ep1">
    <div class="edit-dot"></div>
    <div class="edit-label">텍스트 수정</div>
  </div>
  <div class="edit-point ep2">
    <div class="edit-dot"></div>
    <div class="edit-label">이미지 교체</div>
  </div>
  <div class="edit-point ep3">
    <div class="edit-dot"></div>
    <div class="edit-label">색상 변경</div>
  </div>

  <div class="bottom-title">글자 / 사진 / 색상 / 레이아웃</div>
  <div class="bottom-sub">클릭 한 번으로 직접 수정하세요</div>
  <div class="features-row">
    <div class="feat-chip">코딩 불필요</div>
    <div class="feat-chip">실시간 반영</div>
    <div class="feat-chip">무제한 수정</div>
  </div>
</body></html>`;


// === 스크린샷 생성 ===
async function run() {
  const browser = await chromium.launch();
  const posts = [
    { name: '01_hero_showcase', html: html_01 },
    { name: '02_pricing_card', html: html_02 },
    { name: '03_cms_feature', html: html_03 },
  ];

  for (const { name, html } of posts) {
    console.log(`[${name}] 생성 중...`);
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });

    const htmlPath = path.join(OUT, `${name}.html`);
    fs.writeFileSync(htmlPath, html);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

    // 폰트 로딩 대기
    await page.waitForTimeout(2000);

    const outPath = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: outPath, type: 'png' });

    const stat = fs.statSync(outPath);
    console.log(`  ✓ ${name}.png (${Math.round(stat.size/1024)}KB)`);

    await page.close();
  }

  await browser.close();
  console.log('\n완료!');
}

run().catch(e => { console.error(e); process.exit(1); });
