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
const { sendCard } = require('./lib/telegram');
const { notifyTyped } = require('./lib/notify-filter');
const { analyzeInquiry, selectBestTemplate, renderTemplate, getServiceStats, calculateReplyQuality, getRecentApprovedReplies, getSimilarApprovedReplies } = require('./lib/reply-generator');
const { loadActiveProfile } = require('./lib/style-profile');
const { getCategoryById, getGigUrlById } = require('./lib/product-map');
const { askClaude } = require('./lib/claude-max');
const { formatGigDetailForPrompt } = require('./lib/gig-detail');
const { extractUrls, summarizeUrl, formatForPrompt } = require('./lib/url-summarizer');
const { extractIntent, formatIntentForPrompt, computeLeadHeat } = require('./lib/intent-extractor');
const { verifyReply } = require('./lib/reply-verifier');
const { findRelevantPortfolios, formatPortfoliosForPrompt } = require('./lib/portfolio-refs');
const { summarizeConversation, formatSummaryForPrompt, THRESHOLD: SUMMARIZE_THRESHOLD } = require('./lib/conversation-summarizer');
const { calculateQuote } = require('./lib/quote-calculator');
const { getCustomerProfile, formatProfileForPrompt } = require('./lib/customer-profile');
const { findSemanticSimilar } = require('./lib/semantic-similar');
const { getConvertedInquiryPool } = require('./lib/converted-examples');
const { deepAnalyzeUrl, formatDeepAnalysisForPrompt } = require('./lib/url-deep-analyzer');
const { analyzeAttachmentImages, formatVisionAnalysesForPrompt } = require('./lib/image-vision-analyzer');
const { findPlaybook, formatPlaybookForPrompt } = require('./lib/sales-playbook');
const { getPlaybookForContext, formatPlaybookForPrompt: formatPerfPlaybook } = require('./lib/performance-playbook');
const { classifyConversationState, formatStateForPrompt, defaultState } = require('./lib/conversation-state');
const { selectMinimalAck } = require('./lib/minimal-ack-templates');

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

