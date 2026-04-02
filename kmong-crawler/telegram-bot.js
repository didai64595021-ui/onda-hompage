#!/usr/bin/env node
/**
 * 크몽 텔레그램 봇 서버
 * - 광고 ON/OFF 제어 (/광고on, /광고off)
 * - 광고 상태 조회 (/광고상태)
 * - 매출 요약 (/매출)
 * - 서비스 심사 상태 (/서비스상태)
 * - 대시보드 명령 큐 처리 (kmong_ad_commands)
 *
 * PM2 상시 구동: kmong-telegram-bot
 */

const TelegramBot = require('node-telegram-bot-api');
const { toggleAd } = require('./toggle-ad');
const { supabase } = require('./lib/supabase');
const { PRODUCT_MAP } = require('./lib/product-map');

// 환경변수에서 봇 토큰 로드
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('[에러] TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다');
  process.exit(1);
}

const ALLOWED_CHAT_ID = -1003753252286; // ONDA 서버 그룹

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    params: { timeout: 30 },
    interval: 2000,
  },
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
