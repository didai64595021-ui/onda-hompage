/**
 * 크몽 카테고리 전수조사 — 1차 카테고리별 2차 옵션 리스트 추출
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CAT1_LIST = ['IT·프로그래밍', '디자인', '마케팅', '영상·사진·음향', '번역·통역', '문서·글쓰기', '비즈니스컨설팅', '레슨·실무교육', '주문제작', '취업·투잡', '세무·법무·노무', '심리상담'];

(async () => {
  const r = await login({ slowMo: 100 });
  const browser = r.browser;
  const page = r.page;

  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await closeModals(page).catch(() => {});

  const result = {};

  for (const cat1 of CAT1_LIST) {
    console.log(`\n[${cat1}] 1차 클릭`);
    try {
      // 1차 카테고리 popover 열기
      const cat1Btn = page.locator('button:has-text("1차 카테고리")').first();
      await cat1Btn.click({ force: true });
      await sleep(1500);

      // cat1 옵션 선택
      const opt1 = page.getByText(cat1, { exact: true }).first();
      if (!(await opt1.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log(`  ✗ ${cat1} 옵션 미발견`);
        result[cat1] = { error: 'cat1 not found' };
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(500);
        continue;
      }
      await opt1.click({ force: true });
      await sleep(1500);

      // 2차 카테고리 popover 열기
      const cat2Btn = page.locator('button:has-text("2차 카테고리")').first();
      await cat2Btn.click({ force: true });
      await sleep(1500);

      // 2차 옵션 텍스트 전수 추출
      const cat2Options = await page.evaluate(() => {
        // popover 내부 옵션들 (button 또는 li 또는 div)
        const containers = [...document.querySelectorAll('div[role="dialog"], div[class*="popover"], div[class*="dropdown"], div[class*="menu"]')];
        const texts = new Set();
        for (const cont of containers) {
          // 보이는 컨테이너만
          const r = cont.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // 자식 텍스트 수집
          [...cont.querySelectorAll('button, li, div')].forEach(el => {
            const t = (el.innerText || '').trim();
            if (t && t.length < 30 && !t.includes('\n')) texts.add(t);
          });
        }
        return [...texts];
      });

      console.log(`  ${cat1}: ${cat2Options.length}개 옵션`);
      result[cat1] = cat2Options;

      // 닫기
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(500);
      // 1차 카테고리 다시 닫기를 위해 reload
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      await closeModals(page).catch(() => {});
    } catch (e) {
      console.log(`  ✗ ${cat1} 오류: ${e.message}`);
      result[cat1] = { error: e.message };
    }
  }

  fs.writeFileSync(path.join(__dirname, 'recon-categories-result.json'), JSON.stringify(result, null, 2));
  console.log('\n저장: recon-categories-result.json');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
