// SEO 노출 체크 — 네이버에서 site:도메인 검색 → 스크린샷 OCR로 결과 확인
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'output', 'seo-screenshots');

async function checkSeoVisibility(context, homepageUrl, businessName) {
  if (!homepageUrl) return 'X';

  try {
    const url = new URL(homepageUrl);
    const domain = url.hostname.replace('www.', '');

    const page = await context.newPage();
    try {
      // 네이버에서 site:도메인 검색
      await page.goto(`https://search.naver.com/search.naver?query=site:${domain}`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      await page.waitForTimeout(2000);

      // 방법1: 텍스트 기반 확인 (빠름)
      const content = await page.content();
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      
      const noResult = bodyText.includes('검색결과가 없습니다')
        || bodyText.includes('검색결과를 찾을 수 없습니다')
        || bodyText.includes('일치하는 검색결과가 없습니다')
        || bodyText.includes('관련 검색결과가 없습니다')
        || content.includes('noSearchResult');

      if (noResult) {
        // 스크린샷 저장 (증거용)
        await saveScreenshot(page, domain, 'naver_no_result');
        return 'X';
      }

      // 구글에서도 확인
      await page.goto(`https://www.google.com/search?q=site:${domain}`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      await page.waitForTimeout(2000);

      const googleText = await page.evaluate(() => document.body?.innerText || '');
      const googleNoResult = googleText.includes('did not match any documents')
        || googleText.includes('검색결과가 없습니다')
        || googleText.includes('No results found');

      if (googleNoResult) {
        await saveScreenshot(page, domain, 'google_no_result');
        // 네이버에는 있지만 구글에는 없음 — 부분 노출
        return 'O'; // 네이버에 있으면 O
      }

      return 'O';
    } finally {
      await page.close().catch(() => {});
    }
  } catch (e) {
    console.log(`  ⚠️ SEO 체크 실패 (${businessName}): ${e.message}`);
    return 'X';
  }
}

// 증거용 스크린샷 저장
async function saveScreenshot(page, domain, label) {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    const filename = `${domain}_${label}_${Date.now()}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: false });
  } catch {}
}

module.exports = { checkSeoVisibility };
