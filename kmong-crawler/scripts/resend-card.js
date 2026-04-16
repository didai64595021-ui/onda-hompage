#!/usr/bin/env node
/**
 * 단발 텔레그램 카드 재전송: 이미 생성된 auto_reply_text를 다시 발송한다.
 * 사용: node scripts/resend-card.js <inquiry_id>
 * 용도: 답변은 생성됐으나 텔레그램 ETIMEDOUT으로 카드가 안 간 경우 복구
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase } = require('../lib/supabase');
const { sendCard } = require('../lib/telegram');
const { getGigUrlById } = require('../lib/product-map');

const id = parseInt(process.argv[2], 10);
if (!id) { console.error('usage: node scripts/resend-card.js <inquiry_id>'); process.exit(1); }

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  const { data: row, error } = await supabase
    .from('kmong_inquiries')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !row) { console.error('row 조회 실패:', error?.message); process.exit(2); }
  if (!row.auto_reply_text) { console.error(`#${id} auto_reply_text 비어있음 — 재생성 필요`); process.exit(3); }

  let meta = {};
  try { meta = row.notes ? JSON.parse(row.notes) : {}; } catch {}
  const gigUrl = meta.gig_url || getGigUrlById(row.product_id);
  const serviceTitle = meta.service_title || '';
  const conversationUrl = row.conversation_url || 'https://kmong.com/inboxes';
  const attachments = Array.isArray(meta.attachments) ? meta.attachments : [];
  const attachLine = attachments.length > 0
    ? `🖼️ 첨부 ${attachments.length}개: ${attachments.map(a => esc(a.file_name || '파일')).join(', ')}`
    : null;

  const sourceLabel = `🔁 재전송 (원래 ${row.auto_reply_status})`;
  const card = [
    `💬 <b>신규 문의 #${row.id}</b>  (${sourceLabel})`,
    ``,
    `📝 <b>고객 문의</b>:`,
    esc((row.message_content || '(내용 없음)').slice(0, 500)),
    ``,
    serviceTitle ? `🔗 <b>문의 서비스</b>: ${esc(serviceTitle)}` : null,
    attachLine,
    gigUrl ? `📎 서비스 페이지: ${gigUrl}` : null,
    `💬 대화방: ${conversationUrl}`,
    ``,
    `💡 <b>우리 답변</b>:`,
    `──────────────────`,
    esc(row.auto_reply_text),
    `──────────────────`,
  ].filter(Boolean).join('\n');

  const replyMarkup = {
    inline_keyboard: [
      [{ text: '✅ 발송', callback_data: `kreply_send_${row.id}` }],
      [
        { text: '✏️ 수정', callback_data: `kreply_edit_${row.id}` },
        { text: '🔄 재생성', callback_data: `kreply_regen_${row.id}` },
      ],
    ],
  };

  // 3회 재시도 + backoff
  let result;
  for (let i = 0; i < 3; i++) {
    result = await sendCard(card, replyMarkup);
    if (result?.ok) break;
    console.error(`[시도 ${i + 1}/3 실패] ${result?.error || 'unknown'} — ${i < 2 ? '재시도' : '중단'}`);
    if (i < 2) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  console.log(result?.ok ? `✓ #${id} 텔레그램 카드 재전송 완료` : `✗ #${id} 재전송 실패`);
  process.exit(result?.ok ? 0 : 4);
})().catch(e => { console.error(e); process.exit(5); });
