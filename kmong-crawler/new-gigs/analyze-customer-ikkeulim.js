/**
 * 고객 시뮬레이션: ikkeulim.com (안산커튼 이끌림블라인드커튼) 분석
 * - 메인 + 주요 내부 페이지 스크린샷
 * - 네비게이션 / 섹션 구조 dump
 * - 이미지·페이지 수량 집계
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'customer-ikkeulim');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124',
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const report = { at: new Date().toISOString(), pages: [] };

  // 1. 메인 페이지
  console.log('[1] 메인');
  await page.goto('https://ikkeulim.com/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await sleep(3000);
  await page.screenshot({ path: path.join(OUT, 'main-desktop.png'), fullPage: true });

  // 모바일 캡처
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'main-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(1500);

  // 메인 페이지 정보 수집
  const mainInfo = await page.evaluate(() => {
    const nav = [...document.querySelectorAll('nav a, .doz_menu a, header a')]
      .map(a => ({ text: (a.innerText || '').trim(), href: a.href }))
      .filter(a => a.text && a.text.length < 30 && a.href);
    const sections = [...document.querySelectorAll('section, .section, [class*="section_"]')]
      .map(s => {
        const h = s.querySelector('h1, h2, h3, h4');
        return h ? (h.innerText || '').trim().slice(0, 60) : '';
      }).filter(Boolean);
    const images = [...document.querySelectorAll('img')].length;
    const texts = document.body.innerText.length;
    const hasKakao = !!document.querySelector('[href*="kakao"], [src*="kakao"]');
    const phones = (document.body.innerText.match(/\d{2,4}-\d{3,4}-\d{4}/g) || [])
      .filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
    return { nav, sections, images, textLen: texts, hasKakao, phones };
  });
  report.pages.push({ url: '/', ...mainInfo });
  console.log(`   메뉴 ${mainInfo.nav.length}개, 섹션 ${mainInfo.sections.length}, 이미지 ${mainInfo.images}장`);
  console.log(`   메뉴: ${mainInfo.nav.slice(0, 15).map(n => n.text).join(', ')}`);
  console.log(`   전화: ${mainInfo.phones.join(', ')}`);

  // 2. 내부 페이지 샘플 3~5개
  const internalLinks = [...new Set(mainInfo.nav.filter(n => n.href.includes('ikkeulim.com')).map(n => n.href))].slice(0, 6);
  for (const link of internalLinks) {
    try {
      console.log(`[sub] ${link}`);
      await page.goto(link, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2500);
      const name = link.replace(/https?:\/\/[^/]+/, '').replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 40) || 'root';
      await page.screenshot({ path: path.join(OUT, `sub-${name}.png`), fullPage: true });
      const info = await page.evaluate(() => {
        const h = document.querySelector('h1, h2');
        return { title: h ? (h.innerText || '').trim().slice(0, 80) : '', imgCnt: document.querySelectorAll('img').length, textLen: document.body.innerText.length };
      });
      report.pages.push({ url: link, ...info });
    } catch (e) {
      console.log(`   실패: ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n리포트: ${path.join(OUT, 'report.json')}`);
  await browser.close();
})();
