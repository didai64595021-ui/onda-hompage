/**
 * 단일 select persist 디버그 — 왜 업종/개발스택 만 persist 안되는지
 *
 * 가설:
 *   A) fillReactSelect 의 onChange 이벤트가 특정 select에 안 먹힘
 *   B) React state commit 타이밍 문제 (다른 select 와의 상호작용)
 *   C) 카테고리 특화 필드는 별도 API 호출 필요
 *
 * 실험:
 *   1) 카테고리 select 1개만 fill
 *   2) 즉시 save
 *   3) recon 으로 persist 확인
 *   4) 실패 시 다양한 dispatch 전략 시도
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { fillReactSelect, discoverSelects } = require('./create-gig.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const draftId = '764211';
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113`;

  const { browser, page } = await login({ slowMo: 80 });
  try {
    console.log('[1] nav');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    // 카테고리 select 찾기
    const selects = await discoverSelects(page);
    const cat = selects.find(s => s.label === '카테고리');
    console.log(`[2] 카테고리 select: ${cat?.inputId}`);
    if (!cat) throw new Error('카테고리 select not found');

    // UI 상태 before
    const beforeUI = await page.evaluate(id => {
      const el = document.getElementById(id);
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      if (!ctrl) return null;
      const sv = ctrl.querySelector('[class*="singleValue"]');
      return { selected: sv ? (sv.innerText || '').trim() : '', controlHTML: ctrl.outerHTML.slice(0, 300) };
    }, cat.inputId);
    console.log(`   before UI: selected="${beforeUI?.selected}"`);

    // fill — playwright native click 사용
    console.log('[3] control 클릭 → dropdown 열기');
    const control = page.locator(`#${cat.inputId}`).locator('xpath=ancestor::div[contains(@class, "-control")][1]');
    await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(500);
    await control.click({ force: true });
    await sleep(1200);

    // 드롭다운 DOM 구조 검사
    console.log('[3b] dropdown DOM 조사');
    const menuInfo = await page.evaluate(() => {
      // role=option 찾기
      const roleOpts = document.querySelectorAll('[role="option"]');
      // react-select option 클래스
      const rsOpts = document.querySelectorAll('[class*="-option"], [class*="option"]');
      // kmong 커스텀
      const kmongOpts = [...document.querySelectorAll('div')].filter(el => {
        const cls = String(el.className || '');
        return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between')
          && cls.includes('text-gray-900') && cls.includes('px-3');
      });
      return {
        roleOptions: [...roleOpts].slice(0, 3).map(el => ({ tag: el.tagName, text: (el.innerText || '').slice(0, 40), role: el.getAttribute('role'), cls: (el.className || '').slice(0, 80) })),
        rsOptions: [...rsOpts].slice(0, 3).map(el => ({ tag: el.tagName, text: (el.innerText || '').slice(0, 40), cls: (el.className || '').slice(0, 80) })),
        kmongOptions: kmongOpts.slice(0, 3).map(el => ({ tag: el.tagName, text: (el.innerText || '').slice(0, 40), role: el.getAttribute('role') || 'none', parentRole: el.parentElement?.getAttribute('role') || 'none' })),
      };
    });
    console.log(JSON.stringify(menuInfo, null, 2));

    // 방법 B: page.mouse 로 실제 mouse 이벤트
    console.log('[3c-B] page.mouse 좌표 클릭');
    const optLoc = page.locator('[role="option"]').filter({ hasText: /^포트폴리오 홈페이지$/ }).first();
    const box = await optLoc.boundingBox();
    console.log(`   box: ${JSON.stringify(box)}`);
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await sleep(300);
      await page.mouse.down();
      await sleep(150);
      await page.mouse.up();
      await sleep(1500);
    }

    const midUI = await page.evaluate(id => {
      const el = document.getElementById(id);
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      const sv = ctrl ? ctrl.querySelector('[class*="singleValue"]') : null;
      return sv ? (sv.innerText || '').trim() : '';
    }, cat.inputId);
    console.log(`[3c-B result] mid UI: selected="${midUI}"`);

    // UI 상태 after fill
    const afterFillUI = await page.evaluate(id => {
      const el = document.getElementById(id);
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      if (!ctrl) return null;
      const sv = ctrl.querySelector('[class*="singleValue"]');
      return { selected: sv ? (sv.innerText || '').trim() : '' };
    }, cat.inputId);
    console.log(`[4] after fill UI: selected="${afterFillUI?.selected}"`);

    // 다양한 dispatch 시도
    console.log('[5] 추가 dispatch (blur+change+input)');
    await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      // control 요소에도 dispatch
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      if (ctrl) {
        ctrl.dispatchEvent(new Event('blur', { bubbles: true }));
        ctrl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // body 클릭 (포커스 해제)
      document.body.click();
    }, cat.inputId);
    await sleep(2000);

    // 저장
    console.log('[6] save');
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(1000);
    await btn.click({ force: true });
    await sleep(8000);

    // 저장 후 재로드 전 UI 상태
    const postSaveUI = await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return { err: 'input disappeared' };
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      if (!ctrl) return { err: 'control not found' };
      const sv = ctrl.querySelector('[class*="singleValue"]');
      return { selected: sv ? (sv.innerText || '').trim() : '' };
    }, cat.inputId);
    console.log(`[7] post-save (no reload): selected="${postSaveUI.selected || postSaveUI.err}"`);

    // 재로드
    console.log('[8] reload');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const afterReloadUI = await page.evaluate(() => {
      // 카테고리 select 다시 찾기 (id 변경됨)
      const out = [];
      document.querySelectorAll('input[id^="react-select-"][id$="-input"]').forEach(el => {
        let label = '';
        let cur = el;
        for (let i = 0; i < 12 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const lbls = [...cur.querySelectorAll(':scope > label, :scope > div > label')];
          for (const l of lbls) {
            const t = (l.innerText || '').trim().replace(/\*\s*$/, '').trim();
            if (t && t.length < 40) { label = t; break; }
          }
          if (label) break;
        }
        if (label === '카테고리') {
          let ctrl = el;
          for (let i = 0; i < 10 && ctrl; i++) {
            ctrl = ctrl.parentElement;
            if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
          }
          const sv = ctrl ? ctrl.querySelector('[class*="singleValue"]') : null;
          out.push({ id: el.id, selected: sv ? (sv.innerText || '').trim() : '' });
        }
      });
      return out;
    });
    console.log(`[9] after reload: ${JSON.stringify(afterReloadUI)}`);

    // 판정
    if (afterReloadUI[0]?.selected === '포트폴리오 홈페이지') {
      console.log('\n✅ PERSIST 성공');
    } else {
      console.log('\n❌ PERSIST 실패 — 저장 후 재로드 시 값 사라짐');
      console.log('   가설: 카테고리 select는 다른 저장 경로 필요 (별도 API / 별도 form submit)');
    }
  } finally {
    await browser.close().catch(() => {});
  }
})();
