const { chromium } = require('playwright');

(async () => {
  const viewports = [
    {w:1920,h:1080}, {w:1440,h:900}, {w:1366,h:768}, {w:1280,h:720}, {w:1024,h:768},
    {w:768,h:1024}, {w:430,h:932}, {w:393,h:852}, {w:375,h:812}, {w:360,h:800}
  ];

  const browser = await chromium.launch();

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await context.newPage();
    await page.goto('http://localhost:8090/freelancer-photographer/', { waitUntil: 'networkidle' });
    
    // Wait for loader to disappear
    await page.waitForTimeout(2500);
    
    // Scroll to bottom incrementally to trigger all IntersectionObservers
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const step = vp.h / 2;
    for (let y = 0; y <= scrollHeight; y += step) {
      await page.evaluate((scrollTo) => window.scrollTo(0, scrollTo), y);
      await page.waitForTimeout(200);
    }
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    
    // Take full page screenshot
    await page.screenshot({ path: `/tmp/photographer-v4-${vp.w}x${vp.h}.png`, fullPage: true });
    console.log(`Done: ${vp.w}x${vp.h}`);
    
    await context.close();
  }

  await browser.close();
})();
