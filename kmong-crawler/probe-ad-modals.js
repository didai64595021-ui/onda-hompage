#!/usr/bin/env node
/**
 * 크몽 클릭업 광고 모달 DOM 구조 탐색 prober
 * - ON 상태 첫 서비스 기준으로 "변경" 모달 + "상세 보기" 모달 HTML 덤프
 * - 추출 로직 설계 근거 자료 (본 크롤러는 이 결과를 기반으로 selector 확정)
 * - 결과: probe-out/ad-modal-dump.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login, saveErrorScreenshot } = require('./lib/login');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';
const OUT_DIR = path.join(__dirname, 'probe-out');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function dumpModalDom(page, label) {
  const html = await page.evaluate(() => {
    const modals = document.querySelectorAll('[role="dialog"], [class*="Modal"], [class*="modal"], [class*="Dialog"], [class*="dialog"]');
    const visible = Array.from(modals).filter(m => {
      const r = m.getBoundingClientRect();
      return r.width > 100 && r.height > 100;
    });
    if (!visible.length) return null;
    visible.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));
    return visible[0].outerHTML;
  });
  if (!html) return null;
  const file = path.join(OUT_DIR, `modal-${label}.html`);
  fs.writeFileSync(file, html);
  console.log(`[${label}] 모달 HTML 저장 → ${file} (${html.length} bytes)`);
  return { file, length: html.length };
}

async function main() {
  const startTime = Date.now();
  let browser;
  const report = { timestamp: new Date().toISOString(), steps: [] };

  try {
    console.log('=== 광고 모달 DOM 탐색 시작 ===');
    const r = await login({ slowMo: 200 });
    browser = r.browser;
    const page = r.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    try {
      const btn = page.locator('button:has-text("확인")').first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) await btn.click();
      await page.waitForTimeout(800);
    } catch {}

    // 첫 ON 상태 행 찾기 (광고 토글 ON)
    const rowIndex = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      for (let i = 0; i < rows.length; i++) {
        const toggle = rows[i].querySelector('input[type="checkbox"], input[role="switch"]');
        if (toggle && toggle.checked) return i;
      }
      return -1;
    });
    if (rowIndex === -1) {
      console.log('[경고] ON 상태 서비스 없음 — 첫 행으로 진행');
    }
    const targetIdx = rowIndex >= 0 ? rowIndex : 0;
    console.log(`[타겟] 행 index=${targetIdx}`);

    const row = page.locator('table tbody tr').nth(targetIdx);
    const serviceName = await row.locator('img').first().getAttribute('alt').catch(() => '(unknown)');
    console.log(`[서비스] ${serviceName}`);
    report.service = serviceName;
    report.rowIndex = targetIdx;

    // ---- 1) 변경 모달 ----
    console.log('\n[Step 1] 변경 버튼 클릭');
    const changeBtn = row.locator('button:has-text("변경"), a:has-text("변경")').first();
    await changeBtn.click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    const step1 = await dumpModalDom(page, 'change');
    report.steps.push({ step: 'change_modal', ...step1 });

    const changeScreenshot = path.join(OUT_DIR, 'change-modal.png');
    await page.screenshot({ path: changeScreenshot, fullPage: false });
    console.log(`[Screenshot] ${changeScreenshot}`);

    // 닫기
    const closeBtn = page.locator('[role="dialog"] button:has-text("닫기"), [role="dialog"] button[aria-label*="close" i], [role="dialog"] svg[class*="close"]').first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(1500);

    // ---- 2) 상세 보기 모달 ----
    console.log('\n[Step 2] 상세 보기 클릭');
    const detailLink = row.locator('a:has-text("상세 보기"), button:has-text("상세 보기"), a:has-text("상세보기"), button:has-text("상세보기")').first();
    await detailLink.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    const step2 = await dumpModalDom(page, 'detail');
    report.steps.push({ step: 'detail_modal', ...step2 });

    const detailScreenshot = path.join(OUT_DIR, 'detail-modal.png');
    await page.screenshot({ path: detailScreenshot, fullPage: false });
    console.log(`[Screenshot] ${detailScreenshot}`);

    // 상세 모달의 날짜 필터 탐색
    const datePickerInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="date"], input[placeholder*="날짜"], input[placeholder*="date" i], [class*="date-picker" i], [class*="datepicker" i]');
      return Array.from(inputs).map(el => ({
        tag: el.tagName,
        type: el.type,
        placeholder: el.placeholder || null,
        value: el.value || null,
        cls: el.className,
      }));
    });
    report.detailDatePicker = datePickerInfo;
    console.log(`[날짜 필터 후보] ${datePickerInfo.length}개`);

    // 필터 버튼 (오늘/어제/7일/이번달) 있는지
    const filterButtons = await page.evaluate(() => {
      const all = document.querySelectorAll('[role="dialog"] a.rounded-full, [role="dialog"] button.rounded-full, [role="dialog"] a[class*="rounded"], [role="dialog"] button[class*="rounded"]');
      return Array.from(all).map(el => (el.innerText || '').trim()).filter(t => t.length > 0 && t.length < 30);
    });
    report.detailFilterButtons = filterButtons;
    console.log(`[필터 버튼] ${filterButtons.join(', ')}`);

    fs.writeFileSync(path.join(OUT_DIR, 'ad-modal-dump.json'), JSON.stringify(report, null, 2));
    console.log(`\n=== 완료 (${((Date.now() - startTime) / 1000).toFixed(1)}초) ===`);
    console.log(`결과: ${path.join(OUT_DIR, 'ad-modal-dump.json')}`);

    await browser.close();
  } catch (err) {
    console.error(`[에러] ${err.message}`);
    console.error(err.stack);
    if (browser) {
      const pages = browser.contexts().flatMap(c => c.pages());
      if (pages[0]) await saveErrorScreenshot(pages[0], 'probe-error');
      await browser.close();
    }
    process.exit(1);
  }
}

main();
