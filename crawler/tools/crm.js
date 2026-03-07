/**
 * 고객 CRM — 리드 → 계약 → 유지보수 전체 파이프라인 관리
 * 
 * node tools/crm.js list                        전체 고객 목록
 * node tools/crm.js pipeline                    파이프라인 현황
 * node tools/crm.js add <업체명> --status 계약 --price 200000 --note "스타터팩"
 * node tools/crm.js update <업체명> --status 완료 --note "작업완료"
 * node tools/crm.js followup                    오늘 팔로업 대상
 * node tools/crm.js revenue                     매출 현황
 * node tools/crm.js maintenance                 유지보수 고객 목록
 */

const fs = require('fs');
const path = require('path');

const CRM_PATH = path.join(__dirname, '..', 'output', 'crm.json');

function load() { try { return JSON.parse(fs.readFileSync(CRM_PATH,'utf8')); } catch { return { clients:{}, revenue:[] }; } }
function save(d) { fs.writeFileSync(CRM_PATH, JSON.stringify(d,null,2), 'utf8'); }

const STATUSES = ['리드','시안발송','견적발송','협의중','계약','작업중','완료','유지보수','거절','이탈'];

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const db = load();
  if (!db.clients) db.clients = {};
  if (!db.revenue) db.revenue = [];

  if (!cmd || cmd === 'help') {
    console.log(`
🏢 CRM 사용법:
  list                                전체 고객 목록
  pipeline                            파이프라인 현황
  add <업체명> [--status X] [--price N] [--note "메모"]  고객 추가/수정
  update <업체명> [--status X] [--note "메모"]            상태 변경
  followup                            오늘 팔로업 대상
  revenue [--month YYYY-MM]           매출 현황
  maintenance                         유지보수 고객 목록
  
  상태: ${STATUSES.join(', ')}
`);
    return;
  }

  // ── list ──
  if (cmd === 'list') {
    const clients = Object.values(db.clients);
    if (clients.length === 0) { console.log('📋 등록된 고객 없음'); return; }
    
    const emojiMap = {'리드':'⚪','시안발송':'📨','견적발송':'📄','협의중':'🟡','계약':'🟢','작업중':'🔧','완료':'✅','유지보수':'🔄','거절':'🔴','이탈':'⬛'};
    console.log(`\n📋 전체 고객 (${clients.length}건):\n`);
    clients.sort((a,b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status));
    clients.forEach((c,i) => {
      console.log(`${i+1}. ${emojiMap[c.status]||'⚪'} ${c.name} (${c.status})`);
      if (c.price) console.log(`   💰 ${(c.price/10000).toFixed(0)}만원`);
      if (c.note) console.log(`   📝 ${c.note}`);
      if (c.nextFollowup) console.log(`   📅 다음 팔로업: ${c.nextFollowup}`);
      console.log('');
    });
    return;
  }

  // ── pipeline / stats ──
  if (cmd === 'pipeline' || cmd === 'stats') {
    const clients = Object.values(db.clients);
    console.log('\n📊 파이프라인 현황:\n');
    STATUSES.forEach(s => {
      const count = clients.filter(c => c.status === s).length;
      const revenue = clients.filter(c => c.status === s).reduce((sum,c) => sum + (c.price||0), 0);
      const bar = '█'.repeat(count) + '░'.repeat(Math.max(0, 20-count));
      console.log(`  ${s.padEnd(8)} ${bar} ${count}건 ${revenue ? `(${(revenue/10000).toFixed(0)}만원)` : ''}`);
    });
    
    const totalPipeline = clients.filter(c => ['협의중','계약','작업중'].includes(c.status)).reduce((s,c) => s+(c.price||0), 0);
    const totalCompleted = clients.filter(c => ['완료','유지보수'].includes(c.status)).reduce((s,c) => s+(c.price||0), 0);
    console.log(`\n  💰 진행중 파이프라인: ${(totalPipeline/10000).toFixed(0)}만원`);
    console.log(`  ✅ 완료 매출: ${(totalCompleted/10000).toFixed(0)}만원`);
    return;
  }

  // ── add / update ──
  if (cmd === 'add' || cmd === 'update') {
    const name = args[1];
    if (!name) { console.log('❌ 업체명 필요'); return; }
    
    const si = args.indexOf('--status');
    const pi = args.indexOf('--price');
    const ni = args.indexOf('--note');
    const fi = args.indexOf('--followup');
    
    if (!db.clients[name]) {
      db.clients[name] = { name, status: '리드', createdAt: new Date().toISOString(), history: [] };
    }
    const client = db.clients[name];
    
    if (si !== -1 && STATUSES.includes(args[si+1])) {
      const oldStatus = client.status;
      client.status = args[si+1];
      client.history.push({ from: oldStatus, to: client.status, at: new Date().toISOString() });
    }
    if (pi !== -1) client.price = parseInt(args[pi+1] || '0');
    if (ni !== -1) client.note = args[ni+1];
    if (fi !== -1) client.nextFollowup = args[fi+1]; // YYYY-MM-DD
    
    client.updatedAt = new Date().toISOString();
    
    // 자동 팔로업 설정
    if (!client.nextFollowup && ['시안발송','견적발송'].includes(client.status)) {
      const d = new Date(); d.setDate(d.getDate() + 3);
      client.nextFollowup = d.toISOString().slice(0,10);
    }
    
    // 계약 시 매출 기록
    if (client.status === '계약' && client.price) {
      db.revenue.push({ name, amount: client.price, date: new Date().toISOString().slice(0,10) });
    }
    
    save(db);
    console.log(`✅ ${name} → ${client.status} ${client.price ? `(${(client.price/10000).toFixed(0)}만원)` : ''}`);
    return;
  }

  // ── followup ──
  if (cmd === 'followup') {
    const today = new Date().toISOString().slice(0,10);
    const targets = Object.values(db.clients).filter(c => {
      if (c.nextFollowup && c.nextFollowup <= today) return true;
      if (['시안발송','견적발송','협의중'].includes(c.status)) return true;
      return false;
    });
    
    console.log(`\n📅 오늘 팔로업 대상 (${targets.length}건):\n`);
    targets.forEach((c,i) => {
      console.log(`${i+1}. ${c.name} (${c.status})`);
      if (c.nextFollowup) console.log(`   📅 예정: ${c.nextFollowup}`);
      if (c.note) console.log(`   📝 ${c.note}`);
      console.log('');
    });
    return;
  }

  // ── revenue ──
  if (cmd === 'revenue') {
    const mi = args.indexOf('--month');
    const month = mi !== -1 ? args[mi+1] : new Date().toISOString().slice(0,7);
    
    const monthRevenue = db.revenue.filter(r => r.date.startsWith(month));
    const total = monthRevenue.reduce((s,r) => s + r.amount, 0);
    
    console.log(`\n💰 매출 현황 (${month}):\n`);
    monthRevenue.forEach(r => console.log(`  ${r.date} | ${r.name} | ${(r.amount/10000).toFixed(0)}만원`));
    console.log(`\n  합계: ${(total/10000).toFixed(0)}만원`);
    
    // 전체
    const allTotal = db.revenue.reduce((s,r) => s + r.amount, 0);
    console.log(`  누적: ${(allTotal/10000).toFixed(0)}만원`);
    return;
  }

  // ── maintenance ──
  if (cmd === 'maintenance') {
    const mClients = Object.values(db.clients).filter(c => c.status === '유지보수');
    console.log(`\n🔄 유지보수 고객 (${mClients.length}건):\n`);
    mClients.forEach((c,i) => {
      console.log(`${i+1}. ${c.name}`);
      if (c.note) console.log(`   📝 ${c.note}`);
      console.log('');
    });
    const mrrTotal = mClients.reduce((s,c) => s + (c.price||0), 0);
    console.log(`  💰 월 MRR: ${(mrrTotal/10000).toFixed(0)}만원`);
    return;
  }

  console.log(`❌ 알 수 없는 명령: ${cmd}`);
}

main().catch(e => console.error('❌:', e));
