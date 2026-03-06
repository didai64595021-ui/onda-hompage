/**
 * 매체별 통합 발송기 v2
 * 
 * 지원 매체: SMS(CoolSMS), 이메일(SMTP), 카카오 알림톡, 카카오 오픈채팅 링크, 인스타 DM 가이드
 * 
 * 사용법:
 *   node sender.js help                         도움말
 *   node sender.js list [--new] [--score N] [--category X]  리스트
 *   node sender.js preview <업체명>              발송 미리보기
 *   node sender.js send <업체명> [--sms] [--email] [--all]  개별 발송
 *   node sender.js batch [--sms] [--email] [--all] [--score N] [--limit N]  일괄 발송
 *   node sender.js status <업체명> <상태>        TM 상태 변경
 *   node sender.js stats                        통계
 *   node sender.js export [--status 미연락]      특정 상태 업체 CSV 추출
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTPUT_DIR = path.join(__dirname, 'output');
const DB_PATH = path.join(OUTPUT_DIR, 'history.json');
const SEND_LOG_PATH = path.join(OUTPUT_DIR, 'send-log.json');

// ── 발송 설정 (환경변수) ──
const CONFIG = {
  sms: {
    enabled: !!(process.env.COOLSMS_API_KEY && process.env.COOLSMS_API_SECRET),
    apiKey: process.env.COOLSMS_API_KEY || '',
    apiSecret: process.env.COOLSMS_API_SECRET || '',
    sender: process.env.COOLSMS_SENDER || '',
  },
  email: {
    enabled: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
  kakao: {
    enabled: !!(process.env.KAKAO_ALIMTALK_KEY),
    apiKey: process.env.KAKAO_ALIMTALK_KEY || '',
    senderKey: process.env.KAKAO_SENDER_KEY || '',
    templateCode: process.env.KAKAO_TEMPLATE_CODE || '',
  },
  // 발송 간격 (스팸 방지)
  smsDelay: parseInt(process.env.SEND_SMS_DELAY || '3000'),   // 3초
  emailDelay: parseInt(process.env.SEND_EMAIL_DELAY || '5000'), // 5초
  batchLimit: parseInt(process.env.SEND_BATCH_LIMIT || '100'),  // 1회 최대 100건
};

// ── 유틸 ──
function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); }

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
  const result = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else { if (c === '"') q = true; else if (c === ',') { result.push(cur); cur = ''; } else cur += c; }
  }
  result.push(cur); return result;
}
function csvEscape(val) {
  const s = String(val||'');
  return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s;
}

// ── SMS 발송 (CoolSMS v4) ──
async function sendSMS(to, message) {
  if (!CONFIG.sms.enabled) return { success: false, reason: 'SMS 미설정 (COOLSMS_API_KEY/SECRET 환경변수 필요)' };
  const axios = require('axios');
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const sig = crypto.createHmac('sha256', CONFIG.sms.apiSecret).update(date+salt).digest('hex');
  try {
    const res = await axios.post('https://api.coolsms.co.kr/messages/v4/send', {
      message: { to, from: CONFIG.sms.sender, text: message, type: message.length > 90 ? 'LMS' : 'SMS' }
    }, {
      headers: {
        'Authorization': `HMAC-SHA256 apiKey=${CONFIG.sms.apiKey}, date=${date}, salt=${salt}, signature=${sig}`,
        'Content-Type': 'application/json',
      }
    });
    return { success: true, id: res.data?.groupId };
  } catch (e) { return { success: false, reason: e.response?.data?.errorMessage || e.message }; }
}

// ── 이메일 발송 ──
async function sendEmail(to, subject, body) {
  if (!CONFIG.email.enabled) return { success: false, reason: '이메일 미설정 (SMTP_USER/PASS 환경변수 필요)' };
  const nodemailer = require('nodemailer');
  try {
    const t = nodemailer.createTransport({
      host: CONFIG.email.host, port: CONFIG.email.port,
      secure: CONFIG.email.port === 465,
      auth: { user: CONFIG.email.user, pass: CONFIG.email.pass },
    });
    const info = await t.sendMail({ from: CONFIG.email.from, to, subject, text: body });
    return { success: true, id: info.messageId };
  } catch (e) { return { success: false, reason: e.message }; }
}

// ── 카카오 알림톡 발송 ──
async function sendKakaoAlimtalk(phone, templateVars) {
  if (!CONFIG.kakao.enabled) return { success: false, reason: '카카오 알림톡 미설정 (KAKAO_ALIMTALK_KEY 환경변수 필요)' };
  const axios = require('axios');
  try {
    const res = await axios.post('https://alimtalk-api.bizmsg.kr/v2/sender/send', {
      senderKey: CONFIG.kakao.senderKey,
      templateCode: CONFIG.kakao.templateCode,
      recipientList: [{ recipientNo: phone, templateParameter: templateVars }],
    }, {
      headers: { 'Content-Type': 'application/json', 'userId': CONFIG.kakao.apiKey }
    });
    return { success: true, id: res.data?.resultCode };
  } catch (e) { return { success: false, reason: e.message }; }
}

// ── 인스타 DM 가이드 생성 ──
function generateInstaDMGuide(prospect) {
  const p = prospect;
  if (!p['인스타그램']) return null;
  const instaUrl = p['인스타그램'].split('/').filter(x=>x);
  const handle = instaUrl[instaUrl.length - 1] || '';
  return {
    handle: `@${handle}`,
    url: p['인스타그램'],
    message: `안녕하세요! ${p['업체명']} 홈페이지를 모바일에서 확인해봤는데, 개선하면 고객 문의가 늘어날 것 같아서 연락드려요. 무료 진단 리포트 보내드릴까요? 🙂`,
  };
}

// ── 카카오톡 채널 메시지 가이드 ──
function generateKakaoGuide(prospect) {
  const p = prospect;
  if (!p['카카오톡'] && !p['카카오오픈채팅']) return null;
  return {
    channel: p['카카오톡'] || p['카카오오픈채팅'],
    message: `안녕하세요! ${p['업체명']} 홈페이지 모바일 점검 결과를 공유드리고 싶어서 연락드립니다. ${p['발견된문제']?.split('/')[0]?.trim() || '모바일 최적화'} 관련 무료 시안 보내드릴까요?`,
  };
}

// ── 메인 CLI ──
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help') {
    console.log(`
📮 통합 발송기 v2

  list [--new] [--score N] [--category X]     리스트 조회
  preview <업체명>                             모든 매체 발송 미리보기
  send <업체명> [--sms] [--email] [--all]     개별 발송
  batch [--sms] [--email] [--all] [--score N] [--limit N]  일괄 발송
  status <업체명> <상태>                       상태 변경 (미연락/통화중/문자발송/이메일발송/거절/계약/보류)
  stats                                        전체 통계
  export [--status 미연락] [--score N]         CSV 추출
  channels                                     발송 채널 상태 확인

환경변수 (발송 활성화):
  SMS:    COOLSMS_API_KEY, COOLSMS_API_SECRET, COOLSMS_SENDER
  Email:  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
  Kakao:  KAKAO_ALIMTALK_KEY, KAKAO_SENDER_KEY, KAKAO_TEMPLATE_CODE
  Delay:  SEND_SMS_DELAY(ms), SEND_EMAIL_DELAY(ms), SEND_BATCH_LIMIT
`);
    return;
  }

  const csvPath = path.join(OUTPUT_DIR, 'prospects.csv');
  if (!fs.existsSync(csvPath)) { console.log('❌ prospects.csv 없음'); return; }
  let prospects = parseCSV(csvPath);
  const sendLog = loadJSON(SEND_LOG_PATH); if (!sendLog.sent) sendLog.sent = {};
  const history = loadJSON(DB_PATH); if (!history.crawled) history.crawled = {};

  // ── channels ──
  if (cmd === 'channels') {
    console.log('\n📡 발송 채널 상태:\n');
    console.log(`  📱 SMS (CoolSMS):     ${CONFIG.sms.enabled ? '✅ 활성' : '❌ 비활성'} ${CONFIG.sms.sender ? `(발신: ${CONFIG.sms.sender})` : ''}`);
    console.log(`  📧 이메일 (SMTP):     ${CONFIG.email.enabled ? '✅ 활성' : '❌ 비활성'} ${CONFIG.email.user ? `(${CONFIG.email.user})` : ''}`);
    console.log(`  💬 카카오 알림톡:     ${CONFIG.kakao.enabled ? '✅ 활성' : '❌ 비활성'}`);
    console.log(`  📸 인스타 DM:         ℹ️  수동 (가이드 생성)`);
    console.log(`  💛 카카오톡 채널:     ℹ️  수동 (가이드 생성)`);
    console.log(`\n⚙️  배치 설정: SMS간격 ${CONFIG.smsDelay}ms | 이메일간격 ${CONFIG.emailDelay}ms | 최대 ${CONFIG.batchLimit}건/회`);
    return;
  }

  // ── list ──
  if (cmd === 'list') {
    let filtered = [...prospects];
    if (args.includes('--new')) filtered = filtered.filter(p => p['신규여부'] === 'Y');
    const si = args.indexOf('--score');
    if (si !== -1) filtered = filtered.filter(p => parseInt(p['우선순위점수']||'0') >= parseInt(args[si+1]||'0'));
    const ci = args.indexOf('--category');
    if (ci !== -1) filtered = filtered.filter(p => p['업종']?.includes(args[ci+1]));

    const emojiMap = { '미연락':'⚪','통화중':'🟡','문자발송':'📱','이메일발송':'📧','거절':'🔴','계약':'🟢','보류':'⏸️' };
    console.log(`\n📋 리스트 (${filtered.length}건):\n`);
    filtered.forEach((p,i) => {
      const key = `${p['업체명']}|${p['주소']}`;
      const st = history.crawled[key]?.tmStatus || '미연락';
      console.log(`${i+1}. ${emojiMap[st]||'⚪'} [${p['우선순위점수']}점] ${p['업체명']} (${p['업종']})`);
      console.log(`   📦 ${p['추천패키지']} | ⚠️ ${p['발견된문제']||'없음'}`);
      const channels = [];
      if (p['전화']) channels.push(`📞${p['전화'].split('/')[0].trim()}`);
      if (p['이메일']) channels.push(`📧${p['이메일'].split('/')[0].trim()}`);
      if (p['카카오톡']) channels.push('💬카톡');
      if (p['인스타그램']) channels.push('📸인스타');
      if (channels.length) console.log(`   ${channels.join(' | ')}`);
      console.log('');
    });
    return;
  }

  // ── preview ──
  if (cmd === 'preview') {
    const name = args.slice(1).join(' ');
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }

    console.log(`\n📋 ${p['업체명']} — 전 매체 발송 미리보기\n`);

    console.log('━'.repeat(50));
    console.log('📞 TM 스크립트 (전화):');
    console.log(p['TM스크립트'] || '(문제 없음)');

    console.log('\n' + '━'.repeat(50));
    console.log('📱 SMS 문자:');
    console.log(p['문자템플릿'] || '(문제 없음)');
    if (p['전화']) console.log(`→ 발송 대상: ${p['전화']}`);

    console.log('\n' + '━'.repeat(50));
    console.log('📧 이메일:');
    const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
    const emailPath = path.join(OUTPUT_DIR, 'emails', `${safeName}.txt`);
    if (fs.existsSync(emailPath)) console.log(fs.readFileSync(emailPath, 'utf8'));
    else console.log('(이메일 템플릿 없음)');
    if (p['이메일']) console.log(`→ 발송 대상: ${p['이메일']}`);

    console.log('\n' + '━'.repeat(50));
    const kakaoG = generateKakaoGuide(p);
    if (kakaoG) {
      console.log('💬 카카오톡 채널 (수동 발송):');
      console.log(`→ 채널: ${kakaoG.channel}`);
      console.log(`→ 메시지: ${kakaoG.message}`);
    }

    console.log('\n' + '━'.repeat(50));
    const instaG = generateInstaDMGuide(p);
    if (instaG) {
      console.log('📸 인스타 DM (수동 발송):');
      console.log(`→ 계정: ${instaG.handle} (${instaG.url})`);
      console.log(`→ 메시지: ${instaG.message}`);
    }

    console.log('\n' + '━'.repeat(50));
    console.log('💬 카카오 알림톡 (API):');
    if (p['전화']) console.log(`→ 수신: ${p['전화'].split('/')[0].trim()}`);
    else console.log('→ 전화번호 없어서 불가');
    return;
  }

  // ── send ──
  if (cmd === 'send') {
    const nameArgs = [];
    let doSms = false, doEmail = false, doAll = false;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--sms') doSms = true;
      else if (args[i] === '--email') doEmail = true;
      else if (args[i] === '--all') doAll = true;
      else nameArgs.push(args[i]);
    }
    if (doAll) { doSms = true; doEmail = true; }
    if (!doSms && !doEmail) doAll = doSms = doEmail = true;

    const name = nameArgs.join(' ');
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }

    console.log(`📮 ${p['업체명']} 발송:\n`);
    const key = `${p['업체명']}|${p['주소']}`;

    if (doSms && p['전화']) {
      const phone = p['전화'].split('/')[0].trim().replace(/[^0-9]/g,'');
      console.log(`  📱 SMS → ${phone}`);
      const r = await sendSMS(phone, p['문자템플릿']);
      console.log(`     ${r.success ? '✅ 발송완료' : '⚠️ '+r.reason}`);
      sendLog.sent[`sms:${p['업체명']}:${Date.now()}`] = { type:'sms', to:phone, at:new Date().toISOString(), ...r };
      if (history.crawled[key]) history.crawled[key].tmStatus = '문자발송';
    }

    if (doEmail && p['이메일']) {
      const email = p['이메일'].split('/')[0].trim();
      const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
      const emailPath = path.join(OUTPUT_DIR, 'emails', `${safeName}.txt`);
      const body = fs.existsSync(emailPath) ? fs.readFileSync(emailPath, 'utf8') : p['문자템플릿'];
      const subject = `[${p['업체명']}] 모바일 홈페이지 무료 진단 결과`;
      console.log(`  📧 Email → ${email}`);
      const r = await sendEmail(email, subject, body);
      console.log(`     ${r.success ? '✅ 발송완료' : '⚠️ '+r.reason}`);
      sendLog.sent[`email:${p['업체명']}:${Date.now()}`] = { type:'email', to:email, at:new Date().toISOString(), ...r };
      if (history.crawled[key]) history.crawled[key].tmStatus = '이메일발송';
    }

    // 카카오/인스타 수동 가이드
    const kakaoG = generateKakaoGuide(p);
    if (kakaoG) {
      console.log(`\n  💬 카카오톡 (수동 발송 필요):`);
      console.log(`     채널: ${kakaoG.channel}`);
      console.log(`     메시지: ${kakaoG.message}`);
    }
    const instaG = generateInstaDMGuide(p);
    if (instaG) {
      console.log(`\n  📸 인스타 DM (수동 발송 필요):`);
      console.log(`     ${instaG.handle}: ${instaG.url}`);
      console.log(`     메시지: ${instaG.message}`);
    }

    saveJSON(SEND_LOG_PATH, sendLog);
    saveJSON(DB_PATH, history);
    return;
  }

  // ── batch ──
  if (cmd === 'batch') {
    let doSms = args.includes('--sms');
    let doEmail = args.includes('--email');
    if (args.includes('--all') || (!doSms && !doEmail)) { doSms = true; doEmail = true; }

    const si = args.indexOf('--score');
    const minScore = si !== -1 ? parseInt(args[si+1]||'0') : 0;
    const li = args.indexOf('--limit');
    const limit = li !== -1 ? parseInt(args[li+1]||'100') : CONFIG.batchLimit;

    let targets = prospects.filter(p => parseInt(p['우선순위점수']||'0') >= minScore);
    // 미발송 건만
    targets = targets.filter(p => {
      const key = `${p['업체명']}|${p['주소']}`;
      const st = history.crawled[key]?.tmStatus || '미연락';
      return st === '미연락';
    });
    targets = targets.slice(0, limit);

    console.log(`\n📮 일괄 발송: ${targets.length}건 (점수 ${minScore}+, 미연락만)\n`);
    console.log(`  채널: ${doSms?'📱SMS ':''} ${doEmail?'📧이메일':''}`);
    console.log(`  간격: SMS ${CONFIG.smsDelay}ms | Email ${CONFIG.emailDelay}ms\n`);

    let smsOk=0, smsFail=0, emailOk=0, emailFail=0;

    for (const p of targets) {
      const key = `${p['업체명']}|${p['주소']}`;
      console.log(`→ ${p['업체명']} (${p['업종']}, ${p['우선순위점수']}점)`);

      if (doSms && p['전화']) {
        const phone = p['전화'].split('/')[0].trim().replace(/[^0-9]/g,'');
        const r = await sendSMS(phone, p['문자템플릿']);
        if (r.success) smsOk++; else smsFail++;
        console.log(`  📱 ${r.success?'✅':'❌'} ${phone}`);
        sendLog.sent[`sms:${p['업체명']}:${Date.now()}`] = { type:'sms', to:phone, at:new Date().toISOString(), ...r };
        if (history.crawled[key]) history.crawled[key].tmStatus = '문자발송';
        await sleep(CONFIG.smsDelay);
      }

      if (doEmail && p['이메일']) {
        const email = p['이메일'].split('/')[0].trim();
        const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
        const emailPath = path.join(OUTPUT_DIR, 'emails', `${safeName}.txt`);
        const body = fs.existsSync(emailPath) ? fs.readFileSync(emailPath, 'utf8') : p['문자템플릿'];
        const subject = `[${p['업체명']}] 모바일 홈페이지 무료 진단 결과`;
        const r = await sendEmail(email, subject, body);
        if (r.success) emailOk++; else emailFail++;
        console.log(`  📧 ${r.success?'✅':'❌'} ${email}`);
        sendLog.sent[`email:${p['업체명']}:${Date.now()}`] = { type:'email', to:email, at:new Date().toISOString(), ...r };
        if (!p['전화'] && history.crawled[key]) history.crawled[key].tmStatus = '이메일발송';
        await sleep(CONFIG.emailDelay);
      }
    }

    saveJSON(SEND_LOG_PATH, sendLog);
    saveJSON(DB_PATH, history);

    console.log(`\n📊 일괄 발송 결과:`);
    console.log(`  📱 SMS: 성공 ${smsOk} / 실패 ${smsFail}`);
    console.log(`  📧 이메일: 성공 ${emailOk} / 실패 ${emailFail}`);
    return;
  }

  // ── status ──
  if (cmd === 'status') {
    const valid = ['미연락','통화중','문자발송','이메일발송','거절','계약','보류'];
    const name = args[1]; const status = args[2];
    if (!name || !status) { console.log(`사용법: status <업체명> <${valid.join('|')}>`); return; }
    if (!valid.includes(status)) { console.log(`❌ 유효한 상태: ${valid.join(', ')}`); return; }
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }
    const key = `${p['업체명']}|${p['주소']}`;
    if (history.crawled[key]) { history.crawled[key].tmStatus = status; saveJSON(DB_PATH, history); }
    console.log(`✅ ${p['업체명']} → ${status}`);
    return;
  }

  // ── stats ──
  if (cmd === 'stats') {
    const sent = sendLog.sent || {};
    const sms = Object.values(sent).filter(s=>s.type==='sms');
    const email = Object.values(sent).filter(s=>s.type==='email');
    const statuses = {};
    Object.values(history.crawled).forEach(c => { const s=c.tmStatus||'미연락'; statuses[s]=(statuses[s]||0)+1; });
    const total = Object.keys(history.crawled).length;
    const contracted = statuses['계약']||0;

    console.log(`
📊 통합 발송 통계

📮 발송:
  📱 SMS: ${sms.length}건 (성공 ${sms.filter(s=>s.success).length})
  📧 이메일: ${email.length}건 (성공 ${email.filter(s=>s.success).length})
  📮 총: ${sms.length+email.length}건

📋 TM 상태 (DB ${total}건):
  ⚪ 미연락: ${statuses['미연락']||0}
  🟡 통화중: ${statuses['통화중']||0}
  📱 문자발송: ${statuses['문자발송']||0}
  📧 이메일발송: ${statuses['이메일발송']||0}
  🔴 거절: ${statuses['거절']||0}
  🟢 계약: ${statuses['계약']||0}
  ⏸️  보류: ${statuses['보류']||0}

💰 전환율: ${contracted}/${total} = ${total?(contracted/total*100).toFixed(1):'0.0'}%
`);
    return;
  }

  // ── export ──
  if (cmd === 'export') {
    const sti = args.indexOf('--status');
    const filterStatus = sti !== -1 ? args[sti+1] : null;
    const si = args.indexOf('--score');
    const minScore = si !== -1 ? parseInt(args[si+1]||'0') : 0;

    let filtered = Object.entries(history.crawled);
    if (filterStatus) filtered = filtered.filter(([,v]) => (v.tmStatus||'미연락') === filterStatus);
    if (minScore) filtered = filtered.filter(([,v]) => (v.score||0) >= minScore);

    const exportPath = path.join(OUTPUT_DIR, `export-${filterStatus||'all'}-${Date.now()}.csv`);
    const BOM = '\ufeff';
    const header = '업체명,업종,주소,홈페이지,점수,상태,최초수집,최근수집';
    const rows = filtered.map(([,v]) => [v.name, v.category, v.address, v.homepage, v.score, v.tmStatus, v.firstSeen, v.lastSeen].map(csvEscape).join(','));
    fs.writeFileSync(exportPath, BOM + header + '\n' + rows.join('\n'), 'utf8');
    console.log(`✅ ${filtered.length}건 추출 → ${exportPath}`);
    return;
  }

  console.log(`❌ 알 수 없는 명령: ${cmd}. "help" 참고.`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
main().catch(e => console.error('❌:', e));
