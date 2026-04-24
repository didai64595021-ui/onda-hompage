#!/usr/bin/env node
/**
 * 크몽 텔레그램 봇 서버 (통합 멀티그룹)
 * - ONDA 서버 그룹: 크몽 광고/매출/서비스 관리
 * - 로직모니터 본서버/테스트: 서버 상태, AI 분석
 * - 트래픽 자동주문: 봇 상태 (기능 개발 예정)
 *
 * PM2 상시 구동: kmong-telegram-bot
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });

const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const { toggleAd } = require('./toggle-ad');
const { supabase } = require('./lib/supabase');
const { PRODUCT_MAP } = require('./lib/product-map');

// 환경변수에서 봇 토큰 로드
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('[에러] TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다');
  process.exit(1);
}

// === 그룹별 라우팅 ===
const GROUPS = {
  KMONG: -1003990823637,           // KMONG 자동답변 전용 그룹 (supergroup 업그레이드 2026-04-24)
  LOGIC_PROD: -1003804670860,      // 로직모니터 본서버
  LOGIC_TEST: -5134820548,         // 로직모니터 테스트서버
  TRAFFIC: -5079107870,            // 트래픽 자동주문
};
const ALL_CHAT_IDS = Object.values(GROUPS);
const ALLOWED_CHAT_ID = GROUPS.KMONG; // 크몽 명령은 기존 그룹만

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    params: { timeout: 30 },
    interval: 2000,
  },
  // api.telegram.org 간헐 ETIMEDOUT 대응: request timeout 15초 + IPv4 강제
  request: {
    timeout: 15000,
    family: 4,
    forever: false,
  },
});

// polling/webhook 에러 캐치 — ETIMEDOUT 반복 시 소음 방지
bot.on('polling_error', (err) => {
  console.error('[polling_error]', err.code || '', err.message?.slice(0, 100) || '(no message)');
});
bot.on('webhook_error', (err) => {
  console.error('[webhook_error]', err.code || '', err.message?.slice(0, 100) || '(no message)');
});

// 기존 웹훅 제거 (폴링 충돌 방지)
try {
  bot.deleteWebHook().then(() => console.log('[웹훅] 기존 웹훅 제거 완료'));
} catch {}

// Playwright 동시 실행 방지 큐
let isProcessing = false;
const taskQueue = [];

async function processQueue() {
  if (isProcessing || taskQueue.length === 0) return;
  isProcessing = true;
  const task = taskQueue.shift();
  try {
    await task();
  } catch (err) {
    console.error('[큐 에러]', err.message);
  }
  isProcessing = false;
  processQueue();
}

function enqueue(fn) {
  taskQueue.push(fn);
  processQueue();
}

// 채팅방 검증
function isAllowed(msg) {
  return msg.chat.id === ALLOWED_CHAT_ID;
}
function isAnyGroup(msg) {
  return ALL_CHAT_IDS.includes(msg.chat.id);
}
function isLogicProd(msg) { return msg.chat.id === GROUPS.LOGIC_PROD; }
function isLogicTest(msg) { return msg.chat.id === GROUPS.LOGIC_TEST; }
function isTraffic(msg) { return msg.chat.id === GROUPS.TRAFFIC; }

// 상품 ID 목록 텍스트
function productListText() {
  return PRODUCT_MAP.map(p => `  \`${p.id}\``).join('\n');
}

// === 명령어: /광고on <product_id> ===
bot.onText(/\/광고on(?:@\w+)?\s+(\S+)/, (msg, match) => {
  if (!isAllowed(msg)) return;
  const productId = match[1];
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `광고 ON 처리 중: ${productId}...`);

  enqueue(async () => {
    const result = await toggleAd(productId, 'on');
    bot.sendMessage(chatId, result.success
      ? `광고 ON 완료: ${productId}\n${result.message}`
      : `광고 ON 실패: ${productId}\n${result.message}`
    );
  });
});

// === 명령어: /광고off <product_id> ===
bot.onText(/\/광고off(?:@\w+)?\s+(\S+)/, (msg, match) => {
  if (!isAllowed(msg)) return;
  const productId = match[1];
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `광고 OFF 처리 중: ${productId}...`);

  enqueue(async () => {
    const result = await toggleAd(productId, 'off');
    bot.sendMessage(chatId, result.success
      ? `광고 OFF 완료: ${productId}\n${result.message}`
      : `광고 OFF 실패: ${productId}\n${result.message}`
    );
  });
});

// === 명령어: /광고상태 ===
bot.onText(/\/광고상태(?:@\w+)?/, async (msg) => {
  if (!isAllowed(msg)) return;
  const chatId = msg.chat.id;

  try {
    const { data, error } = await supabase
      .from('kmong_cpc_daily')
      .select('product_id, ad_enabled')
      .order('date', { ascending: false });

    if (error) throw error;

    // 최신 상태만 (product_id별 첫 행)
    const seen = {};
    const latest = [];
    for (const row of (data || [])) {
      if (!seen[row.product_id]) {
        seen[row.product_id] = true;
        latest.push(row);
      }
    }

    if (latest.length === 0) {
      bot.sendMessage(chatId, '광고 상태 데이터가 없습니다.');
      return;
    }

    const lines = latest.map(r => {
      const icon = r.ad_enabled ? '🟢 ON' : '🔴 OFF';
      const name = PRODUCT_MAP.find(p => p.id === r.product_id)?.id || r.product_id;
      return `${icon}  ${name}`;
    });

    bot.sendMessage(chatId, `📊 광고 ON/OFF 현황\n\n${lines.join('\n')}`);
  } catch (err) {
    bot.sendMessage(chatId, `광고 상태 조회 실패: ${err.message}`);
  }
});

// === 명령어: /매출 ===
bot.onText(/\/매출(?:@\w+)?/, async (msg) => {
  if (!isAllowed(msg)) return;
  const chatId = msg.chat.id;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    // 오늘 매출
    const { data: todayOrders } = await supabase
      .from('kmong_orders')
      .select('amount')
      .gte('order_date', today)
      .eq('status', 'completed');
    const todayRev = (todayOrders || []).reduce((s, o) => s + (o.amount || 0), 0);

    // 이번달 매출
    const { data: monthOrders } = await supabase
      .from('kmong_orders')
      .select('amount')
      .gte('order_date', monthStart)
      .eq('status', 'completed');
    const monthRev = (monthOrders || []).reduce((s, o) => s + (o.amount || 0), 0);

    // 전체 매출
    const { data: allOrders } = await supabase
      .from('kmong_orders')
      .select('amount')
      .eq('status', 'completed');
    const totalRev = (allOrders || []).reduce((s, o) => s + (o.amount || 0), 0);

    // 이번달 광고비
    const { data: monthCpc } = await supabase
      .from('kmong_cpc_daily')
      .select('cpc_cost')
      .gte('date', monthStart);
    const monthCost = (monthCpc || []).reduce((s, r) => s + (r.cpc_cost || 0), 0);

    const profit = monthRev - monthCost;
    const roi = monthCost > 0 ? ((profit / monthCost) * 100).toFixed(1) : '-';

    const fmt = n => n.toLocaleString('ko-KR');
    const text = [
      '💰 매출 요약',
      '',
      `오늘: ₩${fmt(todayRev)}`,
      `이번달: ₩${fmt(monthRev)}`,
      `전체 누적: ₩${fmt(totalRev)}`,
      '',
      `이번달 광고비: ₩${fmt(monthCost)}`,
      `이번달 순이익: ₩${fmt(profit)}`,
      `ROI: ${roi}%`,
    ].join('\n');

    bot.sendMessage(chatId, text);
  } catch (err) {
    bot.sendMessage(chatId, `매출 조회 실패: ${err.message}`);
  }
});

// === 명령어: /서비스상태 ===
bot.onText(/\/서비스상태(?:@\w+)?/, async (msg) => {
  if (!isAllowed(msg)) return;
  const chatId = msg.chat.id;

  try {
    // 최신 크롤링 데이터 (최근 24시간)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('kmong_gig_status')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // product_id별 최신 상태만
    const seen = {};
    const latest = [];
    for (const row of (data || [])) {
      if (!seen[row.product_id]) {
        seen[row.product_id] = true;
        latest.push(row);
      }
    }

    if (latest.length === 0) {
      bot.sendMessage(chatId, '최근 24시간 내 서비스 상태 데이터가 없습니다.\ncrawl-gig-status 실행 후 다시 시도하세요.');
      return;
    }

    const statusIcon = {
      '판매중': '🟢',
      '승인전': '🟡',
      '비승인': '🔴',
      '수정중': '🟠',
      '판매중지': '⚫',
    };

    const warnings = latest.filter(g => ['비승인', '승인전'].includes(g.status));
    const lines = latest.map(g => {
      const icon = statusIcon[g.status] || '⚪';
      return `${icon} ${g.gig_title?.substring(0, 30) || g.product_id} — ${g.status}`;
    });

    let text = `📋 서비스 심사 상태\n\n${lines.join('\n')}`;
    if (warnings.length > 0) {
      text += `\n\n⚠️ 주의: ${warnings.length}건 비승인/승인전`;
    }

    bot.sendMessage(chatId, text);
  } catch (err) {
    bot.sendMessage(chatId, `서비스 상태 조회 실패: ${err.message}`);
  }
});

// === 명령어: /도움말 ===
bot.onText(/\/도움말(?:@\w+)?|\/help(?:@\w+)?|\/start(?:@\w+)?/, (msg) => {
  if (!isAllowed(msg)) return;
  const text = [
    '🤖 크몽 관리 봇 명령어',
    '',
    '/광고on <product_id> — 광고 켜기',
    '/광고off <product_id> — 광고 끄기',
    '/광고상태 — 전체 광고 ON/OFF 현황',
    '/매출 — 오늘/이번달/전체 매출 요약',
    '/서비스상태 — 서비스 심사 상태',
    '/도움말 — 이 도움말',
    '',
    '📦 사용 가능한 product_id:',
    productListText(),
  ].join('\n');
  bot.sendMessage(msg.chat.id, text);
});

// ============================================================
// === 로직모니터 그룹 핸들러 (본서버 + 테스트서버) ===
// ============================================================

function getLogicMonitorUrl(msg) {
  if (isLogicProd(msg)) return 'http://127.0.0.1:3000';
  if (isLogicTest(msg)) return 'http://127.0.0.1:3001';
  return null;
}

function getLogicMonitorLabel(msg) {
  if (isLogicProd(msg)) return '본서버';
  if (isLogicTest(msg)) return '테스트';
  return '';
}

// /상태 — 로직모니터 서버 상태
bot.onText(/\/상태(?:@\w+)?/, async (msg) => {
  if (!isLogicProd(msg) && !isLogicTest(msg)) return;
  const url = getLogicMonitorUrl(msg);
  const label = getLogicMonitorLabel(msg);
  try {
    const res = await fetch(url);
    bot.sendMessage(msg.chat.id, `✅ 로직모니터 [${label}] 정상 (HTTP ${res.status})`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ 로직모니터 [${label}] 접속 실패: ${err.message}`);
  }
});

// /분석 — AI 분석 트리거
bot.onText(/\/분석(?:@\w+)?/, async (msg) => {
  if (!isLogicProd(msg) && !isLogicTest(msg)) return;
  const url = getLogicMonitorUrl(msg);
  const label = getLogicMonitorLabel(msg);
  bot.sendMessage(msg.chat.id, `🔄 [${label}] AI 분석 요청 중...`);
  try {
    const CRON_SECRET = 'onda-cron-secret-05dead3e00c8e1f4deb8c7d2ce894fec';
    const res = await fetch(`${url}/api/cron/daily-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
    });
    const data = await res.json();
    bot.sendMessage(msg.chat.id, `✅ [${label}] 분석 완료\n${JSON.stringify(data).slice(0, 500)}`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ [${label}] 분석 실패: ${err.message}`);
  }
});

// /도움말 — 로직모니터 그룹
bot.onText(/\/도움말(?:@\w+)?|\/help(?:@\w+)?|\/start(?:@\w+)?/, (msg) => {
  if (!isLogicProd(msg) && !isLogicTest(msg)) return;
  const label = getLogicMonitorLabel(msg);
  bot.sendMessage(msg.chat.id, [
    `🤖 로직모니터 [${label}] 봇 명령어`,
    '',
    '/상태 — 서버 상태 확인',
    '/분석 — AI 일일 분석 실행',
    '/도움말 — 이 도움말',
  ].join('\n'));
});

// ============================================================
// === 트래픽 자동주문 그룹 핸들러 ===
// ============================================================

bot.onText(/\/상태(?:@\w+)?/, (msg) => {
  if (!isTraffic(msg)) return;
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  bot.sendMessage(msg.chat.id, `✅ 트래픽 봇 정상\n⏱ 가동시간: ${h}시간 ${m}분`);
});

bot.onText(/\/도움말(?:@\w+)?|\/help(?:@\w+)?|\/start(?:@\w+)?/, (msg) => {
  if (!isTraffic(msg)) return;
  bot.sendMessage(msg.chat.id, [
    '🤖 트래픽 자동주문 봇 명령어',
    '',
    '/상태 — 봇 상태 확인',
    '/도움말 — 이 도움말',
    '',
    '※ 자동주문 기능 개발 예정',
  ].join('\n'));
});

// ============================================================
// === 전 그룹 공통: 인사/일반 메시지 응답 ===
// ============================================================

bot.on('message', (msg) => {
  if (!isAnyGroup(msg)) return;
  if (!msg.text || msg.text.startsWith('/')) return;

  const text = msg.text.trim();
  if (/^(ㅎㅇ|안녕|하이|hi|hello)$/i.test(text)) {
    let greeting = '👋 안녕하세요!';
    if (isLogicProd(msg)) greeting += ' 로직모니터 [본서버] 봇입니다. /도움말';
    else if (isLogicTest(msg)) greeting += ' 로직모니터 [테스트] 봇입니다. /도움말';
    else if (isTraffic(msg)) greeting += ' 트래픽 자동주문 봇입니다. /도움말';
    else if (isAllowed(msg)) greeting += ' 크몽 관리 봇입니다. /도움말';
    bot.sendMessage(msg.chat.id, greeting);
  }
});

// === 대시보드 명령 큐 폴링 (30초마다) ===
async function pollAdCommands() {
  try {
    const { data: commands, error } = await supabase
      .from('kmong_ad_commands')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error || !commands || commands.length === 0) return;

    for (const cmd of commands) {
      // processing으로 상태 변경
      await supabase
        .from('kmong_ad_commands')
        .update({ status: 'processing' })
        .eq('id', cmd.id);

      if (cmd.action === 'on' || cmd.action === 'off') {
        enqueue(async () => {
          try {
            const result = await toggleAd(cmd.product_id, cmd.action);
            await supabase
              .from('kmong_ad_commands')
              .update({
                status: result.success ? 'done' : 'failed',
                result_message: result.message,
                completed_at: new Date().toISOString(),
              })
              .eq('id', cmd.id);

            bot.sendMessage(ALLOWED_CHAT_ID,
              `📱 대시보드 명령 실행: ${cmd.product_id} → ${cmd.action.toUpperCase()}\n${result.message}`
            );
          } catch (err) {
            await supabase
              .from('kmong_ad_commands')
              .update({
                status: 'failed',
                result_message: err.message,
                completed_at: new Date().toISOString(),
              })
              .eq('id', cmd.id);
          }
        });
      }
    }
  } catch (err) {
    console.error('[폴링 에러]', err.message);
  }
}

// 30초마다 대시보드 명령 큐 확인
setInterval(pollAdCommands, 30000);
pollAdCommands(); // 시작 시 즉시 1회

// ═══════════════════════════════════════
// 크몽 자동답변 callback_query 핸들러 (Phase H)
// ═══════════════════════════════════════
const { spawn } = require('child_process');

async function refetchInquiry(id) {
  const { data, error } = await supabase.from('kmong_inquiries').select('*').eq('id', id).single();
  return error ? null : data;
}

function buildReplyCard(inquiry, qualityLabel = '재검토') {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const url = inquiry.conversation_url || 'https://kmong.com/inboxes';
  const text = [
    `💬 <b>신규 문의 #${inquiry.id}</b>  (${qualityLabel})`,
    ``,
    `📝 <b>고객 문의</b>:`,
    esc((inquiry.message_content || '(내용 없음)').slice(0, 500)),
    ``,
    `🔗 ${url}`,
    ``,
    `💡 <b>우리 답변</b>:`,
    `──────────────────`,
    esc(inquiry.auto_reply_text || '(답변 없음)'),
    `──────────────────`,
  ].join('\n');
  const reply_markup = {
    inline_keyboard: [[
      { text: '✅ 발송', callback_data: `kreply_send_${inquiry.id}` },
      { text: '✏️ 수정', callback_data: `kreply_edit_${inquiry.id}` },
      { text: '⏭️ 건너뜀', callback_data: `kreply_skip_${inquiry.id}` },
    ]],
  };
  return { text, reply_markup };
}

// 피드백 로그 헬퍼 (Claude few-shot 학습 재료)
async function logReplyFeedback(inquiryId, action, { originalReply, editedReply, adminId, inquirySnapshot, skipReason, regenReason } = {}) {
  try {
    await supabase.from('kmong_reply_feedback').insert([{
      inquiry_id: inquiryId, action,
      original_reply: originalReply || null,
      edited_reply: editedReply || null,
      skip_reason: skipReason || null,
      regen_reason: regenReason || null,
      admin_id: adminId ? String(adminId) : null,
      inquiry_snapshot: inquirySnapshot || null,
    }]);
  } catch (e) { console.error('[feedback log 실패]', e.message); }
}

async function fetchInquirySnapshot(inquiryId) {
  try {
    const { data } = await supabase.from('kmong_inquiries').select('auto_reply_text, ai_suggested_reply, message, intent, lead_heat, priority, product_id').eq('id', inquiryId).single();
    return data;
  } catch { return null; }
}

bot.on('callback_query', async (query) => {
  const data = query.data || '';
  if (!data.startsWith('kreply_')) return;  // 다른 봇 callback 패스
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const m = data.match(/^kreply_(send|edit|skip|regen)_(\d+)$/);
  if (!m) { bot.answerCallbackQuery(query.id, { text: '잘못된 명령' }); return; }
  const action = m[1];
  const inquiryId = parseInt(m[2], 10);
  const adminId = query.from?.id;

  try {
    if (action === 'send') {
      const snap = await fetchInquirySnapshot(inquiryId);
      const { error } = await supabase.from('kmong_inquiries').update({ auto_reply_status: 'approved' }).eq('id', inquiryId);
      if (error) { bot.answerCallbackQuery(query.id, { text: `DB 오류: ${error.message.slice(0, 50)}` }); return; }
      await logReplyFeedback(inquiryId, 'send', { originalReply: snap?.auto_reply_text, adminId, inquirySnapshot: snap });
      const proc = spawn('node', [path.join(__dirname, 'send-reply.js')], { cwd: __dirname, detached: true, stdio: 'ignore' });
      proc.unref();
      bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: `✅ 발송 승인 (${new Date().toLocaleTimeString('ko-KR')}) — 즉시 발송 중`, callback_data: 'noop' }]] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
      bot.answerCallbackQuery(query.id, { text: '발송 승인 + 즉시 발송 트리거' });
    } else if (action === 'skip') {
      const snap = await fetchInquirySnapshot(inquiryId);
      await supabase.from('kmong_inquiries').update({ auto_reply_status: 'skipped' }).eq('id', inquiryId);
      await logReplyFeedback(inquiryId, 'skip', { originalReply: snap?.auto_reply_text, adminId, inquirySnapshot: snap });
      bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '⏭️ 건너뜀', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
      bot.answerCallbackQuery(query.id, { text: '건너뜀 처리' });
    } else if (action === 'regen') {
      const snap = await fetchInquirySnapshot(inquiryId);
      await logReplyFeedback(inquiryId, 'regen', { originalReply: snap?.auto_reply_text, adminId, inquirySnapshot: snap });
      bot.answerCallbackQuery(query.id, { text: '🔄 재생성 중...' }).catch(() => {});
      bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: `🔄 재생성 중 (${new Date().toLocaleTimeString('ko-KR')})`, callback_data: 'noop' }]] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
      // auto-reply.js를 단일 inquiry ID 재생성 모드로 spawn
      const fs = require('fs');
      const logFile = '/home/onda/logs/kmong-auto-reply-spawn.log';
      fs.appendFileSync(logFile, `\n\n===== regen spawn @ ${new Date().toISOString()} (inquiry #${inquiryId}) =====\n`);
      const out = fs.openSync(logFile, 'a'), err = fs.openSync(logFile, 'a');
      const proc = spawn('node', [path.join(__dirname, 'auto-reply.js')], {
        cwd: __dirname, detached: true, stdio: ['ignore', out, err],
        env: { ...process.env, INQUIRY_ID: String(inquiryId) },
      });
      proc.unref();
    } else if (action === 'edit') {
      bot.answerCallbackQuery(query.id, { text: '수정 모드' }).catch((e) => console.error('[answerCB 실패]', e.code || '', e.message?.slice(0, 80)));
      const preSnap = await fetchInquirySnapshot(inquiryId);
      const promptMsg = await bot.sendMessage(chatId, `✏️ 문의 #${inquiryId} 답변 수정.\n새 답변을 이 메시지에 reply 해주세요. (취소하려면 무시)`, { reply_markup: { force_reply: true, selective: false } });
      bot.onReplyToMessage(chatId, promptMsg.message_id, async (replyMsg) => {
        const newReply = (replyMsg.text || '').trim();
        if (!newReply) { bot.sendMessage(chatId, '⚠️ 빈 메시지 — 수정 취소'); return; }
        const { error } = await supabase.from('kmong_inquiries').update({ auto_reply_text: newReply, auto_reply_status: 'generated' }).eq('id', inquiryId);
        if (error) { bot.sendMessage(chatId, `❌ DB 오류: ${error.message}`); return; }
        await logReplyFeedback(inquiryId, 'edit', { originalReply: preSnap?.auto_reply_text, editedReply: newReply, adminId, inquirySnapshot: preSnap });
        const inq = await refetchInquiry(inquiryId);
        if (inq) {
          const card = buildReplyCard(inq, '✏️ 수정 반영');
          await bot.sendMessage(chatId, card.text, { parse_mode: 'HTML', reply_markup: card.reply_markup, disable_web_page_preview: true });
        }
      });
    }
  } catch (err) {
    console.error('[kreply callback]', err.message);
    bot.answerCallbackQuery(query.id, { text: `오류: ${err.message.slice(0, 50)}` });
  }
});

console.log('=== 크몽 텔레그램 봇 시작 ===');
console.log(`허용 채팅방: ${ALLOWED_CHAT_ID}`);
console.log('명령어: /광고on, /광고off, /광고상태, /매출, /서비스상태, /도움말');

// 에러 핸들링
bot.on('polling_error', (err) => {
  console.error('[폴링 에러]', err.code, err.message);
});

process.on('uncaughtException', (err) => {
  console.error('[비정상 에러]', err.message);
});
