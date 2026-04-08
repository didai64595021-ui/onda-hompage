#!/usr/bin/env node
/**
 * 크몽 신규 서비스 등록 페이지 UI 정찰 (read-only)
 * - 후보 URL 들을 순회하며 페이지 구조/필드/버튼 셀렉터 수집
 * - 결과: new-gigs/explore-new-gig.json + 스크린샷
 *
 * 절대 fill/click/submit 하지 않음. 페이지 열기만.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// 후보 URL 우선순위 — 막힌 페이지는 다음으로
const CANDIDATE_URLS = [
  'https://kmong.com/seller/dashboard',           // 대시보드 → "새 서비스 등록" 버튼 추적
  'https://kmong.com/my-gigs',                    // 내 서비스 목록 → 등록 버튼
  'https://kmong.com/seller/gig/new',
  'https://kmong.com/my-gigs/new',
  'https://kmong.com/gigs/new',
  'https://kmong.com/seller/click-up',            // 광고 페이지 (참고)
];

async function dump(page, label) {
  const result = { label, url: page.url(), title: '', inputs: [], textareas: [], editors: [], buttons: [], links: [], categoryHints: [], imageInputs: [], radios: [], selects: [] };
  try { result.title = await page.title(); } catch {}

  // 모든 보이는 input
  try {
    const inputs = page.locator('input:visible');
    const n = await inputs.count();
    for (let i = 0; i < Math.min(n, 60); i++) {
      const el = inputs.nth(i);
      const r = {
        idx: i,
        type: await el.getAttribute('type').catch(() => '') || 'text',
        name: await el.getAttribute('name').catch(() => '') || '',
        id: await el.getAttribute('id').catch(() => '') || '',
        placeholder: await el.getAttribute('placeholder').catch(() => '') || '',
        ariaLabel: await el.getAttribute('aria-label').catch(() => '') || '',
        value: (await el.inputValue().catch(() => '') || '').slice(0, 100),
        cls: (await el.getAttribute('class').catch(() => '') || '').slice(0, 150),
      };
      if (r.type === 'file') result.imageInputs.push(r);
      else if (r.type === 'radio') result.radios.push(r);
      else result.inputs.push(r);
    }
  } catch (e) { result.inputsErr = e.message; }

  // textarea
  try {
    const ta = page.locator('textarea:visible');
    const n = await ta.count();
    for (let i = 0; i < n; i++) {
      const el = ta.nth(i);
      result.textareas.push({
        idx: i,
        name: await el.getAttribute('name').catch(() => '') || '',
        placeholder: await el.getAttribute('placeholder').catch(() => '') || '',
        cls: (await el.getAttribute('class').catch(() => '') || '').slice(0, 150),
      });
    }
  } catch (e) { result.textareasErr = e.message; }

  // contenteditable
  try {
    const ed = page.locator('[contenteditable="true"]:visible');
    const n = await ed.count();
    for (let i = 0; i < n; i++) {
      const el = ed.nth(i);
      result.editors.push({
        idx: i,
        cls: (await el.getAttribute('class').catch(() => '') || '').slice(0, 150),
        text: ((await el.innerText().catch(() => '')) || '').slice(0, 100),
      });
    }
  } catch {}

  // select
  try {
    const sel = page.locator('select:visible');
    const n = await sel.count();
    for (let i = 0; i < n; i++) {
      const el = sel.nth(i);
      const opts = await el.locator('option').allInnerTexts().catch(() => []);
      result.selects.push({
        idx: i,
        name: await el.getAttribute('name').catch(() => '') || '',
        options: opts.slice(0, 20),
      });
    }
  } catch {}

  // 주요 button (보이는, 텍스트 있는)
  try {
    const btns = page.locator('button:visible');
    const n = await btns.count();
    for (let i = 0; i < Math.min(n, 80); i++) {
      const el = btns.nth(i);
      const txt = ((await el.innerText().catch(() => '')) || '').trim().slice(0, 60);
      if (!txt) continue;
      result.buttons.push({
        idx: i,
        text: txt,
        type: await el.getAttribute('type').catch(() => '') || '',
        cls: (await el.getAttribute('class').catch(() => '') || '').slice(0, 100),
      });
    }
  } catch {}

  // 등록/만들기 관련 링크
  try {
    const links = page.locator('a:visible');
    const n = await links.count();
    for (let i = 0; i < Math.min(n, 100); i++) {
      const el = links.nth(i);
      const txt = ((await el.innerText().catch(() => '')) || '').trim().slice(0, 60);
      const href = await el.getAttribute('href').catch(() => '') || '';
      if (txt.match(/등록|새|만들|gig|서비스/i) || href.match(/new|create|gig/i)) {
        result.links.push({ text: txt, href });
      }
    }
  } catch {}

  // 카테고리 힌트 (드롭다운 트리거 등)
  try {
    const els = page.locator('text=/카테고리/i').locator('xpath=..');
    const n = await els.count();
    for (let i = 0; i < Math.min(n, 5); i++) {
      result.categoryHints.push(((await els.nth(i).innerText().catch(() => '')) || '').slice(0, 200));
    }
  } catch {}

  return result;
}

(async () => {
  let browser;
  try {
    console.log('[정찰] 로그인 시도...');
    const { browser: b, page } = await login({ slowMo: 200 });
    browser = b;

    const allResults = [];
    for (const url of CANDIDATE_URLS) {
      console.log(`\n[정찰] → ${url}`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        await closeModals(page).catch(() => {});
        await page.waitForTimeout(1000);
        const finalUrl = page.url();
        console.log(`   final: ${finalUrl}`);
        const safeName = url.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `new-gig-${safeName}.png`),
          fullPage: true,
        }).catch(() => {});
        const dumped = await dump(page, url);
        dumped.finalUrl = finalUrl;
        allResults.push(dumped);
        console.log(`   inputs=${dumped.inputs.length} textareas=${dumped.textareas.length} editors=${dumped.editors.length} buttons=${dumped.buttons.length} imgInputs=${dumped.imageInputs.length}`);
      } catch (e) {
        console.log(`   FAIL: ${e.message.slice(0, 120)}`);
        allResults.push({ label: url, error: e.message });
      }
    }

    const outPath = path.join(__dirname, 'explore-new-gig.json');
    fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
    console.log(`\n[저장] ${outPath}`);
    console.log(`[스크린샷] ${SCREENSHOT_DIR}/new-gig-*.png`);
  } catch (e) {
    console.error('[정찰 실패]', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
