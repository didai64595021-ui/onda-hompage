/**
 * 카테고리 전수조사 v2 — 더 넓은 셀렉터 + HTML 덤프 폴백
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CAT1_LIST = ['IT·프로그래밍', '디자인', '마케팅', '영상·사진·음향'];

(async () => {
  const r = await login({ slowMo: 100 });
  const browser = r.browser;
  const page = r.page;

  const result = {};

  for (const cat1 of CAT1_LIST) {
    console.log(`\n========== ${cat1} ==========`);
    try {
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      await closeModals(page).catch(() => {});

      // 1차 카테고리 클릭
      const cat1Btn = page.locator('button:has-text("1차 카테고리")').first();
      await cat1Btn.click({ force: true });
      await sleep(2000);

      // 옵션 선택
      const opt1 = page.getByText(cat1, { exact: true }).first();
      if (!(await opt1.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log(`  ✗ 1차 옵션 ${cat1} 미발견`);
        result[cat1] = { error: 'cat1 not found' };
        continue;
      }
      await opt1.click({ force: true });
      await sleep(2500);

      // 2차 카테고리 클릭
      const cat2Btn = page.locator('button:has-text("2차 카테고리")').first();
      await cat2Btn.click({ force: true });
      await sleep(2500);

      // 모든 클릭 가능한 텍스트 추출 (모달 안에서)
      const opts = await page.evaluate(() => {
        // 모든 button, li, [role="option"], div with click handler
        const all = document.querySelectorAll('button, li, [role="option"], div');
        const out = [];
        const seen = new Set();
        for (const el of all) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const t = (el.innerText || '').trim();
          if (!t || t.length > 30 || t.includes('\n')) continue;
          // 자체 텍스트만 (자식 없는 leaf 우선)
          if (el.children.length > 0 && el.tagName !== 'BUTTON' && el.tagName !== 'LI') continue;
          if (['1차 카테고리', '2차 카테고리', '다음', '취소', '닫기', '확인', '제목 입력', '서비스 등록'].includes(t)) continue;
          if (seen.has(t)) continue;
          seen.add(t);
          out.push({ tag: el.tagName, text: t });
        }
        return out;
      });

      console.log(`  ${opts.length}개 옵션 추출`);
      result[cat1] = opts.map(o => o.text);
      opts.slice(0, 30).forEach(o => console.log(`    [${o.tag}] ${o.text}`));
    } catch (e) {
      console.log(`  ✗ ${cat1} 오류: ${e.message}`);
      result[cat1] = { error: e.message };
    }
  }

  fs.writeFileSync(path.join(__dirname, 'recon-categories-v2-result.json'), JSON.stringify(result, null, 2));
  console.log('\n저장: recon-categories-v2-result.json');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
