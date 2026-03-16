const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(min = 2000, max = 5000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// 네이버 통합검색에서 플레이스 영역 파싱 → 각 업체 상세 페이지 접근
async function searchPlaces(page, context, keyword) {
  const places = [];

  try {
    // 1단계: 네이버 통합검색
    await page.goto(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`, {
      waitUntil: 'load', timeout: 20000
    });
    await delay(2000, 3000);

    // 2단계: 플레이스 영역에서 업체명+링크 추출
    // 클래스 "uD1F4"가 업체명 링크, 링크에 place_id 포함됨
    const rawPlaces = await page.evaluate(() => {
      const results = [];
      
      // 업체명 링크 (uD1F4 gADnZ 클래스)
      const nameLinks = document.querySelectorAll('a.uD1F4');
      for (const link of nameLinks) {
        const name = link.textContent.replace(/예약|톡톡|영수증|쿠폰/g, '').trim();
        const hasTalktalk = link.textContent.includes('톡톡');
        if (name) {
          results.push({ name, hasTalktalk, href: link.href });
        }
      }

      // 리뷰 정보 (KJzzB 클래스)  
      const reviewEls = document.querySelectorAll('a.KJzzB');
      let reviewIdx = 0;
      for (const el of reviewEls) {
        const text = el.textContent;
        const visitorMatch = text.match(/방문자\s*리뷰\s*([\d,]+)/);
        const blogMatch = text.match(/블로그\s*리뷰\s*([\d,]+)/);
        if (visitorMatch || blogMatch) {
          if (reviewIdx < results.length) {
            results[reviewIdx].visitor_review_count = visitorMatch ? parseInt(visitorMatch[1].replace(/,/g, ''), 10) : 0;
            results[reviewIdx].blog_review_count = blogMatch ? parseInt(blogMatch[1].replace(/,/g, ''), 10) : 0;
          }
          reviewIdx++;
        }
      }

      return results;
    });

    console.log(`  통합검색에서 ${rawPlaces.length}개 업체명 발견`);

    // 3단계: 각 업체를 m.place.naver.com에서 검색하여 place_id + 상세 정보 수집
    const detailPage = await context.newPage();
    
    for (const raw of rawPlaces) {
      try {
        // 네이버 플레이스 검색으로 place_id 찾기
        const searchUrl = `https://m.place.naver.com/place/list?query=${encodeURIComponent(raw.name)}`;
        await detailPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await delay(1500, 2500);

        // place_id 추출 (URL에서 또는 페이지에서)
        const placeInfo = await detailPage.evaluate((targetName) => {
          // 리스트에서 첫 번째 업체 링크 찾기
          const links = document.querySelectorAll('a[href*="/place/"]');
          for (const a of links) {
            const match = a.href.match(/\/place\/(\d+)/);
            if (match) {
              return { placeId: match[1], url: a.href };
            }
          }
          return null;
        }, raw.name);

        if (!placeInfo) {
          // 대안: 직접 상세 페이지 접근 시도
          const directUrl = `https://m.place.naver.com/place/list?query=${encodeURIComponent(keyword + ' ' + raw.name)}`;
          await detailPage.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await delay(1000, 2000);
          
          const retryInfo = await detailPage.evaluate(() => {
            const links = document.querySelectorAll('a[href*="/place/"]');
            for (const a of links) {
              const match = a.href.match(/\/place\/(\d+)/);
              if (match) return { placeId: match[1], url: a.href };
            }
            return null;
          });
          
          if (!retryInfo) {
            console.log(`    ⚠️ ${raw.name} - place_id 못 찾음, 스킵`);
            continue;
          }
          
          Object.assign(placeInfo || {}, retryInfo);
        }

        // 4단계: 업체 상세 페이지에서 정보 수집
        const placeDetailUrl = `https://m.place.naver.com/place/${placeInfo.placeId}/home`;
        await detailPage.goto(placeDetailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await delay(1500, 2500);

        const detail = await detailPage.evaluate(() => {
          const result = {
            category: '',
            address: '',
            phone: '',
            homepage_url: null,
            talktalk_active: false,
            talktalk_url: null,
          };

          // 카테고리
          const categoryEl = document.querySelector('.lnJFt, [class*="category"]');
          if (categoryEl) result.category = categoryEl.textContent.trim();

          // 주소
          const addrEl = document.querySelector('.LDgIH, [class*="addr"], .Y31Sf');
          if (addrEl) result.address = addrEl.textContent.trim();

          // 전화번호
          const phoneEl = document.querySelector('.xlx7Q, a[href^="tel:"]');
          if (phoneEl) result.phone = phoneEl.textContent.trim().replace(/^전화\s*/, '');

          // 홈페이지
          const homepageLinks = document.querySelectorAll('a[class*="homepage"], a.jO09N, a[target="_blank"]');
          for (const a of homepageLinks) {
            const href = a.href;
            if (href && !href.includes('naver.com') && !href.includes('kakao') && !href.includes('instagram') && !href.includes('facebook') && !href.includes('youtube')) {
              result.homepage_url = href;
              break;
            }
          }
          // 홈페이지 별도 영역
          if (!result.homepage_url) {
            const allLinks = document.querySelectorAll('a');
            for (const a of allLinks) {
              const text = a.textContent.trim();
              if ((text === '홈페이지' || text.includes('홈페이지')) && a.href && !a.href.includes('naver.com')) {
                result.homepage_url = a.href;
                break;
              }
            }
          }

          // 톡톡
          const talkLinks = document.querySelectorAll('a[href*="talk.naver.com"]');
          if (talkLinks.length > 0) {
            result.talktalk_active = true;
            result.talktalk_url = talkLinks[0].href;
          } else {
            const allEls = document.querySelectorAll('a, button');
            for (const el of allEls) {
              if (el.textContent.includes('톡톡')) {
                result.talktalk_active = true;
                result.talktalk_url = el.href || null;
                break;
              }
            }
          }

          return result;
        });

        places.push({
          id: placeInfo.placeId,
          name: raw.name,
          category: detail.category,
          address: detail.address,
          phone: detail.phone,
          placeUrl: `https://m.place.naver.com/place/${placeInfo.placeId}`,
          homepage_url: detail.homepage_url,
          visitor_review_count: raw.visitor_review_count || 0,
          blog_review_count: raw.blog_review_count || 0,
          talktalk_active: detail.talktalk_active,
          talktalk_url: detail.talktalk_url,
        });

        console.log(`    ✅ ${raw.name} (place:${placeInfo.placeId}) 수집 완료`);

      } catch (e) {
        console.log(`    ⚠️ ${raw.name} 수집 실패: ${e.message}`);
      }
    }

    await detailPage.close().catch(() => {});

  } catch (e) {
    console.log(`  검색 실패: ${e.message}`);
  }

  console.log(`  총 ${places.length}개 업체 상세 수집 완료`);
  return places;
}

// 톡톡 확인 (이미 searchPlaces에서 수집하므로 단순 래퍼)
async function checkTalktalk(page, placeId) {
  // searchPlaces에서 이미 수집됨 — 여기선 폴백용
  const result = { talktalk_active: false, talktalk_url: null };
  try {
    await page.goto(`https://m.place.naver.com/place/${placeId}/home`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await delay(1000, 2000);

    const data = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="talk.naver.com"]');
      if (links.length > 0) return { active: true, url: links[0].href };
      const btns = document.querySelectorAll('a, button');
      for (const b of btns) {
        if (b.textContent.includes('톡톡')) return { active: true, url: b.href || null };
      }
      return { active: false, url: null };
    });
    result.talktalk_active = data.active;
    result.talktalk_url = data.url;
  } catch {}
  return result;
}

module.exports = { createBrowser, searchPlaces, checkTalktalk, delay, randomUA };
