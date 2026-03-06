/**
 * 자동 팔로업 시퀀스 관리
 * TM 후 자동으로 문자/이메일 시퀀스 발송
 * 
 * node tools/followup-sequence.js check          오늘 발송할 팔로업 확인
 * node tools/followup-sequence.js run             자동 발송 실행
 * node tools/followup-sequence.js add <업체명>    시퀀스에 추가
 * node tools/followup-sequence.js list            전체 시퀀스 목록
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const SEQ_PATH = path.join(OUTPUT_DIR, 'followup-sequences.json');

function load() { try { return JSON.parse(fs.readFileSync(SEQ_PATH,'utf8')); } catch { return { sequences:{} }; } }
function save(d) { fs.writeFileSync(SEQ_PATH, JSON.stringify(d,null,2), 'utf8'); }

// ── 팔로업 시퀀스 정의 ──
const SEQUENCE = [
  { day: 0, type: 'sms', label: '즉시 문자', 
    template: (name) => `[${name}] 대표님, 방금 통화 감사합니다. 말씀드린 모바일 전후 비교 시안 첨부합니다. 24시간 내 작업 가능합니다. 문의: 010-XXXX-XXXX` },
  { day: 3, type: 'sms', label: '3일 후 리마인드',
    template: (name) => `안녕하세요 대표님. 며칠 전 ${name} 홈페이지 모바일 개선 관련 연락드렸던 [이름]입니다. 시안 확인하셨나요? 이번 주 내 결정하시면 10% 할인 적용해드립니다.` },
  { day: 7, type: 'email', label: '7일 후 이메일',
    template: (name) => `${name} 대표님 안녕하세요.\n\n지난주 모바일 홈페이지 개선 관련 연락드렸던 [이름]입니다.\n\n혹시 바쁘셔서 확인을 못 하셨을 수도 있어서 한 번 더 안내드립니다.\n\n무료 전후 비교 시안은 언제든 보내드릴 수 있으니,\n편하실 때 연락주세요.\n\n좋은 한 주 되세요!\n[이름] 010-XXXX-XXXX` },
  { day: 14, type: 'sms', label: '2주 후 마지막',
    template: (name) => `${name} 대표님, [이름]입니다. 홈페이지 개선 건 아직 관심 있으시면 편하실 때 연락주세요. 무료 시안은 언제든 보내드릴 수 있습니다. 좋은 하루 되세요!` },
];

function addToSequence(db, name, phone, email) {
  const today = new Date().toISOString().slice(0,10);
  db.sequences[name] = {
    name, phone, email,
    startDate: today,
    currentStep: 0,
    status: 'active', // active, paused, completed, cancelled
    history: [],
  };
  save(db);
  console.log(`✅ ${name} 팔로업 시퀀스 시작 (${SEQUENCE.length}단계)`);
  SEQUENCE.forEach((s,i) => {
    const d = new Date(); d.setDate(d.getDate() + s.day);
    console.log(`  ${i+1}. [D+${s.day}] ${d.toISOString().slice(0,10)} ${s.type.toUpperCase()} — ${s.label}`);
  });
}

function getTodayTasks(db) {
  const today = new Date().toISOString().slice(0,10);
  const tasks = [];
  
  Object.values(db.sequences).forEach(seq => {
    if (seq.status !== 'active') return;
    
    SEQUENCE.forEach((step, idx) => {
      if (idx < seq.currentStep) return; // 이미 발송됨
      
      const startDate = new Date(seq.startDate);
      startDate.setDate(startDate.getDate() + step.day);
      const scheduled = startDate.toISOString().slice(0,10);
      
      if (scheduled === today && idx === seq.currentStep) {
        tasks.push({
          name: seq.name,
          phone: seq.phone,
          email: seq.email,
          step: idx,
          type: step.type,
          label: step.label,
          message: step.template(seq.name),
        });
      }
    });
  });
  
  return tasks;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const db = load();
  if (!db.sequences) db.sequences = {};

  if (!cmd || cmd === 'help') {
    console.log(`
🔄 팔로업 시퀀스 관리

  check                오늘 발송할 팔로업 확인
  run                  자동 발송 실행
  add <업체명>         시퀀스에 추가
  list                 전체 시퀀스 목록
  pause <업체명>       일시중지
  cancel <업체명>      취소
  
시퀀스:
  D+0: 즉시 문자 (통화 직후)
  D+3: 리마인드 문자
  D+7: 이메일 팔로업
  D+14: 마지막 문자
`);
    return;
  }

  if (cmd === 'list') {
    const seqs = Object.values(db.sequences);
    console.log(`\n🔄 팔로업 시퀀스 (${seqs.length}건):\n`);
    seqs.forEach((s,i) => {
      const statusEmoji = {'active':'🟢','paused':'⏸️','completed':'✅','cancelled':'🔴'}[s.status]||'⚪';
      console.log(`${i+1}. ${statusEmoji} ${s.name} (${s.status}) — 단계 ${s.currentStep+1}/${SEQUENCE.length}`);
      console.log(`   시작: ${s.startDate} | 📞 ${s.phone||'없음'} | 📧 ${s.email||'없음'}`);
    });
    return;
  }

  if (cmd === 'check') {
    const tasks = getTodayTasks(db);
    console.log(`\n📅 오늘 팔로업 (${tasks.length}건):\n`);
    tasks.forEach((t,i) => {
      console.log(`${i+1}. ${t.type==='sms'?'📱':'📧'} ${t.name} — ${t.label}`);
      console.log(`   ${t.type==='sms'?`→ ${t.phone}`:``}`);
      console.log(`   메시지: ${t.message.slice(0,80)}...`);
      console.log('');
    });
    if (tasks.length === 0) console.log('  오늘 팔로업 없음 ✨');
    return;
  }

  if (cmd === 'run') {
    const tasks = getTodayTasks(db);
    console.log(`\n🚀 팔로업 발송: ${tasks.length}건\n`);
    
    for (const task of tasks) {
      console.log(`→ ${task.name} (${task.label})`);
      // 실제 발송은 sender.js 연동
      console.log(`  ${task.type==='sms'?'📱':'📧'} [미설정 — sender.js 연동 필요]`);
      console.log(`  메시지: ${task.message.slice(0,60)}...`);
      
      // 단계 진행
      if (db.sequences[task.name]) {
        db.sequences[task.name].currentStep = task.step + 1;
        db.sequences[task.name].history.push({
          step: task.step, type: task.type, at: new Date().toISOString(), status: 'sent'
        });
        
        // 마지막 단계면 완료 처리
        if (db.sequences[task.name].currentStep >= SEQUENCE.length) {
          db.sequences[task.name].status = 'completed';
        }
      }
    }
    save(db);
    return;
  }

  if (cmd === 'add') {
    const name = args[1];
    if (!name) { console.log('❌ 업체명 필요'); return; }
    
    // prospects.csv에서 연락처 가져오기
    const csvPath = path.join(OUTPUT_DIR, 'prospects.csv');
    let phone = '', email = '';
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf8');
      const lines = content.split('\n');
      const match = lines.find(l => l.includes(name));
      if (match) {
        // 간단 추출
        const parts = match.split(',');
        // 전화: 9번째, 이메일: 10번째 (0-indexed)
        phone = parts[9]?.replace(/"/g,'').trim() || '';
        email = parts[10]?.replace(/"/g,'').trim() || '';
      }
    }
    
    addToSequence(db, name, phone, email);
    return;
  }

  if (cmd === 'pause') {
    const name = args[1];
    if (db.sequences[name]) { db.sequences[name].status = 'paused'; save(db); console.log(`⏸️ ${name} 일시중지`); }
    else console.log(`❌ "${name}" 없음`);
    return;
  }

  if (cmd === 'cancel') {
    const name = args[1];
    if (db.sequences[name]) { db.sequences[name].status = 'cancelled'; save(db); console.log(`🔴 ${name} 취소`); }
    else console.log(`❌ "${name}" 없음`);
    return;
  }
}

main().catch(e => console.error('❌:', e));
