/**
 * /my-gigs?statusType=WAITING 에서 현재 임시저장 drafts 목록 조회 (read-only)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function collect(page) {
  return await page.evaluate(() => {
    const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
    const out = [];
    for (const eb of editBtns) {
      let card = eb;
      for (let i = 0; i < 10; i++) {
        card = card.parentElement;
        if (!card) break;
        const r = card.getBoundingClientRect();
        if (card.querySelector('img') && r.height > 80 && r.height < 260) break;
      }
      if (!card) continue;
      const text = (card.innerText || '').trim();
      const m = text.match(/#(\d{6,})/);
      const id = m ? m[1] : '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const title = lines.find(l => l.length > 8 && l.length < 80 && !/^#|판매중|승인|편집|임시|^\d+$/.test(l)) || '';
      out.push({ id, title, preview: text.slice(0, 120) });
    }
    return out;
  });
}

(async () => {
  const { browser, page } = await login({ slowMo: 60 });
  try {
    const all = [];
    for (let p = 1; p <= 3; p++) {
      const url = `https://kmong.com/my-gigs?statusType=WAITING&page=${p}`;
      console.log(`[list] page ${p}: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
      const items = await collect(page);
      if (items.length === 0) break;
      all.push(...items);
    }
    console.log(`\n=== WAITING drafts: ${all.length}개 ===`);
    all.forEach(it => console.log(`  #${it.id.padEnd(8)} ${it.title}`));
    console.log('\n=== 아임웹/N01 관련 ===');
    const imweb = all.filter(it => it.title.includes('아임웹') || it.preview.includes('아임웹'));
    imweb.forEach(it => console.log(`  #${it.id.padEnd(8)} ${it.title}`));
  } finally {
    await browser.close().catch(() => {});
  }
})();
