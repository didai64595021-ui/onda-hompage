const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── 설정 ──
const OUTPUT_DIR = path.join(__dirname, 'output');
const DB_PATH = path.join(OUTPUT_DIR, 'history.json');
const SEND_LOG_PATH = path.join(OUTPUT_DIR, 'send-log.json');

// ── 발송 매체 설정 (API 키 입력 필요) ──
const CONFIG = {
  // CoolSMS (문자 발송)
  sms: {
    enabled: false,
    apiKey: process.env.COOLSMS_API_KEY || '',
    apiSecret: process.env.COOLSMS_API_SECRET || '',
    sender: process.env.COOLSMS_SENDER || '', // 발신번호
    apiUrl: 'https://api.coolsms.co.kr',
  },
  // 이메일 (SMTP)
  email: {
    enabled: false,
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
  // 카카오 알림톡 (비즈니스 채널)
  kakao: {
    enabled: false,
    apiKey: process.env.KAKAO_API_KEY || '',
    senderKey: process.env.KAKAO_SENDER_KEY || '',
  },
};

// ── 발송 로그 ──
function loadSendLog() {
  try { return JSON.parse(fs.readFileSync(SEND_LOG_PATH, 'utf8')); }
  catch { return { sent: {} }; }
}
function saveSendLog(log) {
  fs.writeFileSync(SEND_LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
}

// ── 히스토리 DB ──
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { crawled: {}, tm_status: {} }; }
}
function saveHistory(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// ── CSV 파싱 ──
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
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

// ── SMS 발송 (CoolSMS) ──
async function sendSMS(to, message) {
  if (!CONFIG.sms.enabled) {
    console.log(`  📱 [SMS 미설정] → ${to}`);
    console.log(`     ${message.slice(0, 80)}...`);
    return { success: false, reason: 'SMS 미설정' };
  }

  try {
    const axios = require('axios');
    const crypto = require('crypto');
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(32).toString('hex');
    const hmac = crypto.createHmac('sha256', CONFIG.sms.apiSecret);
    hmac.update(date + salt);
    const signature = hmac.digest('hex');

    const res = await axios.post(`${CONFIG.sms.apiUrl}/messages/v4/send`, {
      message: {
        to, from: CONFIG.sms.sender,
        text: message, type: 'LMS',
      }
    }, {
      headers: {
        'Authorization': `HMAC-SHA256 apiKey=${CONFIG.sms.apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
        'Content-Type': 'application/json',
      }
    });
    return { success: true, messageId: res.data?.groupId };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

// ── 이메일 발송 ──
async function sendEmail(to, subject, body) {
  if (!CONFIG.email.enabled) {
    console.log(`  📧 [이메일 미설정] → ${to}`);
    console.log(`     제목: ${subject}`);
    return { success: false, reason: '이메일 미설정' };
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: CONFIG.email.host,
      port: CONFIG.email.port,
      secure: CONFIG.email.port === 465,
      auth: { user: CONFIG.email.user, pass: CONFIG.email.pass },
    });

    const info = await transporter.sendMail({
      from: CONFIG.email.from,
      to, subject, text: body,
    });
    return { success: true, messageId: info.messageId };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

// ── 메인 CLI ──
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
📮 발송기 사용법:

  node sender.js list                    전체 리스트 보기
  node sender.js list --new              신규만 보기
  node sender.js list --score 60         점수 60 이상만
  node sender.js list --category 치과    업종 필터

  node sender.js preview <업체명>        발송 미리보기 (TM/문자/이메일)

  node sender.js send-sms <업체명>       문자 발송
  node sender.js send-email <업체명>     이메일 발송
  node sender.js send-all-sms            전체 문자 발송 (미발송 건만)
  node sender.js send-all-email          전체 이메일 발송 (미발송 건만)

  node sender.js status <업체명> <상태>  TM 상태 변경
    상태: 미연락, 통화중, 문자발송, 이메일발송, 거절, 계약, 보류

  node sender.js stats                   발송 통계

환경변수:
  COOLSMS_API_KEY, COOLSMS_API_SECRET, COOLSMS_SENDER  (문자)
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (이메일)
`);
    return;
  }

  // CSV 로드
  const csvPath = path.join(OUTPUT_DIR, 'prospects.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('❌ prospects.csv 없음. 먼저 node crawl.js 실행하세요.');
    return;
  }
  const prospects = parseCSV(csvPath);
  const sendLog = loadSendLog();
  const history = loadHistory();

  // ── list ──
  if (command === 'list') {
    let filtered = [...prospects];
    const newOnly = args.includes('--new');
    const scoreIdx = args.indexOf('--score');
    const catIdx = args.indexOf('--category');

    if (newOnly) filtered = filtered.filter(p => p['신규여부'] === 'Y');
    if (scoreIdx !== -1) {
      const minScore = parseInt(args[scoreIdx + 1] || '0');
      filtered = filtered.filter(p => parseInt(p['우선순위점수'] || '0') >= minScore);
    }
    if (catIdx !== -1) {
      const cat = args[catIdx + 1];
      filtered = filtered.filter(p => p['업종']?.includes(cat));
    }

    console.log(`\n📋 리스트 (${filtered.length}건):\n`);
    filtered.forEach((p, i) => {
      const status = history.crawled[`${p['업체명']}|${p['주소']}`]?.tmStatus || '미연락';
      const statusEmoji = { '미연락': '⚪', '통화중': '🟡', '문자발송': '📱', '이메일발송': '📧', '거절': '🔴', '계약': '🟢', '보류': '⏸️' }[status] || '⚪';
      console.log(`${i + 1}. ${statusEmoji} [${p['우선순위점수']}점] ${p['업체명']} (${p['업종']})`);
      console.log(`   📍 ${p['주소']}`);
      console.log(`   🏠 ${p['홈페이지']}`);
      console.log(`   📦 ${p['추천패키지']}`);
      console.log(`   ⚠️  ${p['발견된문제'] || '없음'}`);
      if (p['전화']) console.log(`   📞 ${p['전화']}`);
      if (p['이메일']) console.log(`   📧 ${p['이메일']}`);
      if (p['카카오톡']) console.log(`   💬 ${p['카카오톡']}`);
      console.log('');
    });
    return;
  }

  // ── preview ──
  if (command === 'preview') {
    const name = args.slice(1).join(' ');
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }

    console.log(`\n📋 ${p['업체명']} 발송 미리보기\n`);
    console.log('━'.repeat(50));
    console.log('📞 TM 스크립트:');
    console.log(p['TM스크립트']);
    console.log('\n━'.repeat(50));
    console.log('📱 문자 템플릿:');
    console.log(p['문자템플릿']);
    console.log('\n━'.repeat(50));

    // 이메일은 파일에서
    const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
    const emailPath = path.join(OUTPUT_DIR, 'emails', `${safeName}.txt`);
    if (fs.existsSync(emailPath)) {
      console.log('📧 이메일 템플릿:');
      console.log(fs.readFileSync(emailPath, 'utf8'));
    }
    return;
  }

  // ── send-sms ──
  if (command === 'send-sms') {
    const name = args.slice(1).join(' ');
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }
    if (!p['전화']) { console.log('❌ 전화번호 없음'); return; }

    const phone = p['전화'].split('/')[0].trim().replace(/[^0-9]/g, '');
    console.log(`📱 문자 발송: ${p['업체명']} → ${phone}`);
    const result = await sendSMS(phone, p['문자템플릿']);
    console.log(result.success ? '✅ 발송 완료' : `⚠️ ${result.reason}`);

    sendLog.sent[`sms:${p['업체명']}`] = { type: 'sms', to: phone, at: new Date().toISOString(), result };
    saveSendLog(sendLog);

    // 히스토리 상태 업데이트
    const key = `${p['업체명']}|${p['주소']}`;
    if (history.crawled[key]) { history.crawled[key].tmStatus = '문자발송'; saveHistory(history); }
    return;
  }

  // ── send-email ──
  if (command === 'send-email') {
    const name = args.slice(1).join(' ');
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }
    if (!p['이메일']) { console.log('❌ 이메일 없음'); return; }

    const email = p['이메일'].split('/')[0].trim();
    const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
    const emailPath = path.join(OUTPUT_DIR, 'emails', `${safeName}.txt`);
    const body = fs.existsSync(emailPath) ? fs.readFileSync(emailPath, 'utf8') : '';
    const subject = `[${p['업체명']}] 모바일 홈페이지 무료 진단 결과`;

    console.log(`📧 이메일 발송: ${p['업체명']} → ${email}`);
    const result = await sendEmail(email, subject, body);
    console.log(result.success ? '✅ 발송 완료' : `⚠️ ${result.reason}`);

    sendLog.sent[`email:${p['업체명']}`] = { type: 'email', to: email, at: new Date().toISOString(), result };
    saveSendLog(sendLog);

    const key = `${p['업체명']}|${p['주소']}`;
    if (history.crawled[key]) { history.crawled[key].tmStatus = '이메일발송'; saveHistory(history); }
    return;
  }

  // ── send-all-sms ──
  if (command === 'send-all-sms') {
    const unsent = prospects.filter(p => {
      return p['전화'] && !sendLog.sent[`sms:${p['업체명']}`];
    });
    console.log(`📱 미발송 문자 ${unsent.length}건 발송 시작...\n`);

    let success = 0, fail = 0;
    for (const p of unsent) {
      const phone = p['전화'].split('/')[0].trim().replace(/[^0-9]/g, '');
      console.log(`  → ${p['업체명']} (${phone})`);
      const result = await sendSMS(phone, p['문자템플릿']);
      if (result.success) success++; else fail++;
      sendLog.sent[`sms:${p['업체명']}`] = { type: 'sms', to: phone, at: new Date().toISOString(), result };

      const key = `${p['업체명']}|${p['주소']}`;
      if (history.crawled[key]) history.crawled[key].tmStatus = '문자발송';

      await new Promise(r => setTimeout(r, 500)); // 발송 간격
    }
    saveSendLog(sendLog);
    saveHistory(history);
    console.log(`\n✅ 완료: 성공 ${success}, 실패 ${fail}`);
    return;
  }

  // ── send-all-email ──
  if (command === 'send-all-email') {
    const unsent = prospects.filter(p => {
      return p['이메일'] && !sendLog.sent[`email:${p['업체명']}`];
    });
    console.log(`📧 미발송 이메일 ${unsent.length}건 발송 시작...\n`);

    let success = 0, fail = 0;
    for (const p of unsent) {
      const email = p['이메일'].split('/')[0].trim();
      const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
      const emailPath = path.join(OUTPUT_DIR, 'emails', `${safeName}.txt`);
      const body = fs.existsSync(emailPath) ? fs.readFileSync(emailPath, 'utf8') : '';
      const subject = `[${p['업체명']}] 모바일 홈페이지 무료 진단 결과`;

      console.log(`  → ${p['업체명']} (${email})`);
      const result = await sendEmail(email, subject, body);
      if (result.success) success++; else fail++;
      sendLog.sent[`email:${p['업체명']}`] = { type: 'email', to: email, at: new Date().toISOString(), result };

      const key = `${p['업체명']}|${p['주소']}`;
      if (history.crawled[key]) history.crawled[key].tmStatus = '이메일발송';

      await new Promise(r => setTimeout(r, 1000));
    }
    saveSendLog(sendLog);
    saveHistory(history);
    console.log(`\n✅ 완료: 성공 ${success}, 실패 ${fail}`);
    return;
  }

  // ── status ──
  if (command === 'status') {
    const name = args[1];
    const status = args[2];
    const validStatus = ['미연락', '통화중', '문자발송', '이메일발송', '거절', '계약', '보류'];

    if (!name || !status) {
      console.log('사용법: node sender.js status <업체명> <상태>');
      console.log(`상태: ${validStatus.join(', ')}`);
      return;
    }

    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }

    if (!validStatus.includes(status)) {
      console.log(`❌ 유효하지 않은 상태. 가능: ${validStatus.join(', ')}`);
      return;
    }

    const key = `${p['업체명']}|${p['주소']}`;
    if (history.crawled[key]) {
      history.crawled[key].tmStatus = status;
      saveHistory(history);
      console.log(`✅ ${p['업체명']} → ${status}`);
    }
    return;
  }

  // ── stats ──
  if (command === 'stats') {
    console.log('\n📊 발송 통계\n');

    const smsSent = Object.values(sendLog.sent).filter(s => s.type === 'sms');
    const emailSent = Object.values(sendLog.sent).filter(s => s.type === 'email');

    console.log(`📱 문자 발송: ${smsSent.length}건`);
    console.log(`📧 이메일 발송: ${emailSent.length}건`);
    console.log(`📮 총 발송: ${smsSent.length + emailSent.length}건`);

    // TM 상태 통계
    const statuses = {};
    Object.values(history.crawled).forEach(c => {
      const s = c.tmStatus || '미연락';
      statuses[s] = (statuses[s] || 0) + 1;
    });
    console.log('\n📋 TM 상태:');
    const emojiMap = { '미연락': '⚪', '통화중': '🟡', '문자발송': '📱', '이메일발송': '📧', '거절': '🔴', '계약': '🟢', '보류': '⏸️' };
    Object.entries(statuses).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
      console.log(`  ${emojiMap[s] || '⚪'} ${s}: ${c}건`);
    });

    // 전환율
    const total = Object.keys(history.crawled).length;
    const contracted = statuses['계약'] || 0;
    if (total > 0) console.log(`\n💰 전환율: ${contracted}/${total} = ${(contracted / total * 100).toFixed(1)}%`);
    return;
  }

  console.log(`❌ 알 수 없는 명령: ${command}. "help" 참고.`);
}

main().catch(e => console.error('❌ 에러:', e));
