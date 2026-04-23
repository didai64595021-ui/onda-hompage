const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'kmong-set');
fs.mkdirSync(OUT, { recursive: true });

// .env
const envContent = fs.readFileSync('/home/onda/.env', 'utf-8');
const OPENAI_KEY = envContent.match(/OPENAI_API_KEY=(.+)/)[1].trim();

// 포트폴리오 base64
function imgB64(name) {
  return 'data:image/jpeg;base64,' + fs.readFileSync(
    path.join(__dirname, '..', 'kmong-images', 'v3-portfolio', name)
  ).toString('base64');
}
const PF = {
  cafe: imgB64('portfolio-cafe-v3.jpg'),
  clinic: imgB64('portfolio-clinic-v3.jpg'),
  nail: imgB64('portfolio-nail-v3.jpg'),
  pilates: imgB64('portfolio-pilates-v3.jpg'),
  tax: imgB64('portfolio-tax-v3.jpg'),
};
// v2도
function imgB64v2(name) {
  return 'data:image/jpeg;base64,' + fs.readFileSync(
    path.join(__dirname, '..', 'kmong-images', 'portfolio', name)
  ).toString('base64');
}
const PF2 = {
  cafe: imgB64v2('portfolio-cafe-v2.jpg'),
  clinic: imgB64v2('portfolio-clinic-v2.jpg'),
};

// === 공통 CSS ===
const BASE_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Noto Sans KR', sans-serif; overflow: hidden; }
.accent { color: #00c896; }
`;
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">`;

// === AI 배경 생성 ===
async function genAIBg(prompt, filename) {
  console.log(`  AI 배경: ${filename}...`);
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1536x1024', quality: 'high' }),
  });
  const data = await resp.json();
  if (data.error) { console.error('  에러:', data.error.message); return null; }
  if (data.data?.[0]?.b64_json) {
    const buf = Buffer.from(data.data[0].b64_json, 'base64');
    const p = path.join(OUT, filename);
    fs.writeFileSync(p, buf);
    console.log(`  ✓ ${filename} (${Math.round(buf.length/1024)}KB)`);
    return p;
  }
  return null;
}

