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
const { analyzeInquiry, selectBestTemplate, renderTemplate, getServiceStats, calculateReplyQuality, getRecentApprovedReplies, getSimilarApprovedReplies } = require('./lib/reply-generator');
const { getCategoryById, getGigUrlById } = require('./lib/product-map');
const { askClaude } = require('./lib/claude-max');

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

      // 2-0. 기존 고객의 후속 문의인지 판단 (같은 customer_name의 과거 inquiry 카운트)
      const { count: priorCount } = await supabase
        .from('kmong_inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('customer_name', inquiry.customer_name)
        .lt('inquiry_date', inquiry.inquiry_date);
      const isFollowUp = (priorCount || 0) >= 1;
      console.log(`  이전 문의 ${priorCount || 0}건 → ${isFollowUp ? 'follow_up 모드' : 'first_contact 모드'}`);

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

      // 2-2. 학습 — 현재 질문과 유사한 과거 sent 답변 (키워드 매칭 + 같은 product 보너스)
      let approvedExamples = [];
      const similar = await getSimilarApprovedReplies(inquiry.message_content, inquiry.product_id, 3);
      if (similar.length > 0) {
        approvedExamples = similar;
        console.log(`  학습참고: 유사 답변 ${similar.length}건 (score=${similar.map(s => s.score).join(',')})`);
      } else if (inquiry.product_id) {
        // 유사 답변 없으면 같은 서비스 최근 답변으로 톤 학습
        const learn = await getRecentApprovedReplies(inquiry.product_id, 3);
        if (learn.ok) approvedExamples = learn.examples;
      }

      // 3. Rule-based 답변 먼저 생성 (fallback + 품질 평가용)
      const isWebInquiry = /홈페이지|랜딩|워드프레스|반응형|HTML|SEO|유지보수|카페24|아임웹/.test(analysis.serviceType || '');
      const template = isWebInquiry ? await selectBestTemplate('first_contact', '신규제작') : null;

      let replyText;
      let replySource = 'rule';
      let claudeModel = null;
      if (template) {
        console.log(`  템플릿: ${template.template_name} (전환율 ${template.conversion_rate}%)`);
        replyText = renderTemplate(template, {
          '{inquiry_topic}': analysis.serviceType,
          '{answer_to_question}': analysis.answer,
        });
      } else {
        const priceGuide = statsText ? `\n참고로 비슷한 구성의 최근 계약은 ${statsText} 범위였습니다.\n` : '';
        replyText = `안녕하세요! ${analysis.serviceType} 문의 감사합니다.\n\n${analysis.answer}${priceGuide}\n딱 맞는 상품으로 안내드리려고 하는데요, 몇 가지만 여쭤볼게요.\n\n1. 한 페이지에 다 담을까요, 메뉴별로 나눌까요?\n2. 납품 후 사진이나 문구를 직접 바꿀 일이 있으실까요?\n3. 아래 추가 기능 중 필요한 게 있으시면 골라주세요\n   - 카카오채널 연동\n   - 네이버예약 연동\n   - 인스타그램 피드 연동\n   - SEO 심화 최적화\n\n말씀해주세요!`;
      }

      // 3-1. Rule-based 답변 품질 평가
      const quality = calculateReplyQuality(analysis, replyText);
      console.log(`  rule 품질점수: ${quality.score}/100 (${quality.reasons.join(', ')})`);

      // 3-2. Claude가 항상 답변 생성 (rule-based는 Claude 실패 시 fallback만)
      //   이유: 모든 문의는 고객 메시지를 맥락 정확히 읽어야 답변이 틀리지 않음 — rule 키워드 매칭은 의도 왜곡 위험
      const isUnmappedProduct = !productCategory || /^\d+$/.test(String(inquiry.product_id || ''));
      if (isUnmappedProduct) console.log(`  ℹ️ 미매핑 product_id — service_title 기반 처리`);
      const needsClaude = true;
      if (needsClaude) {
        // 메타 JSON에서 서비스 제목 가져오기
        let meta = {};
        try { meta = inquiry.notes ? JSON.parse(inquiry.notes) : {}; } catch {}
        const serviceTitle = meta.service_title || analysis.serviceType || '홈페이지 제작';

        // few-shot: 최근 sent 답변 2개만 스타일 참고
        const fewShot = approvedExamples.slice(0, 2).map((e, i) =>
          `[예시${i + 1}] 고객: ${String(e.message_content || '').slice(0, 120)}\n   답변: ${String(e.auto_reply_text || '').slice(0, 400)}`
        ).join('\n\n');

        const sys = `당신은 ONDA 마케팅의 크몽 판매 담당자입니다. 고객이 우리 크몽 서비스 페이지에서 문의를 보낸 상황입니다. 목표는 문의를 계약으로 전환하는 것.

★ 필수 절차 (답변 쓰기 전) ★
1. 고객 문의 내용을 끝까지 정확히 읽는다
2. 고객이 실제 말한 의도를 파악한다 (서비스 페이지 제목과 다를 수 있음 — 실제 메시지 우선)
3. 직전 대화 맥락(있으면)과 연결한다
4. 그런 다음 답변 작성 — 맥락과 어긋나면 신뢰 즉시 추락

답변 규칙:
- 한국어, 3~6문장. 이모지 금지(":)"는 허용). 긴 번호 리스트 피하기
- 첫 문의만 "안녕하세요!" 인사, 후속 문의는 바로 본론
- 고객 실제 의도(메시지 내용)를 서비스 페이지 제목보다 우선 판독
- 외부 플랫폼이나 경쟁사를 추천하지 말 것 — 우리 서비스로 끌어오기
- 아임웹/카페24/워드프레스 등 경쟁 플랫폼 언급 시 "우리가 대신 해드립니다" 로 받아치기
- 항상 다음 스텝 제시: 견적 요청 / 참고자료 / 상담 예약 등 CTA 포함

ONDA 강점 (필요시 자연스럽게 녹이기):
- 코딩 방식 제작 → 호스팅 무료, 디자인 자유도 100%
- 관리자 CMS 제공 → 고객이 직접 수정 가능
- 반응형 (PC·모바일·태블릿), 7일 무상 수정, 도메인 연결 대행
- 가격: STANDARD 12만 / DELUXE 20만 / PREMIUM 35만 (구성에 따라 조정)
- 아임웹/카페24 이전도 가능 (기존 콘텐츠 유지 + 디자인 개선 + 월 호스팅비 0원)

문의 유형별 톤:
- 견적/가격 질문 → 구성 3단계 가격 + 옵션 비용 제시
- 기간 질문 → "3~7일 내" + 작업 단계 요약
- 기능 추가 → 가능 여부 + 옵션 가격
- 타 플랫폼 이전 → "우리가 대신 이전 + 디자인 개선 + 월 비용 0원" 어필
- 막연한 문의 → 업종/용도/참고 사이트 3개 질문으로 되물어서 견적 안내 유도`;

        // 대화 맥락: notes에 저장된 thread에서 현재 메시지를 제외한 이전 히스토리
        const thread = Array.isArray(meta.conversation_thread) ? meta.conversation_thread : [];
        let historyBlock = '';
        if (thread.length > 1) {
          const history = thread.slice(-10, -1);  // 직전 최대 9개 (현재 메시지 제외)
          historyBlock = '\n[직전 대화 히스토리 (오래된 → 최신)]\n' + history.map((m, i) =>
            `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${m.content.slice(0, 200)}`
          ).join('\n');
        }

        const taskContext = [
          `문의 모드: ${isFollowUp ? '후속 문의 (인사 생략)' : '첫 문의'}`,
          `고객이 본 서비스 페이지 제목: ${serviceTitle}`,
          isUnmappedProduct
            ? `⚠️ 이 서비스는 내부 카테고리에 아직 매핑 안 됨 — 페이지 제목을 전적으로 의존해서 맥락 파악하세요`
            : `매핑 카테고리: ${analysis.serviceType}`,
          statsText ? `거래 통계: ${statsText}` : null,
          historyBlock || null,
          fewShot ? `\n최근 합격 답변 톤 참고:\n${fewShot}` : null,
        ].filter(Boolean).join('\n');

        const userMsg = `${taskContext}\n\n[지금 답변해야 할 고객 메시지]\n${inquiry.message_content || '(내용 없음)'}\n\n위 고객 메시지에 대한 답변을 작성해주세요. 직전 대화 히스토리가 있으면 반드시 연결되게 답변하고, 설명이나 주석 없이 답변 본문만 출력하세요.`;

        console.log(`  🤖 Claude 호출 (${isFollowUp ? 'follow_up' : 'first/low-score'}) — model=sonnet`);
        const c = await askClaude({ system: sys, messages: [{ role: 'user', content: userMsg }], model: 'sonnet', max_tokens: 600, temperature: 0.4 });
        if (c.ok && c.text && c.text.length >= 40) {
          replyText = c.text.trim();
          replySource = 'claude';
          claudeModel = c.model;
          console.log(`  ✓ Claude 답변 생성 (${replyText.length}자, tokens in=${c.usage?.input_tokens} out=${c.usage?.output_tokens})`);
        } else {
          console.log(`  ⚠️ Claude 실패 → rule-based 유지: ${c.error || '응답 너무 짧음'}`);
        }
      }

      const needsManual = quality.score < 60 && replySource === 'rule';

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
      const sourceLabel = replySource === 'claude' ? `🤖 Claude ${claudeModel}` : `📋 rule ${quality.score}점`;
      const qualityLabel = needsManual ? `⚠️ 직접 작성 권장 · ${sourceLabel}` : sourceLabel;
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
