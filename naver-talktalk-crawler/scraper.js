require('dotenv').config();
const { chromium } = require('playwright');
const https = require('https');

// 네이버 API 키 로테이션
const API_KEYS = [
  { id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET },
  { id: process.env.NAVER_CLIENT_ID_2, secret: process.env.NAVER_CLIENT_SECRET_2 },
].filter(k => k.id && k.secret);

let apiKeyIndex = 0;
function getApiKey() {
  const key = API_KEYS[apiKeyIndex % API_KEYS.length];
  apiKeyIndex++;
  return key;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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

// 네이버 공식 지역검색 API (모든 키 순회, 재귀 없음)
async function naverLocalSearch(query, display = 5, start = 1) {
  for (let i = 0; i < API_KEYS.length; i++) {
    try {
      const result = await _callNaverApi(query, display, start, API_KEYS[i]);
      if (!result.error) return result;
    } catch (e) {}
  }
  return { items: [], error: true };
}

function _callNaverApi(query, display, start, key) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'openapi.naver.com',
      path: `/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=random`,
      method: 'GET',
      headers: { 'X-Naver-Client-Id': key.id, 'X-Naver-Client-Secret': key.secret },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errorCode) {
            resolve({ items: [], error: true, errorMsg: json.errorMessage });
          } else {
            resolve(json);
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// 네이버 API로 업체 검색 (API 실패 시 HTML 파싱 폴백)
async function searchPlaces(page, context, keyword) {
  const places = [];
  const seenIds = new Set();

  // API 시도 → 실패 시 HTML 폴백
  console.log(`  네이버 검색 API 시도 (키 ${API_KEYS.length}개)...`);
  
  const testResult = await naverLocalSearch(keyword, 5, 1);
  if (testResult.error || !testResult.items || testResult.items.length === 0) {
    console.log(`  API 실패 → HTML 파싱으로 전환`);
    return await searchPlacesHtml(page, context, keyword);
  }

  // API 성공 — 나머지 페이지도 수집
  let allItems = [...testResult.items];
  for (let start = 6; start <= 25; start += 5) {
    const result = await naverLocalSearch(keyword, 5, start);
    if (result.error || !result.items || result.items.length === 0) break;
    allItems.push(...result.items);
    await delay(500, 1000);
  }

  for (const item of allItems) {
      // place_id 추출: link에서 place/{id} 또는 맵링크에서 추출
      let placeId = null;
      if (item.link) {
        const match = item.link.match(/(?:place\/|id=)(\d+)/);
        if (match) placeId = match[1];
      }

      // place_id 없으면 m.place에서 검색
      if (!placeId) {
        placeId = await findPlaceId(page, item.title.replace(/<[^>]*>/g, ''));
      }

      if (!placeId || seenIds.has(placeId)) continue;
      seenIds.add(placeId);

      const name = item.title.replace(/<[^>]*>/g, '').trim();
      
      places.push({
        id: placeId,
        name,
        category: item.category || '',
        address: item.roadAddress || item.address || '',
        phone: item.telephone || '',
        placeUrl: `https://m.place.naver.com/place/${placeId}`,
        homepage_url: null, // 상세 페이지에서 수집
        visitor_review_count: 0,
        blog_review_count: 0,
        talktalk_active: false,
        talktalk_url: null,
      });
    }

  console.log(`  API에서 ${places.length}개 업체 발견`);

  // 각 업체 상세 페이지에서 톡톡/홈페이지/리뷰 수집
  const detailPage = await context.newPage();
  
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    console.log(`    [${i+1}/${places.length}] ${place.name} 상세 수집...`);
    
    try {
      await detailPage.goto(`https://m.place.naver.com/place/${place.id}/home`, {
        waitUntil: 'domcontentloaded', timeout: 15000
      });
      await delay(1500, 2500);

      const detail = await detailPage.evaluate(() => {
        const r = {
          homepage_url: null,
          talktalk_active: false,
          talktalk_url: null,
          visitor_review_count: 0,
          blog_review_count: 0,
        };

        // 톡톡
        const talkLinks = document.querySelectorAll('a[href*="talk.naver.com"]');
        if (talkLinks.length > 0) {
          r.talktalk_active = true;
          r.talktalk_url = talkLinks[0].href;
        } else {
          for (const el of document.querySelectorAll('a, button')) {
            if (el.textContent.includes('톡톡')) {
              r.talktalk_active = true;
              r.talktalk_url = el.href || null;
              break;
            }
          }
        }

        // 홈페이지
        for (const a of document.querySelectorAll('a')) {
          const href = a.href || '';
          const text = a.textContent.trim();
          if ((text === '홈페이지' || text === '홈' || a.className.includes('homepage')) 
              && href && !href.includes('naver.com') && !href.includes('kakao') 
              && !href.includes('instagram') && !href.includes('facebook')) {
            r.homepage_url = href;
            break;
          }
        }
        // 외부 링크 중 홈페이지 후보
        if (!r.homepage_url) {
          for (const a of document.querySelectorAll('a[target="_blank"]')) {
            const href = a.href || '';
            if (href && !href.includes('naver.com') && !href.includes('kakao') 
                && !href.includes('instagram') && !href.includes('facebook')
                && !href.includes('youtube') && !href.includes('blog')) {
              r.homepage_url = href;
              break;
            }
          }
        }

        // 리뷰 수
        const allText = document.body?.innerText || '';
        const visitorMatch = allText.match(/방문자\s*리뷰\s*([\d,]+)/);
        const blogMatch = allText.match(/블로그\s*리뷰\s*([\d,]+)/);
        if (visitorMatch) r.visitor_review_count = parseInt(visitorMatch[1].replace(/,/g, ''), 10);
        if (blogMatch) r.blog_review_count = parseInt(blogMatch[1].replace(/,/g, ''), 10);

        return r;
      });

      place.homepage_url = detail.homepage_url;
      place.talktalk_active = detail.talktalk_active;
      place.talktalk_url = detail.talktalk_url;
      place.visitor_review_count = detail.visitor_review_count;
      place.blog_review_count = detail.blog_review_count;

      console.log(`      톡톡:${place.talktalk_active?'O':'X'} 홈페이지:${place.homepage_url?'O':'X'} 방문자:${place.visitor_review_count} 블로그:${place.blog_review_count}`);

    } catch (e) {
      console.log(`      ⚠️ 상세 수집 실패: ${e.message}`);
    }

    if (i > 0 && i % 10 === 0) {
      console.log(`    --- ${i}개 처리, 15초 휴식 ---`);
      await delay(12000, 18000);
    }
  }

  await detailPage.close().catch(() => {});
  return places;
}

