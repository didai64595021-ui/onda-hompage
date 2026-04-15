#!/usr/bin/env node
/**
 * kmong-dashboard 페이지 진단
 *  - GitHub Pages URL 접속
 *  - 콘솔 오류 + 네트워크 오류 + Supabase fetch 결과 캡처
 *  - 각 탭 클릭하여 데이터 표시 여부 확인
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const URL = 'https://didai64595021-ui.github.io/onda-hompage/portfolio-sites/kmong-dashboard/';
const OUT = path.join(__dirname, 'diag-out', `dashboard-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 }, locale: 'ko-KR',
  })).newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const networkErrors = [];
  const supabaseResponses = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), location: msg.location() });
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('requestfailed', (req) => networkErrors.push({ url: req.url(), failure: req.failure() }));
  page.on('response', async (res) => {
    if (res.url().includes('supabase.co/rest/v1/')) {
      try {
        const body = (await res.text()).slice(0, 400);
        supabaseResponses.push({ url: res.url(), status: res.status(), bodySample: body });
      } catch {}
    }
  });

  console.log(`접속: ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  // 스크롤로 lazy load
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await sleep(700); }

  const meta = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('button, a, [role=tab]')].map(e => (e.innerText || '').trim()).filter(t => t && t.length < 30);
    const hasSupabase = !!window.supabase;
    const hasError = !!document.querySelector('[class*="error"], .alert-danger');
    return {
      title: document.title,
      hasSupabase,
      tabsSample: tabs.slice(0, 30),
      bodyTextSample: (document.body.innerText || '').slice(0, 1000),
    };
  });

  await page.screenshot({ path: path.join(OUT, 'page1.png'), fullPage: false });

  // 각 탭 클릭 시도 (대시보드 탭 이름 추정)
  const tabsToClick = ['CPC', 'Funnel', 'ROI', 'Sales', 'Inquiry', 'Inbox'];
  for (const tabName of tabsToClick) {
    try {
      const clicked = await page.evaluate((t) => {
        const btn = [...document.querySelectorAll('button, a, [role=tab]')].find(e => (e.innerText || '').trim().toUpperCase() === t.toUpperCase());
        if (btn) { btn.click(); return true; }
        return false;
      }, tabName);
      if (clicked) {
        await sleep(2000);
        await page.screenshot({ path: path.join(OUT, `tab-${tabName}.png`), fullPage: false });
      }
    } catch {}
  }

  fs.writeFileSync(path.join(OUT, 'console-errors.json'), JSON.stringify({ consoleErrors, consoleWarnings, networkErrors, supabaseResponses, meta }, null, 2));
  console.log(`\n=== 결과 ===`);
  console.log(`title: ${meta.title}`);
  console.log(`hasSupabase: ${meta.hasSupabase}`);
  console.log(`콘솔 오류: ${consoleErrors.length}건`);
  consoleErrors.slice(0, 5).forEach((e, i) => console.log(`  ${i+1}. ${e.text.slice(0, 200)}`));
  console.log(`네트워크 오류: ${networkErrors.length}건`);
  networkErrors.slice(0, 5).forEach((e, i) => console.log(`  ${i+1}. ${e.url.slice(0, 100)} - ${e.failure?.errorText}`));
  console.log(`Supabase 응답: ${supabaseResponses.length}건`);
  supabaseResponses.slice(0, 8).forEach((r, i) => {
    const tableName = (r.url.match(/rest\/v1\/(\w+)/) || [])[1];
    console.log(`  ${i+1}. ${tableName} ${r.status} | ${r.bodySample.slice(0, 80)}`);
  });
  console.log(`\n결과: ${OUT}`);
  await browser.close();
})();
