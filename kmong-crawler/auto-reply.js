#!/usr/bin/env node
/**
 * 크몽 Phase 2 — 자동 답변 생성 + 텔레그램 미리보기
 * 1. Supabase에서 status='new' & auto_reply_status='pending' 문의 조회
 * 2. 문의 내용 분석 → 키워드 추출 → 서비스 유형 판단
 * 3. 전환율 높은 템플릿 선택 → 답변 생성
 * 4. 텔레그램에 미리보기 발송 (관리자 검수용)
 * 5. auto_reply_status를 'generated'로 업데이트
 *
 * v1: 관리자가 텔레그램에서 보고 크몽에 직접 복붙
 */

const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');
const { analyzeInquiry, selectBestTemplate, renderTemplate } = require('./lib/reply-generator');

async function autoReply() {
  const startTime = Date.now();

  try {
    console.log('=== 크몽 자동 답변 생성 시작 ===');

    // 1. 미처리 문의 조회
    const { data: newInquiries, error: fetchErr } = await supabase
      .from('kmong_inquiries')
      .select('*')
      .eq('status', 'new')
      .eq('auto_reply_status', 'pending')
      .order('inquiry_date', { ascending: false })
      .limit(10);

    if (fetchErr) {
      throw new Error(`문의 조회 실패: ${fetchErr.message}`);
    }

    if (!newInquiries || newInquiries.length === 0) {
      console.log('[정보] 미처리 문의 없음');
      return;
    }

    console.log(`[조회] 미처리 문의 ${newInquiries.length}건`);

    let generatedCount = 0;

    for (const inquiry of newInquiries) {
      console.log(`\n[처리] #${inquiry.id} — ${inquiry.customer_name}`);

      // 2. 문의 내용 분석
      const analysis = analyzeInquiry(inquiry.message_content);
      console.log(`  서비스: ${analysis.serviceType}`);
      console.log(`  키워드: ${analysis.detectedKeywords.join(', ') || '없음'}`);

      // 3. 최적 템플릿 선택
      const template = await selectBestTemplate('first_contact', '신규제작');

      let replyText;
      if (template) {
        console.log(`  템플릿: ${template.template_name} (전환율 ${template.conversion_rate}%)`);
        replyText = renderTemplate(template, {
          '{inquiry_topic}': analysis.serviceType,
          '{answer_to_question}': analysis.answer,
        });
      } else {
        // 템플릿 없으면 기본 답변
        replyText = `안녕하세요! ${analysis.serviceType} 문의 감사합니다.\n\n${analysis.answer}\n\n딱 맞는 상품으로 안내드리려고 하는데요, 몇 가지만 여쭤볼게요.\n\n1. 한 페이지에 다 담을까요, 메뉴별로 나눌까요?\n2. 납품 후 사진이나 문구를 직접 바꿀 일이 있으실까요?\n3. 아래 추가 기능 중 필요한 게 있으시면 골라주세요\n   - 카카오채널 연동\n   - 네이버예약 연동\n   - 인스타그램 피드 연동\n   - SEO 심화 최적화\n\n말씀해주세요!`;
      }

      // 4. Supabase 업데이트
      const { error: updateErr } = await supabase
        .from('kmong_inquiries')
        .update({
          auto_reply_text: replyText,
          auto_reply_status: 'generated',
        })
        .eq('id', inquiry.id);

      if (updateErr) {
        console.error(`  [에러] 업데이트 실패: ${updateErr.message}`);
        continue;
      }

      // 5. reply_history에 기록
      if (template) {
        await supabase.from('kmong_reply_history').insert({
          inquiry_id: inquiry.id,
          template_id: template.id,
          reply_text: replyText,
        });
      }

      // 6. 텔레그램 미리보기 발송
      const preview = [
        `크몽 신규 문의 (자동 답변 생성)`,
        ``,
        `고객: ${inquiry.customer_name}`,
        `문의 내용: "${(inquiry.message_content || '(내용 없음)').substring(0, 100)}"`,
        `감지 서비스: ${analysis.serviceType}`,
        template ? `사용 템플릿: ${template.template_name}` : '',
        ``,
        `자동 생성 답변:`,
        `──────────────────`,
        replyText,
        `──────────────────`,
        ``,
        `문의 ID: #${inquiry.id}`,
        `크몽에서 위 답변을 복붙하거나 수정하여 발송해주세요.`,
      ].filter(Boolean).join('\n');

      notify(preview);
      generatedCount++;
      console.log(`  [완료] 답변 생성 + 텔레그램 발송`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 자동답변: ${generatedCount}건 생성 완료 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    if (generatedCount > 0) notify(msg);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 자동답변 실패: ${err.message}`);
    process.exit(1);
  }
}

autoReply();
