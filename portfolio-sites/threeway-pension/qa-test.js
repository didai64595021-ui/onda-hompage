const { chromium } = require('/home/onda/projects/onda-coldmail/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://didai64595021-ui.github.io/onda-hompage/portfolio-sites/threeway-pension';

const PAGES = [
  { name: 'index', path: '/index.html' },
  { name: 'about', path: '/about.html' },
  { name: 'rooms', path: '/rooms.html' },
  { name: 'rates', path: '/rates.html' },
  { name: 'package', path: '/package.html' },
  { name: 'facilities', path: '/facilities.html' },
  { name: 'attractions', path: '/attractions.html' },
  { name: 'faq', path: '/faq.html' },
];

const DEVICES = [
  { name: 'iPhone-SE', width: 375, height: 667, isMobile: true },
  { name: 'iPhone-14', width: 390, height: 844, isMobile: true },
  { name: 'iPad', width: 768, height: 1024, isMobile: true },
  { name: 'iPad-Landscape', width: 1024, height: 768, isMobile: false },
  { name: 'Desktop-1280', width: 1280, height: 800, isMobile: false },
  { name: 'Desktop-1920', width: 1920, height: 1080, isMobile: false },
];

const issues = [];

async function testPage(browser, pageDef, device) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.isMobile,
    userAgent: device.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
      : undefined,
  });
  const page = await context.newPage();

  try {
    const url = BASE_URL + pageDef.path;
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 1. HTTP 상태 체크
    if (!response || response.status() !== 200) {
      issues.push({ page: pageDef.name, device: device.name, type: 'HTTP', detail: `Status: ${response?.status()}` });
    }

    // 2. 콘솔 에러 수집
    const consoleLogs = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleLogs.push(msg.text()); });

    // 3. 깨진 이미지 체크
    const brokenImages = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      const broken = [];
      imgs.forEach(img => {
        if (img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) {
          broken.push(img.src);
        }
      });
      return broken;
    });
    if (brokenImages.length > 0) {
      issues.push({ page: pageDef.name, device: device.name, type: 'BROKEN_IMG', detail: brokenImages.join(', ') });
    }

    // 4. 가로 오버플로우 체크
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (hasOverflow) {
      issues.push({ page: pageDef.name, device: device.name, type: 'OVERFLOW_X', detail: 'Horizontal scroll detected' });
    }

    // 5. 클릭 가능 요소 최소 크기 체크 (44px)
    const smallTouchTargets = await page.evaluate(() => {
      const clickables = document.querySelectorAll('a, button, [role="button"], input, select, textarea');
      const small = [];
      clickables.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          const text = el.textContent?.trim().slice(0, 30) || el.tagName;
          small.push(`${text} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
        }
      });
      return small.slice(0, 5);
    });
    if (device.isMobile && smallTouchTargets.length > 0) {
      issues.push({ page: pageDef.name, device: device.name, type: 'TOUCH_TARGET', detail: smallTouchTargets.join(' | ') });
    }

    // 6. 텍스트 잘림 체크 (overflow: hidden인 요소 중 텍스트 잘린 경우)
    const clippedText = await page.evaluate(() => {
      const els = document.querySelectorAll('h1, h2, h3, h4, p, span, a');
      const clipped = [];
      els.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.overflow === 'hidden' && el.scrollWidth > el.clientWidth + 2) {
          clipped.push(el.textContent?.trim().slice(0, 40));
        }
      });
      return clipped.slice(0, 5);
    });
    if (clippedText.length > 0) {
      issues.push({ page: pageDef.name, device: device.name, type: 'TEXT_CLIP', detail: clippedText.join(' | ') });
    }

    // 7. 네비게이션 링크 확인
    if (pageDef.name === 'index') {
      const navLinks = await page.evaluate(() => {
        const links = document.querySelectorAll('.nav-menu a, .mobile-menu-overlay a');
        return Array.from(links).map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim() }));
      });
      const expectedPages = ['index.html', 'about.html', 'rooms.html', 'rates.html', 'package.html', 'facilities.html', 'attractions.html', 'faq.html'];
      const missingLinks = expectedPages.filter(p => !navLinks.some(l => l.href === p));
      if (missingLinks.length > 0) {
        issues.push({ page: pageDef.name, device: device.name, type: 'NAV_LINK', detail: `Missing: ${missingLinks.join(', ')}` });
      }
    }

    // 8. 모바일 햄버거 메뉴 동작 체크
    if (device.isMobile && pageDef.name === 'index') {
      const hamburger = await page.$('.hamburger');
      if (hamburger) {
        const isVisible = await hamburger.isVisible();
        if (!isVisible && device.width <= 1024) {
          issues.push({ page: pageDef.name, device: device.name, type: 'HAMBURGER', detail: 'Hamburger not visible on mobile' });
        } else if (isVisible) {
          await hamburger.click();
          await page.waitForTimeout(500);
          const overlayVisible = await page.$eval('.mobile-menu-overlay', el => {
            return window.getComputedStyle(el).opacity !== '0' && el.classList.contains('active');
          }).catch(() => false);
          if (!overlayVisible) {
            issues.push({ page: pageDef.name, device: device.name, type: 'HAMBURGER', detail: 'Menu overlay not appearing after click' });
          }
          // Close it
          await hamburger.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // 9. 히어로 슬라이더 동작 체크
    if (pageDef.name === 'index') {
      const activeSlides = await page.$$eval('.hero-slide.active', els => els.length);
      if (activeSlides !== 1) {
        issues.push({ page: pageDef.name, device: device.name, type: 'SLIDER', detail: `Active slides: ${activeSlides}, expected 1` });
      }
    }

    // 10. 아코디언 동작 체크
    if (pageDef.name === 'faq' || pageDef.name === 'rates') {
      const firstAccordion = await page.$('.accordion-header');
      if (firstAccordion) {
        await firstAccordion.click();
        await page.waitForTimeout(400);
        const isOpen = await page.$eval('.accordion-item:first-child', el => el.classList.contains('open')).catch(() => false);
        if (!isOpen) {
          issues.push({ page: pageDef.name, device: device.name, type: 'ACCORDION', detail: 'First accordion item did not open on click' });
        }
      }
    }

    // 11. 앵커 링크 체크 (rooms.html)
    if (pageDef.name === 'rooms') {
      const anchors = ['room-mint', 'room-disney', 'room-danpung', 'room-suite2', 'room-sonamu', 'room-suite1', 'room-tulip'];
      const missingAnchors = await page.evaluate((ids) => {
        return ids.filter(id => !document.getElementById(id));
      }, anchors);
      if (missingAnchors.length > 0) {
        issues.push({ page: pageDef.name, device: device.name, type: 'ANCHOR', detail: `Missing: ${missingAnchors.join(', ')}` });
      }
    }

    // 12. 라이트박스 동작 체크
    if (pageDef.name === 'facilities' || pageDef.name === 'package') {
      const galleryItem = await page.$('[data-lightbox]');
      if (galleryItem) {
        await galleryItem.click();
        await page.waitForTimeout(500);
        const lightboxActive = await page.$eval('#lightbox', el => el.classList.contains('active')).catch(() => false);
        if (!lightboxActive) {
          issues.push({ page: pageDef.name, device: device.name, type: 'LIGHTBOX', detail: 'Lightbox did not open' });
        } else {
          // Close
          const closeBtn = await page.$('.lightbox-close');
          if (closeBtn) await closeBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }

    // 13. 폰트 로드 체크
    const fontsLoaded = await page.evaluate(() => document.fonts.ready.then(() => document.fonts.size > 0));
    if (!fontsLoaded) {
      issues.push({ page: pageDef.name, device: device.name, type: 'FONT', detail: 'No web fonts loaded' });
    }

    // 14. z-index 겹침 (nav vs 다른 요소)
    const navZIndex = await page.evaluate(() => {
      const nav = document.querySelector('.nav');
      if (!nav) return 0;
      return parseInt(window.getComputedStyle(nav).zIndex) || 0;
    });
    if (navZIndex < 100) {
      issues.push({ page: pageDef.name, device: device.name, type: 'Z_INDEX', detail: `Nav z-index too low: ${navZIndex}` });
    }

    // 15. Footer 링크 수 체크
    const footerLinkCount = await page.$$eval('.footer-links a', els => els.length);
    if (footerLinkCount < 7) {
      issues.push({ page: pageDef.name, device: device.name, type: 'FOOTER', detail: `Only ${footerLinkCount} footer links, expected 8` });
    }

    // 16. 요금 정렬 체크 (rates.html)
    if (pageDef.name === 'rates') {
      const seasonCards = await page.$$('.season-card');
      if (seasonCards.length !== 3) {
        issues.push({ page: pageDef.name, device: device.name, type: 'RATES_LAYOUT', detail: `Expected 3 season cards, got ${seasonCards.length}` });
      }

      // 요금 정렬: 방 크기 순서 확인 (비수기 카드)
      const prices = await page.$$eval('.season-low .season-room-price', els =>
        els.map(el => parseInt(el.textContent.replace(/[^0-9]/g, '')))
      );
      const isSorted = prices.every((v, i) => i === 0 || v >= prices[i - 1]);
      if (!isSorted) {
        issues.push({ page: pageDef.name, device: device.name, type: 'RATES_SORT', detail: `Prices not sorted ascending: ${prices.join(', ')}` });
      }
    }

    // 스크린샷 (모바일 + 데스크톱)
    const ssDir = '/home/onda/projects/onda-hompage/portfolio-sites/threeway-pension/qa-screenshots';
    if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
    await page.screenshot({
      path: path.join(ssDir, `${pageDef.name}_${device.name}.png`),
      fullPage: true,
    });

    if (consoleLogs.length > 0) {
      issues.push({ page: pageDef.name, device: device.name, type: 'CONSOLE_ERROR', detail: consoleLogs.slice(0, 3).join(' | ') });
    }

  } catch (err) {
    issues.push({ page: pageDef.name, device: device.name, type: 'ERROR', detail: err.message.slice(0, 200) });
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('=== 쓰리웨이펜션 전수조사 시작 ===');
  console.log(`Pages: ${PAGES.length}, Devices: ${DEVICES.length}, Total: ${PAGES.length * DEVICES.length} tests\n`);

  const browser = await chromium.launch({ headless: true });

  for (const pageDef of PAGES) {
    for (const device of DEVICES) {
      process.stdout.write(`Testing ${pageDef.name} @ ${device.name}...`);
      await testPage(browser, pageDef, device);
      console.log(' done');
    }
  }

  await browser.close();

  console.log('\n=== 전수조사 결과 ===');
  if (issues.length === 0) {
    console.log('ALL PASS - 이슈 없음!');
  } else {
    console.log(`발견된 이슈: ${issues.length}개\n`);
    const grouped = {};
    issues.forEach(i => {
      const key = i.type;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(i);
    });
    for (const [type, items] of Object.entries(grouped)) {
      console.log(`\n[${type}] (${items.length}건)`);
      items.forEach(i => {
        console.log(`  - ${i.page} @ ${i.device}: ${i.detail}`);
      });
    }
  }

  // JSON 저장
  fs.writeFileSync('/home/onda/projects/onda-hompage/portfolio-sites/threeway-pension/qa-results.json', JSON.stringify(issues, null, 2));
  console.log('\n결과 저장: qa-results.json');
}

main().catch(console.error);
