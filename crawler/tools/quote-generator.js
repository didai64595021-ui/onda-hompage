/**
 * 견적서 자동 생성기
 * 크롤링 데이터 기반 → 맞춤 견적서 HTML/PDF
 * 
 * node tools/quote-generator.js "업체명"
 * node tools/quote-generator.js --batch --score 60   점수 60+ 전체 견적서
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const QUOTE_DIR = path.join(OUTPUT_DIR, 'quotes');

function parseCSV(fp) {
  const c = fs.readFileSync(fp,'utf8').replace(/^\ufeff/,'');
  const ls = c.split('\n').filter(l=>l.trim());
  if(ls.length<2)return[];
  const h=pLine(ls[0]);
  return ls.slice(1).map(l=>{const v=pLine(l);const o={};h.forEach((x,i)=>{o[x]=v[i]||''});return o;});
}
function pLine(l){const r=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(q){if(ch==='"'&&l[i+1]==='"'){c+='"';i++}else if(ch==='"')q=false;else c+=ch}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c=''}else c+=ch}}r.push(c);return r;}

// 패키지 상세
const PACKAGES = {
  '스타터팩': {
    price: '110,000', items: [
      { name: '카카오톡 상담 버튼 추가', price: '50,000' },
      { name: '클릭 전화 연결 버튼 추가', price: '30,000' },
      { name: '오시는 길 지도 삽입', price: '30,000' },
    ],
  },
  '전환형 패키지': {
    price: '200,000', items: [
      { name: '카카오톡 상담 버튼 추가', price: '50,000' },
      { name: '클릭 전화 연결 버튼 추가', price: '30,000' },
      { name: '온라인 문의폼 추가', price: '70,000' },
      { name: 'CTA 버튼 배치 최적화', price: '50,000' },
    ],
  },
  '모바일 응급팩': {
    price: '320,000', items: [
      { name: '메인 페이지 반응형 수정', price: '100,000' },
      { name: '카카오톡 + 전화 버튼 세트', price: '50,000' },
      { name: '온라인 문의폼 추가', price: '70,000' },
      { name: 'Google Analytics 설치', price: '50,000' },
      { name: 'CTA 버튼 배치 최적화', price: '50,000' },
    ],
  },
  '풀 리뉴얼 라이트': {
    price: '650,000', items: [
      { name: '메인+서브 3페이지 반응형 수정', price: '300,000' },
      { name: '전체 CTA 버튼 정리', price: '100,000' },
      { name: '문의폼 + 지도 추가', price: '100,000' },
      { name: 'GA + Meta Pixel 설치', price: '100,000' },
      { name: '1개월 유지보수 포함', price: '50,000' },
    ],
  },
};

function generateQuoteHTML(prospect) {
  const p = prospect;
  const pkgName = p['추천패키지']?.split('(')[0]?.trim() || '스타터팩';
  const pkg = PACKAGES[pkgName] || PACKAGES['스타터팩'];
  const problems = (p['발견된문제']||'').split('/').map(x=>x.trim()).filter(x=>x);
  const today = new Date();
  const expiry = new Date(today.getTime() + 7*24*60*60*1000);
  const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>견적서 - ${p['업체명']}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Pretendard',-apple-system,sans-serif; background:#f8f9fa; color:#333; }
  .page { max-width:800px; margin:0 auto; background:white; }
  .header { background:linear-gradient(135deg,#2563eb,#7c3aed); color:white; padding:48px 40px; }
  .header h1 { font-size:32px; margin-bottom:4px; }
  .header .sub { opacity:0.8; font-size:14px; }
  .section { padding:32px 40px; }
  .section h2 { font-size:20px; color:#1e293b; margin-bottom:16px; border-bottom:2px solid #e2e8f0; padding-bottom:8px; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .info-item { display:flex; }
  .info-label { color:#64748b; width:100px; flex-shrink:0; }
  .info-value { font-weight:500; }
  .problem-list { list-style:none; }
  .problem-list li { padding:8px 16px; margin:4px 0; background:#fef2f2; border-left:3px solid #ef4444; border-radius:0 4px 4px 0; font-size:14px; }
  table { width:100%; border-collapse:collapse; margin:16px 0; }
  th { background:#f1f5f9; padding:12px 16px; text-align:left; font-size:14px; color:#475569; }
  td { padding:12px 16px; border-bottom:1px solid #e2e8f0; font-size:14px; }
  .total-row td { font-weight:bold; font-size:18px; color:#2563eb; border-top:2px solid #2563eb; }
  .note { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px; margin:16px 0; font-size:14px; }
  .note h3 { color:#16a34a; margin-bottom:8px; }
  .terms { font-size:12px; color:#94a3b8; line-height:1.8; }
  .cta-box { background:linear-gradient(135deg,#2563eb11,#7c3aed11); border:2px solid #2563eb; border-radius:12px; padding:24px; text-align:center; margin:24px 0; }
  .cta-box h3 { color:#2563eb; font-size:20px; }
  .stamp { text-align:right; margin-top:32px; }
  .stamp-circle { display:inline-block; width:80px; height:80px; border:3px solid #ef4444; border-radius:50%; line-height:80px; text-align:center; color:#ef4444; font-weight:bold; font-size:14px; }
  @media print { body{background:white} .page{box-shadow:none} }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="sub">QUOTATION</div>
    <h1>웹사이트 개선 견적서</h1>
    <div class="sub" style="margin-top:8px;">견적번호: Q-${Date.now().toString(36).toUpperCase()} | 발행일: ${fmtDate(today)} | 유효기간: ${fmtDate(expiry)}</div>
  </div>

  <div class="section">
    <h2>📋 고객 정보</h2>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">업체명</span><span class="info-value">${p['업체명']}</span></div>
      <div class="info-item"><span class="info-label">업종</span><span class="info-value">${p['업종']}</span></div>
      <div class="info-item"><span class="info-label">주소</span><span class="info-value">${p['주소']}</span></div>
      <div class="info-item"><span class="info-label">홈페이지</span><span class="info-value">${p['홈페이지']}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>⚠️ 진단 결과</h2>
    <p style="margin-bottom:12px;color:#64748b;">현재 홈페이지에서 발견된 문제점입니다.</p>
    <ul class="problem-list">
      ${problems.map(prob => `<li>❌ ${prob}</li>`).join('\n      ')}
    </ul>
  </div>

  <div class="section">
    <h2>📦 견적 내역 — ${pkgName}</h2>
    <table>
      <thead><tr><th>항목</th><th style="text-align:right">금액</th></tr></thead>
      <tbody>
        ${pkg.items.map(item => `<tr><td>${item.name}</td><td style="text-align:right">₩${item.price}</td></tr>`).join('\n        ')}
        <tr class="total-row"><td>합계 (VAT 별도)</td><td style="text-align:right">₩${pkg.price}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="note">
      <h3>✅ 포함 사항</h3>
      <ul style="padding-left:20px;margin-top:8px;">
        <li>1회 수정 포함 (추가 수정 건당 2~5만원)</li>
        <li>24~48시간 내 작업 완료</li>
        <li>전후 비교 시안 무료 제공</li>
        <li>모바일 3개 기기 테스트 (갤럭시, 아이폰, 태블릿)</li>
        <li>크로스브라우저 확인 (Chrome, Safari, Samsung Internet)</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <h2>💳 결제 안내</h2>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">결제 방법</span><span class="info-value">계좌이체 (선입금 50%, 완료 후 잔금)</span></div>
      <div class="info-item"><span class="info-label">작업 기간</span><span class="info-value">입금 확인 후 24~48시간</span></div>
    </div>
  </div>

  <div class="section">
    <div class="cta-box">
      <h3>🎁 이번 달 특별 할인</h3>
      <p style="margin-top:8px;">견적서 수령 후 3일 내 결제 시 <strong style="color:#ef4444;">10% 할인</strong> 적용</p>
      <p style="margin-top:4px;color:#64748b;font-size:13px;">문의: 010-XXXX-XXXX | 카카오톡: XXXXX</p>
    </div>
  </div>

  <div class="section">
    <p class="terms">
      * 본 견적서는 발행일로부터 7일간 유효합니다.<br>
      * 추가 수정은 건당 2~5만원이 별도 청구됩니다.<br>
      * 48시간 내 피드백이 없을 경우 작업 완료로 간주됩니다.<br>
      * 접근 권한(FTP/호스팅) 미제공 시 작업이 지연될 수 있습니다.
    </p>
    <div class="stamp">
      <p style="margin-bottom:8px;color:#64748b;font-size:13px;">발행자</p>
      <div class="stamp-circle">온다</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(QUOTE_DIR, { recursive: true });

  const csvPath = path.join(OUTPUT_DIR, 'prospects.csv');
  if (!fs.existsSync(csvPath)) { console.log('❌ prospects.csv 없음'); return; }
  let prospects = parseCSV(csvPath);

  if (args.includes('--batch')) {
    const si = args.indexOf('--score');
    const min = si !== -1 ? parseInt(args[si+1]||'0') : 0;
    prospects = prospects.filter(p => parseInt(p['우선순위점수']||'0') >= min);
    console.log(`📄 견적서 일괄 생성: ${prospects.length}건\n`);
    for (const p of prospects) {
      const safe = (p['업체명']||'unknown').replace(/[/\\?%*:|"<>]/g,'_');
      const html = generateQuoteHTML(p);
      fs.writeFileSync(path.join(QUOTE_DIR, `${safe}.html`), html, 'utf8');
      console.log(`  ✅ ${p['업체명']} → ${safe}.html`);
    }
    console.log(`\n📁 저장: ${QUOTE_DIR}`);
  } else {
    const name = args.join(' ');
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }
    const safe = p['업체명'].replace(/[/\\?%*:|"<>]/g,'_');
    const html = generateQuoteHTML(p);
    const fp = path.join(QUOTE_DIR, `${safe}.html`);
    fs.writeFileSync(fp, html, 'utf8');
    console.log(`✅ 견적서 생성: ${fp}`);
  }
}

main().catch(e => console.error('❌:', e));
