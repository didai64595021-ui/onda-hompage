/**
 * 카테고리 전수조사 v3 — 페이지 전체 텍스트 덤프 + 화면 캡처
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function dumpVisibleTexts(page) {
  return await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('button, li, [role="option"], [role="menuitem"], a, span, div')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // 자체 텍스트만 (자식 텍스트 제외)
      let ownText = '';
      for (const node of el.childNodes) {
        if (node.nodeType === 3) ownText += node.textContent;  // text node
      }
      ownText = ownText.trim();
      if (!ownText) {
        // 자식이 없으면 innerText 사용
        if (el.children.length === 0) ownText = (el.innerText || '').trim();
      }
      if (!ownText || ownText.length > 30 || ownText.includes('\n')) continue;
      if (seen.has(ownText)) continue;
      seen.add(ownText);
      out.push({ tag: el.tagName, text: ownText });
    }
    return out;
  });
}

(async () => {
  const r = await login({ slowMo: 80 });
  const browser = r.browser;
  const page = r.page;

  const result = {};
  const CAT1_LIST = ['IT·프로그래밍', '디자인', '마케팅', '영상·사진·음향'];

  for (const cat1 of CAT1_LIST) {
    console.log(`\n========== ${cat1} ==========`);
    try {
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
      await closeModals(page).catch(() => {});

      // 1차 카테고리 버튼 클릭
      const cat1Btn = page.locator('button').filter({ hasText: '1차 카테고리' }).first();
      const c1Visible = await cat1Btn.isVisible({ timeout: 5000 }).catch(() => false);
      if (!c1Visible) {
        console.log(`  ✗ 1차 카테고리 버튼 미발견`);
        result[cat1] = { error: '1차 카테고리 버튼 미발견' };
        continue;
      }
      await cat1Btn.click({ force: true });
      await sleep(3000);

      // 클릭 후 보이는 텍스트 모두 dump (cat1 옵션들 포함)
      const cat1Visible = await dumpVisibleTexts(page);
      console.log(`  cat1 클릭 후 visible 텍스트 ${cat1Visible.length}개`);

      // cat1 선택
      const opt1 = page.locator('button, li, div').filter({ hasText: cat1 }).first();
      if (!(await opt1.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log(`  ✗ cat1 옵션 ${cat1} 미발견`);
        result[cat1] = { error: 'cat1 not found in popover', visibleAfterCat1Click: cat1Visible.slice(0, 50) };
        continue;
      }
      await opt1.click({ force: true });
      await sleep(3000);

      // 2차 카테고리 버튼 클릭
      const cat2Btn = page.locator('button').filter({ hasText: '2차 카테고리' }).first();
      if (!(await cat2Btn.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log(`  ✗ 2차 카테고리 버튼 미발견`);
        result[cat1] = { error: '2차 카테고리 버튼 미발견' };
        continue;
      }
      await cat2Btn.click({ force: true });
      await sleep(3000);

      const cat2Visible = await dumpVisibleTexts(page);
      console.log(`  cat2 클릭 후 visible 텍스트 ${cat2Visible.length}개`);

      // 일반 노이즈 제외 + 2차 옵션 추출
      const noise = new Set(['1차 카테고리', '2차 카테고리', '다음', '취소', '닫기', '확인', cat1, '카테고리', '제목', '서비스 등록', '기본 정보', '어떤 카테고리의 서비스를 등록하시나요?', '검색에 잘 노출되는 카테고리를 고르는 방법']);
      const filtered = cat2Visible.filter(o => !noise.has(o.text));
      result[cat1] = filtered.map(o => o.text);

      console.log(`  ${filtered.length}개 cat2 후보:`);
      filtered.slice(0, 30).forEach(o => console.log(`    - ${o.text}`));

      await page.screenshot({ path: path.join(__dirname, 'screenshots', `recon-${cat1.replace(/[·]/g, '_')}-cat2.png`), fullPage: false });
    } catch (e) {
      console.log(`  ✗ ${cat1} 오류: ${e.message}`);
      result[cat1] = { error: e.message };
    }
  }

  fs.writeFileSync(path.join(__dirname, 'recon-categories-v3-result.json'), JSON.stringify(result, null, 2));
  console.log('\n저장: recon-categories-v3-result.json');
  await browser.close();
})().catch(e => { console.error('치명:', e); process.exit(1); });
