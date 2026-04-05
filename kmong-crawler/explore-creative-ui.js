#!/usr/bin/env node
/**
 * 크몽 광고 소재 변경 UI 탐색 스크립트
 * 실제 UI를 찾아서 셀렉터를 파악
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { login, saveErrorScreenshot } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const path = require('path');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';
const TARGET_PRODUCT = 'insta-core'; // insta-core 탐색

async function explore() {
  let browser;
  try {
    const result = await login({ slowMo: 300 });
    browser = result.browser;
    const page = result.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await closeModals(page);

    // 스크린샷 1: 초기 페이지
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'explore-clickup-initial.png'), fullPage: true });
    console.log('[스크린샷] explore-clickup-initial.png');

    // 테이블 행 분석
    const rows = page.locator('table tbody tr, [role="row"], .ad-item, .service-row');
    const rowCount = await rows.count().catch(() => 0);
    console.log(`[테이블] 행 수: ${rowCount}`);

    // 더 넓은 셀렉터로 시도
    const allRows = page.locator('tr');
    const allRowCount = await allRows.count();
    console.log(`[전체 tr] 수: ${allRowCount}`);

    // 각 행의 텍스트 및 버튼 확인
    for (let i = 0; i < Math.min(allRowCount, 20); i++) {
      const row = allRows.nth(i);
      const text = await row.textContent().catch(() => '');
      const buttons = await row.locator('button').allTextContents().catch(() => []);
      const links = await row.locator('a').allTextContents().catch(() => []);
      if (text.includes('인스타그램') || text.includes('insta') || text.includes('핵심')) {
        console.log(`\n[행 ${i}] 텍스트: ${text.substring(0, 100)}`);
        console.log(`  버튼: ${JSON.stringify(buttons)}`);
        console.log(`  링크: ${JSON.stringify(links)}`);
        
        // 이 행의 모든 버튼 클릭 시도
        const rowBtns = row.locator('button');
        const btnCount = await rowBtns.count();
        console.log(`  버튼 수: ${btnCount}`);
        for (let b = 0; b < btnCount; b++) {
          const btn = rowBtns.nth(b);
          const btnText = await btn.textContent().catch(() => '');
          const btnClass = await btn.getAttribute('class').catch(() => '');
          console.log(`    버튼[${b}]: "${btnText.trim()}" class="${btnClass?.substring(0,50)}"`);
        }
      }
    }

    // "변경" 링크/버튼 전체 검색
    const changeBtns = page.locator('button:has-text("변경"), a:has-text("변경"), span:has-text("변경")');
    const changeBtnCount = await changeBtns.count();
    console.log(`\n[변경 버튼] 총 ${changeBtnCount}개`);
    for (let i = 0; i < changeBtnCount; i++) {
      const btn = changeBtns.nth(i);
      const text = await btn.textContent().catch(() => '');
      const tag = await btn.evaluate(el => el.tagName).catch(() => '');
      const parent = await btn.evaluate(el => el.parentElement?.textContent?.substring(0, 100)).catch(() => '');
      console.log(`  [${i}] <${tag}> "${text.trim()}" | 부모: ${parent?.trim()?.substring(0, 80)}`);
    }

    // "소재" 관련 버튼/링크 검색
    const creativeBtns = page.locator('button:has-text("소재"), a:has-text("소재"), button:has-text("광고"), a:has-text("광고 관리")');
    const creativeBtnCount = await creativeBtns.count();
    console.log(`\n[소재/광고 버튼] 총 ${creativeBtnCount}개`);
    for (let i = 0; i < creativeBtnCount; i++) {
      const btn = creativeBtns.nth(i);
      const text = await btn.textContent().catch(() => '');
      console.log(`  [${i}] "${text.trim()}"`);
    }

    // insta-core 행 찾기 (다른 방법)
    const instaCoreRow = page.locator('tr:has-text("인스타그램 핵심"), tr:has-text("핵심만 쏙쏙")').first();
    const hasInstaCore = await instaCoreRow.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`\n[insta-core 행 직접검색] 발견: ${hasInstaCore}`);
    
    if (hasInstaCore) {
      // 이 행의 모든 클릭 가능 요소
      const clickable = instaCoreRow.locator('button, a, [role="button"], input[type="button"]');
      const clickCount = await clickable.count();
      console.log(`  클릭 가능 요소: ${clickCount}개`);
      for (let i = 0; i < clickCount; i++) {
        const el = clickable.nth(i);
        const tag = await el.evaluate(e => e.tagName).catch(() => '');
        const txt = await el.textContent().catch(() => '');
        const href = await el.getAttribute('href').catch(() => '');
        console.log(`    [${i}] <${tag}> "${txt?.trim()}" href="${href}"`);
      }

      // 마지막 버튼("변경")이 있는지 확인
      const lastBtn = instaCoreRow.locator('button').last();
      const lastBtnText = await lastBtn.textContent().catch(() => '');
      console.log(`  마지막 버튼: "${lastBtnText?.trim()}"`);

      // 변경 버튼 클릭
      const changeBtn = instaCoreRow.locator('button:has-text("변경")').first();
      if (await changeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('\n[변경 버튼 클릭]');
        await changeBtn.click({ force: true });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'explore-after-change-click.png'), fullPage: true });
        console.log('[스크린샷] explore-after-change-click.png');

        // 현재 URL 확인
        console.log('[URL 이동]', page.url());

        // 열린 모달/폼 분석
        const inputs = page.locator('input:visible, textarea:visible');
        const inputCount = await inputs.count();
        console.log(`[입력 필드] ${inputCount}개`);
        for (let i = 0; i < inputCount; i++) {
          const inp = inputs.nth(i);
          const placeholder = await inp.getAttribute('placeholder').catch(() => '');
          const name = await inp.getAttribute('name').catch(() => '');
          const type = await inp.getAttribute('type').catch(() => '');
          const value = await inp.inputValue().catch(() => '');
          console.log(`  [${i}] type="${type}" name="${name}" placeholder="${placeholder}" value="${value?.substring(0,50)}"`);
        }
      } else {
        console.log('\n[변경 버튼 없음] — 다른 방법 시도');
        // "상세 보기" 클릭
        const detailBtn = instaCoreRow.locator('button:has-text("상세"), a:has-text("상세")').first();
        if (await detailBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('[상세 보기 클릭]');
          await detailBtn.click({ force: true });
          await page.waitForTimeout(3000);
          await page.screenshot({ path: path.join(__dirname, 'screenshots', 'explore-after-detail-click.png'), fullPage: true });
          console.log('[스크린샷] explore-after-detail-click.png');
        }
      }
    }

    await browser.close();
    console.log('\n[탐색 완료]');

  } catch (err) {
    console.error('[에러]', err.message);
    if (browser) await browser.close();
  }
}

explore();
