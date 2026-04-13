const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'kmong-set');
fs.mkdirSync(OUT, { recursive: true });

function imgB64(name) {
  return 'data:image/jpeg;base64,' + fs.readFileSync(
    path.join(__dirname, '..', 'kmong-images', 'v3-portfolio', name)
  ).toString('base64');
}
function imgB64v2(name) {
  return 'data:image/jpeg;base64,' + fs.readFileSync(
    path.join(__dirname, '..', 'kmong-images', 'portfolio', name)
  ).toString('base64');
}
const PF = {
  cafe: imgB64('portfolio-cafe-v3.jpg'),
  clinic: imgB64('portfolio-clinic-v3.jpg'),
  nail: imgB64('portfolio-nail-v3.jpg'),
  pilates: imgB64('portfolio-pilates-v3.jpg'),
  tax: imgB64('portfolio-tax-v3.jpg'),
};
const PF2 = { cafe: imgB64v2('portfolio-cafe-v2.jpg') };

// 기존 AI 배경 재사용
const bgFile = path.join(OUT, 'ai_bg_main.png');
const bgB64 = fs.existsSync(bgFile)
  ? 'data:image/png;base64,' + fs.readFileSync(bgFile).toString('base64')
  : '';

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">`;
const BASE_CSS = `* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Noto Sans KR',sans-serif; overflow:hidden; }`;

