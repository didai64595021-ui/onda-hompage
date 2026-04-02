#!/usr/bin/env node
/**
 * 크몽 클릭업(Click-Up) 광고 CPC 데이터 크롤러
 * - 셀러 대시보드의 광고 탭에서 서비스별 노출/클릭/CTR/CPC/비용 수집
 * - 어제 1일치 데이터 수집 후 Supabase에 upsert
 */

const { login, saveErrorScreenshot } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const { matchProductId } = require('./lib/product-map');
const { notify } = require('./lib/telegram');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * 숫자 문자열을 파싱 (콤마, % 제거)
 */
function parseNum(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[,%원건회]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function crawlCpc() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 CPC 크롤러 시작 ===');
    const yesterday = getYesterday();
    console.log(`[대상 날짜] ${yesterday}`);

    const result = await login({ slowMo: 150 });
    browser = result.browser;
    const page = result.page;

    // 클릭업 페이지 이동
    console.log('[이동] 클릭업 광고 페이지...');
    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 페이지 로드 확인
    const title = await page.title();
    console.log(`[페이지] ${title} — URL: ${page.url()}`);

    // 날짜 필터: "어제" 선택
    try {
      // 날짜 필터 버튼 클릭 (기본 "지난 7일" 텍스트)
      const dateFilter = page.locator('button:has-text("지난 7일"), button:has-text("오늘"), button:has-text("어제"), button:has-text("이번 달")').first();
      if (await dateFilter.isVisible({ timeout: 3000 })) {
        await dateFilter.click();
        await page.waitForTimeout(1000);
      }
      // "어제" 옵션 클릭
      const yesterdayOption = page.locator('button:has-text("어제")').first();
      if (await yesterdayOption.isVisible({ timeout: 3000 })) {
        await yesterdayOption.click();
        await page.waitForTimeout(2000);
        console.log('[필터] 어제 날짜 필터 적용');
      }
    } catch {
      console.log('[필터] 날짜 필터 UI를 찾지 못함 — 기본 데이터 사용');
    }

    // 테이블에서 CPC 데이터 추출
    // 컬럼: On/Off(0) | 서비스img(1) | 상태(2) | 희망클릭비용(3) | 노출수(4) | 클릭수(5) | 평균클릭비용(6) | 총비용(7) | 신청정보(8)
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();
    console.log(`[추출] 테이블 행: ${rowCount}개`);

    const records = [];
    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const cells = row.locator('td');
      const cellCount = await cells.count();
      if (cellCount < 8) continue;

      // 서비스명: td[1] 내부 img의 alt 속성에서 추출
      const serviceName = await cells.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
      const productId = matchProductId(serviceName);

      if (!productId) {
        console.log(`[스킵] 매칭 실패: "${serviceName}"`);
        continue;
      }

      const impressions = parseNum(await cells.nth(4).innerText().catch(() => '0'));
      const clicks = parseNum(await cells.nth(5).innerText().catch(() => '0'));
      const avgCpc = parseNum(await cells.nth(6).innerText().catch(() => '0'));
      const totalCost = parseNum(await cells.nth(7).innerText().catch(() => '0'));
      const ctr = impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0;

      const record = {
        product_id: productId,
        date: yesterday,
        impressions,
        clicks,
        ctr,
        cpc_cost: totalCost,
        title_text: serviceName.trim(),
      };
      records.push(record);
      console.log(`[매핑] ${serviceName.substring(0, 30)} → ${productId} | 노출:${impressions} 클릭:${clicks} 비용:${totalCost}원`);
    }

    // Supabase upsert
    if (records.length > 0) {
      const { data, error } = await supabase
        .from('kmong_cpc_daily')
        .upsert(records, { onConflict: 'product_id,date' });

      if (error) {
        throw new Error(`Supabase upsert 실패: ${error.message}`);
      }
      console.log(`[Supabase] ${records.length}건 upsert 완료`);
    } else {
      console.log('[경고] 수집된 CPC 데이터 없음');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 크롤: CPC ${records.length}건 수집 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notify(msg);

    await browser.close();
    return records;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 CPC 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

// 직접 실행
crawlCpc();
