/** 1회용: 특정 react-select-input 의 부모 HTML 구조 dump (어떤 컴포넌트인지 식별) */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser, page } = await login({ slowMo: 80 });
  try {
    await page.goto('https://kmong.com/my-gigs/edit/761240?rootCategoryId=6&subCategoryId=605', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(7000);

    // "개발 언어" select (라벨 영역) + "기술 수준" select (정상 작동) 둘 다 dump
    const dump = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[id^="react-select-"]')].filter((el) => el.id.endsWith('-input'));
      const result = [];
      for (const el of inputs) {
        // 가까운 control container
        let cur = el;
        let container = null;
        for (let i = 0; i < 12 && cur && !container; i++) {
          cur = cur.parentElement;
          if (cur && typeof cur.className === 'string' && cur.className.includes('control')) container = cur;
        }
        // 라벨 텍스트 찾기 (nearestLabel 동일 로직)
        let label = '';
        cur = el;
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
        // outerHTML 기준 부모 5단계
        let html = el.outerHTML;
        cur = el;
        for (let i = 0; i < 5; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          html = cur.outerHTML;
        }
        result.push({
          inputId: el.id,
          label,
          containerClass: container ? (container.className || '').slice(0, 100) : null,
          parent5HtmlPreview: html.slice(0, 600),
        });
      }
      return result.slice(0, 4); // 첫 4개만 (기술수준 + 개발언어 + 프런트엔드 + 백엔드)
    });
    console.log(JSON.stringify(dump, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
