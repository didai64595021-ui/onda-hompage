#!/usr/bin/env node
/**
 * 크몽 판매관리 주문 데이터 크롤러
 * - https://kmong.com/seller/order-list 에서 주문 수집
 * - 카드 리스트에서 텍스트 파싱으로 데이터 추출
 * - Supabase kmong_orders 테이블에 upsert (onConflict: order_id)
 */

const { login, saveErrorScreenshot } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const { matchProductId } = require('./lib/product-map');
const { notifyTyped } = require('./lib/notify-filter');
const path = require('path');

const ORDER_LIST_URL = 'https://kmong.com/seller/order-list';

/**
 * 금액 파싱 (콤마, 원 제거)
 */
function parseAmount(str) {
  if (!str) return 0;
  const match = str.match(/([\d,]+)\s*원/);
  if (!match) return 0;
  return parseInt(match[1].replace(/,/g, ''), 10) || 0;
}

/**
 * 날짜 파싱 ("26.03.28 14:14" → "2026-03-28")
 */
function parseOrderDate(text) {
  if (!text) return null;
  // YY.MM.DD HH:MM
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{2})\s*(\d{2}:\d{2})?/);
  if (match) {
    const year = 2000 + parseInt(match[1]);
    return `${year}-${match[2]}-${match[3]}`;
  }
  return null;
}

/**
 * 주문 상태 정규화
 */
function normalizeStatus(text) {
  if (!text) return 'unknown';
  if (text.includes('거래 완료') || text.includes('거래완료')) return '거래완료';
  if (text.includes('진행중') || text.includes('진행 중')) return '진행중';
  if (text.includes('작업물 발송')) return '작업물발송';
  if (text.includes('주문 취소') || text.includes('취소')) return '취소';
  if (text.includes('수정 요청')) return '수정요청';
  return text.trim().substring(0, 20);
}

/**
 * 30일 이내 날짜인지 확인
 */
function isWithin30Days(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  return diff <= 30 * 24 * 60 * 60 * 1000;
}