// 학습 참고 수집 — 4-tier fallback. Phase A에서 병렬 실행되도록 함수화.
//   (1) 전환 답변 풀 시맨틱 (2) 전체 sent 시맨틱 (3) 키워드 overlap (4) 동일 상품 최근답변
async function fetchLearningExamples(inquiry) {
  const semStart = Date.now();
  const detail = { examples: [], sourceLabel: '', elapsedMs: 0, log: '' };

  // 1) 전환 답변 풀 먼저 시도
  try {
    const convPool = await getConvertedInquiryPool(inquiry.product_id, 20);
    if (convPool.length >= 3) {
      const convR = await findSemanticSimilar({
        currentMessage: inquiry.message_content || '',
        productId: inquiry.product_id,
        topK: 3,
        customPool: convPool,
      });
      if (convR.ok && convR.examples && convR.examples.length > 0) {
        detail.examples = convR.examples;
        detail.sourceLabel = `전환 답변 (${convPool.length}풀)`;
        detail.elapsedMs = Date.now() - semStart;
        detail.log = `학습참고(전환답변 ${(detail.elapsedMs / 1000).toFixed(1)}s, ${convR.model || 'haiku'}): ${detail.examples.length}건 / ${convR.reasoning?.slice(0, 70) || ''}`;
        return detail;
      }
    }
  } catch (e) {
    detail.log = `⚠️ 전환답변 풀 조회 예외: ${e.message}`;
  }

  // 2) 일반 시맨틱 검색
  const semR = await findSemanticSimilar({
    currentMessage: inquiry.message_content || '',
    productId: inquiry.product_id,
    topK: 3,
    poolSize: 25,
  });
  if (semR.ok && semR.examples && semR.examples.length > 0) {
    detail.examples = semR.examples;
    detail.sourceLabel = '시맨틱 전체풀';
    detail.elapsedMs = Date.now() - semStart;
    detail.log = `학습참고(시맨틱 ${(detail.elapsedMs / 1000).toFixed(1)}s, ${semR.model || 'haiku'}): ${detail.examples.length}건`;
    return detail;
  }

  // 3) 키워드 폴백
  const similar = await getSimilarApprovedReplies(inquiry.message_content, inquiry.product_id, 3);
  if (similar.length > 0) {
    detail.examples = similar;
    detail.sourceLabel = '키워드 폴백';
    detail.elapsedMs = Date.now() - semStart;
    detail.log = `학습참고(키워드 폴백): ${similar.length}건`;
    return detail;
  }

  // 4) 동일 상품 최근답변
  if (inquiry.product_id) {
    const learn = await getRecentApprovedReplies(inquiry.product_id, 3);
    if (learn.ok) {
      detail.examples = learn.examples;
      detail.sourceLabel = '동일상품 최근답변';
      detail.elapsedMs = Date.now() - semStart;
      detail.log = `학습참고(동일상품 최근답변): ${learn.examples.length}건`;
      return detail;
    }
  }

  detail.elapsedMs = Date.now() - semStart;
  return detail;
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

      // 2-2. 학습 로직 — Phase A에 병렬 편입됨 (이 위치에선 초기화만, 실제 호출은 needsClaude 블록)
      //   (1~2순위) 시맨틱 검색 (findSemanticSimilar, Opus 4.7 — ~80s) / (3~4순위 폴백) 키워드·동일상품
      let approvedExamples = [];
      let exampleSourceLabel = '';

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
            url: s.url, title: s.title || '', body: (s.bodyText || '').slice(0, 400),
          }));

          // 심층 분석은 Phase 6F — heat 계산 후 (아래에서) 호출
          // 여기선 원본 summaries 보관해 뒤에서 body 전체를 쓸 수 있게 함
          var _urlSummariesRaw = summaries.filter(s => s.ok);
        }

        // [2단계] 첨부 이미지 수 (intent extractor에는 개수만, 메인 Claude는 Vision으로 내용 분석)
        const rawAttachmentsForCount = Array.isArray(meta.attachments) ? meta.attachments : [];
        const imageCountForIntent = rawAttachmentsForCount.filter(a => {
          const name = String(a.file_name || a.preview_url || a.local_path || '');
          return /\.(png|jpe?g|gif|webp)$/i.test(name);
        }).length;

        // [3단계] Phase A 병렬 — 대화 상태 + 의도 + 프로필 + 대화 요약 + 학습참고
        //   이전: 5개 Opus 호출이 순차 (80s × 5 = 400s+)
        //   현재: 독립 호출 병렬 (max ≈ 90~115s) + minimal_ack 케이스는 메인 호출 스킵
        const phaseStart = Date.now();
        const [stateR, intentR, profileR, summaryR, learningDetail] = await Promise.all([
          classifyConversationState({
            messageContent: inquiry.message_content || '',
            thread,
            gigTitle: serviceTitle,
          }),
          extractIntent({
            messageContent: inquiry.message_content || '',
            thread,
            gigTitle: serviceTitle,
            attachmentCount: imageCountForIntent,
            urlSummaries,
          }),
          ((priorCount || 0) >= 2)
            ? getCustomerProfile(inquiry.customer_name, { minPrior: 1 }).catch(e => ({ ok: false, error: e.message }))
            : Promise.resolve(null),
          (thread.length >= SUMMARIZE_THRESHOLD)
            ? summarizeConversation({ thread, gigTitle: serviceTitle }).catch(e => ({ ok: false, error: e.message }))
            : Promise.resolve(null),
          fetchLearningExamples(inquiry).catch(e => ({ examples: [], sourceLabel: '', elapsedMs: 0, log: `⚠️ 학습참고 실패: ${e.message}` })),
        ]);
        const phaseElapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
        console.log(`  ⚡ Phase A 병렬 (${phaseElapsed}s): classifier + intent + profile${profileR ? '' : '(skip)'} + summarize${summaryR ? '' : '(skip)'} + learning`);

        // 학습 참고 결과 주입 (Phase A에서 병렬 수행 — 80s 별도 직렬 제거됨)
        if (learningDetail && learningDetail.examples && learningDetail.examples.length > 0) {
          approvedExamples = learningDetail.examples;
          exampleSourceLabel = learningDetail.sourceLabel;
        }
        if (learningDetail && learningDetail.log) console.log(`  📚 ${learningDetail.log}`);

        // 대화 상태 분석 결과
        const state = stateR.ok ? stateR.state : defaultState('classifier_fail');
        console.log(`  🗣️ 대화 상태 (${stateR.model || 'default'}): mode=${state.response_mode}, ball=${state.ball_in_court}, stage=${state.stage}${state.our_last_promise ? ` · 직전 약속="${state.our_last_promise.slice(0, 60)}"` : ''}`);

        // 의도 결과 처리 (기존 로직)
        let intentBlock = '';
        if (intentR.ok && intentR.intent) {
          intent = intentR.intent;
          intentBlock = formatIntentForPrompt(intent);
          leadHeat = computeLeadHeat(intent, {
            threadLength: thread.length,
            messageLength: (inquiry.message_content || '').length,
          });
          console.log(`  🎯 의도 (${intentR.model || 'haiku'}): primary=${intent.primary_intent}, 감정=${intent.sentiment}, 긴급=${intent.urgency}, 명시질문 ${intent.explicit_questions.length}개, 커버포인트 ${intent.must_address.length}개 (신뢰도 ${intent.confidence})`);
          console.log(`  🌡️ 리드 히트: ${leadHeat.label} (${leadHeat.score}/100)${intent.requires_human ? '  ⚠️ 사람 응대 필요' : ''}`);
        } else {
          console.log(`  ⚠️ 의도 추출 실패 → 메인 프롬프트만으로 진행: ${intentR.error || 'unknown'}`);
        }

        // [분기] 대화 상태에 따라 메인 Opus 호출 스킵
        //   minimal_ack: 고객이 대기 모드 — 고정 템플릿으로 짧게 응답
        //   human_needed: 컴플레인/환불/법적 — 자동 답변 금지, rule 초안만 두고 사람 검수
        let skipMainClaude = false;
        let skipReason = null;
        let minimalAckMeta = null;
        if (state.response_mode === 'minimal_ack' && state.should_reply !== false) {
          const ack = selectMinimalAck({ messageContent: inquiry.message_content || '', state });
          replyText = ack.text;
          replySource = 'minimal_ack';
          claudeModel = 'template';
          skipMainClaude = true;
          skipReason = `minimal_ack/${ack.scenario}`;
          minimalAckMeta = ack;
          console.log(`  💬 minimal_ack — 고정 템플릿 (scenario=${ack.scenario}, idx=${ack.template_index})`);
          console.log(`     이유: ${state.reasoning?.slice(0, 120) || '-'}`);
        } else if (state.response_mode === 'human_needed' || state.should_reply === false) {
          skipMainClaude = true;
          skipReason = 'human_needed';
          console.log(`  🚨 human_needed — 자동 답변 Opus 스킵 (rule 초안만 사람 검수용)`);
          console.log(`     이유: ${state.reasoning?.slice(0, 120) || '-'}`);
        }

        // [Phase 6F] heat ≥ 60 & URL 심층 분석 (Opus 4.7) — 고가치 리드만 깊게 판독
        let deepUrlBlock = '';
        if (leadHeat.score >= 60 && typeof _urlSummariesRaw !== 'undefined' && _urlSummariesRaw.length > 0) {
          const deepStart = Date.now();
          const deepResults = await Promise.all(_urlSummariesRaw.slice(0, 2).map(s =>
            deepAnalyzeUrl({ url: s.url, title: s.title, body: s.bodyText || '', maxBody: 6000 })
              .catch(e => ({ ok: false, error: e.message, url: s.url }))
          ));
          const blocks = [];
          for (let i = 0; i < deepResults.length; i++) {
            const r = deepResults[i];
            const src = _urlSummariesRaw[i];
            if (r.ok && r.analysis) {
              blocks.push(formatDeepAnalysisForPrompt(src.url, r.analysis));
              console.log(`  🔬 URL 심층 분석 (${((Date.now() - deepStart) / 1000).toFixed(1)}s, ${r.model}): ${src.url} — 업종=${r.analysis.industry}, 약점 ${r.analysis.current_weaknesses.length}개`);
            } else {
              console.log(`  ⚠️ URL 심층 분석 실패: ${src.url} — ${r.error?.slice(0, 80)}`);
            }
          }
          if (blocks.length) deepUrlBlock = blocks.join('\n\n');
        }

        // [Phase 6H] 업종 sales playbook 매칭 — 메시지/facts에서 업종 키워드 감지
        let playbookBlock = '';
        const playbookContext = [inquiry.message_content || '', ...(intent?.customer_facts || []), serviceTitle || ''].join(' ');
        const playbook = findPlaybook(playbookContext);
        if (playbook) {
          playbookBlock = formatPlaybookForPrompt(playbook);
          console.log(`  📚 업종 playbook 매칭: ${playbook.key}`);
        }

        // [Phase 7] 실적 기반 전환 후킹 playbook 주입 (CTR/CVR/ROI 데이터)
        let perfBlock = '';
        try {
          const perf = getPlaybookForContext({ intent, serviceTitle, productId: inquiry.product_id });
          if (perf) {
            perfBlock = formatPerfPlaybook(perf);
            const ctrTop = perf.ctrLeaders[0]?.ctr;
            const roiTop = perf.roiLeaders[0]?.roi;
            console.log(`  📈 실적 playbook 주입: CTR 1위 ${ctrTop}% / ROI 1위 ${roiTop}%${perf.isSelfInTop ? ' · 본 서비스 상위권' : ''}`);
          }
        } catch (e) {
          console.log(`  ⚠️ 실적 playbook 로드 실패: ${e.message}`);
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

        // 고객 프로필 블록 — Phase A에서 병렬 수행된 결과(profileR) 처리만
        let profileBlock = '';
        if (profileR && profileR.ok && profileR.profile) {
          profileBlock = formatProfileForPrompt(profileR.profile);
          console.log(`  👤 고객 프로필${profileR.cached ? ' (cached)' : `, ${profileR.model}`}: 가격민감=${profileR.profile.price_sensitivity}, 결정속도=${profileR.profile.decision_speed}, 톤=${profileR.profile.relationship_tone}`);
        } else if (profileR && !profileR.ok && profileR.error) {
          console.log(`  ⚠️ 고객 프로필 실패: ${profileR.error.slice(0, 100)}`);
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

        // [4단계] 대화 히스토리 블록 구성 — Phase A에서 병렬 수행된 summaryR 처리
        //   thread 길이 ≥6 → 요약 + 최신 2개만 원문 / < 6 → 전부 원문
        let historyBlock = '';
        let summaryBlock = '';
        if (summaryR && summaryR.ok && summaryR.shouldUse) {
          summaryBlock = formatSummaryForPrompt(summaryR.summary, summaryR.summarized);
          const recent2 = thread.slice(-3, -1);
          historyBlock = recent2.length > 0
            ? '\n[직전 원문 (최신 2개)]\n' + recent2.map((m, i) =>
                `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${m.content.slice(0, 240)}`
              ).join('\n')
            : '';
          console.log(`  📝 대화 요약 (${summaryR.model}): stage=${summaryR.summary.funnel_stage}, 커밋먼트 ${summaryR.summary.our_commitments.length}개, 주의 ${summaryR.summary.red_flags.length}개`);
        } else if (summaryR && !summaryR.ok) {
          const history = thread.slice(-10, -1);
          historyBlock = '\n[직전 대화 히스토리 (오래된 → 최신)]\n' + history.map((m, i) =>
            `${i + 1}. ${m.role === 'assistant' ? '우리' : '고객'}: ${m.content.slice(0, 200)}`
          ).join('\n');
          if (summaryR.error) console.log(`  ⚠️ 대화 요약 실패 → 원문 사용: ${summaryR.error.slice(0, 100)}`);
        } else if (thread.length > 1 && thread.length < SUMMARIZE_THRESHOLD) {
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

        // 말투 프로필 주입 (누적 과거 답변에서 Opus가 추출한 셀러 스타일)
        const styleProfile = await loadActiveProfile().catch(() => null);
        const styleBlock = styleProfile ? `\n\n★ 셀러 고유 말투 (반드시 따를 것) ★\n${styleProfile.description}\n특징:\n${Object.entries(styleProfile.characteristics || {}).map(([k,v]) => `- ${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\n')}\n\n` : '';
        if (styleProfile) {
          const corrections = styleProfile.characteristics?.user_corrections?.length || 0;
          const forbidden = styleProfile.characteristics?.forbidden_patterns?.length || 0;
          console.log(`  🎨 스타일 프로필 주입: ${styleBlock.length}자 (샘플 ${styleProfile.sample_count}건, 교정 ${corrections}건, 금지 ${forbidden}건)`);
        } else {
          console.log(`  ⚠️ 스타일 프로필 없음 — 기본 프롬프트로 진행`);
        }

        const sys = `당신은 ONDA 마케팅의 크몽 판매 담당자입니다. 목표는 문의를 계약으로 전환하는 것.${styleBlock}

★ 절대 원칙 ★
1. "고객 의도 분석 결과" 블록의 명시 질문과 커버포인트를 모두 답변에 반영한다 — 하나라도 빠지면 실패
2. "고객 제공 사실"에 있는 업종/규모/참고 사이트는 반드시 그대로 인용한다 ("30명 규모 미용실이시고..." 처럼)
3. 서비스 페이지 제목보다 고객이 실제 메시지에서 말한 내용이 우선
4. 직전 대화 히스토리가 있으면 이미 안내한 내용은 반복하지 말고 다음 단계로 진전
5. 예시(few-shot) 답변은 톤만 참고 — 내용/사실/숫자를 그대로 복사하지 말 것

★★★ URL 출처 분리 (할루시네이션 방지 — 절대 규칙) ★★★
절대 위반 금지:
- 고객이 대화에서 공유한 URL (참고 사이트/경쟁사/자사 기존 홈페이지/레퍼런스 등)은 **우리 작업물이 아니다**. 그걸 "저희가 작업한 곳", "저희 포트폴리오", "저희가 만든 사이트", "직접 진행한 레퍼런스"라고 절대 말하지 말 것.
- "ONDA 실존 포트폴리오 레퍼런스" 블록에 **명시된 URL만** 우리 실적으로 인용 가능. 그 블록이 비었거나 "해당 업종 실존 포트폴리오 없음"이면 우리 작업이라는 주장 **일체 금지**.
- 고객이 공유한 URL은 "보내주신 사이트 확인했습니다", "참고하신 스타일 잘 봤습니다", "말씀주신 레퍼런스 방향에 맞춰 잡아드릴 수 있습니다" 식으로 **수용만** 할 것.
- 해당 업종 실존 포트폴리오가 없을 경우: "맞춤 사례 선별해서 안내드리겠습니다", "상담 진행 시 해당 업종 레퍼런스 별도로 정리해서 공유드리겠습니다" 로 안전 처리. 가상 사례 창작 절대 금지.
- "이전에 진행한", "이전에 작업한", "저희가 진행했던" 같은 표현은 [ONDA 실존 포트폴리오 레퍼런스] 블록의 URL에만 쓸 수 있다. 고객 공유 URL에 절대 쓰지 말 것.
- 한국어 주어 생략 특성상 고객 메시지의 "이전에 진행했던 홈페이지 스타일입니다" 같은 표현은 **고객이 자사/타사 사이트를 공유한 것**이지 우리 작업이 아니다. 포트폴리오 블록에 등록되어 있지 않으면 절대 우리 작업이라 주장 금지.

답변 형식:
- 한국어, 3~7문장. 이모지 금지(":)"는 허용). 번호 리스트는 고객이 질문 3개 이상일 때만
- 첫 문의만 "안녕하세요!" 인사, 후속 문의는 바로 본론
- 반드시 다음 스텝 CTA 포함 (참고자료 요청 / 견적 확정 / 상담 일정 등)

구체 정보 출처:
- 패키지 가격/일정은 반드시 [크몽 서비스 스펙] 블록의 값만 사용 (추측 금지)
- 거래 통계가 있으면 "비슷한 구성은 평균 N만원" 식으로 근거 제시

★ 전환 후킹 공식 (실적 기반 playbook 참고 시 적용) ★
답변에 아래 공식을 자연스럽게 녹여 CTR→문의전환→결제전환 모든 단계 효율화:
1. [후킹 공식] 타겟 호명 + pain point 직격 + 시간 보증
   - 예: "사장님" "깨짐/촌스러움/없음" "24시간/당일/3일"
2. [범위 명시] "디자인부터 SEO까지", "원스톱", "기획 + 제작 + 이전"
3. [결제 유도] 구체 견적 숫자 + 포트폴리오 링크 + 수정 무제한 보장
4. [신뢰 요소] "이미 ○○ 업종 ○건 진행", "평균 ○만원에 마무리됨"
   ※ 단, 내부 수치(ROI/ROAS)를 직접 인용하지 말 것
5. [긴급도 매칭] 고객 urgency=high 면 "오늘 착수 가능" / "1시간 내 견적" 스피드 강조

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
          profileBlock ? `\n${profileBlock}` : null,  // 3회 이상 문의 고객 프로필
          playbookBlock ? `\n${playbookBlock}` : null,  // 업종별 sales playbook
          perfBlock ? `\n${perfBlock}` : null,  // 실적 기반 전환 후킹 playbook
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
          deepUrlBlock ? `\n${deepUrlBlock}` : (urlBlock ? `\n${urlBlock}` : null),
          historyBlock || null,
          fewShot ? `\n최근 합격 답변 톤 참고 [${exampleSourceLabel || '일반'}] (톤만 참고, 내용 복사 금지):\n${fewShot}` : null,
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
        // [Phase 6G] heat ≥ 60 && 첨부 이미지 존재 → Opus Vision 사전 심층 분석
        //   분석 결과 텍스트를 프롬프트에 주입하고, 이미지 원본도 여전히 Claude에 넘겨 교차 참조
        let visionBlock = '';
        if (leadHeat.score >= 60 && imageBlocks.length > 0) {
          const visionStart = Date.now();
          const visionR = await analyzeAttachmentImages({
            imageBlocks,
            customerMessage: inquiry.message_content || '',
          });
          if (visionR.ok) {
            visionBlock = formatVisionAnalysesForPrompt(visionR.analyses);
            const okCount = visionR.analyses.filter(a => a.ok).length;
            if (okCount > 0) {
              console.log(`  🖼️ Vision 심층 분석 (${((Date.now() - visionStart) / 1000).toFixed(1)}s): ${okCount}/${imageBlocks.length}장 분석 완료`);
            }
          }
        }

        const attachNote = imageBlocks.length > 0
          ? `\n\n[고객 첨부 이미지 ${imageBlocks.length}장]\n아래 이미지는 이번 문의에 고객이 첨부한 파일입니다 (${imageBlocks.map(b => b._meta.file_name).join(', ')}). ${visionBlock ? '위에 Vision 사전 분석 결과가 있으니 그걸 우선 참고하되' : '답변 작성 전 반드시 이미지 내용을 정확히 관찰하고'}, 거기에 담긴 정보(레이아웃/구조표/화면/참고자료 등)를 답변에 구체적으로 반영하세요. "첨부 잘 받았습니다"로 끝내지 말고, 이미지에서 파악한 핵심을 2~3가지 짚어주고 다음 스텝으로 연결하세요.`
          : '';

        const userMsg = `${taskContext}${visionBlock ? '\n\n' + visionBlock : ''}\n\n[지금 답변해야 할 고객 메시지]\n${inquiry.message_content || '(내용 없음)'}${attachNote}\n\n위 고객 메시지에 대한 답변을 작성해주세요. 직전 대화 히스토리가 있으면 반드시 연결되게 답변하고, 설명이나 주석 없이 답변 본문만 출력하세요.`;

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

        if (skipMainClaude) {
          console.log(`  ⏭️  메인 Opus 호출 스킵 (${skipReason}) — replyText 기확정`);
        } else {
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
        }

        // [5단계] 자기검증 — 답변이 intent.must_address / explicit_questions 를 커버했는지 체크
        //   커버율 70% 미만이면 missing 포인트 강조하며 1회 자동 재생성
        //   Claude 메인이 요구사항 일부를 빠뜨려서 동문서답 나오는 케이스 방어
        if (!skipMainClaude && replySource === 'claude' && intent && intent.confidence !== 'low') {
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
    if (generatedCount > 0) notifyTyped('reply', msg);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notifyTyped('error', `크몽 자동답변 실패: ${err.message}`);
    process.exit(1);
  }
}

autoReply();
