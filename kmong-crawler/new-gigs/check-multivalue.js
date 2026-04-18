require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const { browser, page } = await login({ slowMo: 80 });
  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, 'https://kmong.com/my-gigs/edit/764211?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    const y = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h1,h2,h3,h4')].find(h => (h.innerText || '').includes('주요 특징'));
      return h ? h.getBoundingClientRect().top + window.scrollY : 0;
    });
    await page.evaluate(y => window.scrollTo(0, y - 50), y);
    await sleep(1500);
    await page.screenshot({ path: require('path').join(__dirname, 'n02-feat-section.png'), fullPage: false });

    const result = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[id^="react-select-"][id$="-input"]').forEach(el => {
        // label
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
        // control
        let ctrl = el;
        for (let i = 0; i < 10 && ctrl; i++) {
          ctrl = ctrl.parentElement;
          if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
        }
        const sv = ctrl ? ctrl.querySelector('[class*="singleValue"]') : null;
        const mvEls = ctrl ? [...ctrl.querySelectorAll('[class*="multiValue"]')] : [];
        out.push({
          inputId: el.id,
          label: label.split('\n')[0],
          singleValue: sv ? (sv.innerText || '').trim() : '',
          multiValues: mvEls.map(m => (m.innerText || '').trim()).filter(Boolean),
        });
      });
      return out;
    });
    console.log('모든 select 상태:');
    result.forEach(r => {
      const filled = r.singleValue || r.multiValues.join(', ');
      console.log(`  [${r.label.padEnd(15)}] ${r.inputId} → ${filled || '(비어있음)'}`);
    });
  } finally {
    await browser.close();
  }
})();