async function crawlOrders() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 주문(Orders) 크롤러 시작 ===');

    const result = await login({ slowMo: 100 });
    browser = result.browser;
    const page = result.page;

    // 주문 목록 이동
    console.log('[이동] 판매관리 주문목록...');
    await page.goto(ORDER_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log(`[페이지] URL: ${page.url()}`);

    // "전체 상태" 탭 선택 시도
    try {
      // 상태 필터 탭이 있으면 전체 상태 또는 현재 표시 유지
      // 페이지는 기본적으로 모든 주문을 보여주므로 특별히 변경 불필요
    } catch {}

    // 페이지 전체 텍스트에서 주문 파싱
    const fullText = await page.locator('main, #app, #__next, body').first().innerText();
    const orders = [];

    // 주문번호 패턴으로 각 주문 블록 분리
    // #7199199 형태의 주문번호를 기준으로 분할
    const orderBlocks = fullText.split(/(#\d{5,})/);

    for (let i = 1; i < orderBlocks.length; i += 2) {
      const orderId = orderBlocks[i].replace('#', '');
      const block = orderBlocks[i + 1] || '';
      const prevBlock = orderBlocks[i - 1] || ''; // 주문번호 앞 텍스트 (상태, 날짜)

      // 서비스명: 주문번호 바로 뒤 줄
      const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const serviceName = blockLines[0] || '';

      // 금액: "NNN,NNN원" 패턴
      let amount = 0;
      for (const line of blockLines) {
        const amt = parseAmount(line);
        if (amt > 0) {
          amount = amt;
          break;
        }
      }

      // 주문일시: prevBlock 또는 block에서 찾기
      let orderDate = null;
      const combinedText = prevBlock + '\n' + block;

      // "주문일시 YY.MM.DD HH:MM"
      const orderDateMatch = combinedText.match(/주문일시\s*\n?\s*(\d{2}\.\d{2}\.\d{2}\s*\d{2}:\d{2})/);
      if (orderDateMatch) {
        orderDate = parseOrderDate(orderDateMatch[1]);
      }

      // 거래 완료 일시
      let completedAt = null;
      const completedMatch = combinedText.match(/거래 완료 일시\s*\n?\s*(\d{2}\.\d{2}\.\d{2}\s*\d{2}:\d{2})/);
      if (completedMatch) {
        completedAt = parseOrderDate(completedMatch[1]);
      }

      // 상태
      let status = 'unknown';
      if (prevBlock.includes('거래 완료')) status = '거래완료';
      else if (prevBlock.includes('주문 취소')) status = '취소';
      else if (prevBlock.includes('진행중') || prevBlock.includes('진행 중')) status = '진행중';
      else if (prevBlock.includes('작업물 발송')) status = '작업물발송';
      else if (prevBlock.includes('수정 요청')) status = '수정요청';

      // 30일 이내만
      if (orderDate && !isWithin30Days(orderDate)) {
        console.log(`[스킵] 30일 초과: #${orderId} (${orderDate})`);
        continue;
      }

      // 고객 닉네임: "구매자" 관련 텍스트 또는 블록 마지막 줄에서 추출
      let buyerName = '';
      for (const line of blockLines) {
        // "구매자: 닉네임" 또는 단독 닉네임 패턴
        const buyerMatch = line.match(/구매자\s*[:：]?\s*(.+)/);
        if (buyerMatch) {
          buyerName = buyerMatch[1].trim();
          break;
        }
      }
      // 구매자 패턴 못 찾으면 블록에서 금액/날짜/상태가 아닌 짧은 텍스트 시도
      if (!buyerName) {
        for (const line of blockLines.slice(1)) {
          if (line.length > 1 && line.length <= 20 && !line.match(/[\d,]+원/) && !line.match(/\d{2}\.\d{2}\.\d{2}/) && !line.includes('주문일시') && !line.includes('거래') && !line.includes('진행') && !line.includes('작업물') && !line.includes('취소') && !line.includes('수정') && !line.includes('패키지')) {
            buyerName = line;
            break;
          }
        }
      }

      const productId = matchProductId(serviceName);

      orders.push({
        order_id: orderId,
        product_id: productId,
        service_name: serviceName.trim(),
        buyer_name: buyerName,
        order_date: orderDate || new Date().toISOString().split('T')[0],
        package_type: '',
        amount,
        status,
        completed_at: completedAt,
      });

      console.log(`[주문] #${orderId} | ${serviceName.substring(0, 40)} → ${productId || 'N/A'} | ${amount}원 | ${status} | ${orderDate} | 구매자: ${buyerName || 'N/A'}`);
    }

    // 페이지네이션: 2페이지 확인
    try {
      const page2Btn = page.locator('a:has-text("2"), button:has-text("2")').first();
      if (await page2Btn.isVisible({ timeout: 2000 })) {
        await page2Btn.click();
        await page.waitForTimeout(3000);

        const text2 = await page.locator('main, #app, #__next, body').first().innerText();
        const blocks2 = text2.split(/(#\d{5,})/);

        for (let i = 1; i < blocks2.length; i += 2) {
          const orderId = blocks2[i].replace('#', '');
          const block = blocks2[i + 1] || '';
          const prevBlock = blocks2[i - 1] || '';

          const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
          const serviceName = blockLines[0] || '';
          let amount = 0;
          for (const line of blockLines) {
            const amt = parseAmount(line);
            if (amt > 0) { amount = amt; break; }
          }

          const combinedText = prevBlock + '\n' + block;
          const orderDateMatch = combinedText.match(/주문일시\s*\n?\s*(\d{2}\.\d{2}\.\d{2}\s*\d{2}:\d{2})/);
          const orderDate = orderDateMatch ? parseOrderDate(orderDateMatch[1]) : null;

          if (orderDate && !isWithin30Days(orderDate)) continue;

          // 중복 체크
          if (orders.find(o => o.order_id === orderId)) continue;

          let status = 'unknown';
          if (prevBlock.includes('거래 완료')) status = '거래완료';
          else if (prevBlock.includes('주문 취소')) status = '취소';

          // 고객 닉네임 추출 (P2)
          let buyerName = '';
          for (const line of blockLines) {
            const buyerMatch = line.match(/구매자\s*[:：]?\s*(.+)/);
            if (buyerMatch) { buyerName = buyerMatch[1].trim(); break; }
          }
          if (!buyerName) {
            for (const line of blockLines.slice(1)) {
              if (line.length > 1 && line.length <= 20 && !line.match(/[\d,]+원/) && !line.match(/\d{2}\.\d{2}\.\d{2}/) && !line.includes('주문일시') && !line.includes('거래') && !line.includes('진행')) {
                buyerName = line; break;
              }
            }
          }

          const productId = matchProductId(serviceName);
          orders.push({
            order_id: orderId,
            product_id: productId,
            service_name: serviceName.trim(),
            buyer_name: buyerName,
            order_date: orderDate || new Date().toISOString().split('T')[0],
            package_type: '',
            amount,
            status,
          });

          console.log(`[주문 P2] #${orderId} | ${serviceName.substring(0, 40)} → ${productId || 'N/A'} | ${amount}원 | 구매자: ${buyerName || 'N/A'}`);
        }
      }
    } catch {
      console.log('[페이지네이션] 2페이지 없음 또는 실패');
    }

    console.log(`[추출] 총 ${orders.length}건 주문 수집`);

    // Supabase upsert
    if (orders.length > 0) {
      const { data, error } = await supabase
        .from('kmong_orders')
        .upsert(orders, { onConflict: 'order_id' });

      if (error) {
        throw new Error(`Supabase upsert 실패: ${error.message}`);
      }
      console.log(`[Supabase] ${orders.length}건 upsert 완료`);
    } else {
      console.log('[경고] 수집된 주문 데이터 없음');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 크롤: 주문 ${orders.length}건 수집 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notifyTyped('crawl', msg);

    await browser.close();
    return orders;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notifyTyped('error', `크몽 주문 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

crawlOrders();
