#!/usr/bin/env node
/**
 * 크몽 메시지함(Inbox) 문의 데이터 크롤러
 * - 최근 24시간 문의 수집
 * - 각 대화를 열어 연결된 서비스명 확인
 * - Supabase kmong_inquiries 테이블에 insert (중복 스킵)
 */

const { login, saveErrorScreenshot } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const { matchProductId } = require('./lib/product-map');
const { notify } = require('./lib/telegram');
const path = require('path');
const fs = require('fs'); // Keep fs import for other uses if any, but not for SCREENSHOT_DIR here

const INBOX_URL = 'https://kmong.com/inboxes';

/**
 * 시간 텍스트를 파싱해서 24시간 이내인지 확인
 * "3시간 전", "20시간 전", "어제 10:26", "03.28" 등
 */
function isWithin24h(timeText) {
  if (!timeText) return false;
  const t = timeText.trim();

  // "N분 전", "N시간 전", "방금"
  if (t.includes('분 전') || t.includes('시간 전') || t.includes('방금')) {
    return true;
  }

  // "어제" — 24시간 이내로 간주
  if (t.includes('어제')) {
    return true;
  }

  // "MM.DD" 형식 — 오늘/어제인지 확인
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

  // "N분 전"
  const minMatch = t.match(/(\d+)분 전/);
  if (minMatch) {
    return new Date(now - parseInt(minMatch[1]) * 60 * 1000).toISOString();
  }

  // "N시간 전"
  const hourMatch = t.match(/(\d+)시간 전/);
  if (hourMatch) {
    return new Date(now - parseInt(hourMatch[1]) * 60 * 60 * 1000).toISOString();
  }

  // "어제 HH:MM"
  const yesterdayMatch = t.match(/어제\s*(\d{1,2}):(\d{2})/);
  if (yesterdayMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(parseInt(yesterdayMatch[1]), parseInt(yesterdayMatch[2]), 0, 0);
    return d.toISOString();
  }

  // "방금"
  if (t.includes('방금')) {
    return now.toISOString();
  }

  return now.toISOString();
}

async function crawlInbox() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 문의(Inbox) 크롤러 시작 ===');

    const result = await login({ slowMo: 100 });
    browser = result.browser;
    const page = result.page;

    // 로그인 후 페이지가 안정될 때까지 대기
    await page.waitForURL((url) => url.origin === 'https://kmong.com', { waitUntil: 'domcontentloaded' });

    // 메시지함 이동
    console.log('[이동] 메시지함...');
    await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log(`[페이지] URL: ${page.url()}`);

    // 메시지 링크 목록 추출
    const msgLinks = page.locator('a[href*="inbox_group_id"]');
    const linkCount = await msgLinks.count();
    console.log(`[추출] 메시지 링크: ${linkCount}개`);

    const inquiries = [];

    for (let i = 0; i < Math.min(linkCount, 30); i++) {
      const link = msgLinks.nth(i);
      const text = await link.innerText().catch(() => '');
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length < 2) continue;

      // 첫 줄: 고객 닉네임, 둘째 줄: 시간
      const customerName = lines[0];
      const timeText = lines[1];

      // 24시간 이내만
      if (!isWithin24h(timeText)) {
        console.log(`[스킵] 24h 초과: ${customerName} (${timeText})`);
        break; // 메시지가 시간순이므로 여기서 중단
      }

      const inquiryDate = parseTimeText(timeText);
      console.log(`[대화] ${customerName} — ${timeText}`);

      // 대화를 클릭해서 서비스명 확인
      let serviceName = '';
      try {
        await link.click();
        await page.waitForTimeout(2000);

        let extractedServiceName = await page.evaluate(() => {
          const serviceLabelStrong = Array.from(document.querySelectorAll('strong')).find(el => el.textContent.includes('문의 서비스'));

          if (serviceLabelStrong) {
            let currentElement = serviceLabelStrong.nextElementSibling;
            while (currentElement) {
              if (currentElement.textContent.trim().length > 0) {
                return currentElement.textContent.trim();
              }
              currentElement = currentElement.nextElementSibling;
            }
          }
          const cardEl = document.querySelector('[class*="message-card__content"] [class*="service-item__title"] strong');
          if (cardEl) {
            return cardEl.textContent.trim();
          }
          return '';
        });
        serviceName = extractedServiceName;
      } catch (e) {
        console.warn(`[경고] 서비스명 추출 실패: ${e.message}`);
        // 대화 클릭 실패해도 문의 자체는 기록
      }

      const productId = matchProductId(serviceName);
      console.log(`  서비스: ${serviceName || '(미확인)'} → ${productId || 'N/A'}`);

      inquiries.push({
        product_id: productId,
        inquiry_date: inquiryDate,
        customer_name: customerName,
        inquiry_type: '크몽 메시지',
        status: 'new',
      });

      // 뒤로가기하여 목록으로 돌아옴
      await page.goBack();
      await page.waitForTimeout(1000); // 페이지 로드 대기
    }

    console.log(`[추출] 24시간 내 문의: ${inquiries.length}건`);

    // 중복 체크 후 Supabase insert
    let insertedCount = 0;
    for (const inquiry of inquiries) {
      const { data: existing } = await supabase
        .from('kmong_inquiries')
        .select('id')
        .eq('customer_name', inquiry.customer_name)
        .gte('inquiry_date', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`[스킵] 중복: ${inquiry.customer_name}`);
        continue;
      }

      const { error } = await supabase
        .from('kmong_inquiries')
        .insert(inquiry);

      if (error) {
        console.error(`[에러] insert 실패: ${error.message} — ${inquiry.customer_name}`);
      } else {
        insertedCount++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 크롤: 문의 ${insertedCount}건 수집 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notify(msg);

    await browser.close();
    return inquiries;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 문의 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

crawlInbox();
