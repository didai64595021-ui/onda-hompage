/**
 * 저장 시 PUT /gig-modules/form/{draftId}/draft body 캡처
 * → 업종/카테고리/개발스택 필드 이름 + 기존 값 확인
 * → 직접 API 호출로 값 주입 가능한지 파악
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const draftId = '764211';
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113`;

  const { browser, page } = await login({ slowMo: 60 });
  const captured = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('api.kmong.com') && u.includes('draft') && req.method() === 'PUT') {
      const body = req.postData() || '';
      captured.push({ url: u, body, headers: req.headers() });
    }
  });
  // response body도 캡처
  const responses = [];
  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('api.kmong.com') && u.includes('draft')) {
      try {
        const text = await resp.text();
        responses.push({ url: u, status: resp.status(), body: text.slice(0, 30000) });
      } catch(e){}
    }
  });

  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    console.log('[1] 초기 GET 후 응답 확인 (현재 form 전체 state)');
    const initResponses = responses.filter(r => r.url.includes('GET') || true);
    console.log(`   응답 ${responses.length}개`);

    console.log('[2] 임시저장 1회 — PUT body 캡처');
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded();
    await sleep(500);
    await btn.click({ force: true });
    await sleep(8000);

    console.log(`\n[3] 캡처 결과: PUT ${captured.length}건`);
    captured.forEach((c, i) => {
      console.log(`   #${i} URL: ${c.url}`);
      console.log(`      body 길이: ${c.body.length}자`);
    });

    if (captured[0]) {
      // body JSON 파싱 → 업종/카테고리 관련 키 탐색
      try {
        const data = JSON.parse(captured[0].body);
        fs.writeFileSync(path.join(__dirname, 'save-body-parsed.json'), JSON.stringify(data, null, 2));
        console.log('\n[4] body 키 탐색');
        // 재귀적으로 모든 키/값 dump
        function walk(obj, pathArr = []) {
          if (obj && typeof obj === 'object') {
            if (Array.isArray(obj)) {
              obj.forEach((v, i) => walk(v, [...pathArr, `[${i}]`]));
            } else {
              for (const k of Object.keys(obj)) {
                walk(obj[k], [...pathArr, k]);
              }
            }
          } else {
            const p = pathArr.join('.');
            // 업종/카테고리 관련 key 필터
            const s = String(obj).slice(0, 80);
            if (p.toLowerCase().includes('category') || p.toLowerCase().includes('industry') ||
                p.toLowerCase().includes('업종') || p.toLowerCase().includes('카테고리') ||
                p.includes('language') || p.includes('framework') || p.includes('database') || p.includes('cloud') ||
                p.includes('BUSINESS') || p.includes('INDUSTRY') || p.includes('CATEGORY') ||
                s.includes('가구') || s.includes('포트폴리오') || s.includes('JavaScript')) {
              console.log(`   ${p} = ${JSON.stringify(obj).slice(0, 100)}`);
            }
          }
        }
        walk(data);
      } catch (e) {
        console.log(`   parse 실패: ${e.message}`);
        fs.writeFileSync(path.join(__dirname, 'save-body-raw.txt'), captured[0].body);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
})();
