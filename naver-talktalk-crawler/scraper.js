const { chromium } = require('playwright');

// User-Agent 로테이션
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 랜덤 딜레이
function delay(min = 2000, max = 5000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 브라우저 초기화
async function createBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    userAgent: randomUA(),
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });

  const page = await context.newPage();
  return { browser, context, page };
}

// 네이버 지도 검색 (API 응답 인터셉트 방식)
// 페이지 로드 시 SPA가 내부적으로 호출하는 allSearch API를 캡처
async function searchPlaces(page, keyword) {
  const places = [];

  // API 응답을 Promise로 캡처 (goto 전에 리스너 등록)
  let apiResolve;
  const apiPromise = new Promise(resolve => { apiResolve = resolve; });
  let apiData = null;

  const handler = async (response) => {
    const url = response.url();
    if (url.includes('api/search/allSearch') && response.status() === 200) {
      try {
        apiData = await response.json();
      } catch {}
      apiResolve();
    }
  };
  page.on('response', handler);

  // 타임아웃 설정
  const timeout = setTimeout(() => apiResolve(), 15000);

  const mapUrl = `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`;
  await page.goto(mapUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // SPA 로드 후 API 호출 대기
  await apiPromise;
  clearTimeout(timeout);
  page.off('response', handler);

  if (!apiData) {
    console.log('  API 응답 캡처 실패');
    return places;
  }

  const list = apiData?.result?.place?.list || [];
  for (const item of list) {
    const categoryStr = Array.isArray(item.category) ? item.category.join(',') : (item.category || '');
    places.push({
      id: item.id,
      name: item.name,
      category: categoryStr,
      address: item.roadAddress || item.address || '',
      phone: item.tel || '',
      placeUrl: `https://m.place.naver.com/place/${item.id}`,
      homepage_url: item.homePage || null,
      visitor_review_count: parseInt(item.placeReviewCount, 10) || 0,
      blog_review_count: parseInt(item.reviewCount, 10) || 0,
    });
  }

  console.log(`  ${list.length}개 업체 발견`);
  return places;
}

// 톡톡 확인 (상세 페이지 방문)
async function checkTalktalk(page, placeId) {
  const result = { talktalk_active: false, talktalk_url: null };

  try {
    const placeUrl = `https://m.place.naver.com/place/${placeId}/home`;
    await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(1500, 2500);

    const talktalkData = await page.evaluate(() => {
      // 패턴 1: talk.naver.com 링크
      const talkLinks = document.querySelectorAll('a[href*="talk.naver.com"], a[href*="talktalk"]');
      for (const a of talkLinks) {
        return { active: true, url: a.href };
      }

      // 패턴 2: 톡톡 텍스트가 있는 버튼/링크
      const allEls = document.querySelectorAll('a, button');
      for (const el of allEls) {
        const text = el.textContent.trim();
        if (text.includes('톡톡') && (text.includes('문의') || text.includes('채팅') || text.includes('상담'))) {
          return { active: true, url: el.href || null };
        }
      }

      // 패턴 3: class에 talktalk 포함
      const talkClass = document.querySelector('[class*="talktalk"], [class*="talkBtn"], [class*="chat_btn"]');
      if (talkClass) {
        return { active: true, url: talkClass.href || null };
      }

      // 패턴 4: data attribute
      const dataEl = document.querySelector('[data-nclicks*="talk"]');
      if (dataEl) {
        return { active: true, url: null };
      }

      return { active: false, url: null };
    });

    result.talktalk_active = talktalkData.active;
    result.talktalk_url = talktalkData.url;
  } catch {
    // 페이지 접근 실패 → 톡톡 없음 처리
  }

  return result;
}

module.exports = { createBrowser, searchPlaces, checkTalktalk, delay, randomUA };
