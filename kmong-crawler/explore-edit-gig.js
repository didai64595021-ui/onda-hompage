#!/usr/bin/env node
/**
 * 크몽 gig 편집 페이지 UI 탐색
 * insta-core (gig 662105) 직접 이동 후 필드 분석
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { login } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const GIG_ID = 662105; // insta-core

async function explore() {
  let browser;
  try {
    const result = await login({ slowMo: 300 });
    browser = result.browser;
    const page = result.page;

    // 직접 편집 페이지로 이동
    const editUrl = `https://kmong.com/my-gigs/edit/${GIG_ID}?rootCategoryId=2&subCategoryId=203&thirdCategoryId=20312`;
    console.log('[편집 페이지 이동]', editUrl);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await closeModals(page);

    // 스크린샷
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'explore-edit-gig-full.png'), fullPage: true });
    console.log('[스크린샷] explore-edit-gig-full.png');
    console.log('[현재 URL]', page.url());

    // 모든 input/textarea 분석
    const inputs = page.locator('input:visible, textarea:visible');
    const inputCount = await inputs.count();
    console.log(`\n[입력 필드] ${inputCount}개`);
    for (let i = 0; i < inputCount; i++) {
      const inp = inputs.nth(i);
      const placeholder = await inp.getAttribute('placeholder').catch(() => '');
      const name = await inp.getAttribute('name').catch(() => '');
      const type = await inp.getAttribute('type').catch(() => '');
      const disabled = await inp.getAttribute('disabled').catch(() => null);
      const value = await inp.inputValue().catch(() => '');
      const cls = await inp.getAttribute('class').catch(() => '');
      console.log(`  [${i}] type="${type}" name="${name}" placeholder="${placeholder}" disabled=${disabled !== null} value="${value?.substring(0,60)}"`)
      console.log(`       class="${cls?.substring(0,80)}"`);
    }

    // contenteditable 에디터
    const editors = page.locator('[contenteditable="true"], .ql-editor, .ProseMirror');
    const editorCount = await editors.count();
    console.log(`\n[에디터] ${editorCount}개`);
    for (let i = 0; i < editorCount; i++) {
      const ed = editors.nth(i);
      const text = await ed.innerText().catch(() => '');
      console.log(`  [${i}] "${text?.substring(0, 100)}"`);
    }

    // 태그 영역 탐색
    const tagArea = page.locator('[class*="tag"], [class*="keyword"], [data-testid*="tag"]');
    const tagCount = await tagArea.count();
    console.log(`\n[태그 영역] ${tagCount}개`);
    for (let i = 0; i < Math.min(tagCount, 5); i++) {
      const tag = tagArea.nth(i);
      const text = await tag.textContent().catch(() => '');
      const cls = await tag.getAttribute('class').catch(() => '');
      console.log(`  [${i}] "${text?.substring(0, 80)}" class="${cls?.substring(0,60)}"`);
    }

    // 현재 태그 값 확인
    const tagItems = page.locator('[class*="tag-item"], [class*="keyword-item"], .chip, [class*="chip"]');
    const tagItemCount = await tagItems.count();
    console.log(`\n[태그 아이템] ${tagItemCount}개`);
    for (let i = 0; i < tagItemCount; i++) {
      const t = tagItems.nth(i);
      const txt = await t.textContent().catch(() => '');
      console.log(`  "${txt?.trim()}"`);
    }

    // 제목 필드 직접 찾기
    const titleInputs = page.locator('input[type="text"]:visible').filter({ hasNot: page.locator('[disabled]') });
    const titleCount = await titleInputs.count();
    console.log(`\n[텍스트 입력 필드 (enabled)] ${titleCount}개`);
    for (let i = 0; i < titleCount; i++) {
      const inp = titleInputs.nth(i);
      const val = await inp.inputValue().catch(() => '');
      const placeholder = await inp.getAttribute('placeholder').catch(() => '');
      console.log(`  [${i}] placeholder="${placeholder}" value="${val?.substring(0,100)}"`);
    }

    // 버튼 목록
    const btns = page.locator('button:visible');
    const btnCount = await btns.count();
    console.log(`\n[버튼] ${btnCount}개`);
    for (let i = 0; i < Math.min(btnCount, 10); i++) {
      const btn = btns.nth(i);
      const txt = await btn.textContent().catch(() => '');
      console.log(`  [${i}] "${txt?.trim()}"`);
    }

    // 페이지 전체 텍스트에서 "제목" 관련 섹션
    const headings = page.locator('h1, h2, h3, label, [class*="label"]');
    const headingCount = await headings.count();
    console.log(`\n[레이블/헤딩] ${Math.min(headingCount, 20)}개`);
    for (let i = 0; i < Math.min(headingCount, 20); i++) {
      const h = headings.nth(i);
      const txt = await h.textContent().catch(() => '');
      if (txt?.trim()) console.log(`  "${txt.trim().substring(0, 80)}"`);
    }

    await browser.close();
    console.log('\n[탐색 완료]');
  } catch (err) {
    console.error('[에러]', err.message);
    if (browser) await browser.close();
  }
}

explore();
