#!/usr/bin/env node
/**
 * 크몽 follow-up 넛지 제안기
 *  - auto_reply_status='sent' 이후 24~72시간 무반응 고객 감지
 *  - 각 케이스별 맞춤 넛지 문안을 Haiku로 생성
 *  - Telegram 카드로 관리자 검수 (자동 발송 없음 — 사용자가 복사해서 수동 발송 또는 [발송] 버튼)
 *  - notes JSON에 nudge_sent_at 기록해 중복 방지
 *
 *  cron 추천: 매일 오전 10시 1회 (영업시간 내)
 */
const { supabase } = require('./lib/supabase');
const { askClaude } = require('./lib/claude-max');
const { notify, sendCard } = require('./lib/telegram');
const { getCategoryById, getGigUrlById } = require('./lib/product-map');

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SYSTEM = `당신은 ONDA 마케팅의 크몽 판매자입니다. 24시간 이상 고객 반응이 없는 대화에 보낼 "부드러운 넛지" 문안을 한국어로 작성하세요.

규칙:
- 재촉 X, 부담 X, 확인 요청 O
- 우리가 직전에 안내한 핵심 포인트 1개 재요약 + "혹시 결정에 필요한 추가 정보 있으신가요?" 식 오픈 질문
- 2~4문장, CTA 1개, 이모지 금지 (":)" 만 허용)
- 첫 인사 생략 (이미 대화 중)
- 본문만 출력, 주석 없이`;

/**
 * 후속 메시지 여부 체크 — 같은 customer의 더 최근 inquiry가 있으면 이미 답변한 상태
 */
async function hasCustomerReplied(customerName, sentAt) {
  const { data } = await supabase
    .from('kmong_inquiries')
    .select('id, inquiry_date')
    .eq('customer_name', customerName)
    .gt('inquiry_date', sentAt)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function main() {
  console.log('=== 크몽 follow-up 넛지 제안 시작 ===');
  const now = Date.now();
  const h24ago = new Date(now - 24 * 3600 * 1000).toISOString();
  const h72ago = new Date(now - 72 * 3600 * 1000).toISOString();

  // sent 상태 + 24~72h 사이 (너무 오래된 건 넛지 의미 없음)
  const { data: sentList, error } = await supabase
    .from('kmong_inquiries')
    .select('*')
    .eq('auto_reply_status', 'sent')
    .gte('inquiry_date', h72ago)
    .lte('inquiry_date', h24ago)
    .order('inquiry_date', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[에러]', error.message);
    notify(`넛지 조회 실패: ${error.message}`);
    process.exit(1);
  }

  if (!sentList || sentList.length === 0) {
    console.log('[정보] 24~72h 무반응 후보 없음');
    return;
  }

  console.log(`[조회] 후보 ${sentList.length}건`);

  let nudgeCount = 0;
  for (const inq of sentList) {
    // 이미 넛지 보낸 경우 스킵
    let meta = {};
    try { meta = inq.notes ? JSON.parse(inq.notes) : {}; } catch {}
    if (meta.nudge_sent_at) {
      console.log(`[스킵] #${inq.id} 이미 넛지 발송 (${meta.nudge_sent_at})`);
      continue;
    }

    // 고객이 이미 답장했으면 스킵 (새 inquiry 있음)
    const replied = await hasCustomerReplied(inq.customer_name, inq.inquiry_date);
    if (replied) {
      console.log(`[스킵] #${inq.id} 고객이 답장함 (${inq.customer_name})`);
      continue;
    }

    console.log(`\n[넛지] #${inq.id} — ${inq.customer_name}`);

    // 넛지 문안 생성
    const lastReply = inq.auto_reply_text || '';
    const userMsg = `[상황]
- 우리가 ${Math.floor((now - new Date(inq.inquiry_date).getTime()) / 3600000)}시간 전 마지막 답변을 보냈고 고객 반응 없음
- 서비스: ${meta.service_title || getCategoryById(inq.product_id) || '홈페이지 제작'}

[우리 마지막 답변 (요약)]
${String(lastReply).slice(0, 600)}

[고객 이전 마지막 메시지]
${String(inq.message_content || '').slice(0, 400)}

위 맥락에 맞춰 부드러운 넛지 1통을 작성하세요.`;

    const r = await askClaude({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      model: 'haiku',
      max_tokens: 400,
      temperature: 0.3,
    });

    if (!r.ok || !r.text) {
      console.log(`  ⚠️ Haiku 실패: ${r.error || 'empty'}`);
      continue;
    }

    const nudgeText = r.text.trim();
    console.log(`  ✓ 넛지 생성 (${nudgeText.length}자, ${r.model})`);

    // notes에 nudge_sent_at 기록 (텔레그램 보고 시점 기준)
    meta.nudge_sent_at = new Date().toISOString();
    meta.nudge_text = nudgeText;
    const { error: upErr } = await supabase
      .from('kmong_inquiries')
      .update({ notes: JSON.stringify(meta) })
      .eq('id', inq.id);
    if (upErr) console.log(`  ⚠️ notes 업데이트 실패: ${upErr.message}`);

    // 텔레그램 카드 발송 (사용자 검수)
    const gigUrl = meta.gig_url || getGigUrlById(inq.product_id);
    const convUrl = inq.conversation_url || 'https://kmong.com/inboxes';
    const hoursAgo = Math.floor((now - new Date(inq.inquiry_date).getTime()) / 3600000);
    const card = [
      `⏰ <b>24h+ 무반응 고객 넛지 제안 #${inq.id}</b>`,
      `고객: <b>${esc(inq.customer_name)}</b> · ${hoursAgo}시간 전 마지막 답변`,
      meta.service_title ? `서비스: ${esc(meta.service_title)}` : null,
      gigUrl ? `📎 ${gigUrl}` : null,
      `💬 대화방: ${convUrl}`,
      ``,
      `📝 <b>고객 마지막 메시지</b>:`,
      esc((inq.message_content || '').slice(0, 400)),
      ``,
      `💡 <b>우리 마지막 답변</b>:`,
      esc(lastReply.slice(0, 500)),
      ``,
      `✨ <b>넛지 제안 (복사해서 보내세요)</b>:`,
      `──────────────────`,
      esc(nudgeText),
      `──────────────────`,
      `⚠️ 이 메시지는 자동 발송되지 않음 — 위 문구 검토 후 크몽 대화방에 직접 붙여넣기`,
    ].filter(Boolean).join('\n');

    await sendCard(card);
    nudgeCount++;
  }

  const msg = `크몽 넛지 제안: ${nudgeCount}건 발송 (후보 ${sentList.length}건 중)`;
  console.log(`\n=== ${msg} ===`);
  if (nudgeCount > 0) notify(msg);
}

main().catch(e => {
  console.error('[에러]', e.message);
  notify(`크몽 넛지 실패: ${e.message}`);
  process.exit(1);
});
