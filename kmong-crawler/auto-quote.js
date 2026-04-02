#!/usr/bin/env node
/**
 * 크몽 Phase 2 — 자동 견적 생성
 * 1. 고객이 답변한 메시지 감지 (auto_reply_status = 'sent' + 후속 메시지 있음)
 * 2. 답변 내용 파싱 → 패키지/옵션 자동 판단
 * 3. 견적 메시지 자동 생성
 * 4. 텔레그램에 견적 미리보기 발송 (검수)
 *
 * v1: 관리자가 텔레그램에서 보고 크몽에 직접 복붙
 */

const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');
const { parseQuoteInfo, generateQuoteMessage } = require('./lib/reply-generator');

function formatNumber(n) {
  return n.toLocaleString('ko-KR');
}

async function autoQuote() {
  const startTime = Date.now();

  try {
    console.log('=== 크몽 자동 견적 생성 시작 ===');

    // 1. 고객 답변이 있는 문의 조회
    // auto_reply_status가 'generated' 또는 'sent'이고 message_content에 고객 답변이 있는 건
    const { data: inquiries, error: fetchErr } = await supabase
      .from('kmong_inquiries')
      .select('*')
      .in('auto_reply_status', ['generated', 'sent'])
      .not('message_content', 'is', null)
      .order('inquiry_date', { ascending: false })
      .limit(10);

    if (fetchErr) {
      throw new Error(`문의 조회 실패: ${fetchErr.message}`);
    }

    if (!inquiries || inquiries.length === 0) {
      console.log('[정보] 견적 생성 대상 없음');
      return;
    }

    console.log(`[조회] 견적 대상 ${inquiries.length}건`);

    let generatedCount = 0;

    for (const inquiry of inquiries) {
      // 이미 견적이 있으면 스킵
      const { data: existingQuote } = await supabase
        .from('kmong_reply_history')
        .select('id')
        .eq('inquiry_id', inquiry.id)
        .eq('notes', 'quote')
        .limit(1);

      if (existingQuote && existingQuote.length > 0) {
        console.log(`[스킵] 이미 견적 생성됨: #${inquiry.id}`);
        continue;
      }

      console.log(`\n[처리] #${inquiry.id} — ${inquiry.customer_name}`);

      // 2. 고객 답변 파싱
      const quoteInfo = parseQuoteInfo(inquiry.message_content);

      if (!quoteInfo) {
        console.log(`  [스킵] 견적 정보 파싱 실패`);
        continue;
      }

      console.log(`  패키지: ${quoteInfo.packageType} (${formatNumber(quoteInfo.package.price)}원)`);
      console.log(`  옵션: ${quoteInfo.selectedOptions.map(o => o.name).join(', ') || '없음'}`);
      console.log(`  합계: ${formatNumber(quoteInfo.total)}원`);

      // 3. 견적 메시지 생성
      const quoteText = generateQuoteMessage(quoteInfo);

      // 4. reply_history에 기록
      await supabase.from('kmong_reply_history').insert({
        inquiry_id: inquiry.id,
        reply_text: quoteText,
        notes: 'quote',
      });

      // 5. 텔레그램 견적 미리보기 발송
      const preview = [
        `크몽 자동 견적 생성`,
        ``,
        `고객: ${inquiry.customer_name}`,
        `고객 답변: "${(inquiry.message_content || '').substring(0, 150)}"`,
        ``,
        `감지 패키지: ${quoteInfo.packageType} (${formatNumber(quoteInfo.package.price)}원)`,
        quoteInfo.selectedOptions.length > 0
          ? `추가 옵션: ${quoteInfo.selectedOptions.map(o => `${o.name}(+${formatNumber(o.price)}원)`).join(', ')}`
          : '',
        `합계: ${formatNumber(quoteInfo.total)}원`,
        ``,
        `자동 생성 견적:`,
        `──────────────────`,
        quoteText,
        `──────────────────`,
        ``,
        `문의 ID: #${inquiry.id}`,
        `크몽에서 위 견적을 복붙하거나 수정하여 발송해주세요.`,
      ].filter(Boolean).join('\n');

      notify(preview);
      generatedCount++;
      console.log(`  [완료] 견적 생성 + 텔레그램 발송`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 자동견적: ${generatedCount}건 생성 완료 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    if (generatedCount > 0) notify(msg);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 자동견적 실패: ${err.message}`);
    process.exit(1);
  }
}

autoQuote();
