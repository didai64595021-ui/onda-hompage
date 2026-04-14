#!/usr/bin/env node
/**
 * 크몽 서비스 설명 에디터(TipTap/ProseMirror) 툴바 정찰
 * - 기존 draft 하나에 접속 → #DESCRIPTION 주변 툴바 요소 dump
 * - 7단계 풀자동화 포맷팅 시 어떤 서식 버튼이 지원되는지 확인
 * - 지원 단축키도 확인 (Ctrl+B 등)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TARGET_DRAFT = process.argv[2] || 763080;
const DRAFT_URL = `https://kmong.com/my-gigs/edit/${TARGET_DRAFT}?rootCategoryId=1&subCategoryId=113&thirdCategoryId=11301`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await login(page);
  console.log(`[recon] draft URL: ${DRAFT_URL}`);
  await page.goto(DRAFT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  await closeModals(page).catch(() => {});

  // #DESCRIPTION ProseMirror 찾기
  const editor = page.locator('#DESCRIPTION .ProseMirror').first();
  const editorVisible = await editor.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`[recon] #DESCRIPTION ProseMirror visible: ${editorVisible}`);

  if (!editorVisible) {
    console.log('편집 에디터 미발견 — URL 확인');
    await browser.close();
    process.exit(1);
  }

  // #DESCRIPTION 컨테이너 주변 (가까운 조상 → 자식 중 툴바로 보이는 요소 dump)
  const toolbar = await page.evaluate(() => {
    const descRoot = document.querySelector('#DESCRIPTION');
    if (!descRoot) return { error: 'no #DESCRIPTION' };

    // 조상 탐색 (에디터 컨테이너)
    let container = descRoot;
    for (let i = 0; i < 6 && container; i++) {
      container = container.parentElement;
      if (!container) break;
      // 툴바가 포함된 조상 탐색
      if (container.querySelectorAll('button').length > 2) break;
    }

    const buttons = [];
    (container || descRoot).querySelectorAll('button').forEach(btn => {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // 가까운 거리의 버튼만 (툴바는 에디터 근처)
      const dr = descRoot.getBoundingClientRect();
      if (Math.abs(r.top - dr.top) > 200 && Math.abs(r.bottom - dr.top) > 200) return;
      const text = (btn.innerText || '').trim();
      const aria = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';
      const dataAction = btn.getAttribute('data-action') || '';
      const svg = btn.querySelector('svg');
      const svgHTML = svg ? (svg.outerHTML || '').slice(0, 200) : '';
      const cls = (btn.className || '').toString().slice(0, 80);
      buttons.push({ text, aria, title, dataAction, svgHTML, cls, x: Math.round(r.x), y: Math.round(r.y) });
    });

    // TipTap extensions 확인 (React-TipTap은 editor instance를 window에 노출하지 않음)
    // ProseMirror의 Schema 확인
    const pmNodes = [];
    const pmMarks = [];
    const pm = descRoot.querySelector('.ProseMirror');
    if (pm && pm.pmViewDesc) {
      // 내부 API (보통 접근 불가)
    }
    // Schema는 얻기 어려워서 버튼 + data 속성으로 추측

    return { buttons };
  });

  console.log('\n=== #DESCRIPTION 툴바 버튼 dump ===');
  console.log(JSON.stringify(toolbar, null, 2));

  // 스크린샷
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'recon-editor-toolbar.png'), fullPage: false });

  // 에디터 클릭 → 단축키 테스트
  console.log('\n=== 단축키 테스트 ===');
  await editor.click({ force: true });
  await sleep(500);
  await page.keyboard.press('Control+A');
  await sleep(200);
  await page.keyboard.press('Delete');
  await sleep(300);
  await page.keyboard.type('TEST_BOLD');
  await sleep(300);
  // Ctrl+A → Ctrl+B
  await page.keyboard.press('Control+A');
  await sleep(200);
  await page.keyboard.press('Control+B');
  await sleep(500);
  const afterBold = await page.evaluate(() => {
    return document.querySelector('#DESCRIPTION .ProseMirror').innerHTML;
  });
  console.log('after Ctrl+B innerHTML:', afterBold.slice(0, 500));

  // Ctrl+A → Ctrl+B (해제) → H2 단축키 Ctrl+Shift+2
  await page.keyboard.press('Control+B');
  await sleep(300);
  await page.keyboard.press('Control+Shift+2');
  await sleep(500);
  const afterH2 = await page.evaluate(() => {
    return document.querySelector('#DESCRIPTION .ProseMirror').innerHTML;
  });
  console.log('after Ctrl+Shift+2 innerHTML:', afterH2.slice(0, 500));

  // 툴바 버튼 직접 클릭 (첫번째 버튼이 뭐하는지 확인)
  if (toolbar.buttons && toolbar.buttons.length > 0) {
    console.log(`\n총 ${toolbar.buttons.length}개 버튼 발견`);
    const labels = toolbar.buttons.map((b, i) => `${i}: ${b.aria || b.title || b.text || b.cls}`).slice(0, 30);
    console.log(labels.join('\n'));
  }

  // 저장
  fs.writeFileSync(path.join(__dirname, 'recon-editor-toolbar.json'),
    JSON.stringify({ url: DRAFT_URL, toolbar, afterBold, afterH2 }, null, 2));
  console.log('\n저장: recon-editor-toolbar.json');

  await browser.close();
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
