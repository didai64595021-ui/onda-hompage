#!/usr/bin/env node
/**
 * 크몽 클릭업(Click-Up) 광고 CPC 데이터 크롤러
 * - 셀러 대시보드의 광고 탭에서 서비스별 노출/클릭/CTR/CPC/비용 수집
 * - 어제 1일치 데이터 수집 후 Supabase에 upsert
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login, saveErrorScreenshot } = require('./lib/login');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { matchProductId } = require('./lib/product-map');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
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

    // === 날짜 필터: "어제" 강제 적용 (필수) ===
    // 검증 결과 (2026-04-07):
    //  - 페이지 진입 시 "광고 노출 영역 확장" 안내 모달이 자동 표시 → 필터 UI 가림
    //  - 필터는 button이 아닌 <a class="rounded-full"> 4개 (지난 7일/오늘/어제/이번 달)
    //  - default 활성 = "지난 7일" (bg-gray-900) → 매번 캡처 시 7일 누적값 저장 = 7배 inflate 사고
    //  - 정답: 모달 닫기 → "어제" a 클릭 → 활성 필터 검증

    // 1) 진입 모달 닫기
    try {
      const modalConfirm = page.locator('button:has-text("확인")').first();
      if (await modalConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await modalConfirm.click();
        await page.waitForTimeout(800);
        console.log('[필터] 진입 안내 모달 닫음');
      }
    } catch {}

    // 2) "어제" a 태그 클릭 (필수)
    const yesterdayLink = page.locator('a.rounded-full:has-text("어제")').first();
    if (!(await yesterdayLink.isVisible({ timeout: 5000 }).catch(() => false))) {
      const fallback = page.locator('a:has-text("어제")').first();
      if (!(await fallback.isVisible({ timeout: 2000 }).catch(() => false))) {
        await saveErrorScreenshot(page, 'no-yesterday-filter');
        throw new Error('"어제" 필터 a 태그를 찾을 수 없음 — 페이지 구조 변경 가능');
      }
      await fallback.click();
    } else {
      await yesterdayLink.click();
    }
    await page.waitForTimeout(2500);

    // 3) 활성 필터 검증 — bg-gray-900 클래스가 "어제"에 붙어 있어야 함
    const activeFilter = await page.evaluate(() => {
      const all = document.querySelectorAll('a.rounded-full');
      for (const el of all) {
        if ((el.className || '').includes('bg-gray-900')) return (el.innerText || '').trim();
      }
      return null;
    });
    if (activeFilter !== '어제') {
      await saveErrorScreenshot(page, 'filter-not-applied');
      throw new Error(`"어제" 필터 적용 실패 — 현재 활성: ${activeFilter}`);
    }
    console.log('[필터] "어제" 필터 적용 검증 완료');

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

      // 광고 ON/OFF 토글 상태: td[0] 내부 토글 스위치
      let adEnabled = true;
      try {
        const toggleInput = cells.nth(0).locator('input[type="checkbox"], input[role="switch"]').first();
        if (await toggleInput.count() > 0) {
          adEnabled = await toggleInput.isChecked();
        } else {
          // 토글 버튼의 class로 판단 (on/active 클래스)
          const toggleEl = cells.nth(0).locator('[class*="toggle"], [class*="switch"]').first();
          if (await toggleEl.count() > 0) {
            const cls = await toggleEl.getAttribute('class') || '';
            adEnabled = cls.includes('on') || cls.includes('active') || cls.includes('checked');
          }
        }
      } catch { /* 토글 없으면 기본 true */ }

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
        ad_enabled: adEnabled,
      };
      records.push(record);
      console.log(`[매핑] ${serviceName.substring(0, 30)} → ${productId} | 노출:${impressions} 클릭:${clicks} 비용:${totalCost}원 | 광고:${adEnabled ? 'ON' : 'OFF'}`);
    }

    // === product_id 중복 제거 ===
    // PRODUCT_MAP의 키워드가 두 행에 동시에 매칭되면 같은 product_id가 records에 두 번 들어가
    // Supabase upsert가 "ON CONFLICT DO UPDATE command cannot affect row a second time" 에러로 실패함.
    // 같은 product_id는 비용 큰 행을 keep (광고 활성도가 높은 게 진짜).
    const dedupMap = new Map();
    for (const r of records) {
      const prev = dedupMap.get(r.product_id);
      if (!prev || (r.cpc_cost || 0) > (prev.cpc_cost || 0)) {
        dedupMap.set(r.product_id, r);
      } else {
        console.log(`[중복 제거] ${r.product_id}: "${r.title_text.substring(0,30)}" (비용 ${r.cpc_cost} ≤ ${prev.cpc_cost}) — 스킵`);
      }
    }
    const uniqueRecords = [...dedupMap.values()];
    if (uniqueRecords.length < records.length) {
      console.log(`[중복 제거] ${records.length}행 → ${uniqueRecords.length}행`);
    }

    // Supabase upsert
    if (uniqueRecords.length > 0) {
      const { data, error } = await supabase
        .from('kmong_cpc_daily')
        .upsert(uniqueRecords, { onConflict: 'product_id,date' });

      if (error) {
        throw new Error(`Supabase upsert 실패: ${error.message}`);
      }
      console.log(`[Supabase] ${uniqueRecords.length}건 upsert 완료`);
    } else {
      console.log('[경고] 수집된 CPC 데이터 없음');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 크롤: CPC ${uniqueRecords.length}건 수집 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notify(msg);

    await browser.close();
    return uniqueRecords;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 CPC 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

// 직접 실행
crawlCpc();