// ===================================================================
// 썸네일 (760x420)
// ===================================================================
function htmlThumb(bgB64) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:760px; height:420px; background: url('${bgB64}') center/cover; position:relative; }
.ov { position:absolute; inset:0; background: linear-gradient(135deg, rgba(6,6,12,0.8) 0%, rgba(6,6,12,0.4) 50%, rgba(6,6,12,0.7) 100%); }
.content { position:absolute; inset:0; display:flex; align-items:center; padding:0 50px; gap:40px; z-index:2; }
.left { flex:1; }
.tag { display:inline-block; background:rgba(0,200,150,0.15); border:1px solid rgba(0,200,150,0.4); padding:6px 18px; border-radius:20px; color:#00c896; font-size:11px; font-weight:800; font-family:Montserrat; letter-spacing:3px; backdrop-filter:blur(10px); margin-bottom:14px; }
.left h1 { font-size:42px; font-weight:900; color:#fff; line-height:1.2; }
.left h1 span { color:#00c896; }
.left .sub { font-size:16px; color:#aaa; font-weight:700; margin-top:10px; }
.left .price { display:inline-block; background:linear-gradient(135deg,#00c896,#00a67d); padding:10px 28px; border-radius:30px; color:#080812; font-size:18px; font-weight:900; margin-top:16px; box-shadow:0 4px 20px rgba(0,200,150,0.3); }
.right { display:flex; gap:10px; perspective:800px; }
.mock { width:180px; height:240px; border-radius:10px; overflow:hidden; border:2px solid #333; box-shadow:0 10px 40px rgba(0,0,0,0.5); }
.mock.m1 { transform:rotateY(8deg); }
.mock.m2 { transform:translateY(-10px); border-color:#00c896; box-shadow:0 10px 40px rgba(0,200,150,0.15); }
.mock img { width:100%; height:100%; object-fit:cover; }
</style></head><body>
<div class="ov"></div>
<div class="content">
  <div class="left">
    <div class="tag">HOMEPAGE</div>
    <h1>업종별 맞춤<br><span>반응형 홈페이지</span></h1>
    <div class="sub">84개 포트폴리오 / CMS 포함 / 5일 제작</div>
    <div class="price">15만원부터</div>
  </div>
  <div class="right">
    <div class="mock m1"><img src="${PF.cafe}"></div>
    <div class="mock m2"><img src="${PF.clinic}"></div>
  </div>
</div>
</body></html>`;
}

// ===================================================================
// 상세1 - 히어로/후킹
// ===================================================================
function htmlDetail1(bgB64) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:900px; background:url('${bgB64}') center/cover; position:relative; }
.ov { position:absolute; inset:0; background:linear-gradient(180deg, rgba(6,6,12,0.75) 0%, rgba(6,6,12,0.4) 40%, rgba(6,6,12,0.85) 100%); }
.wrap { position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px; }
.tag { background:rgba(0,200,150,0.12); border:1px solid rgba(0,200,150,0.4); padding:8px 24px; border-radius:24px; color:#00c896; font-size:13px; font-weight:800; font-family:Montserrat; letter-spacing:3px; backdrop-filter:blur(10px); margin-bottom:30px; }
h1 { font-size:52px; font-weight:900; color:#fff; line-height:1.3; }
h1 span { color:#00c896; }
.desc { font-size:22px; color:#bbb; font-weight:700; margin-top:20px; line-height:1.6; }
.checks { display:flex; gap:20px; margin-top:36px; }
.check { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px 24px; backdrop-filter:blur(20px); text-align:center; width:180px; }
.check .icon { font-size:32px; color:#00c896; font-weight:900; margin-bottom:8px; }
.check .label { font-size:17px; color:#fff; font-weight:800; }
.check .sub { font-size:13px; color:#888; font-weight:600; margin-top:4px; }
</style></head><body>
<div class="ov"></div>
<div class="wrap">
  <div class="tag">ONDA MARKETING</div>
  <h1>홈페이지,<br><span>이제 쉽고 빠르게</span></h1>
  <div class="desc">디자인부터 개발, 관리까지<br>원스톱으로 해결합니다</div>
  <div class="checks">
    <div class="check"><div class="icon">5일</div><div class="label">빠른 제작</div><div class="sub">상담~납품</div></div>
    <div class="check"><div class="icon">CMS</div><div class="label">직접 수정</div><div class="sub">코딩 불필요</div></div>
    <div class="check"><div class="icon">100%</div><div class="label">반응형</div><div class="sub">모든 기기</div></div>
    <div class="check"><div class="icon">15만~</div><div class="label">합리적 가격</div><div class="sub">추가비 없음</div></div>
  </div>
</div>
</body></html>`;
}

// ===================================================================
// 상세2 - 포트폴리오 쇼케이스
// ===================================================================
const htmlDetail2 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:1100px; background:linear-gradient(180deg,#0a0a10,#0d1117); position:relative; }
.bg-glow { position:absolute; width:600px; height:600px; background:radial-gradient(circle,rgba(0,200,150,0.06) 0%,transparent 60%); top:200px; left:50%; transform:translateX(-50%); }
.header { text-align:center; padding-top:50px; position:relative; z-index:2; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:46px; font-weight:900; color:#fff; margin-top:8px; }
h1 span { color:#00c896; }
.grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; padding:40px 30px; position:relative; z-index:2; }
.item { position:relative; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); box-shadow:0 10px 30px rgba(0,0,0,0.3); }
.item img { width:100%; height:220px; object-fit:cover; display:block; }
.item .tag { position:absolute; bottom:10px; left:10px; background:rgba(0,0,0,0.7); backdrop-filter:blur(10px); padding:5px 14px; border-radius:8px; color:#fff; font-size:14px; font-weight:800; }
.more { text-align:center; margin-top:10px; position:relative; z-index:2; }
.more-tags { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; padding:0 40px; margin-top:16px; }
.more-tag { background:rgba(255,255,255,0.04); border:1px solid rgba(0,200,150,0.2); padding:8px 18px; border-radius:20px; color:#00c896; font-size:15px; font-weight:700; }
.more p { color:#888; font-size:20px; font-weight:700; }
</style></head><body>
<div class="bg-glow"></div>
<div class="header">
  <div class="label">PORTFOLIO</div>
  <h1><span>84개</span> 실제 제작 사례</h1>
</div>
<div class="grid">
  <div class="item"><img src="${PF.cafe}"><div class="tag">카페</div></div>
  <div class="item"><img src="${PF.clinic}"><div class="tag">병원</div></div>
  <div class="item"><img src="${PF.nail}"><div class="tag">네일샵</div></div>
  <div class="item"><img src="${PF.pilates}"><div class="tag">필라테스</div></div>
  <div class="item"><img src="${PF.tax}"><div class="tag">세무사</div></div>
  <div class="item"><img src="${PF2.cafe}"><div class="tag">기업</div></div>
</div>
<div class="more">
  <p>그 외 78개 업종 제작 가능</p>
  <div class="more-tags">
    <div class="more-tag">부동산</div><div class="more-tag">음식점</div><div class="more-tag">헬스장</div>
    <div class="more-tag">법률</div><div class="more-tag">학원</div><div class="more-tag">인테리어</div>
    <div class="more-tag">펫샵</div><div class="more-tag">농장</div><div class="more-tag">펜션</div>
  </div>
</div>
</body></html>`;

// ===================================================================
// 상세3 - CMS 기능
// ===================================================================
const htmlDetail3 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:900px; background:linear-gradient(160deg,#080810,#0d1420); position:relative; }
.bc { position:absolute; border-radius:50%; filter:blur(100px); opacity:0.1; }
.bc1 { width:400px; height:400px; background:#00c896; top:250px; left:150px; }
.header { text-align:center; padding-top:45px; position:relative; z-index:2; }
.tag { display:inline-block; background:rgba(0,200,150,0.12); border:1px solid rgba(0,200,150,0.3); padding:6px 20px; border-radius:20px; color:#00c896; font-size:12px; font-weight:800; font-family:Montserrat; letter-spacing:3px; backdrop-filter:blur(10px); }
h1 { font-size:56px; font-weight:900; color:#fff; margin-top:14px; line-height:1.2; }
h1 span { color:#00c896; }
.screen { margin:30px auto 0; width:760px; height:380px; border-radius:14px; overflow:hidden; border:2px solid #2a2a36; position:relative; z-index:2; box-shadow:0 20px 60px rgba(0,0,0,0.4); }
.bar { height:30px; background:#1e1e2a; display:flex; align-items:center; padding:0 12px; gap:6px; }
.dot { width:9px; height:9px; border-radius:50%; }
.dr { background:#ff5f57; } .dy { background:#febc2e; } .dg { background:#28c840; }
.screen img { width:100%; height:calc(100% - 30px); object-fit:cover; }
.ep { position:absolute; z-index:3; display:flex; align-items:center; gap:8px; }
.ep-dot { width:32px; height:32px; border-radius:50%; background:#00c896; display:flex; align-items:center; justify-content:center; box-shadow:0 0 20px rgba(0,200,150,0.4); }
.ep-dot::after { content:''; width:10px; height:10px; border-radius:50%; background:#080810; }
.ep-label { background:rgba(0,200,150,0.9); color:#080810; padding:5px 14px; border-radius:8px; font-size:13px; font-weight:800; }
.ep1 { top:350px; left:100px; } .ep2 { top:320px; left:380px; } .ep3 { top:410px; left:600px; }
.bottom { text-align:center; margin-top:30px; position:relative; z-index:2; }
.bottom h2 { font-size:30px; font-weight:900; color:#fff; }
.bottom p { font-size:20px; color:#999; font-weight:700; margin-top:8px; }
.chips { display:flex; justify-content:center; gap:16px; margin-top:24px; }
.chip { background:rgba(0,200,150,0.1); border:1px solid rgba(0,200,150,0.25); padding:10px 22px; border-radius:12px; color:#00c896; font-size:18px; font-weight:800; }
</style></head><body>
<div class="bc bc1"></div>
<div class="header"><div class="tag">CMS</div><h1>코딩 없이<br><span>직접 수정</span></h1></div>
<div class="screen"><div class="bar"><div class="dot dr"></div><div class="dot dy"></div><div class="dot dg"></div></div><img src="${PF.pilates}"></div>
<div class="ep ep1"><div class="ep-dot"></div><div class="ep-label">텍스트 수정</div></div>
<div class="ep ep2"><div class="ep-dot"></div><div class="ep-label">이미지 교체</div></div>
<div class="ep ep3"><div class="ep-dot"></div><div class="ep-label">색상 변경</div></div>
<div class="bottom">
  <h2>글자 / 사진 / 색상 / 레이아웃</h2>
  <p>클릭 한 번으로 직접 수정하세요</p>
  <div class="chips"><div class="chip">코딩 불필요</div><div class="chip">실시간 반영</div><div class="chip">무제한 수정</div></div>
</div>
</body></html>`;

// ===================================================================
// 상세4 - 반응형
// ===================================================================
const htmlDetail4 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:800px; background:linear-gradient(160deg,#0a0a14,#101824); position:relative; }
.header { text-align:center; padding-top:40px; }
.tag { display:inline-block; background:rgba(0,200,150,0.12); border:1px solid rgba(0,200,150,0.3); padding:6px 20px; border-radius:20px; color:#00c896; font-size:12px; font-weight:800; font-family:Montserrat; letter-spacing:3px; }
h1 { font-size:46px; font-weight:900; color:#fff; margin-top:12px; line-height:1.2; }
h1 span { color:#00c896; }
.devices { display:flex; align-items:flex-end; justify-content:center; gap:20px; margin-top:30px; padding:0 30px; }
.pc { width:480px; height:340px; border-radius:12px; overflow:hidden; border:2px solid #333; box-shadow:0 15px 50px rgba(0,0,0,0.4); position:relative; }
.pc .bar { height:26px; background:#1e1e2a; display:flex; align-items:center; padding:0 10px; gap:5px; }
.dot { width:8px; height:8px; border-radius:50%; }
.dr{background:#ff5f57;}.dy{background:#febc2e;}.dg{background:#28c840;}
.pc img { width:100%; height:calc(100% - 26px); object-fit:cover; }
.pc .badge { position:absolute; top:34px; left:10px; background:#00c896; color:#080810; padding:4px 12px; border-radius:8px; font-size:12px; font-weight:800; }
.phone { width:180px; height:340px; border-radius:22px; overflow:hidden; border:3px solid #444; box-shadow:0 15px 50px rgba(0,0,0,0.4); position:relative; }
.phone img { width:100%; height:100%; object-fit:cover; }
.phone .badge { position:absolute; top:10px; left:10px; background:#00c896; color:#080810; padding:4px 12px; border-radius:8px; font-size:11px; font-weight:800; }
.bottom { text-align:center; margin-top:30px; }
.bottom h2 { font-size:26px; font-weight:900; color:#fff; }
.feats { display:flex; justify-content:center; gap:14px; margin-top:16px; }
.feat { background:rgba(0,200,150,0.08); border:1px solid rgba(0,200,150,0.2); padding:8px 18px; border-radius:10px; color:#00c896; font-size:16px; font-weight:800; }
</style></head><body>
<div class="header"><div class="tag">RESPONSIVE</div><h1>PC에서도 모바일에서도<br><span>완벽하게</span></h1></div>
<div class="devices">
  <div class="pc"><div class="bar"><div class="dot dr"></div><div class="dot dy"></div><div class="dot dg"></div></div><img src="${PF.cafe}"><div class="badge">PC</div></div>
  <div class="phone"><img src="${PF.cafe}"><div class="badge">Mobile</div></div>
</div>
<div class="bottom">
  <h2>모든 기기에서 최적화된 경험</h2>
  <div class="feats"><div class="feat">자동 레이아웃</div><div class="feat">터치 최적화</div><div class="feat">빠른 로딩</div></div>
</div>
</body></html>`;

// ===================================================================
// 상세5 - 프로세스
// ===================================================================
const htmlDetail5 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:900px; background:linear-gradient(160deg,#0a0a12,#0d1117); position:relative; }
.header { text-align:center; padding-top:40px; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:50px; font-weight:900; color:#fff; margin-top:6px; }
.sub { font-size:22px; color:#888; font-weight:700; margin-top:6px; }
.timeline { padding:30px 0 0 160px; position:relative; }
.timeline::before { content:''; position:absolute; left:157px; top:40px; bottom:40px; width:3px; background:linear-gradient(180deg,#00c896,rgba(0,200,150,0.1)); border-radius:2px; }
.step { display:flex; align-items:flex-start; gap:24px; margin-bottom:18px; position:relative; }
.num { width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg,#00c896,#00a67d); display:flex; align-items:center; justify-content:center; font-family:Montserrat; font-size:18px; font-weight:800; color:#0a0a12; z-index:2; box-shadow:0 0 16px rgba(0,200,150,0.3); flex-shrink:0; }
.step-title { font-size:30px; font-weight:900; color:#fff; display:flex; align-items:center; gap:14px; }
.day { display:inline-block; background:rgba(0,200,150,0.1); border:1px solid rgba(0,200,150,0.25); padding:3px 14px; border-radius:8px; font-size:15px; font-weight:800; color:#00c896; }
.step-desc { font-size:17px; color:#777; font-weight:700; margin-top:4px; }
.cta { text-align:center; margin-top:24px; }
.cta-btn { display:inline-block; background:linear-gradient(135deg,#00c896,#00a67d); padding:14px 48px; border-radius:40px; color:#0a0a12; font-size:22px; font-weight:900; box-shadow:0 6px 24px rgba(0,200,150,0.25); }
</style></head><body>
<div class="header"><div class="label">PROCESS</div><h1>5일이면 완성</h1><div class="sub">심플한 제작 과정</div></div>
<div class="timeline">
  <div class="step"><div class="num">01</div><div><div class="step-title">상담 <span class="day">당일</span></div><div class="step-desc">요구사항 파악 / 업종 스타일 논의</div></div></div>
  <div class="step"><div class="num">02</div><div><div class="step-title">기획 <span class="day">1일</span></div><div class="step-desc">레이아웃 설계 / 콘텐츠 구성</div></div></div>
  <div class="step"><div class="num">03</div><div><div class="step-title">디자인 <span class="day">2~3일</span></div><div class="step-desc">시안 제작 / 피드백 반영</div></div></div>
  <div class="step"><div class="num">04</div><div><div class="step-title">개발 <span class="day">3~4일</span></div><div class="step-desc">코딩 + CMS / 반응형 적용</div></div></div>
  <div class="step"><div class="num">05</div><div><div class="step-title">납품 <span class="day">5일</span></div><div class="step-desc">최종 검수 / 도메인 연결</div></div></div>
</div>
<div class="cta"><div class="cta-btn">무료 상담 시작하기</div></div>
</body></html>`;

// ===================================================================
// 상세6 - 가격표
// ===================================================================
const htmlDetail6 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:960px; background:linear-gradient(160deg,#0a0a10,#0f1419); position:relative; }
.bg-glow { position:absolute; width:500px; height:500px; background:radial-gradient(circle,rgba(0,200,150,0.08) 0%,transparent 65%); top:50%; left:50%; transform:translate(-50%,-50%); }
.header { text-align:center; padding-top:35px; position:relative; z-index:2; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:44px; font-weight:900; color:#fff; margin-top:6px; }
h1 span { color:#00c896; }
.cards { display:flex; justify-content:center; gap:16px; margin-top:28px; padding:0 20px; position:relative; z-index:2; }
.card { width:260px; min-height:620px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:30px 22px; backdrop-filter:blur(20px); position:relative; }
.card.ft { background:linear-gradient(160deg,rgba(0,200,150,0.12),rgba(0,200,150,0.03)); border:1px solid rgba(0,200,150,0.35); box-shadow:0 16px 50px rgba(0,200,150,0.08); transform:translateY(-6px); }
.best { position:absolute; top:-13px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg,#00c896,#00e6ac); color:#0a0a0f; padding:5px 20px; border-radius:16px; font-size:12px; font-weight:800; font-family:Montserrat; letter-spacing:2px; }
.tier { text-align:center; font-family:Montserrat; font-size:16px; font-weight:800; color:#888; letter-spacing:2px; margin-top:6px; }
.card.ft .tier { color:#00c896; }
.price { text-align:center; font-size:40px; font-weight:900; color:#fff; margin:10px 0 4px; }
.pages { text-align:center; font-size:16px; color:#666; font-weight:700; }
.div { height:1px; background:rgba(255,255,255,0.06); margin:18px 0; }
.card.ft .div { background:rgba(0,200,150,0.2); }
.features { list-style:none; }
.features li { padding:8px 0; font-size:18px; font-weight:700; color:#999; display:flex; align-items:center; gap:10px; }
.card.ft .features li { color:#ddd; }
.features li::before { content:''; width:7px; height:7px; border-radius:50%; background:#444; flex-shrink:0; }
.card.ft .features li::before { background:#00c896; }
.footer { position:absolute; bottom:20px; width:100%; text-align:center; color:#555; font-size:15px; font-weight:700; z-index:2; }
</style></head><body>
<div class="bg-glow"></div>
<div class="header"><div class="label">PRICING</div><h1>합리적인 가격<br><span>투명한 견적</span></h1></div>
<div class="cards">
  <div class="card"><div class="tier">BASIC</div><div class="price">15만원~</div><div class="pages">원페이지</div><div class="div"></div><ul class="features"><li>반응형 디자인</li><li>모바일 최적화</li><li>CMS 기본</li><li>1회 수정</li></ul></div>
  <div class="card ft"><div class="best">BEST</div><div class="tier">STANDARD</div><div class="price">35만원~</div><div class="pages">5페이지</div><div class="div"></div><ul class="features"><li>반응형 디자인</li><li>CMS 전체 기능</li><li>SEO 최적화</li><li>문의폼 / 지도</li><li>2회 수정</li></ul></div>
  <div class="card"><div class="tier">PREMIUM</div><div class="price">70만원~</div><div class="pages">10페이지+</div><div class="div"></div><ul class="features"><li>반응형 디자인</li><li>CMS + 위젯</li><li>SEO + 분석</li><li>다국어 지원</li><li>1개월 유지보수</li></ul></div>
</div>
<div class="footer">부가세 별도 / 맞춤 견적 가능 / 급행 추가 15만원</div>
</body></html>`;

// ===================================================================
// 상세7 - 후기
// ===================================================================
const htmlDetail7 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:820px; background:linear-gradient(160deg,#0c0c14,#0a0e16); position:relative; }
.header { text-align:center; padding-top:40px; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:42px; font-weight:900; color:#fff; margin-top:8px; }
.reviews { padding:30px 40px 0; display:flex; flex-direction:column; gap:18px; }
.review { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:24px 28px; backdrop-filter:blur(10px); display:flex; gap:20px; }
.avatar { width:52px; height:52px; border-radius:50%; background:linear-gradient(135deg,#00c896,#00a67d); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:900; color:#080812; flex-shrink:0; }
.rv-content { flex:1; }
.rv-name { font-size:18px; font-weight:900; color:#fff; }
.stars { color:#f59e0b; font-size:16px; margin-top:2px; }
.rv-text { font-size:17px; color:#bbb; font-weight:600; margin-top:8px; line-height:1.5; }
.bottom { text-align:center; margin-top:24px; }
.stat { font-size:22px; font-weight:800; color:#00c896; }
</style></head><body>
<div class="header"><div class="label">REVIEW</div><h1>사장님들의 실제 후기</h1></div>
<div class="reviews">
  <div class="review"><div class="avatar">카</div><div class="rv-content"><div class="rv-name">카페 사장님</div><div class="stars">★★★★★</div><div class="rv-text">디자인이 정말 마음에 들어요. 모바일에서도 완벽하고 직접 수정도 쉬워서 만족합니다.</div></div></div>
  <div class="review"><div class="avatar">필</div><div class="rv-content"><div class="rv-name">필라테스 원장님</div><div class="stars">★★★★★</div><div class="rv-text">5일만에 원하는 사이트가 나왔어요. CMS 덕분에 수정비용 0원이에요.</div></div></div>
  <div class="review"><div class="avatar">세</div><div class="rv-content"><div class="rv-name">세무사님</div><div class="stars">★★★★★</div><div class="rv-text">전문적인 느낌이 확 나면서도 깔끔해요. 상담 문의가 2배로 늘었습니다.</div></div></div>
</div>
<div class="bottom"><div class="stat">크몽 평점 4.9 / 재주문률 40%</div></div>
</body></html>`;

// ===================================================================
// 상세8 - CTA
// ===================================================================
const htmlDetail8 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:700px; background:linear-gradient(160deg,#003828,#0a0a10); position:relative; }
.wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:40px; }
h1 { font-size:48px; font-weight:900; color:#fff; line-height:1.3; }
h1 span { color:#00c896; }
.desc { font-size:22px; color:#aaa; font-weight:700; margin-top:16px; }
.checks { display:flex; flex-wrap:wrap; justify-content:center; gap:12px; margin-top:30px; }
.check { background:rgba(0,200,150,0.1); border:1px solid rgba(0,200,150,0.2); padding:10px 22px; border-radius:12px; color:#00c896; font-size:18px; font-weight:800; }
.cta { margin-top:36px; background:linear-gradient(135deg,#00c896,#00e6ac); padding:20px 80px; border-radius:50px; color:#080812; font-size:30px; font-weight:900; box-shadow:0 8px 40px rgba(0,200,150,0.35); }
.info { color:#888; font-size:18px; font-weight:700; margin-top:20px; }
</style></head><body>
<div class="wrap">
  <h1>지금 바로<br><span>무료 상담</span> 받으세요</h1>
  <div class="desc">업종별 맞춤 홈페이지, 5일이면 완성</div>
  <div class="checks">
    <div class="check">반응형 디자인</div><div class="check">CMS 포함</div>
    <div class="check">SEO 최적화</div><div class="check">15만원부터</div>
  </div>
  <div class="cta">무료 상담 시작하기</div>
  <div class="info">카카오톡 / 크몽 / 전화 상담 가능</div>
</div>
</body></html>`;


// === MAIN ===
async function run() {
  // AI 배경 1장만 (썸네일+상세1 공유)
  console.log('=== AI 배경 생성 ===');
  const bgPath = await genAIBg(
    `Premium dark tech workspace background. Multiple floating holographic screens showing beautiful website designs. Subtle green (#00c896) neon accent glow, dark navy-black gradient. Modern futuristic aesthetic. NO TEXT, NO LETTERS, NO WORDS. Ultra clean. Photorealistic.`,
    'ai_bg_main.png'
  );

  const bgB64 = bgPath ? 'data:image/png;base64,' + fs.readFileSync(bgPath).toString('base64') : '';
  if (!bgB64) { console.error('AI 배경 실패'); process.exit(1); }

  console.log('\n=== Playwright 스크린샷 ===');
  const browser = await chromium.launch();

  const pages = [
    { name: '00_thumbnail', html: htmlThumb(bgB64), w: 760, h: 420 },
    { name: '01_hero', html: htmlDetail1(bgB64), w: 860, h: 900 },
    { name: '02_portfolio', html: htmlDetail2, w: 860, h: 1100 },
    { name: '03_cms', html: htmlDetail3, w: 860, h: 900 },
    { name: '04_responsive', html: htmlDetail4, w: 860, h: 800 },
    { name: '05_process', html: htmlDetail5, w: 860, h: 900 },
    { name: '06_pricing', html: htmlDetail6, w: 860, h: 960 },
    { name: '07_reviews', html: htmlDetail7, w: 860, h: 820 },
    { name: '08_cta', html: htmlDetail8, w: 860, h: 700 },
  ];

  for (const { name, html, w, h } of pages) {
    console.log(`  [${name}]...`);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const hp = path.join(OUT, `${name}.html`);
    fs.writeFileSync(hp, html);
    await page.goto(`file://${hp}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const op = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: op, type: 'png' });
    console.log(`  ✓ ${name}.png (${Math.round(fs.statSync(op).size/1024)}KB)`);
    await page.close();
  }

  await browser.close();
  console.log('\n=== 전체 완료 (썸네일 1 + 상세 8 = 총 9장) ===');
}

run().catch(e => { console.error(e); process.exit(1); });
