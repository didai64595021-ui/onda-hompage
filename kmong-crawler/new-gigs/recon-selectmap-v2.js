/** 1회용: selectMap dump v2 — singleValue + truncate p 둘 다 selected 로 detect */
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

    const selects = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[id^="react-select-"]').forEach((el) => {
        if (!el.id.endsWith('-input')) return;
        // control container
        let cur = el;
        let container = null;
        for (let i = 0; i < 12 && cur && !container; i++) {
          cur = cur.parentElement;
          if (cur && typeof cur.className === 'string' && cur.className.includes('control')) container = cur;
        }
        let selected = '';
        let detectedVia = '';
        if (container) {
          // 1) standard singleValue
          const sv = container.querySelector('[class*="singleValue"]');
          if (sv) {
            selected = (sv.innerText || '').trim();
            detectedVia = 'singleValue';
          }
          // 2) p.truncate (multi-select selected tag)
          if (!selected) {
            const pt = container.querySelector('p.truncate');
            if (pt) {
              selected = (pt.innerText || '').trim();
              detectedVia = 'p.truncate';
            }
          }
          // 3) any p with text
          if (!selected) {
            const ps = container.querySelectorAll('p');
            for (const p of ps) {
              const t = (p.innerText || '').trim();
              if (t && t.length < 50 && t !== '선택' && !t.includes('placeholder')) {
                selected = t;
                detectedVia = 'p-any';
                break;
              }
            }
          }
        }
        out.push({ inputId: el.id, selected, detectedVia });
      });
      return out;
    });
    console.log('selectMap (강화된 detection):');
    selects.forEach((s) => console.log(`  ${s.inputId}  selected=${JSON.stringify(s.selected).padEnd(28)} via=${s.detectedVia || '-'}`));
    const filled = selects.filter((s) => s.selected);
    const empty = selects.filter((s) => !s.selected);
    console.log(`\n채워짐: ${filled.length}, 빈것: ${empty.length}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
