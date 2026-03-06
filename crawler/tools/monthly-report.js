/**
 * 월간 리포트 생성기 — 크롤링/발송/계약 성과 HTML 리포트
 * node tools/monthly-report.js [YYYY-MM]
 */
const fs = require('fs');
const path = require('path');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function load(p) { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return {}; } }

function main() {
  const month = process.argv[2] || new Date().toISOString().slice(0,7);
  const history = load(path.join(OUTPUT_DIR, 'history.json'));
  const sendLog = load(path.join(OUTPUT_DIR, 'send-log.json'));
  const crm = load(path.join(OUTPUT_DIR, 'crm.json'));
  const apiUsage = load(path.join(OUTPUT_DIR, 'api-usage.json'));

  const crawled = history.crawled || {};
  const sent = sendLog.sent || {};
  const clients = crm.clients || {};
  const revenue = crm.revenue || [];

  // 이번 달 데이터
  const monthCrawled = Object.values(crawled).filter(c => c.firstSeen?.startsWith(month));
  const monthSent = Object.values(sent).filter(s => s.at?.startsWith(month));
  const monthRevenue = revenue.filter(r => r.date?.startsWith(month));
  const monthApiCalls = Object.entries(apiUsage).filter(([d]) => d.startsWith(month)).reduce((s,[,v]) => s + (v.calls||0), 0);

  // 상태별
  const statuses = {};
  Object.values(crawled).forEach(c => { const st = c.tmStatus||'미연락'; statuses[st]=(statuses[st]||0)+1; });

  const totalRevenue = monthRevenue.reduce((s,r) => s + r.amount, 0);
  const smsCount = monthSent.filter(s=>s.type==='sms').length;
  const emailCount = monthSent.filter(s=>s.type==='email').length;

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>월간 리포트 ${month}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}
.container{max-width:900px;margin:0 auto}
h1{text-align:center;font-size:28px;margin-bottom:8px}
.sub{text-align:center;color:#64748b;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.card{background:#1e293b;border-radius:12px;padding:20px}
.card h3{color:#94a3b8;font-size:12px;text-transform:uppercase;margin-bottom:8px}
.big{font-size:32px;font-weight:bold}
.blue{color:#3b82f6}.green{color:#22c55e}.red{color:#ef4444}.yellow{color:#eab308}
.bar-container{margin:8px 0}
.bar{height:6px;background:#334155;border-radius:3px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px}
.list{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:16px}
.list h3{color:#94a3b8;font-size:13px;margin-bottom:12px}
.list-item{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #334155;font-size:14px}
</style></head><body>
<div class="container">
<h1>📊 월간 리포트</h1>
<div class="sub">${month} | 생성: ${new Date().toISOString().slice(0,10)}</div>

<div class="grid">
  <div class="card"><h3>📈 신규 수집</h3><div class="big blue">${monthCrawled.length}건</div></div>
  <div class="card"><h3>📚 DB 누적</h3><div class="big">${Object.keys(crawled).length}건</div></div>
  <div class="card"><h3>📮 발송</h3><div class="big">${monthSent.length}건</div><div style="font-size:13px;color:#64748b;margin-top:4px">📱${smsCount} 📧${emailCount}</div></div>
  <div class="card"><h3>🔍 API 사용</h3><div class="big">${monthApiCalls.toLocaleString()}회</div></div>
  <div class="card"><h3>🟢 계약</h3><div class="big green">${statuses['계약']||0}건</div></div>
  <div class="card"><h3>💰 매출</h3><div class="big green">${(totalRevenue/10000).toFixed(0)}만원</div></div>
</div>

<div class="list">
  <h3>📋 TM 파이프라인</h3>
  ${['미연락','문자발송','이메일발송','통화중','협의중','계약','거절','보류'].map(s => {
    const cnt = statuses[s]||0;
    const pct = Object.keys(crawled).length ? (cnt/Object.keys(crawled).length*100).toFixed(0) : 0;
    const colors = {'미연락':'#64748b','문자발송':'#3b82f6','이메일발송':'#8b5cf6','통화중':'#eab308','계약':'#22c55e','거절':'#ef4444','보류':'#94a3b8'};
    return `<div class="list-item"><span>${s}</span><span>${cnt}건 (${pct}%)</span></div>
    <div class="bar-container"><div class="bar"><div class="bar-fill" style="width:${pct}%;background:${colors[s]||'#64748b'}"></div></div></div>`;
  }).join('')}
</div>

<div class="list">
  <h3>📋 업종별 수집</h3>
  ${(() => {
    const cats = {};
    monthCrawled.forEach(c => { cats[c.category] = (cats[c.category]||0)+1; });
    return Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c,n]) => 
      `<div class="list-item"><span>${c}</span><span>${n}건</span></div>`
    ).join('');
  })()}
</div>

<div class="list">
  <h3>💰 매출 상세</h3>
  ${monthRevenue.length ? monthRevenue.map(r => `<div class="list-item"><span>${r.date} ${r.name}</span><span>${(r.amount/10000).toFixed(0)}만원</span></div>`).join('') : '<div style="color:#64748b">이번 달 매출 없음</div>'}
</div>

</div></body></html>`;

  const reportPath = path.join(OUTPUT_DIR, `report-${month}.html`);
  fs.writeFileSync(reportPath, html, 'utf8');
  console.log(`✅ 월간 리포트: ${reportPath}`);
}

main();
