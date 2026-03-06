/**
 * 통합 대시보드 — 크롤링/발송/TM 현황 한눈에 보기
 * 
 * 사용법:
 *   node dashboard.js           전체 현황
 *   node dashboard.js --html    HTML 대시보드 생성
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const DB_PATH = path.join(OUTPUT_DIR, 'history.json');
const SEND_LOG_PATH = path.join(OUTPUT_DIR, 'send-log.json');
const CSV_PATH = path.join(OUTPUT_DIR, 'prospects.csv');

function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8').replace(/^\ufeff/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current); return result;
}

function main() {
  const args = process.argv.slice(2);
  
  if (!fs.existsSync(CSV_PATH)) {
    console.log('❌ prospects.csv 없음. 먼저 node crawl.js 실행');
    return;
  }

  const prospects = parseCSV(CSV_PATH);
  const history = load(DB_PATH);
  const sendLog = load(SEND_LOG_PATH);
  const crawled = history.crawled || {};

  // ── 기본 통계 ──
  const total = prospects.length;
  const withPhone = prospects.filter(p => p['전화']).length;
  const withEmail = prospects.filter(p => p['이메일']).length;
  const withKakao = prospects.filter(p => p['카카오톡']).length;
  const nonResponsive = prospects.filter(p => p['반응형'] === 'N').length;

  // 점수 분포
  const urgent = prospects.filter(p => parseInt(p['우선순위점수'] || '0') >= 60).length;
  const medium = prospects.filter(p => { const s = parseInt(p['우선순위점수'] || '0'); return s >= 30 && s < 60; }).length;
  const low = prospects.filter(p => parseInt(p['우선순위점수'] || '0') < 30).length;

  // TM 상태
  const statuses = {};
  Object.values(crawled).forEach(c => {
    const s = c.tmStatus || '미연락';
    statuses[s] = (statuses[s] || 0) + 1;
  });

  // 발송 통계
  const sent = sendLog.sent || {};
  const smsSent = Object.values(sent).filter(s => s.type === 'sms').length;
  const emailSent = Object.values(sent).filter(s => s.type === 'email').length;

  // 업종별
  const byCategory = {};
  prospects.forEach(p => { byCategory[p['업종']] = (byCategory[p['업종']] || 0) + 1; });

  // 패키지 추천 분포
  const byPackage = {};
  prospects.forEach(p => { const pkg = p['추천패키지'] || '없음'; byPackage[pkg] = (byPackage[pkg] || 0) + 1; });

  // 예상 매출
  const pkgPrices = {
    '스타터팩': 110000,
    '전환형 패키지': 195000,
    '모바일 응급팩': 320000,
    '풀 리뉴얼 라이트': 650000,
  };
  let estimatedRevenue = 0;
  prospects.forEach(p => {
    const pkgName = p['추천패키지']?.split('(')[0]?.trim() || '';
    estimatedRevenue += pkgPrices[pkgName] || 110000;
  });

  // 전환율
  const contracted = statuses['계약'] || 0;
  const conversionRate = total > 0 ? (contracted / total * 100).toFixed(1) : '0.0';

  console.log(`
╔════════════════════════════════════════════════════════╗
║           📊 UI 잠재고객 크롤러 대시보드               ║
║           ${new Date().toISOString().slice(0, 19).replace('T', ' ')}              ║
╚════════════════════════════════════════════════════════╝

📈 수집 현황
  총 업체: ${total}건
  DB 누적: ${Object.keys(crawled).length}건
  비반응형: ${nonResponsive}건

🎯 잠재고객 등급
  🔴 긴급 (60+점): ${urgent}건
  🟡 중간 (30~59점): ${medium}건
  🟢 경미 (0~29점): ${low}건

📞 연락 가능
  전화: ${withPhone}건 (${(withPhone/total*100).toFixed(0)}%)
  이메일: ${withEmail}건 (${(withEmail/total*100).toFixed(0)}%)
  카카오톡: ${withKakao}건 (${(withKakao/total*100).toFixed(0)}%)

📮 발송 현황
  문자: ${smsSent}건
  이메일: ${emailSent}건
  총 발송: ${smsSent + emailSent}건

📋 TM 상태
  ⚪ 미연락: ${statuses['미연락'] || 0}건
  🟡 통화중: ${statuses['통화중'] || 0}건
  📱 문자발송: ${statuses['문자발송'] || 0}건
  📧 이메일발송: ${statuses['이메일발송'] || 0}건
  🔴 거절: ${statuses['거절'] || 0}건
  🟢 계약: ${statuses['계약'] || 0}건
  ⏸️  보류: ${statuses['보류'] || 0}건

💰 예상 매출 (전체 계약 시)
  총: ${(estimatedRevenue / 10000).toFixed(0)}만원
  전환율 ${conversionRate}% 기준: ${(estimatedRevenue * contracted / total / 10000 || 0).toFixed(0)}만원

📋 업종 TOP 10
${Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cat, cnt]) => `  ${cat}: ${cnt}건`).join('\n')}

📦 추천 패키지 분포
${Object.entries(byPackage).sort((a, b) => b[1] - a[1]).map(([pkg, cnt]) => `  ${pkg}: ${cnt}건`).join('\n')}
`);

  // HTML 대시보드
  if (args.includes('--html')) {
    generateHTMLDashboard({ total, withPhone, withEmail, withKakao, nonResponsive, urgent, medium, low, statuses, smsSent, emailSent, byCategory, byPackage, estimatedRevenue, contracted, prospects });
  }
}

function generateHTMLDashboard(data) {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UI 잠재고객 대시보드</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, sans-serif; background:#0f172a; color:#e2e8f0; padding:20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:16px; max-width:1200px; margin:0 auto; }
  .card { background:#1e293b; border-radius:12px; padding:20px; }
  .card h3 { color:#94a3b8; font-size:13px; text-transform:uppercase; margin-bottom:12px; }
  .big-num { font-size:36px; font-weight:bold; color:#f8fafc; }
  .sub { font-size:14px; color:#64748b; margin-top:4px; }
  .bar { height:8px; background:#334155; border-radius:4px; margin:8px 0; overflow:hidden; }
  .bar-fill { height:100%; border-radius:4px; }
  .red { background:#ef4444; }
  .yellow { background:#eab308; }
  .green { background:#22c55e; }
  .blue { background:#3b82f6; }
  .purple { background:#a855f7; }
  .title { text-align:center; margin-bottom:24px; }
  .title h1 { font-size:28px; color:#f8fafc; }
  .title p { color:#64748b; }
  .list-item { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #334155; }
  .list-item:last-child { border:none; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:bold; }
</style>
</head>
<body>
<div class="title">
  <h1>📊 UI 잠재고객 크롤러 대시보드</h1>
  <p>${new Date().toISOString().slice(0, 19).replace('T', ' ')} KST</p>
</div>
<div class="grid">
  <div class="card">
    <h3>📈 총 수집</h3>
    <div class="big-num">${data.total}</div>
    <div class="sub">비반응형: ${data.nonResponsive}건</div>
  </div>
  <div class="card">
    <h3>🎯 긴급 (60+점)</h3>
    <div class="big-num" style="color:#ef4444">${data.urgent}</div>
    <div class="bar"><div class="bar-fill red" style="width:${data.total ? data.urgent/data.total*100 : 0}%"></div></div>
  </div>
  <div class="card">
    <h3>📞 전화 보유</h3>
    <div class="big-num">${data.withPhone}</div>
    <div class="sub">${data.total ? (data.withPhone/data.total*100).toFixed(0) : 0}% 보유</div>
  </div>
  <div class="card">
    <h3>📮 총 발송</h3>
    <div class="big-num">${data.smsSent + data.emailSent}</div>
    <div class="sub">문자 ${data.smsSent} | 이메일 ${data.emailSent}</div>
  </div>
  <div class="card">
    <h3>🟢 계약</h3>
    <div class="big-num" style="color:#22c55e">${data.contracted}</div>
    <div class="sub">전환율 ${data.total ? (data.contracted/data.total*100).toFixed(1) : 0}%</div>
  </div>
  <div class="card">
    <h3>💰 예상 매출</h3>
    <div class="big-num">${(data.estimatedRevenue / 10000).toFixed(0)}만</div>
    <div class="sub">전체 계약 시 예상</div>
  </div>
  <div class="card" style="grid-column:span 2">
    <h3>📋 업종별 수집</h3>
    ${Object.entries(data.byCategory).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([cat,cnt]) => 
      `<div class="list-item"><span>${cat}</span><span>${cnt}건</span></div>`
    ).join('')}
  </div>
  <div class="card" style="grid-column:span 2">
    <h3>📦 추천 패키지 분포</h3>
    ${Object.entries(data.byPackage).sort((a,b)=>b[1]-a[1]).map(([pkg,cnt]) => 
      `<div class="list-item"><span>${pkg}</span><span>${cnt}건</span></div>`
    ).join('')}
  </div>
  <div class="card" style="grid-column:span 2">
    <h3>🏆 TOP 10 우선 TM 대상</h3>
    ${data.prospects.slice(0,10).map((p,i) => 
      `<div class="list-item"><span>${i+1}. [${p['우선순위점수']}점] ${p['업체명']} (${p['업종']})</span><span>${p['추천패키지']?.split('(')[0]?.trim() || ''}</span></div>`
    ).join('')}
  </div>
</div>
</body>
</html>`;

  const htmlPath = path.join(OUTPUT_DIR, 'dashboard.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`\n🌐 HTML 대시보드: ${htmlPath}`);
}

main();
