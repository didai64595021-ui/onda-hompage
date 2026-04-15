#!/usr/bin/env node
/**
 * 크몽 카테고리 페이지 구조 학습 (1회성)
 *  - URL 패턴 시도 + 상품 카드 셀렉터 발견
 *  - 출력: 발견된 상품 카드 정보 + 가격/리뷰/제목 selector 후보
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, 'diag-out', `probe-category-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });

const URLS = [
  'https://kmong.com/category/6/663',           // IT 자동화
  'https://kmong.com/category/6',               // IT root
  'https://kmong.com/category/1',               // 디자인 root
  'https://kmong.com/category/1/113',           // 디자인 상세페이지
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 }, locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  for (const url of URLS) {
    console.log(`\n=== ${url} ===`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      // 스크롤로 lazy load 유도
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await sleep(800); }
      console.log(`  final url: ${page.url()}`);

      const meta = await page.evaluate(() => {
        // 상품 카드 후보: a 태그 with /gig/ 또는 /id 형태
        const links = [...document.querySelectorAll('a')].filter(a => /\/gig\/\d+/.test(a.href) || /\/(gigs|projects)\/\d+/.test(a.href));
        const sample = links.slice(0, 3).map(a => ({
          href: a.href,
          text: (a.innerText || '').trim().slice(0, 200),
          parentTag: a.parentElement?.tagName,
          parentClass: a.parentElement?.className?.toString().slice(0, 100),
          // 가격 추정 (text 안에 ₩, 만원, 천원 등)
          hasPrice: /₩[\d,]+|[\d,]+\s*원|[\d,]+만원/.test(a.innerText || ''),
        }));
        const allCards = links.length;
        // 가격 텍스트 포함 텍스트 찾기
        const priceTexts = [...document.querySelectorAll('*')].filter(e =>
          e.children.length === 0 && /₩[\d,]+|[\d,]+만원|^[\d,]{4,}원$/.test((e.innerText || '').trim())
        ).slice(0, 5).map(e => ({ tag: e.tagName, cls: e.className?.toString().slice(0,60), text: (e.innerText || '').trim() }));
        return { gigLinkCount: allCards, sample, priceTexts, title: document.title };
      });
      console.log(`  ${JSON.stringify(meta).slice(0, 600)}`);
      const tag = url.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
      await page.screenshot({ path: path.join(OUT, `${tag}.png`), fullPage: false });
      fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(meta, null, 2));
    } catch (e) { console.log(`  ERROR ${e.message}`); }
  }

  console.log(`\n결과: ${OUT}`);
  await browser.close();
})();
