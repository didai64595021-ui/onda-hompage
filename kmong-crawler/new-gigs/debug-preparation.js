#!/usr/bin/env node
/**
 * 준비사항 필드 디버그 — 실제 DOM 구조 확인
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  // R01 draft
  await page.goto('https://kmong.com/my-gigs/edit/761745?rootCategoryId=2&subCategoryId=230', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await sleep(6000);
  await closeModals(page).catch(() => {});

  // 페이지 끝까지 스크롤
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(2000);

  // 모든 TipTap 에디터 찾기
  const editors = await page.evaluate(() => {
    const results = [];
    // ProseMirror 에디터 전체 탐색
    document.querySelectorAll('.ProseMirror').forEach((el, i) => {
      let parentId = '';
      let cur = el;
      for (let j = 0; j < 10 && cur; j++) {
        cur = cur.parentElement;
        if (cur && cur.id) { parentId = cur.id; break; }
      }
      const rect = el.getBoundingClientRect();
      results.push({
        idx: i,
        parentId,
        visible: rect.width > 0 && rect.height > 0,
        top: rect.top,
        text: (el.innerText || '').slice(0, 50),
      });
    });

    // ID로 직접 찾기
    const ids = ['DESCRIPTION', 'DESCRIPTION_PROGRESS', 'DESCRIPTION_PREPARATION'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const pm = el.querySelector('.ProseMirror');
        const rect = el.getBoundingClientRect();
        results.push({
          directLookup: id,
          exists: true,
          hasProseMirror: !!pm,
          visible: rect.width > 0 && rect.height > 0,
          top: rect.top,
          display: window.getComputedStyle(el).display,
          overflow: window.getComputedStyle(el).overflow,
        });
      } else {
        results.push({ directLookup: id, exists: false });
      }
    });

    // 섹션 헤더 찾기 (의뢰인 준비사항)
    const headers = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, p, span, div').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t.includes('준비사항') || t.includes('의뢰인')) {
        const rect = el.getBoundingClientRect();
        headers.push({ text: t.slice(0, 60), tag: el.tagName, top: rect.top, visible: rect.height > 0 });
      }
    });

    return { editors: results, headers };
  });

  console.log('=== ProseMirror 에디터 ===');
  editors.editors.forEach(e => console.log(JSON.stringify(e)));
  console.log('\n=== 준비사항 헤더 ===');
  editors.headers.forEach(h => console.log(JSON.stringify(h)));

  // 스크린샷
  await page.screenshot({ path: require('path').join(__dirname, 'screenshots', 'debug-preparation-full.png'), fullPage: true });
  console.log('\n스크린샷 저장 완료');

  await browser.close();
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
