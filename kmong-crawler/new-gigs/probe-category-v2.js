#!/usr/bin/env node
/**
 * Probe v2 — 카테고리 서브 진입 URL 패턴 발견
 *  1. /category/6 진입 후 sub 카테고리 링크 추출
 *  2. /search?keyword=... 패턴 시도
 *  3. 좌측 사이드바 메뉴 구조 파악
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, 'diag-out', `probe-cat-v2-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 }, locale: 'ko-KR',
  })).newPage();

  // 1) /category/6 진입 후 모든 a 태그 분석
  await page.goto('https://kmong.com/category/6', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  const cat6Links = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')].filter(a => /category|subcategory|filter/i.test(a.href || ''));
    return links.slice(0, 40).map(a => ({ href: a.href, text: (a.innerText || '').trim().slice(0, 60) }));
  });
  console.log('--- category/6 내부 카테고리 링크들 ---');
  cat6Links.forEach(l => console.log(`  ${l.href}  | ${l.text}`));
  fs.writeFileSync(path.join(OUT, 'cat6-links.json'), JSON.stringify(cat6Links, null, 2));

  // 2) 검색 URL 시도
  const SEARCH_URLS = [
    'https://kmong.com/search?keyword=%EC%97%85%EB%AC%B4%20%EC%9E%90%EB%8F%99%ED%99%94', // 업무 자동화
    'https://kmong.com/search?keyword=%EC%B1%97%EB%B4%87',                                // 챗봇
    'https://kmong.com/category/6/programming-pc-web/programming-pc-web-automation',     // slug 추정
  ];
  for (const u of SEARCH_URLS) {
    console.log(`\n--- ${u} ---`);
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3500);
      const m = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a')].filter(a => /\/gig\/\d+/.test(a.href));
        return { title: document.title, finalUrl: location.href, gigCount: links.length, sample: links.slice(0, 2).map(a => ({ href: a.href, text: (a.innerText || '').slice(0, 100) })) };
      });
      console.log(JSON.stringify(m).slice(0, 400));
    } catch (e) { console.log('  ERROR', e.message); }
  }

  // 3) 카테고리 6 페이지에서 좌측 메뉴 클릭 시도
  console.log(`\n--- /category/6 → 업무 자동화 메뉴 클릭 ---`);
  await page.goto('https://kmong.com/category/6', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);
  const clicked = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a, button')].filter(e => (e.innerText || '').trim() === '업무 자동화' || (e.innerText || '').trim() === '업무 자동화·매크로');
    if (links[0]) { links[0].click(); return links[0].href || 'click button'; }
    return null;
  });
  await sleep(3500);
  console.log(`  클릭 후 url: ${page.url()}`);
  console.log(`  clicked: ${clicked}`);

  await browser.close();
})();
