#!/usr/bin/env node
/**
 * 우리(ondadaad) SELLING 탭 판매중 상품 가격 크롤링 (참조용, 수정 X)
 *  - /my-gigs?statusType=SELLING 진입 후 카드별 가격/제목/카테고리 추출
 *  - 카테고리별 평균 / 최저 / 최고 통계
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const { browser, page } = await login({ slowMo: 60 });
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const all = [];
  for (let pg = 1; pg <= 5; pg++) {
    const url = `https://kmong.com/my-gigs?statusType=SELLING&page=${pg}`;
    await page.evaluate((u) => { window.location.href = u; }, url);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await sleep(4500);
    if (!page.url().includes('/my-gigs?')) { console.log(`  page ${pg} 리다이렉트 종료`); break; }
    for (let i = 0; i < 5; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await sleep(500); }

    const items = await page.evaluate(() => {
      const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
      const out = [];
      for (const eb of editBtns) {
        let card = eb;
        for (let i = 0; i < 8; i++) {
          card = card.parentElement;
          if (!card) break;
          const text = (card.innerText || '').slice(0, 800);
          if (text.includes('#') && /\d+원|\d+,\d+/.test(text)) {
            const idMatch = text.match(/#(\d{6,})/);
            const titleMatch = text.split('\n').find(l => l.trim().length > 5 && !/^\d|편집|상태|분류|판매중/.test(l.trim()));
            // 가격 모두 추출 (STD/DLX/PRM 가능)
            const prices = [...text.matchAll(/([\d,]+)\s*원/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10)).filter(n => n >= 1000 && n < 100000000);
            const cat = (text.match(/(IT·프로그래밍|디자인|마케팅|영상)\s*\/\s*([^\n]+)/) || [])[2]?.trim() || null;
            if (idMatch) out.push({ draftId: idMatch[1], title: titleMatch?.trim().slice(0, 60), prices, cat, text: text.slice(0, 500) });
            break;
          }
        }
      }
      return out;
    });
    console.log(`page ${pg}: ${items.length}건`);
    all.push(...items);
    if (items.length === 0) break;
  }

  // 정리 (중복 제거)
  const seen = new Set();
  const unique = all.filter(x => { if (seen.has(x.draftId)) return false; seen.add(x.draftId); return true; });
  console.log(`\n총 SELLING ${unique.length}건`);
  for (const it of unique) {
    const minP = Math.min(...it.prices);
    const maxP = Math.max(...it.prices);
    console.log(`  [${it.draftId}] ${it.title || '?'} | ${it.cat || '?'} | ${it.prices.length}가격 ${minP}~${maxP}`);
  }

  const out = path.join(__dirname, 'our-selling-prices.json');
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), total: unique.length, items: unique }, null, 2));
  console.log(`\n📄 ${out}`);
  await browser.close();
})();
