/**
 * UI 컴포넌트 템플릿 라이브러리
 * 자주 쓰는 버튼/폼/CTA를 바로 복붙 가능하게
 * 
 * node tools/template-library.js              전체 목록
 * node tools/template-library.js phone-btn    특정 템플릿 출력
 * node tools/template-library.js --html       전체 미리보기 HTML
 */
const fs = require('fs');
const path = require('path');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

const TEMPLATES = {
  'phone-btn': {
    name: '📞 클릭 전화 버튼 (모바일 고정)',
    description: '모바일 하단 고정 전화 버튼. 클릭 시 바로 전화 연결.',
    html: `<!-- 모바일 전화 버튼 -->
<a href="tel:02-1234-5678" style="
  position:fixed; bottom:20px; right:20px; z-index:9999;
  width:60px; height:60px; border-radius:50%;
  background:#2563eb; color:white; display:flex;
  align-items:center; justify-content:center;
  box-shadow:0 4px 12px rgba(37,99,235,0.4);
  text-decoration:none; font-size:24px;
">📞</a>`,
    css: '',
  },
  'kakao-btn': {
    name: '💬 카카오톡 상담 버튼 (모바일 고정)',
    description: '카카오톡 채널 채팅 연결. 모바일 하단 고정.',
    html: `<!-- 카카오톡 버튼 -->
<a href="https://pf.kakao.com/_XXXXX/chat" target="_blank" style="
  position:fixed; bottom:90px; right:20px; z-index:9999;
  width:60px; height:60px; border-radius:50%;
  background:#fee500; color:#3c1e1e; display:flex;
  align-items:center; justify-content:center;
  box-shadow:0 4px 12px rgba(254,229,0,0.4);
  text-decoration:none; font-size:24px;
">💬</a>`,
  },
  'cta-banner': {
    name: '🎯 CTA 배너 (상단/하단)',
    description: '문의 유도 배너. 모바일 상단 또는 하단에 배치.',
    html: `<!-- CTA 배너 -->
<div style="
  position:fixed; bottom:0; left:0; right:0; z-index:9998;
  background:linear-gradient(135deg,#2563eb,#7c3aed);
  color:white; padding:12px 20px; display:flex;
  align-items:center; justify-content:space-between;
  font-size:14px;
">
  <span>📱 모바일 최적화 상담 받기</span>
  <a href="tel:02-1234-5678" style="
    background:white; color:#2563eb; padding:8px 16px;
    border-radius:6px; text-decoration:none; font-weight:bold;
    font-size:13px;
  ">전화하기</a>
</div>`,
  },
  'contact-form': {
    name: '📝 문의폼 (반응형)',
    description: '이름/연락처/내용 간단 문의폼. 이메일 전송 연결.',
    html: `<!-- 문의폼 -->
<div style="max-width:500px;margin:40px auto;padding:24px;background:#f8fafc;border-radius:12px;">
  <h3 style="text-align:center;margin-bottom:16px;font-size:20px;">📩 문의하기</h3>
  <form action="mailto:your@email.com" method="POST" enctype="text/plain">
    <input type="text" name="name" placeholder="이름/업체명" required style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:8px;margin-bottom:10px;font-size:15px;">
    <input type="tel" name="phone" placeholder="연락처" required style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:8px;margin-bottom:10px;font-size:15px;">
    <textarea name="message" placeholder="문의 내용" rows="3" style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:8px;margin-bottom:10px;font-size:15px;resize:vertical;"></textarea>
    <button type="submit" style="width:100%;padding:14px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">문의 보내기</button>
  </form>
</div>`,
  },
  'map-embed': {
    name: '🗺️ 네이버 지도 임베드',
    description: '오시는 길 섹션. 네이버 지도 + 주소 표시.',
    html: `<!-- 오시는 길 -->
<div style="max-width:600px;margin:40px auto;padding:24px;">
  <h3 style="text-align:center;margin-bottom:16px;">🗺️ 오시는 길</h3>
  <div style="border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <iframe src="https://map.naver.com/p/entry/place/YOUR_PLACE_ID?c=15.00,0,0,0,dh" 
      width="100%" height="300" frameborder="0" style="display:block;" allowfullscreen></iframe>
  </div>
  <p style="text-align:center;margin-top:12px;color:#64748b;font-size:14px;">
    📍 서울시 OO구 OO로 123, OO빌딩 2층<br>
    🚇 OO역 O번 출구 도보 3분
  </p>
</div>`,
  },
  'price-table': {
    name: '💰 가격표/메뉴판 (반응형)',
    description: '서비스 가격 테이블. 모바일 자동 조정.',
    html: `<!-- 가격표 -->
<div style="max-width:600px;margin:40px auto;padding:24px;">
  <h3 style="text-align:center;margin-bottom:16px;">💰 가격 안내</h3>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f1f5f9;"><th style="padding:12px;text-align:left;font-size:14px;">서비스</th><th style="padding:12px;text-align:right;font-size:14px;">가격</th></tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px;font-size:14px;">기본 서비스</td><td style="padding:12px;text-align:right;font-weight:bold;">50,000원</td></tr>
      <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px;font-size:14px;">프리미엄 서비스</td><td style="padding:12px;text-align:right;font-weight:bold;">100,000원</td></tr>
      <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px;font-size:14px;">VIP 서비스</td><td style="padding:12px;text-align:right;font-weight:bold;">200,000원</td></tr>
    </tbody>
  </table>
</div>`,
  },
  'ga-pixel': {
    name: '📊 GA + Meta Pixel 코드',
    description: 'Google Analytics 4 + Facebook/Meta Pixel 추적 코드.',
    html: `<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>

<!-- Meta Pixel -->
<script>
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>`,
  },
  'viewport-meta': {
    name: '📱 반응형 메타태그',
    description: 'viewport 메타태그. 반응형의 첫걸음.',
    html: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">`,
  },
};

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--html')) {
    let preview = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>템플릿 라이브러리</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#f8fafc;padding:24px}
.container{max-width:900px;margin:0 auto}h1{text-align:center;margin-bottom:32px}
.tmpl{background:white;border-radius:12px;padding:24px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.tmpl h3{margin-bottom:8px;color:#2563eb}.tmpl p{color:#64748b;font-size:14px;margin-bottom:12px}
pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5}
</style></head><body><div class="container"><h1>🧩 UI 템플릿 라이브러리</h1>`;
    
    Object.entries(TEMPLATES).forEach(([key, t]) => {
      preview += `<div class="tmpl"><h3>${t.name}</h3><p>${t.description}</p><pre>${t.html.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></div>`;
    });
    
    preview += `</div></body></html>`;
    const fp = path.join(OUTPUT_DIR, 'template-library.html');
    fs.writeFileSync(fp, preview, 'utf8');
    console.log(`✅ 템플릿 라이브러리 HTML: ${fp}`);
    return;
  }

  if (args.length > 0 && !args[0].startsWith('--')) {
    const key = args[0];
    const t = TEMPLATES[key];
    if (!t) {
      console.log(`❌ "${key}" 없음. 사용 가능: ${Object.keys(TEMPLATES).join(', ')}`);
      return;
    }
    console.log(`\n${t.name}\n${t.description}\n\n${t.html}\n`);
    return;
  }

  console.log('\n🧩 UI 템플릿 라이브러리\n');
  Object.entries(TEMPLATES).forEach(([key, t]) => {
    console.log(`  ${key.padEnd(20)} ${t.name}`);
  });
  console.log(`\n사용: node tools/template-library.js <템플릿명>`);
  console.log(`전체 HTML: node tools/template-library.js --html`);
}

main();
