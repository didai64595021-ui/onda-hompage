#!/usr/bin/env node
/**
 * 크몽 메시지함(Inbox) 문의 데이터 크롤러
 * - 크몽 내부 API 기반 (DOM 파싱 대신 API 사용)
 * - /api/v5/inbox-groups → 대화 목록
 * - /api/inbox/v1/inbox-groups/{id} → 대화 상세 (연관 서비스/gig 정보)
 * - /api/v5/inbox-groups/{id}/messages → 메시지 내용
 * - 최근 24시간 문의만 수집
 * - Supabase kmong_inquiries 테이블에 insert (중복 스킵)
 */

const { login } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const { matchProductId } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

/**
 * 시간 텍스트를 파싱해서 24시간 이내인지 확인
 * "3시간 전", "20시간 전", "어제 10:26", "03.28" 등
 */
function isWithin24h(timeText) {
  if (!timeText) return false;
  const t = timeText.trim();

  if (t.includes('분 전') || t.includes('시간 전') || t.includes('방금')) {
    return true;
  }

  if (t.includes('어제')) {
    return true;
  }

  const match = t.match(/(\d{1,2})\.(\d{1,2})/);
  if (match) {
    const now = new Date();
    const msgDate = new Date(now.getFullYear(), parseInt(match[1]) - 1, parseInt(match[2]));
    const diffMs = now - msgDate;
    return diffMs <= 24 * 60 * 60 * 1000;
  }

  return false;
}

/**
 * 시간 텍스트를 ISO 날짜로 변환
 */
