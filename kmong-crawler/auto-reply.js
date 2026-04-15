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
const { notify, sendCard } = require('./lib/telegram');
const { analyzeInquiry, selectBestTemplate, renderTemplate, getServiceStats, calculateReplyQuality, getRecentApprovedReplies } = require('./lib/reply-generator');
const { getCategoryById, getGigUrlById } = require('./lib/product-map');

// HTML 이스케이프
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

      // 2. 문의 내용 분석 — product_id의 카테고리를 기본 인사말/serviceType으로 주입
      const productCategory = getCategoryById(inquiry.product_id);
      const analysis = analyzeInquiry(inquiry.message_content, productCategory);
      console.log(`  서비스: ${analysis.serviceType}${productCategory ? ' (product_id→category)' : ' (내용 분석)'}`);
      console.log(`  키워드: ${analysis.detectedKeywords.join(', ') || '없음'}`);
      console.log(`  질문 수: ${analysis.questionCount}`);

      // 2-1. 해당 서비스 거래 데이터 참조
      let statsText = '';
      if (inquiry.product_id) {
        const stats = await getServiceStats(inquiry.product_id);
        if (stats) {
          const fmtW = n => (n / 10000).toFixed(0);
          statsText = `평균 ${fmtW(stats.avgAmount)}만원 (${fmtW(stats.minAmount)}~${fmtW(stats.maxAmount)}만원, ${stats.orderCount}건)`;
          console.log(`  거래통계: ${statsText}`);
        }
      }

      // 2-2. 학습 — 같은 서비스의 최근 합격 답변 (Few-shot 참고용)
      let approvedExamples = [];
      if (inquiry.product_id) {
        const learn = await getRecentApprovedReplies(inquiry.product_id, 5);
        if (learn.ok && learn.examples.length > 0) {
          approvedExamples = learn.examples;
          console.log(`  학습참고: 합격답변 ${learn.examples.length}건 (같은상품 ${learn.sameProductCount}건 + 타상품 ${learn.examples.length - learn.sameProductCount}건)`);
        }
      }

      // 3. 최적 템플릿 선택 — 홈페이지/웹 계열 문의일 때만 기존 '신규제작' 템플릿 사용
      // (인스타/디자인 등 다른 서비스는 template=null → 기본 답변으로 fallback하여 서비스 맥락 반영)
      const isWebInquiry = /홈페이지|랜딩|워드프레스|반응형|HTML|SEO|유지보수|카페24|아임웹/.test(analysis.serviceType || '');
      const template = isWebInquiry ? await selectBestTemplate('first_contact', '신규제작') : null;

      let replyText;
      if (template) {
        console.log(`  템플릿: ${template.template_name} (전환율 ${template.conversion_rate}%)`);
        replyText = renderTemplate(template, {
          '{inquiry_topic}': analysis.serviceType,
          '{answer_to_question}': analysis.answer,
        });
      } else {
        // 템플릿 없으면 기본 답변 (거래 데이터 반영)
        const priceGuide = statsText ? `\n참고로 비슷한 구성의 최근 계약은 ${statsText} 범위였습니다.\n` : '';
        replyText = `안녕하세요! ${analysis.serviceType} 문의 감사합니다.\n\n${analysis.answer}${priceGuide}\n딱 맞는 상품으로 안내드리려고 하는데요, 몇 가지만 여쭤볼게요.\n\n1. 한 페이지에 다 담을까요, 메뉴별로 나눌까요?\n2. 납품 후 사진이나 문구를 직접 바꿀 일이 있으실까요?\n3. 아래 추가 기능 중 필요한 게 있으시면 골라주세요\n   - 카카오채널 연동\n   - 네이버예약 연동\n   - 인스타그램 피드 연동\n   - SEO 심화 최적화\n\n말씀해주세요!`;
      }

      // 3-1. 응답 품질 점수 산정
      const quality = calculateReplyQuality(analysis, replyText);
      console.log(`  품질점수: ${quality.score}/100 (${quality.reasons.join(', ')})`);
      const needsManual = quality.score < 60;

      // 4. Supabase 업데이트
      const { error: updateErr } = await supabase
        .from('kmong_inquiries')
        .update({
          auto_reply_text: replyText,
          auto_reply_status: needsManual ? 'needs_review' : 'generated',
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

      // 6. 텔레그램 카드 발송 (인라인 [발송][수정][건너뜀])
      const qualityLabel = needsManual ? '⚠️ 직접 작성 권장' : `✅ 품질 ${quality.score}점`;
      // notes JSON에서 실시간 gig 메타데이터 추출 (crawl-inbox 저장분) + product-map fallback
      let meta = {};
      try { meta = inquiry.notes ? JSON.parse(inquiry.notes) : {}; } catch {}
      const gigUrl = meta.gig_url || getGigUrlById(inquiry.product_id);
      const serviceTitle = meta.service_title || '';
      const conversationUrl = inquiry.conversation_url || 'https://kmong.com/inboxes';
      const card = [
        `💬 <b>신규 문의 #${inquiry.id}</b>  (${qualityLabel})`,
        ``,
        `📝 <b>고객 문의</b>:`,
        esc((inquiry.message_content || '(내용 없음)').slice(0, 500)),
        ``,
        serviceTitle ? `🔗 <b>문의 서비스</b>: ${esc(serviceTitle)}` : `🔗 <b>서비스</b>: ${esc(analysis.serviceType)}`,
        statsText ? `📊 거래통계: ${esc(statsText)}` : null,
        gigUrl ? `📎 서비스 페이지: ${gigUrl}` : null,
        `💬 대화방: ${conversationUrl}`,
        ``,
        `💡 <b>우리 답변</b>:`,
        `──────────────────`,
        esc(replyText),
        `──────────────────`,
      ].filter(Boolean).join('\n');

      const replyMarkup = {
        inline_keyboard: [
          [{ text: '✅ 발송', callback_data: `kreply_send_${inquiry.id}` }],
          [
            { text: '✏️ 수정', callback_data: `kreply_edit_${inquiry.id}` },
            { text: '⏭️ 건너뜀', callback_data: `kreply_skip_${inquiry.id}` },
          ],
        ],
      };
      await sendCard(card, replyMarkup);
      generatedCount++;
      console.log(`  [완료] 답변 생성 + 텔레그램 발송 (품질: ${quality.score}점)`);
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
