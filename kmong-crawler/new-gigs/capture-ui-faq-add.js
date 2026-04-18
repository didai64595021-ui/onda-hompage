/**
 * UI 에서 실제 FAQ/SEARCH_KEYWORD/GIG_INSTRUCTION 추가 버튼 클릭 → body 캡처
 *
 * → 서버가 UI 로 받는 실제 schema 획득
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const draftId = '764211';
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113`;
  const { browser, page } = await login({ slowMo: 80 });
  const allPUTs = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('api.kmong.com') && u.includes('/draft') && req.method() === 'PUT') {
      allPUTs.push({ body: req.postData(), url: u, t: Date.now() });
    }
  });
  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(4000);

    // 판매 핵심 정보 섹션까지 스크롤
    console.log('[1] 판매 핵심 정보 섹션 스크롤');
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('h1,h2,h3,h4,button')].find(el => (el.innerText || '').includes('판매 핵심 정보'));
      if (h) h.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await sleep(1500);

    // FAQ 섹션 찾기
    console.log('[2] FAQ "추가" 버튼 찾기');
    const faqAddClicked = await page.evaluate(() => {
      // FAQ 섹션 찾기 — h* 또는 label 에 FAQ 텍스트
      const faqLabels = [...document.querySelectorAll('h1,h2,h3,h4,h5,p,span,label')].filter(el => {
        const t = (el.innerText || '').trim();
        return t === 'FAQ' || t === 'F&Q' || t.includes('자주 묻는 질문') || t === '자주 묻는 질문';
      });
      if (faqLabels.length === 0) return { ok: false, reason: 'FAQ label 없음' };
      const faqLabel = faqLabels[0];
      // FAQ 섹션 컨테이너 찾고 그 안의 "추가" 버튼
      let container = faqLabel;
      for (let i = 0; i < 8 && container; i++) {
        container = container.parentElement;
        if (!container) break;
        const addBtns = [...container.querySelectorAll('button')].filter(b => {
          const t = (b.innerText || '').trim();
          return t === '추가' || t.includes('추가') || t.includes('+');
        });
        if (addBtns.length > 0) {
          const btn = addBtns[0];
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return { ok: true, btnText: (btn.innerText || '').trim(), containerDepth: i };
        }
      }
      return { ok: false, reason: '추가 버튼 없음' };
    });
    console.log(`   FAQ 추가 버튼: ${JSON.stringify(faqAddClicked)}`);
    await sleep(2000);

    // FAQ input 채우기
    console.log('[3] FAQ input 찾고 값 입력');
    const faqFill = await page.evaluate(() => {
      // 가장 최근 추가된 FAQ input 들 찾기
      const inputs = [...document.querySelectorAll('input[type="text"], textarea')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !el.value;
      });
      // placeholder 로 FAQ 관련 찾기
      const faqInputs = inputs.filter(el => {
        const p = (el.placeholder || '').toLowerCase();
        return p.includes('질문') || p.includes('답변') || p.includes('faq') || p.includes('질의');
      });
      return faqInputs.map(el => ({
        tag: el.tagName,
        type: el.type,
        placeholder: el.placeholder,
        name: el.name,
      }));
    });
    console.log(`   FAQ input 후보: ${JSON.stringify(faqFill)}`);

    // 직접 input 찾아서 채우기 — playwright locator 사용
    const faqQInput = page.locator('input[placeholder*="질문"], textarea[placeholder*="질문"]').first();
    const faqAInput = page.locator('input[placeholder*="답변"], textarea[placeholder*="답변"]').first();
    if (await faqQInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await faqQInput.fill('테스트 샘플 질문');
      console.log('   질문 input fill OK');
    }
    if (await faqAInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await faqAInput.fill('테스트 샘플 답변');
      console.log('   답변 input fill OK');
    }
    await sleep(1500);

    // 검색 키워드 입력
    console.log('[4] SEARCH_KEYWORD input');
    const kwInput = page.locator('input[placeholder*="키워드"]').first();
    if (await kwInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await kwInput.fill('테스트키워드');
      await page.keyboard.press('Enter').catch(() => {});
      console.log('   키워드 input fill OK');
    }
    await sleep(1500);

    // 저장
    console.log('[5] 저장');
    allPUTs.length = 0;
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded();
    await sleep(500);
    await btn.click({ force: true });
    await sleep(8000);

    if (allPUTs.length > 0) {
      const body = JSON.parse(allPUTs[0].body);
      const faq = body.items.find(it => (it.type || it.key) === 'FAQ');
      const kw = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
      console.log('\n[6] 저장 PUT body FAQ:');
      console.log(JSON.stringify(faq?.valueData, null, 2).slice(0, 500));
      console.log('\n[6] 저장 PUT body SEARCH_KEYWORD:');
      console.log(JSON.stringify(kw?.valueData, null, 2).slice(0, 500));
      fs.writeFileSync(path.join(__dirname, 'ui-captured-body.json'), JSON.stringify(body, null, 2));
    } else {
      console.log('PUT 캡처 실패');
    }
  } finally {
    await browser.close().catch(() => {});
  }
})();
