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

const https = require('https');
const fs = require('fs');
const path = require('path');
const { supabase } = require('./lib/supabase');
const { notify, sendCard } = require('./lib/telegram');
const { analyzeInquiry, selectBestTemplate, renderTemplate, getServiceStats, calculateReplyQuality, getRecentApprovedReplies, getSimilarApprovedReplies } = require('./lib/reply-generator');
const { getCategoryById, getGigUrlById } = require('./lib/product-map');
const { askClaude } = require('./lib/claude-max');
const { formatGigDetailForPrompt } = require('./lib/gig-detail');

// HTML 이스케이프
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 로컬 파일 → {base64, media_type} (크몽 원본 첨부 로드)
function readLocalAsBase64(localPath, fileName) {
  try {
    const stat = fs.statSync(localPath);
    const buf = fs.readFileSync(localPath);
    const ext = (fileName || localPath).toLowerCase().match(/\.(png|jpe?g|gif|webp)$/);
    const media_type = ext
      ? (ext[1] === 'jpg' ? 'image/jpeg' : `image/${ext[1]}`)
      : 'image/png';
    return { ok: true, base64: buf.toString('base64'), media_type, bytes: stat.size };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 이미지 URL → {base64, media_type} (폴백: local_path 없을 때만 썸네일 사용)
function fetchImageAsBase64(url, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve({ ok: false, error: `HTTP ${res.statusCode}` });
        return;
      }
      const ct = res.headers['content-type'] || '';
      const chunks = []; let total = 0;
      res.on('data', (c) => {
        total += c.length;
        if (total > maxBytes) { res.destroy(); resolve({ ok: false, error: `too large (>${maxBytes})` }); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // URL 확장자로 폴백 추정
        const ext = (url.match(/\.(png|jpe?g|gif|webp)(\?|$)/i) || [])[1]?.toLowerCase();
        const media_type = ct.startsWith('image/') ? ct.split(';')[0] :
          (ext === 'jpg' ? 'image/jpeg' : ext ? `image/${ext}` : 'image/png');
        resolve({ ok: true, base64: buf.toString('base64'), media_type, bytes: buf.length });
      });
      res.on('error', (e) => resolve({ ok: false, error: e.message }));
    }).on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

async function autoReply() {
  const startTime = Date.now();

  try {
    // regen 모드: 특정 inquiry ID 하나만 재생성 (status 무관)
    const regenId = process.env.INQUIRY_ID ? parseInt(process.env.INQUIRY_ID, 10) : null;
    console.log(`=== 크몽 자동 답변 생성 시작 ===${regenId ? ` (🔄 regen #${regenId})` : ''}`);

    // 1. 문의 조회 — regen이면 단건, 아니면 pending 전체
    const query = supabase.from('kmong_inquiries').select('*');
    const { data: newInquiries, error: fetchErr } = regenId
      ? await query.eq('id', regenId).limit(1)
      : await query.eq('status', 'new').eq('auto_reply_status', 'pending').order('inquiry_date', { ascending: false }).limit(10);

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
- 구체 가격은 반드시 [크몽 서비스 스펙] 블록의 패키지 price 값 사용
- 아임웹/카페24 이전도 가능 (기존 콘텐츠 유지 + 디자인 개선 + 월 호스팅비 0원)

문의 유형별 톤:
- 견적/가격 질문 → 구성 3단계 가격 + 옵션 비용 제시
- 기간 질문 → "3~7일 내" + 작업 단계 요약
- 기능 추가 → 가능 여부 + 옵션 가격
- 타 플랫폼 이전 → "우리가 대신 이전 + 디자인 개선 + 월 비용 0원" 어필
- 막연한 문의 → 업종/용도/참고 사이트 3개 질문으로 되물어서 견적 안내 유도

★ 짧은 반문/되물음 특별 규칙 ★
고객이 "네?", "ㅎㅇ", "?", "무슨 말씀이세요", "이해가 안 가요" 같은 짧은 반문을 했을 때:
- 직전 우리 답변(assistant role)을 반드시 먼저 확인
- "어떤 부분이 궁금하신가요?" 같은 열린 질문 금지 — 우리가 보낸 내용 중 어느 부분이 모호했을지 직접 추론해서 구체적으로 재설명
- 예시: 직전에 "3단계 패키지 12/20/35만원" 안내했는데 고객이 "네?" → "혹시 어떤 패키지가 적당한지 궁금하신 건가요? 아니면 가격 구성이 이해 안 되셨나요? 타이어공장 규모면 STANDARD 12만원(메인 1P + CMS)이 가장 많이 선택하세요. 참고할 자사 홈페이지 링크나 희망하는 페이지 수만 알려주시면 바로 안내드리겠습니다."
- 즉 재설명 + 2~3개 선택지 + 다음 스텝 제시 구조`;

        // 대화 맥락: notes에 저장된 thread에서 현재 메시지를 제외한 이전 히스토리
        const thread = Array.isArray(meta.conversation_thread) ? meta.conversation_thread : [];
        let historyBlock = '';
        if (thread.length > 1) {
          const history = thread.slice(-10, -1);  // 직전 최대 9개 (현재 메시지 제외)
          historyBlock = '\n[직전 대화 히스토리 (오래된 → 최신)]\n' + history.map((m, i) =>
            `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${m.content.slice(0, 200)}`
          ).join('\n');
        }

        // 실시간 gig 상세 (crawl-inbox가 매번 fetch 해서 notes.gig_detail에 저장)
        const gigDetailBlock = meta.gig_detail ? formatGigDetailForPrompt(meta.gig_detail) : '';

        const taskContext = [
          `문의 모드: ${isFollowUp ? '후속 문의 (인사 생략)' : '첫 문의'}`,
          `고객이 본 서비스 페이지 제목: ${serviceTitle}`,
          isUnmappedProduct
            ? `⚠️ 이 서비스는 내부 카테고리에 아직 매핑 안 됨 — 페이지 제목을 전적으로 의존해서 맥락 파악하세요`
            : `매핑 카테고리: ${analysis.serviceType}`,
          statsText ? `거래 통계: ${statsText}` : null,
          gigDetailBlock ? `\n${gigDetailBlock}` : null,
          historyBlock || null,
          fewShot ? `\n최근 합격 답변 톤 참고:\n${fewShot}` : null,
        ].filter(Boolean).join('\n');

        // 고객 첨부 이미지 수집 (Vision)
        //  로딩 우선순위: local_path(크몽 원본 다운로드) → preview_url(160x120 썸네일 폴백)
        const rawAttachments = Array.isArray(meta.attachments) ? meta.attachments : [];
        const imageAttachments = rawAttachments.filter(a => {
          const name = String(a.file_name || a.preview_url || a.local_path || '');
          return /\.(png|jpe?g|gif|webp)$/i.test(name);
        }).slice(0, 5);
        const imageBlocks = [];
        for (const att of imageAttachments) {
          let r;
          if (att.local_path && fs.existsSync(att.local_path)) {
            r = readLocalAsBase64(att.local_path, att.file_name);
            if (r.ok) console.log(`  📎 이미지 로드(원본): ${att.file_name} (${r.media_type}, ${r.bytes} bytes)`);
          } else if (att.preview_url) {
            r = await fetchImageAsBase64(att.preview_url);
            if (r.ok) console.log(`  📎 이미지 로드(썸네일): ${att.file_name} (${r.media_type}, ${r.bytes} bytes) — 원본 없음`);
          } else {
            r = { ok: false, error: 'local_path/preview_url 모두 없음' };
          }
          if (r.ok) {
            imageBlocks.push({
              type: 'image',
              source: { type: 'base64', media_type: r.media_type, data: r.base64 },
              _meta: { file_name: att.file_name, bytes: r.bytes },
            });
          } else {
            console.log(`  ⚠️ 이미지 로드 실패: ${att.file_name} — ${r.error}`);
          }
        }
        const attachNote = imageBlocks.length > 0
          ? `\n\n[고객 첨부 이미지 ${imageBlocks.length}장]\n아래 이미지는 이번 문의에 고객이 첨부한 파일입니다 (${imageBlocks.map(b => b._meta.file_name).join(', ')}). 답변 작성 전 반드시 이미지 내용을 정확히 관찰하고, 거기에 담긴 정보(레이아웃/구조표/화면/참고자료 등)를 답변에 구체적으로 반영하세요. "첨부 잘 받았습니다"로 끝내지 말고, 이미지에서 파악한 핵심을 2~3가지 짚어주고 다음 스텝으로 연결하세요.`
          : '';

        const userMsg = `${taskContext}\n\n[지금 답변해야 할 고객 메시지]\n${inquiry.message_content || '(내용 없음)'}${attachNote}\n\n위 고객 메시지에 대한 답변을 작성해주세요. 직전 대화 히스토리가 있으면 반드시 연결되게 답변하고, 설명이나 주석 없이 답변 본문만 출력하세요.`;

        // regen 모드: 사용자가 "맥락에 안 맞는다"고 판단한 상황 → temperature 올리고 명시적 instruction 추가
        const claudeTemp = regenId ? 0.7 : 0.4;
        const regenHint = regenId ? '\n\n⚠️ 직전 답변이 맥락에 맞지 않았습니다. 고객 메시지를 다시 정확히 읽고 새롭게 작성하되, 이전 답변과 구조·어조·강조점이 다르도록 해주세요.' : '';
        const finalUserMsg = userMsg + regenHint;

        // content 구성: 이미지 블록(있으면) + 텍스트 블록
        //   _meta 필드는 Anthropic API에 보내기 전 제거
        const contentArr = [
          ...imageBlocks.map(b => ({ type: b.type, source: b.source })),
          { type: 'text', text: finalUserMsg },
        ];

        console.log(`  🤖 Claude 호출 (${regenId ? 'regen' : (isFollowUp ? 'follow_up' : 'first/low-score')}) — model=sonnet, temp=${claudeTemp}, images=${imageBlocks.length}`);
        const c = await askClaude({ system: sys, messages: [{ role: 'user', content: contentArr }], model: 'sonnet', max_tokens: 600, temperature: claudeTemp });
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
      const cardAttachments = Array.isArray(meta.attachments) ? meta.attachments : [];
      const attachLine = cardAttachments.length > 0
        ? `🖼️ 첨부 ${cardAttachments.length}개: ${cardAttachments.map(a => esc(a.file_name || '파일')).join(', ')}`
        : null;
      const card = [
        `💬 <b>신규 문의 #${inquiry.id}</b>  (${qualityLabel})`,
        ``,
        `📝 <b>고객 문의</b>:`,
        esc((inquiry.message_content || '(내용 없음)').slice(0, 500)),
        ``,
        serviceTitle ? `🔗 <b>문의 서비스</b>: ${esc(serviceTitle)}` : `🔗 <b>서비스</b>: ${esc(analysis.serviceType)}`,
        statsText ? `📊 거래통계: ${esc(statsText)}` : null,
        attachLine,
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
            { text: '🔄 재생성', callback_data: `kreply_regen_${inquiry.id}` },
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