// ===================================================================
// 00 - 썸네일 (수정: "반응형 홈페이지" 한 줄로)
// ===================================================================
const htmlThumb = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:760px; height:420px; background:url('${bgB64}') center/cover; position:relative; }
.ov { position:absolute; inset:0; background:linear-gradient(135deg,rgba(6,6,12,0.82) 0%,rgba(6,6,12,0.45) 50%,rgba(6,6,12,0.75) 100%); }
.content { position:absolute; inset:0; display:flex; align-items:center; padding:0 45px; gap:30px; z-index:2; }
.left { flex:1; }
.tag { display:inline-block; background:rgba(0,200,150,0.15); border:1px solid rgba(0,200,150,0.4); padding:5px 16px; border-radius:20px; color:#00c896; font-size:10px; font-weight:800; font-family:Montserrat; letter-spacing:3px; margin-bottom:12px; }
.left h1 { font-size:36px; font-weight:900; color:#fff; line-height:1.25; white-space:nowrap; }
.left h1 span { color:#00c896; }
.left .sub { font-size:14px; color:#aaa; font-weight:700; margin-top:8px; }
.left .price { display:inline-block; background:linear-gradient(135deg,#00c896,#00a67d); padding:9px 24px; border-radius:28px; color:#080812; font-size:16px; font-weight:900; margin-top:14px; box-shadow:0 4px 20px rgba(0,200,150,0.3); }
.right { display:flex; gap:10px; perspective:800px; }
.mock { width:175px; height:230px; border-radius:10px; overflow:hidden; border:2px solid #333; box-shadow:0 10px 40px rgba(0,0,0,0.5); }
.mock.m1 { transform:rotateY(8deg); }
.mock.m2 { transform:translateY(-10px); border-color:#00c896; box-shadow:0 10px 40px rgba(0,200,150,0.15); }
.mock img { width:100%; height:100%; object-fit:cover; }
</style></head><body>
<div class="ov"></div>
<div class="content">
  <div class="left">
    <div class="tag">HOMEPAGE</div>
    <h1>업종별 맞춤</h1>
    <h1><span>반응형 홈페이지</span></h1>
    <div class="sub">84개 포트폴리오 / CMS 포함 / 5일 제작</div>
    <div class="price">15만원부터</div>
  </div>
  <div class="right">
    <div class="mock m1"><img src="${PF.cafe}"></div>
    <div class="mock m2"><img src="${PF.clinic}"></div>
  </div>
</div>
</body></html>`;

// ===================================================================
// 02 - 포트폴리오 (수정: 상하 여백 동일)
// ===================================================================
const htmlDetail2 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:1060px; background:linear-gradient(180deg,#0a0a10,#0d1117); position:relative; display:flex; flex-direction:column; }
.bg-glow { position:absolute; width:600px; height:600px; background:radial-gradient(circle,rgba(0,200,150,0.06) 0%,transparent 60%); top:200px; left:50%; transform:translateX(-50%); }
.header { text-align:center; padding-top:45px; position:relative; z-index:2; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:46px; font-weight:900; color:#fff; margin-top:8px; }
h1 span { color:#00c896; }
.grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; padding:36px 30px; position:relative; z-index:2; flex:1; }
.item { position:relative; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); box-shadow:0 10px 30px rgba(0,0,0,0.3); }
.item img { width:100%; height:220px; object-fit:cover; display:block; }
.item .tag { position:absolute; bottom:10px; left:10px; background:rgba(0,0,0,0.7); backdrop-filter:blur(10px); padding:5px 14px; border-radius:8px; color:#fff; font-size:14px; font-weight:800; }
.more { text-align:center; padding-bottom:45px; position:relative; z-index:2; }
.more p { color:#888; font-size:20px; font-weight:700; }
.more-tags { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; padding:0 40px; margin-top:14px; }
.more-tag { background:rgba(255,255,255,0.04); border:1px solid rgba(0,200,150,0.2); padding:8px 18px; border-radius:20px; color:#00c896; font-size:15px; font-weight:700; }
</style></head><body>
<div class="bg-glow"></div>
<div class="header"><div class="label">PORTFOLIO</div><h1><span>84개</span> 실제 제작 사례</h1></div>
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
// 03 - CMS (수정: 편집포인트 실제 위치)
// ===================================================================
const htmlDetail3 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:880px; background:linear-gradient(160deg,#080810,#0d1420); position:relative; }
.bc { position:absolute; border-radius:50%; filter:blur(100px); opacity:0.1; }
.bc1 { width:400px; height:400px; background:#00c896; top:250px; left:150px; }
.header { text-align:center; padding-top:40px; position:relative; z-index:2; }
.tag { display:inline-block; background:rgba(0,200,150,0.12); border:1px solid rgba(0,200,150,0.3); padding:6px 20px; border-radius:20px; color:#00c896; font-size:12px; font-weight:800; font-family:Montserrat; letter-spacing:3px; }
h1 { font-size:56px; font-weight:900; color:#fff; margin-top:12px; line-height:1.2; }
h1 span { color:#00c896; }
.screen-wrap { margin:26px auto 0; width:760px; height:380px; position:relative; z-index:2; }
.screen { width:100%; height:100%; border-radius:14px; overflow:hidden; border:2px solid #2a2a36; box-shadow:0 20px 60px rgba(0,0,0,0.4); }
.bar { height:30px; background:#1e1e2a; display:flex; align-items:center; padding:0 12px; gap:6px; }
.dot { width:9px; height:9px; border-radius:50%; }
.dr{background:#ff5f57;}.dy{background:#febc2e;}.dg{background:#28c840;}
.screen img { width:100%; height:calc(100% - 30px); object-fit:cover; }
.ep { position:absolute; z-index:3; display:flex; align-items:center; gap:8px; }
.ep-dot { width:30px; height:30px; border-radius:50%; background:#00c896; display:flex; align-items:center; justify-content:center; box-shadow:0 0 16px rgba(0,200,150,0.4); }
.ep-dot::after { content:''; width:10px; height:10px; border-radius:50%; background:#080810; }
.ep-label { background:rgba(0,200,150,0.9); color:#080810; padding:5px 14px; border-radius:8px; font-size:13px; font-weight:800; white-space:nowrap; }
/* 필라테스 사이트 실제 위치: 상단 타이틀=좌상, 사진=중앙, 강사목록=우하 */
.ep1 { top:200px; left:60px; }
.ep2 { top:290px; left:320px; }
.ep3 { top:350px; right:80px; flex-direction:row-reverse; }
.bottom { text-align:center; padding:28px 0 40px; position:relative; z-index:2; }
.bottom h2 { font-size:30px; font-weight:900; color:#fff; }
.bottom p { font-size:20px; color:#999; font-weight:700; margin-top:8px; }
.chips { display:flex; justify-content:center; gap:16px; margin-top:20px; }
.chip { background:rgba(0,200,150,0.1); border:1px solid rgba(0,200,150,0.25); padding:10px 22px; border-radius:12px; color:#00c896; font-size:18px; font-weight:800; }
</style></head><body>
<div class="bc bc1"></div>
<div class="header"><div class="tag">CMS</div><h1>코딩 없이<br><span>직접 수정</span></h1></div>
<div class="screen-wrap">
  <div class="screen"><div class="bar"><div class="dot dr"></div><div class="dot dy"></div><div class="dot dg"></div></div><img src="${PF.pilates}"></div>
  <div class="ep ep1"><div class="ep-dot"></div><div class="ep-label">텍스트 수정</div></div>
  <div class="ep ep2"><div class="ep-dot"></div><div class="ep-label">이미지 교체</div></div>
  <div class="ep ep3"><div class="ep-label">색상 변경</div><div class="ep-dot"></div></div>
</div>
<div class="bottom">
  <h2>글자 / 사진 / 색상 / 레이아웃</h2>
  <p>클릭 한 번으로 직접 수정하세요</p>
  <div class="chips"><div class="chip">코딩 불필요</div><div class="chip">실시간 반영</div><div class="chip">무제한 수정</div></div>
</div>
</body></html>`;

// ===================================================================
// 04 - 반응형 (PC 목업 크게 + 디바이스 아이콘 3종, 가짜 모바일 스크린샷 제거)
// ===================================================================
const htmlDetail4 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:auto; background:linear-gradient(160deg,#0a0a14,#101824); position:relative; padding:40px 0; }
.header { text-align:center; }
.tag { display:inline-block; background:rgba(0,200,150,0.12); border:1px solid rgba(0,200,150,0.3); padding:6px 20px; border-radius:20px; color:#00c896; font-size:12px; font-weight:800; font-family:Montserrat; letter-spacing:3px; }
h1 { font-size:46px; font-weight:900; color:#fff; margin-top:12px; line-height:1.2; }
h1 span { color:#00c896; }
/* PC 목업 크게 중앙 배치 */
.screen-wrap { margin:28px auto 0; width:740px; }
.screen { width:100%; border-radius:14px; overflow:hidden; border:2px solid #333; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
.bar { height:28px; background:#1e1e2a; display:flex; align-items:center; padding:0 12px; gap:6px; }
.dot { width:9px; height:9px; border-radius:50%; }
.dr{background:#ff5f57;}.dy{background:#febc2e;}.dg{background:#28c840;}
.screen img { width:100%; display:block; }
/* 디바이스 3종 아이콘 */
.devices-row { display:flex; justify-content:center; gap:40px; margin-top:32px; }
.device { text-align:center; }
.device-icon { width:72px; height:72px; border-radius:50%; background:rgba(0,200,150,0.1); border:2px solid rgba(0,200,150,0.3); display:flex; align-items:center; justify-content:center; margin:0 auto 10px; }
.device-icon svg { width:32px; height:32px; fill:#00c896; }
.device .name { font-size:18px; font-weight:900; color:#fff; }
.device .check { font-size:14px; font-weight:700; color:#00c896; margin-top:2px; }
.bottom { text-align:center; margin-top:28px; }
.bottom h2 { font-size:24px; font-weight:900; color:#fff; }
.feats { display:flex; justify-content:center; gap:14px; margin-top:14px; }
.feat { background:rgba(0,200,150,0.08); border:1px solid rgba(0,200,150,0.2); padding:8px 18px; border-radius:10px; color:#00c896; font-size:16px; font-weight:800; }
</style></head><body>
<div class="header"><div class="tag">RESPONSIVE</div><h1>PC에서도 모바일에서도<br><span>완벽하게</span></h1></div>
<div class="screen-wrap">
  <div class="screen">
    <div class="bar"><div class="dot dr"></div><div class="dot dy"></div><div class="dot dg"></div></div>
    <img src="${PF.cafe}">
  </div>
</div>
<div class="devices-row">
  <div class="device">
    <div class="device-icon"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" fill="none" stroke="#00c896" stroke-width="2"/><line x1="8" y1="21" x2="16" y2="21" stroke="#00c896" stroke-width="2"/><line x1="12" y1="17" x2="12" y2="21" stroke="#00c896" stroke-width="2"/></svg></div>
    <div class="name">PC</div>
    <div class="check">최적화 완료</div>
  </div>
  <div class="device">
    <div class="device-icon"><svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="#00c896" stroke-width="2"/><line x1="9" y1="18" x2="15" y2="18" stroke="#00c896" stroke-width="2" stroke-linecap="round"/></svg></div>
    <div class="name">태블릿</div>
    <div class="check">최적화 완료</div>
  </div>
  <div class="device">
    <div class="device-icon"><svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2" fill="none" stroke="#00c896" stroke-width="2"/><circle cx="12" cy="18" r="1" fill="#00c896"/></svg></div>
    <div class="name">모바일</div>
    <div class="check">최적화 완료</div>
  </div>
</div>
<div class="bottom">
  <h2>모든 기기에서 자동으로 최적화</h2>
  <div class="feats"><div class="feat">자동 레이아웃</div><div class="feat">터치 최적화</div><div class="feat">빠른 로딩</div></div>
</div>
</body></html>`;

// ===================================================================
// 05 - 프로세스 (수정: 상하 여백 동일)
// ===================================================================
const htmlDetail5 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:auto; background:linear-gradient(160deg,#0a0a12,#0d1117); position:relative; padding:40px 0; }
.header { text-align:center; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:50px; font-weight:900; color:#fff; margin-top:6px; }
.sub { font-size:22px; color:#888; font-weight:700; margin-top:6px; }
.timeline { padding:28px 0 0 160px; position:relative; }
.timeline::before { content:''; position:absolute; left:157px; top:38px; bottom:38px; width:3px; background:linear-gradient(180deg,#00c896,rgba(0,200,150,0.1)); border-radius:2px; }
.step { display:flex; align-items:flex-start; gap:24px; margin-bottom:16px; position:relative; }
.num { width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg,#00c896,#00a67d); display:flex; align-items:center; justify-content:center; font-family:Montserrat; font-size:18px; font-weight:800; color:#0a0a12; z-index:2; box-shadow:0 0 16px rgba(0,200,150,0.3); flex-shrink:0; }
.step-title { font-size:30px; font-weight:900; color:#fff; display:flex; align-items:center; gap:14px; }
.day { display:inline-block; background:rgba(0,200,150,0.1); border:1px solid rgba(0,200,150,0.25); padding:3px 14px; border-radius:8px; font-size:15px; font-weight:800; color:#00c896; }
.step-desc { font-size:17px; color:#777; font-weight:700; margin-top:4px; }
.cta { text-align:center; padding:24px 0 0; }
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
// 06 - 가격표 (수정: 카드 아래 불필요 여백 제거)
// ===================================================================
const htmlDetail6 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:auto; background:linear-gradient(160deg,#0a0a10,#0f1419); position:relative; padding:35px 0; }
.bg-glow { position:absolute; width:500px; height:500px; background:radial-gradient(circle,rgba(0,200,150,0.08) 0%,transparent 65%); top:50%; left:50%; transform:translate(-50%,-50%); }
.header { text-align:center; position:relative; z-index:2; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:44px; font-weight:900; color:#fff; margin-top:6px; }
h1 span { color:#00c896; }
.cards { display:flex; justify-content:center; gap:16px; margin-top:24px; padding:0 20px; position:relative; z-index:2; }
.card { width:260px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:28px 22px; backdrop-filter:blur(20px); position:relative; }
.card.ft { background:linear-gradient(160deg,rgba(0,200,150,0.12),rgba(0,200,150,0.03)); border:1px solid rgba(0,200,150,0.35); box-shadow:0 16px 50px rgba(0,200,150,0.08); transform:translateY(-6px); }
.best { position:absolute; top:-13px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg,#00c896,#00e6ac); color:#0a0a0f; padding:5px 20px; border-radius:16px; font-size:12px; font-weight:800; font-family:Montserrat; letter-spacing:2px; }
.tier { text-align:center; font-family:Montserrat; font-size:16px; font-weight:800; color:#888; letter-spacing:2px; margin-top:6px; }
.card.ft .tier { color:#00c896; }
.price { text-align:center; font-size:40px; font-weight:900; color:#fff; margin:10px 0 4px; }
.pages { text-align:center; font-size:16px; color:#666; font-weight:700; }
.div { height:1px; background:rgba(255,255,255,0.06); margin:16px 0; }
.card.ft .div { background:rgba(0,200,150,0.2); }
.features { list-style:none; }
.features li { padding:7px 0; font-size:18px; font-weight:700; color:#999; display:flex; align-items:center; gap:10px; }
.card.ft .features li { color:#ddd; }
.features li::before { content:''; width:7px; height:7px; border-radius:50%; background:#444; flex-shrink:0; }
.card.ft .features li::before { background:#00c896; }
.footer { text-align:center; color:#555; font-size:15px; font-weight:700; margin-top:24px; position:relative; z-index:2; }
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
// 07 - 후기 (수정: 상하 여백 동일)
// ===================================================================
const htmlDetail7 = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS}
body { width:860px; height:auto; background:linear-gradient(160deg,#0c0c14,#0a0e16); position:relative; padding:40px 0; }
.header { text-align:center; }
.label { font-family:Montserrat; font-size:16px; font-weight:800; color:#00c896; letter-spacing:4px; }
h1 { font-size:42px; font-weight:900; color:#fff; margin-top:8px; }
.reviews { padding:28px 40px 0; display:flex; flex-direction:column; gap:16px; }
.review { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:22px 26px; backdrop-filter:blur(10px); display:flex; gap:18px; }
.avatar { width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg,#00c896,#00a67d); display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:900; color:#080812; flex-shrink:0; }
.rv-name { font-size:18px; font-weight:900; color:#fff; }
.stars { color:#f59e0b; font-size:15px; margin-top:2px; }
.rv-text { font-size:16px; color:#bbb; font-weight:600; margin-top:6px; line-height:1.5; }
.bottom { text-align:center; margin-top:24px; }
.stat { font-size:22px; font-weight:800; color:#00c896; }
</style></head><body>
<div class="header"><div class="label">REVIEW</div><h1>사장님들의 실제 후기</h1></div>
<div class="reviews">
  <div class="review"><div class="avatar">카</div><div><div class="rv-name">카페 사장님</div><div class="stars">★★★★★</div><div class="rv-text">디자인이 정말 마음에 들어요. 모바일에서도 완벽하고 직접 수정도 쉬워서 만족합니다.</div></div></div>
  <div class="review"><div class="avatar">필</div><div><div class="rv-name">필라테스 원장님</div><div class="stars">★★★★★</div><div class="rv-text">5일만에 원하는 사이트가 나왔어요. CMS 덕분에 수정비용 0원이에요.</div></div></div>
  <div class="review"><div class="avatar">세</div><div><div class="rv-name">세무사님</div><div class="stars">★★★★★</div><div class="rv-text">전문적인 느낌이 확 나면서도 깔끔해요. 상담 문의가 2배로 늘었습니다.</div></div></div>
</div>
<div class="bottom"><div class="stat">크몽 평점 4.9 / 재주문률 40%</div></div>
</body></html>`;

// === MAIN ===
async function run() {
  const browser = await chromium.launch();

  const pages = [
    { name: '00_thumbnail', html: htmlThumb, w: 760, h: 420 },
    { name: '02_portfolio', html: htmlDetail2, w: 860, h: 1060 },
    { name: '03_cms', html: htmlDetail3, w: 860, h: 880 },
    { name: '04_responsive', html: htmlDetail4, w: 860, auto: true },
    // auto height pages - fullPage screenshot
    { name: '05_process', html: htmlDetail5, w: 860, auto: true },
    { name: '06_pricing', html: htmlDetail6, w: 860, auto: true },
    { name: '07_reviews', html: htmlDetail7, w: 860, auto: true },
  ];

  for (const p of pages) {
    console.log(`[${p.name}]...`);
    const page = await browser.newPage({ viewport: { width: p.w, height: p.h || 1200 } });
    const hp = path.join(OUT, `${p.name}.html`);
    fs.writeFileSync(hp, p.html);
    await page.goto(`file://${hp}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const op = path.join(OUT, `${p.name}.png`);
    if (p.auto) {
      // 콘텐츠 실제 높이로 뷰포트 리사이즈 후 스크린샷
      const contentH = await page.evaluate(() => document.body.scrollHeight);
      await page.setViewportSize({ width: p.w, height: contentH });
      await page.waitForTimeout(300);
      await page.screenshot({ path: op, type: 'png' });
    } else {
      await page.screenshot({ path: op, type: 'png' });
    }

    // === Playwright 여백 검증 ===
    const bodyBox = await page.locator('body').boundingBox();
    const firstEl = await page.locator('body > *:first-child').boundingBox();
    const lastEl = await page.locator('body > *:last-child').boundingBox();
    if (bodyBox && firstEl && lastEl) {
      const topGap = firstEl.y;
      const bottomGap = bodyBox.height - (lastEl.y + lastEl.height);
      const diff = Math.abs(topGap - bottomGap);
      const status = diff < 20 ? '✓ 균형' : `⚠ 차이 ${Math.round(diff)}px`;
      console.log(`  여백: 상단 ${Math.round(topGap)}px / 하단 ${Math.round(bottomGap)}px → ${status}`);
    }

    const stat = fs.statSync(op);
    console.log(`  ✓ ${p.name}.png (${Math.round(stat.size/1024)}KB)`);
    await page.close();
  }

  await browser.close();
  console.log('\n=== 수정 7장 완료 ===');
}

run().catch(e => { console.error(e); process.exit(1); });
