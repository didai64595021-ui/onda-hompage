#!/usr/bin/env node
/**
 * 크몽 Phase 2 — 승인된 답변 크몽 발송
 * 1. Supabase에서 auto_reply_status='approved' 문의 조회
 * 2. Playwright로 크몽 inbox 해당 대화 열기
 * 3. 승인된 답변 텍스트 입력 → 발송
 * 4. status를 'sent'로 업데이트
 * 5. 텔레그램에 발송 완료 알림
 *
 * 30분마다 실행 (PM2 cron)
 */

const { login, saveErrorScreenshot } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');
const { closeModals } = require('./lib/modal-handler');

const INBOX_URL = 'https://kmong.com/inboxes';

async function sendReply() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 승인 답변 발송 시작 ===');

    // 1. 승인된 답변 조회
    const { data: approved, error: fetchErr } = await supabase
      .from('kmong_inquiries')
      .select('*')
      .eq('auto_reply_status', 'approved')
      .order('inquiry_date', { ascending: true })
      .limit(5);

    if (fetchErr) {
      throw new Error(`승인 답변 조회 실패: ${fetchErr.message}`);
    }

    if (!approved || approved.length === 0) {
      console.log('[정보] 승인된 답변 없음');
      return;
    }

    console.log(`[조회] 승인된 답변 ${approved.length}건`);

    // 2. 브라우저 로그인
    const result = await login({ slowMo: 150 });
    browser = result.browser;
    const page = result.page;

    let sentCount = 0;

    for (const inquiry of approved) {
      console.log(`\n[발송] #${inquiry.id} — ${inquiry.customer_name}`);

      try {
        // 3. 메시지함 이동 (모달 닫기 필수 — pointer events intercept 방지)
        await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await closeModals(page).catch(() => {});
        await page.waitForTimeout(500);

        // 4. 해당 고객 대화 찾기
        const msgLink = page.locator(`a[href*="inbox_group_id"]:has-text("${inquiry.customer_name}")`).first();
        const isVisible = await msgLink.isVisible({ timeout: 5000 }).catch(() => false);

        if (!isVisible) {
          console.log(`  [스킵] 대화를 찾을 수 없음: ${inquiry.customer_name}`);
          // conversation_url이 있으면 직접 이동
          if (inquiry.conversation_url) {
            await page.goto(inquiry.conversation_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);
          } else {
            continue;
          }
        } else {
          await msgLink.click();
          await page.waitForTimeout(2000);
        }

        // 5. 텍스트 입력 영역 찾기
        const textarea = page.locator('textarea, [contenteditable="true"], .message-input, [class*="input"]').first();
        const inputVisible = await textarea.isVisible({ timeout: 5000 }).catch(() => false);

        if (!inputVisible) {
          console.log(`  [에러] 입력 영역을 찾을 수 없음`);
          await saveErrorScreenshot(page, `send-reply-no-input-${inquiry.id}`);
          continue;
        }

        // 6. 답변 입력
        await textarea.click();
        await textarea.fill(inquiry.auto_reply_text);
        await page.waitForTimeout(500);

        // 7. 전송 버튼 클릭
        const sendBtn = page.locator('button:has-text("전송"), button:has-text("보내기"), button[type="submit"]').first();
        const sendVisible = await sendBtn.isVisible({ timeout: 3000 }).catch(() => false);

        if (sendVisible) {
          await sendBtn.click();
          await page.waitForTimeout(2000);
          console.log(`  [전송] 메시지 발송 완료`);
        } else {
          // Enter 키로 전송 시도
          await textarea.press('Enter');
          await page.waitForTimeout(2000);
          console.log(`  [전송] Enter 키 발송`);
        }

        // 8. Supabase 업데이트
        const { error: updateErr } = await supabase
          .from('kmong_inquiries')
          .update({ auto_reply_status: 'sent' })
          .eq('id', inquiry.id);

        if (updateErr) {
          console.error(`  [에러] 상태 업데이트 실패: ${updateErr.message}`);
        }

        // 9. reply_history 업데이트
        await supabase
          .from('kmong_reply_history')
          .update({ sent_at: new Date().toISOString() })
          .eq('inquiry_id', inquiry.id)
          .is('sent_at', null);

        sentCount++;
        notify(`크몽 답변 발송 완료: ${inquiry.customer_name} (#${inquiry.id})`);

      } catch (innerErr) {
        console.error(`  [에러] ${innerErr.message}`);
        await saveErrorScreenshot(page, `send-reply-error-${inquiry.id}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 답변 발송: ${sentCount}/${approved.length}건 완료 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    if (sentCount > 0) notify(msg);

    await browser.close();

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 답변 발송 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

sendReply();
