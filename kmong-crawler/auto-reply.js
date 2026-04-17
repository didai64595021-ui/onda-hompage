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
const { extractUrls, summarizeUrl, formatForPrompt } = require('./lib/url-summarizer');
const { extractIntent, formatIntentForPrompt, computeLeadHeat } = require('./lib/intent-extractor');
const { verifyReply } = require('./lib/reply-verifier');
const { findRelevantPortfolios, formatPortfoliosForPrompt } = require('./lib/portfolio-refs');
const { summarizeConversation, formatSummaryForPrompt, THRESHOLD: SUMMARIZE_THRESHOLD } = require('./lib/conversation-summarizer');
const { calculateQuote } = require('./lib/quote-calculator');

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

      // 텔레그램 카드 빌드에서 참조할 수 있도록 scope 상위에 선언
      let intent = null;
      let leadHeat = { score: 0, tier: 'cold', label: '❄️ cold' };
      let verifyResult = null;  // 마지막 self-check 결과

      const needsClaude = true;
      if (needsClaude) {
        // 메타 JSON에서 서비스 제목 가져오기
        let meta = {};
        try { meta = inquiry.notes ? JSON.parse(inquiry.notes) : {}; } catch {}
        const serviceTitle = meta.service_title || analysis.serviceType || '홈페이지 제작';
        const thread = Array.isArray(meta.conversation_thread) ? meta.conversation_thread : [];

        // [1단계] URL 추출 + 요약 (intent extractor와 Claude 메인 둘 다 사용)
        const urlSources = [inquiry.message_content || ''];
        for (const m of thread) {
          if (m.role === 'user' && m.content) urlSources.push(m.content);
        }
        const urls = extractUrls(urlSources.join('\n'));
        let urlBlock = '';
        let urlSummaries = [];
        if (urls.length > 0) {
          console.log(`  🔗 URL ${urls.length}개 발견: ${urls.join(', ')} — 내용 파악 중 (병렬)...`);
          const summaries = await Promise.all(urls.map(u =>
            summarizeUrl(u).catch(e => ({ ok: false, url: u, error: e.message }))
          ));
          for (const s of summaries) {
            if (s.ok) console.log(`    ✓ ${s.url || ''} (${s.source}, body=${s.bodyLen || 0}자)`);
            else console.log(`    ✗ ${s.url || ''}: ${s.error}`);
          }
          urlBlock = formatForPrompt(summaries);
          urlSummaries = summaries.filter(s => s.ok).map(s => ({
            url: s.url, title: s.title || '', body: (s.body || '').slice(0, 400),
          }));
        }

        // [2단계] 첨부 이미지 수 (intent extractor에는 개수만, 메인 Claude는 Vision으로 내용 분석)
        const rawAttachmentsForCount = Array.isArray(meta.attachments) ? meta.attachments : [];
        const imageCountForIntent = rawAttachmentsForCount.filter(a => {
          const name = String(a.file_name || a.preview_url || a.local_path || '');
          return /\.(png|jpe?g|gif|webp)$/i.test(name);
        }).length;

        // [3단계] 의도 추출 (Haiku) — 구조화된 "반드시 답할 질문/사실" 추출
        const intentStart = Date.now();
        const intentR = await extractIntent({
          messageContent: inquiry.message_content || '',
          thread,
          gigTitle: serviceTitle,
          attachmentCount: imageCountForIntent,
          urlSummaries,
        });
        let intentBlock = '';
        if (intentR.ok && intentR.intent) {
          intent = intentR.intent;
          intentBlock = formatIntentForPrompt(intent);
          leadHeat = computeLeadHeat(intent, {
            threadLength: thread.length,
            messageLength: (inquiry.message_content || '').length,
          });
          console.log(`  🎯 의도 추출 (${((Date.now() - intentStart) / 1000).toFixed(1)}s, ${intentR.model || 'haiku'}): primary=${intent.primary_intent}, 감정=${intent.sentiment}, 긴급=${intent.urgency}, 명시질문 ${intent.explicit_questions.length}개, 커버포인트 ${intent.must_address.length}개 (신뢰도 ${intent.confidence})`);
          console.log(`  🌡️ 리드 히트: ${leadHeat.label} (${leadHeat.score}/100)${intent.requires_human ? '  ⚠️ 사람 응대 필요' : ''}`);
        } else {
          console.log(`  ⚠️ 의도 추출 실패 → 메인 프롬프트만으로 진행: ${intentR.error || 'unknown'}`);
        }

        // 포트폴리오 요청이거나 고객이 업종 명시한 경우 → 실존 포트폴리오 주입 (할루시네이션 방지)
        let portfolioBlock = '';
        const needsPortfolio = intent && (
          intent.primary_intent === 'portfolio_request' ||
          /포트폴리오|사례|레퍼런스|실적|견본/.test(inquiry.message_content || '')
        );
        if (needsPortfolio) {
          const industryHint = [inquiry.message_content || '', ...(intent?.customer_facts || [])].join(' ');
          const refs = findRelevantPortfolios(industryHint, 3);
          portfolioBlock = formatPortfoliosForPrompt(refs);
          console.log(`  📁 포트폴리오 레퍼런스 주입: ${refs.map(r => r.industry).join(', ')}`);
        }

        // 가격/견적 의도면 자동 견적 계산 → Claude 프롬프트에 숫자 명시 (hallucination 방지)
        let quoteBlock = '';
        const needsQuote = intent && (
          ['price', 'spec_confirm', 'feature_ask'].includes(intent.primary_intent) ||
          /견적|가격|비용|얼마|패키지/.test(inquiry.message_content || '')
        );
        if (needsQuote) {
          const calcInput = [inquiry.message_content || '', ...(intent?.customer_facts || []), ...(intent?.explicit_questions || [])].join(' ');
          const q = calculateQuote(calcInput);
          if (q && q.total > 0) {
            quoteBlock = q.breakdown;
            console.log(`  💰 견적 자동 계산: ${q.package ? q.package.name : '패키지미정'} + 옵션 ${q.options.length}개 = 총 ${(q.total / 10000).toFixed(0)}만원`);
          }
        }

        // [4단계] 대화 히스토리 블록 구성
        //   thread 길이 ≥6 → 이전 메시지는 구조화 요약, 최신 2개만 원문 (토큰 절약 + 집중도↑)
        //   < 6 → 전부 원문 (요약 오버헤드 불필요)
        let historyBlock = '';
        let summaryBlock = '';
        if (thread.length >= SUMMARIZE_THRESHOLD) {
          const sumStart = Date.now();
          const sumR = await summarizeConversation({ thread, gigTitle: serviceTitle });
          if (sumR.ok && sumR.shouldUse) {
            summaryBlock = formatSummaryForPrompt(sumR.summary, sumR.summarized);
            const recent2 = thread.slice(-3, -1);  // 현재 제외 직전 2개만 원문
            historyBlock = recent2.length > 0
              ? '\n[직전 원문 (최신 2개)]\n' + recent2.map((m, i) =>
                  `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${m.content.slice(0, 240)}`
                ).join('\n')
              : '';
            console.log(`  📝 대화 요약 (${((Date.now() - sumStart) / 1000).toFixed(1)}s, ${sumR.model}): stage=${sumR.summary.funnel_stage}, 커밋먼트 ${sumR.summary.our_commitments.length}개, 주의 ${sumR.summary.red_flags.length}개`);
          } else {
            // 요약 실패 → 원문으로 폴백
            const history = thread.slice(-10, -1);
            historyBlock = '\n[직전 대화 히스토리 (오래된 → 최신)]\n' + history.map((m, i) =>
              `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${m.content.slice(0, 200)}`
            ).join('\n');
            if (sumR.error) console.log(`  ⚠️ 대화 요약 실패 → 원문 사용: ${sumR.error.slice(0, 100)}`);
          }
        } else if (thread.length > 1) {
          const history = thread.slice(-10, -1);
          historyBlock = '\n[직전 대화 히스토리 (오래된 → 최신)]\n' + history.map((m, i) =>
            `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${m.content.slice(0, 200)}`
          ).join('\n');
        }

        // 실시간 gig 상세
        const gigDetailBlock = meta.gig_detail ? formatGigDetailForPrompt(meta.gig_detail) : '';

        // few-shot: 최근 sent 답변 2개 (톤만 참고 — 내용 복사 금지 규칙은 system에 명시)
        const fewShot = approvedExamples.slice(0, 2).map((e, i) =>
          `[예시${i + 1}] 고객: ${String(e.message_content || '').slice(0, 120)}\n   답변: ${String(e.auto_reply_text || '').slice(0, 400)}`
        ).join('\n\n');

        const sys = `당신은 ONDA 마케팅의 크몽 판매 담당자입니다. 목표는 문의를 계약으로 전환하는 것.

★ 절대 원칙 ★
1. "고객 의도 분석 결과" 블록의 명시 질문과 커버포인트를 모두 답변에 반영한다 — 하나라도 빠지면 실패
2. "고객 제공 사실"에 있는 업종/규모/참고 사이트는 반드시 그대로 인용한다 ("30명 규모 미용실이시고..." 처럼)
3. 서비스 페이지 제목보다 고객이 실제 메시지에서 말한 내용이 우선
4. 직전 대화 히스토리가 있으면 이미 안내한 내용은 반복하지 말고 다음 단계로 진전
5. 예시(few-shot) 답변은 톤만 참고 — 내용/사실/숫자를 그대로 복사하지 말 것

답변 형식:
- 한국어, 3~7문장. 이모지 금지(":)"는 허용). 번호 리스트는 고객이 질문 3개 이상일 때만
- 첫 문의만 "안녕하세요!" 인사, 후속 문의는 바로 본론
- 반드시 다음 스텝 CTA 포함 (참고자료 요청 / 견적 확정 / 상담 일정 등)

구체 정보 출처:
- 패키지 가격/일정은 반드시 [크몽 서비스 스펙] 블록의 값만 사용 (추측 금지)
- 거래 통계가 있으면 "비슷한 구성은 평균 N만원" 식으로 근거 제시

경쟁 플랫폼/외부 언급:
- 아임웹/카페24/워드프레스/윅스 → "우리가 대신 해드립니다 + 월 호스팅비 0원 + 디자인 자유도 100%"로 전환
- 고객에게 외부 서비스 추천 금지 (우리로 끌어오기)

★ 짧은 반문 특별 규칙 (is_short_reply=true 일 때) ★
"네?", "ㅎㅇ", "?", "무슨 말씀이세요" 같은 1~5자 반문이면:
- "어떤 부분이 궁금하신가요?" 같은 열린 질문 금지
- 직전 우리 답변에서 모호했을 지점을 직접 추론 → 재설명 + 2~3개 선택지 + 다음 스텝 구조

★ 막연한 문의 (primary_intent=other, confidence=low) ★
고객이 구체 정보 없이 "홈페이지 만들 수 있나요?" 수준이면:
- 업종/용도/참고 사이트 3개 질문으로 되묻기
- 되묻기만 하지 말고 "말씀해주시면 24시간 내 견적안내드립니다" 다음 스텝 제시`;

        const taskContext = [
          intentBlock || null,  // 최상단 — 모든 판단의 기준
          summaryBlock ? `\n${summaryBlock}` : null,  // 장기 대화 요약 (6+ 메시지)
          quoteBlock ? `\n${quoteBlock}` : null,  // 자동 견적 계산 (가격/스펙 의도)
          portfolioBlock ? `\n${portfolioBlock}` : null,  // 포트폴리오 요청 시에만 주입
          `문의 모드: ${isFollowUp ? '후속 문의 (인사 생략)' : '첫 문의'}`,
          `고객이 본 서비스 페이지 제목: ${serviceTitle}`,
          isUnmappedProduct
            ? `⚠️ 이 서비스는 내부 카테고리에 아직 매핑 안 됨 — 페이지 제목을 전적으로 의존해서 맥락 파악하세요`
            : `매핑 카테고리: ${analysis.serviceType}`,
          statsText ? `거래 통계: ${statsText}` : null,
          gigDetailBlock ? `\n${gigDetailBlock}` : null,
          urlBlock ? `\n${urlBlock}` : null,
          historyBlock || null,
          fewShot ? `\n최근 합격 답변 톤 참고 (톤만 참고, 내용 복사 금지):\n${fewShot}` : null,
        ].filter(Boolean).join('\n');

        // 고객 첨부 이미지 수집 (Vision)
        //  로딩 우선순위: local_path(크몽 원본 다운로드) → preview_url(160x120 썸네일 폴백)
        const rawAttachments = Array.isArray(meta.attachments) ? meta.attachments : [];
        const imageAttachments = rawAttachments.filter(a => {
          const name = String(a.file_name || a.preview_url || a.local_path || '');
          return /\.(png|jpe?g|gif|webp)$/i.test(name);
        }).slice(0, 5);
        // 이미지 fetch 병렬화 — preview_url 다운로드는 직렬일 필요 없음
        const imageResults = await Promise.all(imageAttachments.map(async (att) => {
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
          return { att, r };
        }));
        const imageBlocks = [];
        for (const { att, r } of imageResults) {
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

        // temperature 자동 결정 (intent 기반 quality dial)
        //   - 컴플레인/분노/사람필요 → 0.2 (보수·정확성)
        //   - 막연한 문의/저신뢰 → 0.6 (탐색적으로 질문 도출)
        //   - 재생성 모드 → 0.7 (다른 각도)
        //   - 기본 → 0.4
        let claudeTemp = 0.4;
        if (regenId) claudeTemp = 0.7;
        else if (intent && (intent.sentiment === 'angry' || intent.sentiment === 'frustrated' || intent.requires_human)) claudeTemp = 0.2;
        else if (intent && (intent.confidence === 'low' || intent.primary_intent === 'other')) claudeTemp = 0.6;

        const regenHint = regenId ? '\n\n⚠️ 직전 답변이 맥락에 맞지 않았습니다. 고객 메시지를 다시 정확히 읽고 새롭게 작성하되, 이전 답변과 구조·어조·강조점이 다르도록 해주세요.' : '';
        const finalUserMsg = userMsg + regenHint;

        // content 구성: 이미지 블록(있으면) + 텍스트 블록
        //   _meta 필드는 Anthropic API에 보내기 전 제거
        const contentArr = [
          ...imageBlocks.map(b => ({ type: b.type, source: b.source })),
          { type: 'text', text: finalUserMsg },
        ];

        console.log(`  🤖 Claude 호출 (${regenId ? 'regen' : (isFollowUp ? 'follow_up' : 'first/low-score')}) — model=opus, temp=${claudeTemp}, images=${imageBlocks.length}`);
        const c = await askClaude({ system: sys, messages: [{ role: 'user', content: contentArr }], model: 'opus', max_tokens: 600, temperature: claudeTemp });
        if (c.ok && c.text && c.text.length >= 40) {
          replyText = c.text.trim();
          replySource = 'claude';
          claudeModel = c.model;
          console.log(`  ✓ Claude 답변 생성 (${replyText.length}자, tokens in=${c.usage?.input_tokens} out=${c.usage?.output_tokens})`);
        } else {
          console.log(`  ⚠️ Claude 실패 → rule-based 유지: ${c.error || '응답 너무 짧음'}`);
        }

        // [5단계] 자기검증 — 답변이 intent.must_address / explicit_questions 를 커버했는지 체크
        //   커버율 70% 미만이면 missing 포인트 강조하며 1회 자동 재생성
        //   Claude 메인이 요구사항 일부를 빠뜨려서 동문서답 나오는 케이스 방어
        if (replySource === 'claude' && intent && intent.confidence !== 'low') {
          const verify = await verifyReply({ intent, replyText, customerMessage: inquiry.message_content || '' });
          verifyResult = verify;
          if (verify.ok) {
            console.log(`  🔍 self-check (${verify.model}): verdict=${verify.verdict}, coverage=${(verify.coverage_ratio * 100).toFixed(0)}%, missing=${verify.missing.length}, off-topic=${verify.off_topic.length}`);
            if (verify.missing.length) console.log(`     missing: ${verify.missing.slice(0, 3).join(' / ')}`);

            // variant 2-pass 조건: (verdict=fail 자동복구) OR (heat ≥ 70 핫 리드, 품질 극대화)
            //   단, regen 모드는 이미 수동 트리거라 중복 금지
            const shouldSelfRepair = verify.verdict === 'fail' && !regenId;
            const shouldVariant = !regenId && leadHeat && leadHeat.score >= 70 && verify.coverage_ratio < 0.95;

            if (shouldSelfRepair || shouldVariant) {
              // 바리언트 각도 선택 — heat 높고 missing 있으면 missing 중심, 아니면 다른 프레임
              const altAngleHint = shouldSelfRepair
                ? `\n\n⚠️ 직전 초안이 다음 포인트를 빠뜨렸습니다 — 반드시 반영해서 다시 쓰세요:\n${verify.missing.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n이미 잘 답한 부분(${verify.covered.slice(0, 3).join(' / ')})은 유지하되, 빠진 포인트를 자연스럽게 녹이세요.`
                : `\n\n🎯 [바리언트 생성] 동일 질문에 대해 직전 초안과 다른 각도로 작성하세요. 초안이 "스펙/숫자 중심"이면 "관계·업종 특화 사례·불안 해소" 중심으로, 초안이 "관계 중심"이면 "구체 숫자·구성·타임라인" 중심으로 프레임을 바꾸세요. 명시 질문은 둘 다 다 커버하되 강조점만 다르게.`;
              const altTemp = shouldSelfRepair ? claudeTemp : Math.min(0.8, Math.max(0.2, claudeTemp + 0.3));
              const altContent = [
                ...imageBlocks.map(b => ({ type: b.type, source: b.source })),
                { type: 'text', text: finalUserMsg + altAngleHint },
              ];
              console.log(`  🔁 ${shouldSelfRepair ? 'self-repair' : 'variant 2-pass'} 호출 (temp=${altTemp})`);
              const c2 = await askClaude({ system: sys, messages: [{ role: 'user', content: altContent }], model: 'opus', max_tokens: 700, temperature: altTemp });

              if (c2.ok && c2.text && c2.text.length >= 40) {
                const altText = c2.text.trim();
                // 바리언트 검증
                const v2 = await verifyReply({ intent, replyText: altText, customerMessage: inquiry.message_content || '' });
                if (v2.ok) {
                  const origScore = verify.coverage_ratio || 0;
                  const altScore = v2.coverage_ratio || 0;
                  const origOffTopic = verify.off_topic?.length || 0;
                  const altOffTopic = v2.off_topic?.length || 0;
                  // 승자 선정: (1) 커버율 우선, (2) 동률이면 off_topic 적은 쪽
                  const altWins = altScore > origScore || (altScore === origScore && altOffTopic < origOffTopic);
                  console.log(`  🏆 바리언트 비교: 초안 coverage=${(origScore * 100).toFixed(0)}% (off=${origOffTopic}) vs 대안 coverage=${(altScore * 100).toFixed(0)}% (off=${altOffTopic}) → ${altWins ? '대안 채택' : '초안 유지'}`);
                  if (altWins) {
                    replyText = altText;
                    claudeModel = c2.model;
                    verifyResult = v2;
                  }
                } else {
                  console.log(`  ⚠️ 바리언트 검증 실패 — 초안 유지: ${v2.error}`);
                }
              } else {
                console.log(`  ⚠️ 바리언트 생성 실패 → 초안 유지: ${c2.error || '짧음'}`);
              }
            }
          } else {
            console.log(`  ⚠️ self-check 실패 (스킵): ${verify.error}`);
          }
        }
      }

      // needs_review 트리거 조건 (하나라도 해당):
      //   1) 룰베이스 폴백 + 저품질 (Claude 실패 케이스)
      //   2) intent.requires_human (컴플레인/환불/감정악화)
      //   3) self-check verdict=fail (자동 repair 후에도 커버율 미달)
      //   4) intent.confidence=low (의도 파악 자체가 어려운 모호 문의)
      const needsManual = (quality.score < 60 && replySource === 'rule') ||
        (intent && intent.requires_human === true) ||
        (verifyResult && verifyResult.ok && verifyResult.verdict === 'fail') ||
        (intent && intent.confidence === 'low' && (inquiry.message_content || '').length > 30);

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

      // 의도/히트/검증 요약 라인 (Claude 경로만)
      const intentLine = intent ? (
        `🎯 의도: <code>${esc(intent.primary_intent)}</code> · 감정 <code>${esc(intent.sentiment)}</code> · 긴급 <code>${esc(intent.urgency)}</code> · 신뢰도 <code>${esc(intent.confidence)}</code>`
      ) : null;
      const heatLine = intent ? `${leadHeat.label} · <b>${leadHeat.score}/100</b>` : null;
      const verifyLine = verifyResult && verifyResult.ok ? (
        `🔍 커버율 ${(verifyResult.coverage_ratio * 100).toFixed(0)}% (${verifyResult.verdict}${verifyResult.missing?.length ? ` · 누락 ${verifyResult.missing.length}개` : ''})`
      ) : null;
      const humanBanner = intent && intent.requires_human
        ? `🚨 <b>사람 응대 필요</b> — 컴플레인·감정·법적 이슈 감지됨. 자동발송 전 관리자 검수 권장.`
        : null;

      const card = [
        `💬 <b>신규 문의 #${inquiry.id}</b>  (${qualityLabel})`,
        humanBanner,
        heatLine,
        intentLine,
        verifyLine,
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
