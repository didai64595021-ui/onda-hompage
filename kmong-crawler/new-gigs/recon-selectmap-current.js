/** 1회용: 현재 draft 의 selectMap 라벨 dump (discoverSelects 결과) */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const draftId = process.argv[2] || '761240';
const sub = process.argv[3] || '605';

(async () => {
  const { browser, page } = await login({ slowMo: 80 });
  try {
    await page.goto(`https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(7000);

    // 같은 discoverSelects 로직
    const selects = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[id^="react-select-"]').forEach((el) => {
        if (!el.id.endsWith('-input')) return;
        let label = '';
        let cur = el;
        for (let i = 0; i < 12 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const ps = [...cur.querySelectorAll(':scope > p, :scope > div > p, :scope > label')];
          for (const p of ps) {
            const t = (p.innerText || '').trim().replace(/\*\s*$/, '').trim();
            if (t && t.length < 40 && t !== '편집' && t !== '변경하기') {
              label = t;
              break;
            }
          }
          if (label) break;
        }
        // 현재 selected
        let container = null;
        cur = el;
        for (let i = 0; i < 12 && cur && !container; i++) {
          cur = cur.parentElement;
          if (cur && typeof cur.className === 'string' && cur.className.includes('control')) container = cur;
        }
        let selected = '';
        if (container) {
          const sv = container.querySelector('[class*="singleValue"]');
          if (sv) selected = (sv.innerText || '').trim();
        }
        out.push({ inputId: el.id, label, selected });
      });
      return out;
    });
    console.log('selectMap:');
    selects.forEach((s) => console.log(`  ${s.inputId}  label=${JSON.stringify(s.label).padEnd(30)}  selected=${JSON.stringify(s.selected)}`));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
