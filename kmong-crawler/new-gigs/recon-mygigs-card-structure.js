/** 1회용: my-gigs?statusType=WAITING 페이지 카드 구조 dump */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser, page } = await login({ slowMo: 100 });
  try {
    await page.goto('https://kmong.com/my-gigs?statusType=WAITING&page=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await sleep(400);
    }

    const dump = await page.evaluate(() => {
      const editBtns = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === '편집하기');
      const out = [];
      let cnt = 0;
      for (const eb of editBtns) {
        if (cnt >= 3) break; // 처음 3개만
        cnt++;
        let card = eb;
        for (let i = 0; i < 10; i++) {
          card = card.parentElement;
          if (!card) break;
          const r = card.getBoundingClientRect();
          if (card.querySelector('img') && r.height > 80 && r.height < 250) break;
        }
        if (!card) continue;
        // 모든 a.href + button onclick + data-* 수집
        const anchors = [...card.querySelectorAll('a')].map((a) => a.getAttribute('href') || '');
        const buttons = [...card.querySelectorAll('button')].map((b) => ({
          text: (b.innerText || '').trim().slice(0, 30),
          onclick: b.getAttribute('onclick') || '',
          aria: b.getAttribute('aria-label') || '',
          dataset: Object.keys(b.dataset).map((k) => `${k}=${b.dataset[k]}`).join(';'),
        }));
        const dataAttrs = [];
        for (const k of Object.keys(card.dataset || {})) dataAttrs.push(`${k}=${card.dataset[k]}`);
        // 카드 안의 모든 'data-' 속성
        const allDataEls = [];
        card.querySelectorAll('*').forEach((el) => {
          for (const attr of el.attributes || []) {
            if (attr.name.startsWith('data-')) allDataEls.push(`${el.tagName}.${attr.name}=${attr.value}`);
          }
        });
        out.push({
          title: (card.innerText || '').split('\n').slice(0, 3).join(' | ').slice(0, 100),
          anchors: anchors.slice(0, 10),
          buttons: buttons.slice(0, 10),
          dataAttrs,
          allDataEls: allDataEls.slice(0, 20),
          outerHTML: card.outerHTML.slice(0, 500),
        });
      }
      return out;
    });
    console.log(JSON.stringify(dump, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
