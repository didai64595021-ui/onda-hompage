require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');
const { fillSubGallery, fillReactSelect, discoverSelects } = require('./create-gig.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const IMAGE_DIR = path.join(__dirname, '03-images');

async function navTo(page, draftId, sub, third) {
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}${third ? `&thirdCategoryId=${third}` : ''}`;
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await page.evaluate(u => { window.location.href = u; }, url);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(4000);
}

async function save(page) {
  await page.evaluate(() => {
    document.querySelectorAll('input,textarea').forEach(el => {
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await sleep(2000);
  const btn = page.locator('button:has-text("임시 저장하기")').last();
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(600);
  await btn.click({ force: true });
  await sleep(8000);
  return true;
}

(async () => {
  const { browser, page } = await login({ slowMo: 80 });
  try {
    // ===== Task 1: N01 이미지 상태 확인 + 재업로드 =====
    console.log('\n===== Task 1: N01 상세 이미지 =====');
    await navTo(page, '764206', '639', '63901');

    const imgState = await page.evaluate(() => {
      // 메인 이미지
      const mainImgs = document.querySelectorAll('#MAIN_GALLERY img');
      // 상세 이미지
      const subImgs = document.querySelectorAll('#IMAGE_GALLERY img');
      // 상세 이미지 섹션 카운터 텍스트
      const allText = document.body.innerText;
      const detailMatch = allText.match(/상세 이미지\s*\((\d+)\/(\d+)\)/);
      return {
        mainCount: mainImgs.length,
        subCount: subImgs.length,
        detailCounter: detailMatch ? detailMatch[0] : 'not found',
      };
    });
    console.log(`   현재 상태: 메인 ${imgState.mainCount} / 상세 ${imgState.subCount} / counter="${imgState.detailCounter}"`);

    if (imgState.subCount < 3) {
      console.log('   상세 이미지 3장 재업로드');
      const gallery = ['niche-N01-gallery-1.png', 'niche-N01-gallery-2.png', 'niche-N01-gallery-3.png'];
      const paths = gallery.map(f => path.join(IMAGE_DIR, f));
      const gRes = await fillSubGallery(page, paths);
      console.log(`   업로드 결과: ${JSON.stringify(gRes)}`);
      await sleep(3000);

      const savedOk = await save(page);
      console.log(`   저장: ${savedOk}`);

      // 재검증
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await sleep(5000);
      const verify = await page.evaluate(() => ({
        mainCount: document.querySelectorAll('#MAIN_GALLERY img').length,
        subCount: document.querySelectorAll('#IMAGE_GALLERY img').length,
        detailCounter: (document.body.innerText.match(/상세 이미지\s*\((\d+)\/(\d+)\)/) || [])[0] || 'not found',
      }));
      console.log(`   persist 확인: 메인 ${verify.mainCount} / 상세 ${verify.subCount} / ${verify.detailCounter}`);
    } else {
      console.log('   ✓ 이미 3장+ 있음 — skip');
    }

    // ===== Task 2: N04 카테고리 옵션 확인 + fill =====
    console.log('\n===== Task 2: N04 카테고리 옵션 probe + fill =====');
    await navTo(page, '764212', '660', '66001');

    const selects = await discoverSelects(page);
    const catSlot = selects.find(s => s.label === '카테고리');
    if (!catSlot) {
      console.log('   카테고리 slot 없음');
    } else {
      console.log(`   카테고리 slot: ${catSlot.inputId}`);
      // dropdown 열어서 옵션 수집
      const control = page.locator(`#${catSlot.inputId}`).locator('xpath=ancestor::div[contains(@class, "-control")][1]');
      await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await sleep(500);
      await control.click({ force: true });
      await sleep(1500);

      const options = await page.evaluate(() => {
        return [...document.querySelectorAll('[role="option"]')]
          .map(el => (el.innerText || '').trim())
          .filter(t => t && t.length < 80);
      });
      console.log(`   N04 카테고리 옵션 ${options.length}개: ${JSON.stringify(options)}`);

      // 드롭다운 닫기
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(500);

      // 노션 gig에 적합한 값 선택 (첫 옵션 or 가장 일반적인 것)
      // '노션 홈페이지 → 진짜 홈페이지' 주제 — 아마 '홈페이지' 관련
      let target = options.find(o => o.includes('홈페이지')) || options.find(o => o.includes('노션')) || options[0];
      console.log(`   선택 목표: "${target}"`);

      const r = await fillReactSelect(page, catSlot.inputId, target, '카테고리');
      console.log(`   fill 결과: ${JSON.stringify(r)}`);
      await sleep(2000);

      const savedOk = await save(page);
      console.log(`   저장: ${savedOk}`);

      // 재검증 (control innerText 방식)
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await sleep(5000);
      const verify = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('input[id^="react-select-"][id$="-input"]')];
        for (const el of inputs) {
          // label LABEL 우선
          let label = '';
          let cur = el;
          for (let i = 0; i < 12 && cur; i++) {
            cur = cur.parentElement;
            if (!cur) break;
            const lbls = [...cur.querySelectorAll(':scope > label, :scope > div > label')];
            for (const l of lbls) {
              const t = (l.innerText || '').trim().replace(/\*\s*$/, '').trim();
              if (t && t.length < 40) { label = t.split('\n')[0]; break; }
            }
            if (label) break;
          }
          if (label === '카테고리') {
            let ctrl = el;
            for (let i = 0; i < 10 && ctrl; i++) {
              ctrl = ctrl.parentElement;
              if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
            }
            const ctrlText = ctrl ? (ctrl.innerText || '').trim() : '';
            return { label, ctrlText, value: ctrlText.replace(label, '').trim() };
          }
        }
        return { err: 'not found' };
      });
      console.log(`   persist 확인: "${verify.value}"`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
})();
