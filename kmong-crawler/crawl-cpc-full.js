#!/usr/bin/env node
/**
 * 크몽 클릭업 광고 풀 크롤러
 * - 리스트: 광고 ON 서비스만 수집
 * - 변경 모달: 추천 입찰가 + 희망 CPC + 일 예산 + 종료일 스냅샷 (매번 저장)
 * - 상세 모달: 검색어별 성과 (날짜 루프 40일 백필 또는 어제 1일)
 *
 * 사용법:
 *   node crawl-cpc-full.js                  # 어제 1일치 (일일 증분)
 *   node crawl-cpc-full.js --backfill 40    # 어제부터 40일 전까지 전부
 *
 * 근거: probe-out/ad-modal-dump.json + ad-extract.js selector
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login, saveErrorScreenshot } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const { matchProductId } = require('./lib/product-map');
const { notifyTyped } = require('./lib/notify-filter');
const {
  parseNum,
  extractKeywordTable,
  extractChangeModal,
  closeDialog,
  getBackfillDates,
} = require('./lib/ad-extract');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';
const urlForDate = (d) => `${CLICK_UP_URL}?startedDate=${d}&endedDate=${d}&filter=custom`;

async function gotoDate(page, date) {
  await page.goto(urlForDate(date), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  try { const b = page.locator('button:has-text("확인")').first(); if (await b.isVisible({ timeout: 1500 }).catch(()=>false)) await b.click(); } catch {}
  await page.waitForTimeout(800);
}

function getYesterday() {
  // KST 기준 어제 — UTC와 9h 오차로 어제-2 행 오염 방지 (2026-04-20 오염 사고 대응)
  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const kstYesterday = new Date(kstNow.getTime() - 24 * 3600 * 1000);
  return kstYesterday.toISOString().split('T')[0];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const backfillIdx = args.indexOf('--backfill');
  const backfill = backfillIdx >= 0 ? parseInt(args[backfillIdx + 1] || '40', 10) : 0;
  const limit = args.indexOf('--limit') >= 0 ? parseInt(args[args.indexOf('--limit') + 1] || '1', 10) : 0;
  return { backfill, limit };
}

function log(...args) {
  console.log(...args);
  if (process.stdout.write) process.stdout.write('');
}

async function listOnServices(page) {
  return await page.evaluate(() => {
    const out = [];
    const rows = document.querySelectorAll('table tbody tr');
    for (let i = 0; i < rows.length; i++) {
      const toggle = rows[i].querySelector('input[type="checkbox"], input[role="switch"]');
      const on = toggle ? !!toggle.checked : false;
      const img = rows[i].querySelector('img');
      const serviceName = img?.getAttribute('alt') || '';
      const statusCell = rows[i].querySelector('td:nth-child(3)');
      const adStatus = (statusCell?.innerText || '').trim().split('\n')[0];
      out.push({ rowIndex: i, on, serviceName, adStatus });
    }
    return out;
  });
}

async function readListRowMetrics(page, rowIndex) {
  return await page.evaluate((idx) => {
    const rows = document.querySelectorAll('table tbody tr');
    const row = rows[idx];
    if (!row) return null;
    const tds = row.querySelectorAll('td');
    const txt = (el) => (el?.innerText || '').trim();
    return {
      desired_cpc: txt(tds[3]),
      impressions: txt(tds[4]),
      clicks: txt(tds[5]),
      avg_cpc: txt(tds[6]),
      total_cost: txt(tds[7]),
    };
  }, rowIndex);
}

async function openChangeModal(page, rowIndex) {
  const row = page.locator('table tbody tr').nth(rowIndex);
  const btn = row.locator('button:has-text("변경"), a:has-text("변경")').first();
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(2000);
}

async function openDetailModal(page, rowIndex) {
  const row = page.locator('table tbody tr').nth(rowIndex);
  const link = row.locator('a:has-text("상세 보기"), button:has-text("상세 보기"), a:has-text("상세보기"), button:has-text("상세보기")').first();
  await link.click({ timeout: 5000 });
  await page.waitForTimeout(2500);
}

async function saveBidSuggestions(productId, suggestions, capturedAt) {
  if (!suggestions?.length) return 0;
  const rows = suggestions.map(s => ({
    product_id: productId,
    keyword: s.keyword,
    category: null,
    suggested_cpc: s.suggested_cpc,
    captured_at: capturedAt,
  }));
  const { error } = await supabase.from('kmong_ad_bid_suggestion').insert(rows);
  if (error) {
    console.log(`[WARN] bid_suggestion insert 실패: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function saveAdConfig(productId, date, cfg, listMetrics, adStatus) {
  const row = {
    product_id: productId,
    date,
    desired_cpc: cfg.desired_cpc || parseNum(listMetrics?.desired_cpc),
    daily_budget: cfg.daily_budget,
    end_date: cfg.end_date || null,
    ad_enabled: true,
    ad_status: adStatus || null,
  };
  const { error } = await supabase
    .from('kmong_ad_config_daily')
    .upsert([row], { onConflict: 'product_id,date' });
  if (error) console.log(`[WARN] ad_config upsert 실패: ${error.message}`);
}

async function saveKeywordRows(productId, date, rows) {
  if (!rows?.length) return 0;
  const payload = rows.map(r => ({
    product_id: productId,
    date,
    keyword: r.keyword,
    impressions: r.impressions,
    clicks: r.clicks,
    avg_cpc: r.avg_cpc,
    total_cost: r.total_cost,
  }));
  const { error } = await supabase
    .from('kmong_ad_keyword_daily')
    .upsert(payload, { onConflict: 'product_id,date,keyword' });
  if (error) {
    console.log(`[WARN] keyword_daily upsert 실패: ${error.message}`);
    return 0;
  }
  return payload.length;
}

async function saveCpcDailyAggregate(productId, date, listMetrics, adEnabled, serviceName) {
  const impressions = parseNum(listMetrics?.impressions);
  const clicks = parseNum(listMetrics?.clicks);
  const totalCost = parseNum(listMetrics?.total_cost);
  const ctr = impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0;
  const { error } = await supabase
    .from('kmong_cpc_daily')
    .upsert([{
      product_id: productId,
      date,
      impressions,
      clicks,
      ctr,
      cpc_cost: totalCost,
      title_text: serviceName?.trim(),
      ad_enabled: adEnabled,
      crawled_at: new Date().toISOString(),
    }], { onConflict: 'product_id,date' });
  if (error) console.log(`[WARN] cpc_daily upsert 실패: ${error.message}`);
}

async function main() {
  const startTime = Date.now();
  const { backfill } = parseArgs();
  const yesterday = getYesterday();
  const dates = backfill > 0 ? getBackfillDates(backfill) : [yesterday];
  console.log(`=== 크몽 CPC-FULL 크롤러 ===`);
  console.log(`모드: ${backfill > 0 ? `백필 ${backfill}일` : '일일 증분 (어제)'}`);
  console.log(`대상 날짜: ${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`);

  let browser;
  const summary = { services: 0, suggestions: 0, keywordRows: 0, dates: dates.length, errors: [] };

  try {
    const r = await login({ slowMo: 150 });
    browser = r.browser;
    const page = r.page;

    // === Phase 1: 어제 기준 리스트 + 변경 모달 + 설정 스냅샷 ===
    console.log('\n[Phase 1] 어제 기준 리스트 + 변경 모달 수집');
    await gotoDate(page, yesterday);

    const allRows = await listOnServices(page);
    const onRows = allRows.filter(r => r.on);
    console.log(`[리스트] 전체 ${allRows.length}행 / 광고 ON ${onRows.length}행`);
    if (onRows.length === 0) console.log('[경고] ON 서비스 0개 — 전체 상태:', JSON.stringify(allRows.slice(0, 5)));

    const mappedServices = [];
    for (const s of onRows) {
      const productId = matchProductId(s.serviceName);
      if (!productId) { console.log(`[스킵] 매핑 실패: ${s.serviceName}`); continue; }
      mappedServices.push({ ...s, productId });
      console.log(`\n━━━ [${productId}] ${s.serviceName.substring(0, 40)} ━━━`);

      const listMetrics = await readListRowMetrics(page, s.rowIndex);
      await saveCpcDailyAggregate(productId, yesterday, listMetrics, true, s.serviceName);

      try {
        await openChangeModal(page, s.rowIndex);
        const cfg = await extractChangeModal(page);
        const captured = new Date().toISOString();
        const savedSug = await saveBidSuggestions(productId, cfg.suggestions, captured);
        summary.suggestions += savedSug;
        await saveAdConfig(productId, yesterday, cfg, listMetrics, s.adStatus);
        console.log(`  [변경] 추천가 ${cfg.suggestions.length}개 / 희망 ${cfg.desired_cpc}원 / 일예산 ${cfg.daily_budget || '무제한'}`);
        await closeDialog(page);
      } catch (e) {
        console.log(`  [변경-에러] ${e.message}`);
        summary.errors.push({ productId, stage: 'change', msg: e.message });
        await closeDialog(page).catch(() => {});
      }
      summary.services += 1;
    }

    // === Phase 2: 날짜별 상세 모달 루프 (URL 쿼리) ===
    console.log(`\n[Phase 2] 상세 모달 날짜 루프 (${dates.length}일 × ${mappedServices.length}서비스 = ${dates.length * mappedServices.length}회)`);
    for (let di = 0; di < dates.length; di++) {
      const date = dates[di];
      if (di > 0 || dates.length !== 1 || date !== yesterday) {
        await gotoDate(page, date);
      }
      console.log(`\n━━ [${di + 1}/${dates.length}] ${date} ━━`);
      const rowsNow = await listOnServices(page);
      const byName = new Map(rowsNow.map(r => [r.serviceName, r.rowIndex]));

      for (const s of mappedServices) {
        const rowIdx = byName.has(s.serviceName) ? byName.get(s.serviceName) : s.rowIndex;
        try {
          await openDetailModal(page, rowIdx);
          const kwRows = await extractKeywordTable(page);
          const saved = await saveKeywordRows(s.productId, date, kwRows);
          summary.keywordRows += saved;
          const nonZero = kwRows.filter(r => r.impressions > 0 || r.clicks > 0).length;
          console.log(`  [${s.productId}] 키워드 ${kwRows.length} (성과 ${nonZero})`);
          await closeDialog(page);
          await page.waitForTimeout(300);
        } catch (e) {
          console.log(`  [상세-에러 ${s.productId} ${date}] ${e.message}`);
          summary.errors.push({ productId: s.productId, stage: `detail:${date}`, msg: e.message });
          await closeDialog(page).catch(() => {});
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `CPC-FULL: 서비스 ${summary.services} / 추천가 ${summary.suggestions} / 키워드 ${summary.keywordRows}행 / ${dates.length}일 (${elapsed}초) / 에러 ${summary.errors.length}`;
    console.log(`\n=== ${msg} ===`);
    if (summary.errors.length) console.log('에러:', JSON.stringify(summary.errors.slice(0, 10), null, 2));
    notifyTyped('crawl', msg);

    await browser.close();
  } catch (err) {
    console.error(`[치명적 에러] ${err.message}`);
    console.error(err.stack);
    notifyTyped('error', `크몽 CPC-FULL 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