// HTML 파싱 폴백 (API 실패 시)
async function searchPlacesHtml(page, context, keyword) {
  const places = [];

  try {
    // 네이버 통합검색
    await page.goto(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`, {
      waitUntil: 'load', timeout: 20000
    });
    await delay(2000, 3000);

    // 업체명 추출 (uD1F4 클래스)
    const rawPlaces = await page.evaluate(() => {
      const results = [];
      const nameLinks = document.querySelectorAll('a.uD1F4');
      for (const link of nameLinks) {
        const name = link.textContent.replace(/예약|톡톡|영수증|쿠폰/g, '').trim();
        if (name) results.push({ name });
      }
      // 리뷰 수
      const reviewEls = document.querySelectorAll('a.KJzzB');
      let idx = 0;
      for (const el of reviewEls) {
        const text = el.textContent;
        const vm = text.match(/방문자\s*리뷰\s*([\d,]+)/);
        const bm = text.match(/블로그\s*리뷰\s*([\d,]+)/);
        if ((vm || bm) && idx < results.length) {
          results[idx].visitor_review_count = vm ? parseInt(vm[1].replace(/,/g, ''), 10) : 0;
          results[idx].blog_review_count = bm ? parseInt(bm[1].replace(/,/g, ''), 10) : 0;
          idx++;
        }
      }
      return results;
    });

    console.log(`  HTML에서 ${rawPlaces.length}개 업체명 발견`);

    const detailPage = await context.newPage();

    for (const raw of rawPlaces) {
      const placeId = await findPlaceId(detailPage, raw.name);
      if (!placeId) {
        console.log(`    ⚠️ ${raw.name} - place_id 못 찾음, 스킵`);
        continue;
      }

      // 상세 페이지 수집
      try {
        await detailPage.goto(`https://m.place.naver.com/place/${placeId}/home`, {
          waitUntil: 'domcontentloaded', timeout: 15000
        });
        await delay(1500, 2500);

        const detail = await detailPage.evaluate(() => {
          const r = { homepage_url: null, talktalk_active: false, talktalk_url: null, category: '', address: '', phone: '' };
          
          // 톡톡
          const talkLinks = document.querySelectorAll('a[href*="talk.naver.com"]');
          if (talkLinks.length > 0) { r.talktalk_active = true; r.talktalk_url = talkLinks[0].href; }
          else { for (const el of document.querySelectorAll('a, button')) { if (el.textContent.includes('톡톡')) { r.talktalk_active = true; r.talktalk_url = el.href || null; break; } } }
          
          // 홈페이지
          for (const a of document.querySelectorAll('a')) {
            const text = a.textContent.trim();
            if ((text === '홈페이지' || text === '홈') && a.href && !a.href.includes('naver.com')) { r.homepage_url = a.href; break; }
          }
          
          // 카테고리/주소/전화
          const catEl = document.querySelector('.lnJFt, [class*="category"]');
          if (catEl) r.category = catEl.textContent.trim();
          const addrEl = document.querySelector('.LDgIH, [class*="addr"], .Y31Sf');
          if (addrEl) r.address = addrEl.textContent.trim();
          const phoneEl = document.querySelector('.xlx7Q, a[href^="tel:"]');
          if (phoneEl) r.phone = phoneEl.textContent.trim();
          
          return r;
        });

        places.push({
          id: placeId, name: raw.name, category: detail.category, address: detail.address,
          phone: detail.phone, placeUrl: `https://m.place.naver.com/place/${placeId}`,
          homepage_url: detail.homepage_url,
          visitor_review_count: raw.visitor_review_count || 0,
          blog_review_count: raw.blog_review_count || 0,
          talktalk_active: detail.talktalk_active, talktalk_url: detail.talktalk_url,
        });
        console.log(`    ✅ ${raw.name} (place:${placeId})`);
      } catch (e) {
        console.log(`    ⚠️ ${raw.name} 상세 실패: ${e.message}`);
      }
    }

    await detailPage.close().catch(() => {});
  } catch (e) {
    console.log(`  HTML 파싱 실패: ${e.message}`);
  }

  console.log(`  총 ${places.length}개 업체 수집 완료`);
  return places;
}

// place_id 검색 (폴백)
async function findPlaceId(page, name) {
  try {
    const searchUrl = `https://m.place.naver.com/place/list?query=${encodeURIComponent(name)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await delay(1000, 1500);

    const id = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/place/"]');
      for (const a of links) {
        const match = a.href.match(/\/place\/(\d+)/);
        if (match) return match[1];
      }
      return null;
    });
    return id;
  } catch {
    return null;
  }
}

// 톡톡 확인 (폴백용)
async function checkTalktalk(page, placeId) {
  const result = { talktalk_active: false, talktalk_url: null };
  try {
    await page.goto(`https://m.place.naver.com/place/${placeId}/home`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await delay(1000, 2000);
    const data = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="talk.naver.com"]');
      if (links.length > 0) return { active: true, url: links[0].href };
      return { active: false, url: null };
    });
    result.talktalk_active = data.active;
    result.talktalk_url = data.url;
  } catch {}
  return result;
}

module.exports = { createBrowser, searchPlaces, checkTalktalk, delay, randomUA };
