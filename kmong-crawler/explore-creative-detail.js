#!/usr/bin/env node
/**
 * 크몽 광고 소재 변경 경로 정밀 탐색
 * 상세보기 버튼 클릭 후 소재 변경 UI 확인
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { login } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const path = require('path');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

async function explore() {
  let browser;
  try {
    const result = await login({ slowMo: 500 });
    browser = result.browser;
    const page = result.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await closeModals(page);

    // 행 인덱스 1 = insta-core (두 번째 행, 크롤링에서 확인됨)
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    console.log(`[행 수] ${rowCount}`);

    // 각 행의 서비스명 확인
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const text = await row.textContent().catch(() => '');
      console.log(`[행 ${i}] ${text.substring(0, 120).replace(/\s+/g, ' ')}`);
    }

    // insta-core = 행 1 (크롤링 결과 기준)
    const targetRowIdx = 1;
    const targetRow = rows.nth(targetRowIdx);
    const targetText = await targetRow.textContent().catch(() => '');
    console.log(`\n[대상 행 ${targetRowIdx}] ${targetText.substring(0, 150).replace(/\s+/g, ' ')}`);

    // 상태 컬럼 버튼 목록
    const btns = targetRow.locator('button');
    const btnCount = await btns.count();
    console.log(`[버튼 수] ${btnCount}`);
    for (let b = 0; b < btnCount; b++) {
      const btn = btns.nth(b);
      const txt = await btn.textContent().catch(() => '');
      const cls = await btn.getAttribute('class').catch(() => '');
      console.log(`  버튼[${b}]: "${txt?.trim()}" | class: ${cls?.substring(0, 60)}`);
    }

    // "상세보기" 버튼 클릭 (상태 컬럼)
    const detailBtn = targetRow.locator('button:has-text("상세보기"), button:has-text("상세 보기"), a:has-text("상세보기")').first();
    const hasDetail = await detailBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`\n[상세보기 버튼] 발견: ${hasDetail}`);

    if (hasDetail) {
      await detailBtn.click({ force: true });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'explore-detail-modal.png'), fullPage: true });
      console.log('[스크린샷] explore-detail-modal.png');
      console.log('[현재 URL]', page.url());

      // 모달 내 콘텐츠 분석
      const modal = page.locator('[role="dialog"], .modal, .popup, [class*="modal"], [class*="popup"]').first();
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        const modalText = await modal.textContent().catch(() => '');
        console.log('\n[모달 내용]', modalText.substring(0, 500).replace(/\s+/g, ' '));
        
        // 모달 내 버튼
        const modalBtns = modal.locator('button');
        const modalBtnCount = await modalBtns.count();
        for (let b = 0; b < modalBtnCount; b++) {
          const btn = modalBtns.nth(b);
          const txt = await btn.textContent().catch(() => '');
          console.log(`  모달버튼[${b}]: "${txt?.trim()}"`);
        }

        // 모달 내 입력 필드
        const inputs = modal.locator('input, textarea');
        const inputCount = await inputs.count();
        console.log(`\n[모달 입력 필드] ${inputCount}개`);
        for (let i = 0; i < inputCount; i++) {
          const inp = inputs.nth(i);
          const placeholder = await inp.getAttribute('placeholder').catch(() => '');
          const name = await inp.getAttribute('name').catch(() => '');
          const value = await inp.inputValue().catch(() => '');
          console.log(`  [${i}] placeholder="${placeholder}" name="${name}" value="${value?.substring(0,80)}"`);
        }
      }

      // 소재/타이틀 관련 텍스트 찾기
      const pageText = await page.textContent('body').catch(() => '');
      if (pageText.includes('소재') || pageText.includes('타이틀') || pageText.includes('광고문구')) {
        console.log('\n[소재/타이틀 텍스트 발견!]');
        // 관련 요소 찾기
        const titleElems = page.locator('*:has-text("소재"), *:has-text("타이틀 변경"), *:has-text("광고 소재")');
        const count = await titleElems.count();
        console.log(`  관련 요소: ${count}개`);
        for (let i = 0; i < Math.min(count, 5); i++) {
          const el = titleElems.nth(i);
          const txt = await el.textContent().catch(() => '');
          const tag = await el.evaluate(e => e.tagName).catch(() => '');
          console.log(`  <${tag}> "${txt?.trim().substring(0, 100)}"`);
        }
      }
    }

    // 직접 소재 변경 페이지 URL 시도
    console.log('\n[광고 신청 페이지 탐색]');
    await page.goto('https://kmong.com/seller/click-up/apply', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log('[URL]', page.url());
    
    const applyPageTitle = await page.title().catch(() => '');
    console.log('[페이지 제목]', applyPageTitle);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'explore-apply-page.png'), fullPage: false });
    console.log('[스크린샷] explore-apply-page.png');

    await browser.close();
    console.log('\n[탐색 완료]');
  } catch (err) {
    console.error('[에러]', err.message);
    if (browser) await browser.close();
  }
}

explore();