function parseTimeText(timeText) {
  if (!timeText) return new Date().toISOString();
  const t = timeText.trim();
  const now = new Date();

  const minMatch = t.match(/(\d+)분 전/);
  if (minMatch) {
    return new Date(now - parseInt(minMatch[1]) * 60 * 1000).toISOString();
  }

  const hourMatch = t.match(/(\d+)시간 전/);
  if (hourMatch) {
    return new Date(now - parseInt(hourMatch[1]) * 60 * 60 * 1000).toISOString();
  }

  const yesterdayMatch = t.match(/어제\s*(\d{1,2}):(\d{2})/);
  if (yesterdayMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(parseInt(yesterdayMatch[1]), parseInt(yesterdayMatch[2]), 0, 0);
    return d.toISOString();
  }

  if (t.includes('방금')) {
    return now.toISOString();
  }

  // "YY.MM.DD HH:MM" 형식
  const fullMatch = t.match(/(\d{2})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (fullMatch) {
    const d = new Date(2000 + parseInt(fullMatch[1]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[3]),
      parseInt(fullMatch[4]), parseInt(fullMatch[5]));
    return d.toISOString();
  }

  return now.toISOString();
}

async function crawlInbox() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 문의(Inbox) 크롤러 시작 [API 기반] ===');

    const result = await login({ slowMo: 50 });
    browser = result.browser;
    const page = result.page;

    // 로그인 후 페이지 네비게이션 완전 종료 대기 (리다이렉트 완료 후 evaluate 가능)
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      console.log(`[loadState 대기 타임아웃 - 계속 진행] ${e.message}`);
    }
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log(`[현재 URL] ${currentUrl}`);

    // 크몽 메인/대시보드 어디서든 API 호출 가능하도록 그대로 사용
    // 1단계: inbox-groups API로 대화 목록 가져오기
    console.log('[API] 대화 목록 조회...');
    const inboxData = await page.evaluate(async () => {
      const r = await fetch('https://kmong.com/api/v5/inbox-groups?page=1', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    });

    if (!inboxData || !inboxData.inbox_groups) {
      throw new Error('inbox-groups API 응답 없음');
    }

    const groups = inboxData.inbox_groups;
    console.log(`[API] 전체 대화: ${inboxData.total}개, 이번 페이지: ${groups.length}개`);

    const inquiries = [];

    for (const group of groups) {
      const customerName = group.partner?.username || '알 수 없음';
      const timeText = group.sent_at || '';
      const inboxGroupId = group.inbox_group_id;

      // 24시간 이내만 처리
      if (!isWithin24h(timeText)) {
        console.log(`[스킵] 24h 초과: ${customerName} (${timeText})`);
        continue;
      }

      // 상대방이 시작한 대화만 = 문의 (셀러가 먼저 보낸 건 제외)
      const isCustomerStarted = group.group_started_userid !== group.USERID;

      const inquiryDate = group.created_at || parseTimeText(timeText);
      console.log(`[대화] ${customerName} — ${timeText} (group_id: ${inboxGroupId}, 고객시작: ${isCustomerStarted})`);

      // 2단계: 각 대화의 상세 API 호출 → 연관 서비스(gig) 정보 가져오기
      let serviceName = '';
      let gigId = null;
      let messageContent = '';
      try {
        const detailData = await page.evaluate(async (gId) => {
          const r = await fetch(`https://kmong.com/api/inbox/v1/inbox-groups/${gId}`, { credentials: 'include' });
          if (!r.ok) return null;
          return await r.json();
        }, inboxGroupId);

        // button.gigs는 대화방 전체 연관 gig 목록 (여러 개일 수 있음) — 기본값만 설정, 실제 매칭은 메시지 extra_data 우선
        const allGigs = (detailData?.button?.gigs || []).map(g => ({ gigId: g.gigId, title: g.title || '' }));
        if (allGigs.length > 0) {
          const last = allGigs[allGigs.length - 1];
          serviceName = last.title;
          gigId = last.gigId;
        }

        // 3단계: 메시지 내용 가져오기 (첫 메시지 = 고객 문의 내용)
        const msgData = await page.evaluate(async (gId) => {
          const r = await fetch(`https://kmong.com/api/v5/inbox-groups/${gId}/messages?page=1`, { credentials: 'include' });
          if (!r.ok) return null;
          return await r.json();
        }, inboxGroupId);

        messageContent = '';
        var conversationThread = [];
        if (msgData?.messages) {
          // 전체 대화 스레드 (시간순 정렬, 최근 20개) — auto-reply가 Claude 맥락으로 활용
          const sortedMsgs = [...msgData.messages]
            .filter(m => m.message && String(m.message).trim())
            .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
          conversationThread = sortedMsgs.slice(-20).map(m => ({
            role: m.is_mine ? 'assistant' : 'user',
            content: String(m.message).slice(0, 800),
            at: m.created_at || null,
          }));

          // messageContent = 가장 최근 고객 메시지 (답변 대상)
          const latestCustomer = [...sortedMsgs].reverse().find(m => !m.is_mine);
          var latestMessageId = latestCustomer?.MID || null;
          if (latestCustomer) {
            messageContent = latestCustomer.message;
            // ★ 크몽 API 실제 구조: 고객이 gig에 연결된 문의를 보내면 extra_data에 {PID, title, price, category_info} 삽입됨
            //   UI의 "문의 서비스" 블록 = extra_data가 있는 메시지의 카드 표시
            //   같은 대화방에서 다른 gig으로 새 문의 시 extra_data 달린 새 메시지가 들어옴
            const latestCustomerWithExtra = [...sortedMsgs].reverse().find(m => !m.is_mine && m.extra_data && (m.extra_data.PID || m.extra_data.title));
            if (latestCustomerWithExtra?.extra_data) {
              const ex = latestCustomerWithExtra.extra_data;
              serviceName = ex.title || serviceName;
              gigId = ex.PID || gigId;
              console.log(`  → extra_data 기반 서비스 매칭: ${serviceName} (PID=${gigId})`);
            }
          }
        }
        console.log(`  → 최종 서비스: ${serviceName || '(미확인)'} (gigId: ${gigId || 'N/A'})`);

        if (messageContent) {
          console.log(`  → 고객 메시지: ${messageContent.substring(0, 80)}...`);
        }

        // 4단계: gig 상세 실시간 fetch (소재 최적화로 자주 바뀌므로 매번 신규)
        var gigDetail = null;
        if (gigId) {
          try {
            const { fetchGigDetail } = require('./lib/gig-detail');
            gigDetail = await fetchGigDetail(page, gigId);
            if (gigDetail && !gigDetail._error) {
              console.log(`  → gig 상세: ${gigDetail.packages?.length || 0}개 패키지, ${gigDetail.descriptions?.length || 0}개 본문블록`);
            } else {
              console.warn(`  → gig 상세 실패: ${gigDetail?._error || 'null'}`);
            }
          } catch (e) {
            console.warn(`  → gig 상세 fetch 예외: ${e.message}`);
          }
        }

      } catch (e) {
        console.warn(`  → API 호출 실패: ${e.message}`);
      }

      const productId = matchProductId(serviceName) || (gigId ? String(gigId) : null);
      console.log(`  → 매핑: ${serviceName || '(미확인)'} → productId: ${productId || 'N/A'}`);

      // 실시간 gig 메타데이터 + 대화 스레드 + gig 상세 → notes JSON (스키마 변경 없이 보존)
      const gigUrl = gigId ? `https://kmong.com/gig/${gigId}` : null;
      const notesPayload = {
        gig_id: gigId,
        service_title: serviceName || null,
        gig_url: gigUrl,
        conversation_thread: conversationThread || [],
        gig_detail: gigDetail || null,
        latest_message_id: latestMessageId,  // 중복 판정 기준 (메시지 텍스트보다 정확)
      };

      inquiries.push({
        product_id: productId,
        inquiry_date: inquiryDate,
        customer_name: customerName,
        inquiry_type: '크몽 메시지',
        status: 'new',
        notes: JSON.stringify(notesPayload),
        message_content: messageContent || null,
        conversation_url: `https://kmong.com/inboxes?inbox_group_id=${inboxGroupId}&partner_id=${group.partner?.USERID || ''}`,
      });
    }

    console.log(`\n[결과] 24시간 내 문의: ${inquiries.length}건`);

    // 중복 체크 — 같은 고객의 가장 최근 inquiry의 latest_message_id (notes JSON) 와 비교
    // 메시지 텍스트만 비교하면 '"ㅎㅇ"' 같은 반복 인사가 중복 판정되어 놓침 → MID 기반이 정확
    let insertedCount = 0;
    for (const inquiry of inquiries) {
      const { data: existing } = await supabase
        .from('kmong_inquiries')
        .select('id, message_content, notes, inquiry_date')
        .eq('customer_name', inquiry.customer_name)
        .gte('inquiry_date', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('inquiry_date', { ascending: false });

      // 현재 inquiry의 MID
      let curMID = null;
      try { curMID = JSON.parse(inquiry.notes || '{}').latest_message_id; } catch {}

      const sameMID = curMID && (existing || []).some(e => {
        try { return JSON.parse(e.notes || '{}').latest_message_id === curMID; } catch { return false; }
      });
      if (sameMID) {
        console.log(`[스킵] 동일 MID 중복: ${inquiry.customer_name} (MID=${curMID})`);
        continue;
      }
      // MID 없으면 fallback: 메시지 텍스트 + 1시간 이내만 중복 처리 (짧은 윈도우)
      if (!curMID) {
        const recentSameMsg = (existing || []).some(e =>
          (e.message_content || '') === (inquiry.message_content || '') &&
          (new Date(e.inquiry_date) > new Date(Date.now() - 60 * 60 * 1000))
        );
        if (recentSameMsg) {
          console.log(`[스킵] 1시간 내 동일 메시지: ${inquiry.customer_name}`);
          continue;
        }
      }
      if (existing && existing.length > 0) {
        console.log(`[추가] 기존 고객 새 메시지: ${inquiry.customer_name} (${existing.length + 1}번째, MID=${curMID || '?'})`);
      }

      const { error } = await supabase
        .from('kmong_inquiries')
        .insert({
          product_id: inquiry.product_id,
          inquiry_date: inquiry.inquiry_date,
          customer_name: inquiry.customer_name,
          inquiry_type: inquiry.inquiry_type,
          status: inquiry.status,
          message_content: inquiry.message_content,
          conversation_url: inquiry.conversation_url,
          notes: inquiry.notes,
        });

      if (error) {
        console.error(`[에러] insert 실패: ${error.message} — ${inquiry.customer_name}`);
      } else {
        insertedCount++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 크롤: 문의 ${insertedCount}건 수집 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    if (insertedCount > 0) notify(msg);  // 0건이면 알림 스킵 (불필요한 알림 방지)

    await browser.close();

    // 체이닝: 신규 문의 있으면 auto-reply 즉시 spawn (cron 대기 X)
    if (insertedCount > 0) {
      const { spawn } = require('child_process');
      const fs = require('fs');
      const logFile = '/home/onda/logs/kmong-auto-reply-spawn.log';
      const ts = new Date().toISOString();
      fs.appendFileSync(logFile, `\n\n===== spawn @ ${ts} (new inquiries: ${insertedCount}) =====\n`);
      const out = fs.openSync(logFile, 'a');
      const err = fs.openSync(logFile, 'a');
      const proc = spawn('node', [require('path').join(__dirname, 'auto-reply.js')], {
        cwd: __dirname, detached: true, stdio: ['ignore', out, err], env: process.env,
      });
      proc.unref();
      console.log(`[체이닝] auto-reply 즉시 spawn → 답변 카드 생성 시작 (로그: ${logFile})`);
    }

    return inquiries;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 문의 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

crawlInbox();
