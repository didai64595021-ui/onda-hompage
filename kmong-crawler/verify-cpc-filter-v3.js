#!/usr/bin/env node
/**
 * 검증 v3 — 최종: 모달 닫기 → "어제" a 태그 클릭 → 단일 일자 데이터 확정
 *
 * v2에서 확정:
 *  - 필터: <a class="block rounded-full border ..."> 4개 (지난 7일/오늘/어제/이번 달)
 *  - 현재 활성: "지난 7일" (bg-gray-900) ← 크롤러가 매번 이걸 저장 = 7배 inflate
 *  - 모달 닫기: button:has-text("확인") 으로 OK
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';
const OUT_PATH = '/tmp/kmong-verify-v3-result.json';
const SHOT_DIR = '/tmp/kmong-verify-shots-v3';

function parseNum(str) {
  if (!str) return 0;
  const c = str.replace(/[,%원건회VAT()포함\s]/g, '').trim();
  const n = parseFloat(c);
  return isNaN(n) ? 0 : n;
}

async function readSummary(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText;
    const find = (label) => {
      const re = new RegExp(label + '[\\s\\S]{0,50}?([\\d,]+)\\s*(원)?', 'i');
      const m = text.match(re);
      return m ? m[1].replace(/,/g, '') : null;
    };
    return {
      impressions: find('총 노출 수'),
      clicks: find('총 클릭 수'),
      avg_cpc: find('평균 클릭 비용'),
      total_cost: find('총 비용'),
    };
  });
}

async function readTable(page) {
  const tableRows = page.locator('table tbody tr');
  const rowCount = await tableRows.count();
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const row = tableRows.nth(i);
    const cells = row.locator('td');
    if (await cells.count() < 8) continue;
    const serviceName = await cells.nth(1).locator('img').first().getAttribute('alt').catch(() => '') || '';
    rows.push({
      serviceName: serviceName.slice(0, 40),
      impressions: parseNum(await cells.nth(4).innerText().catch(() => '0')),
      clicks: parseNum(await cells.nth(5).innerText().catch(() => '0')),
      avgCpc: parseNum(await cells.nth(6).innerText().catch(() => '0')),
      totalCost: parseNum(await cells.nth(7).innerText().catch(() => '0')),
    });
  }
  const totals = rows.reduce((a, r) => ({
    impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks,
    totalCost: a.totalCost + r.totalCost,
  }), { impressions: 0, clicks: 0, totalCost: 0 });
  return { rowCount: rows.length, rows, totals };
}

async function dismissModal(page) {
  try {
    const el = page.locator('button:has-text("확인")').first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click({ timeout: 1500 });
      await page.waitForTimeout(800);
      return true;
    }
  } catch {}
  return false;
}

async function clickPeriod(page, label) {
  /**
   * <a class="block rounded-full border ..."> 4개 중 label 매칭
   */
  const sel = `a.rounded-full:has-text("${label}")`;
  const el = page.locator(sel).first();
  if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) {
    // fallback: 그냥 a:has-text
    const fallback = page.locator(`a:has-text("${label}")`).first();
    if (!(await fallback.isVisible({ timeout: 2000 }).catch(() => false))) {
      throw new Error(`"${label}" 필터 a 태그 못 찾음`);
    }
    await fallback.click({ timeout: 1500 });
  } else {
    await el.click({ timeout: 1500 });
  }
  // 데이터 갱신 대기
  await page.waitForTimeout(2500);
}

async function getActiveFilter(page) {
  return await page.evaluate(() => {
    const all = document.querySelectorAll('a.rounded-full');
    for (const el of all) {
      const cls = el.className || '';
      if (cls.includes('bg-gray-900')) return (el.innerText || '').trim();
    }
    return null;
  });
}

(async () => {
  const result = {
    started_at: new Date().toISOString(),
    cases: {},
  };

  let browser;
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    console.log('[step] 로그인...');
    const r = await login({ slowMo: 80 });
    browser = r.browser;
    const page = r.page;

    console.log('[step] 클릭업 페이지 이동');
    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);

    console.log('[step] 모달 닫기');
    result.modal_dismissed = await dismissModal(page);
    await page.waitForTimeout(800);

    // 진입 직후 활성 필터 확인
    result.initial_active = await getActiveFilter(page);
    console.log('[default 활성]', result.initial_active);

    await page.screenshot({ path: path.join(SHOT_DIR, '1-default.png'), fullPage: false });
    result.cases.default = {
      active: result.initial_active,
      summary: await readSummary(page),
      table: await readTable(page),
    };

    // === "어제" 클릭 ===
    console.log('[step] "어제" 클릭');
    await clickPeriod(page, '어제');
    await page.screenshot({ path: path.join(SHOT_DIR, '2-yesterday.png'), fullPage: false });
    result.cases.yesterday = {
      active: await getActiveFilter(page),
      summary: await readSummary(page),
      table: await readTable(page),
    };

    // === "이번 달" 클릭 ===
    console.log('[step] "이번 달" 클릭');
    await clickPeriod(page, '이번 달');
    await page.screenshot({ path: path.join(SHOT_DIR, '3-this-month.png'), fullPage: false });
    result.cases.this_month = {
      active: await getActiveFilter(page),
      summary: await readSummary(page),
      table: await readTable(page),
    };

    fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
    console.log('OK ->', OUT_PATH);
  } catch (err) {
    console.error('[FAIL]', err.message);
    result.error = err.message;
    result.stack = err.stack;
    fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
