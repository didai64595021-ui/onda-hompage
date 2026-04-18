/**
 * FAQ / SEARCH_KEYWORD / GIG_INSTRUCTION schema 시행착오
 *
 * 각각 다른 format 으로 시도해서 PUT 응답 200 받는 것 찾기
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function probe() {
  const draftId = '764211';
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113`;
  const { browser, page } = await login({ slowMo: 60 });
  let captured = null, capturedUrl = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('api.kmong.com') && u.includes('/draft') && req.method() === 'PUT' && !captured) {
      captured = req.postData();
      capturedUrl = u;
    }
  });

  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(4000);

    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded();
    await sleep(500);
    await btn.click({ force: true });
    await sleep(7000);
    if (!captured) throw new Error('capture fail');

    const baseBody = JSON.parse(captured);

    // TEST 1: keywords (string array)
    console.log('\n[TEST 1] SEARCH_KEYWORD: keywords = ["테스트키워드1", "테스트키워드2"]');
    let body = JSON.parse(JSON.stringify(baseBody));
    const kw = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
    kw.valueData.keywords = ['테스트키워드1', '테스트키워드2'];
    const r1 = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body });
      return { status: r.status, text: (await r.text()).slice(0, 500) };
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   응답: ${JSON.stringify(r1)}`);

    // TEST 2: faqs — { question, answer }
    console.log('\n[TEST 2] FAQ: [{ question, answer }]');
    body = JSON.parse(JSON.stringify(baseBody));
    const faq2 = body.items.find(it => (it.type || it.key) === 'FAQ');
    faq2.valueData.faqs = [{ question: '테스트 질문1', answer: '테스트 답변1' }];
    const r2 = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body });
      return { status: r.status, text: (await r.text()).slice(0, 500) };
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   응답: ${JSON.stringify(r2)}`);

    // TEST 3: faqs — { q, a }
    console.log('\n[TEST 3] FAQ: [{ q, a }]');
    body = JSON.parse(JSON.stringify(baseBody));
    const faq3 = body.items.find(it => (it.type || it.key) === 'FAQ');
    faq3.valueData.faqs = [{ q: '테스트 질문2', a: '테스트 답변2' }];
    const r3 = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body });
      return { status: r.status, text: (await r.text()).slice(0, 500) };
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   응답: ${JSON.stringify(r3)}`);

    // TEST 4: faqs — { title, content }
    console.log('\n[TEST 4] FAQ: [{ title, content }]');
    body = JSON.parse(JSON.stringify(baseBody));
    const faq4 = body.items.find(it => (it.type || it.key) === 'FAQ');
    faq4.valueData.faqs = [{ title: '테스트 질문3', content: '테스트 답변3' }];
    const r4 = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body });
      return { status: r.status, text: (await r.text()).slice(0, 500) };
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   응답: ${JSON.stringify(r4)}`);

    // TEST 5: GIG_INSTRUCTION — { content }
    console.log('\n[TEST 5] GIG_INSTRUCTION: [{ content }]');
    body = JSON.parse(JSON.stringify(baseBody));
    const gi5 = body.items.find(it => (it.type || it.key) === 'GIG_INSTRUCTION');
    gi5.valueData.gigInstructions = [{ content: '테스트 안내' }];
    const r5 = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body });
      return { status: r.status, text: (await r.text()).slice(0, 500) };
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   응답: ${JSON.stringify(r5)}`);

    // reload 후 실제 저장된 값 확인 (마지막 시도가 어떻게 됐는지)
    console.log('\n[verify] reload 후 최종 body 재캡처');
    captured = null;
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await sleep(4000);
    await page.locator('button:has-text("임시 저장하기")').last().click({ force: true }).catch(() => {});
    await sleep(8000);
    if (captured) {
      const finalBody = JSON.parse(captured);
      const faqFinal = finalBody.items.find(it => (it.type || it.key) === 'FAQ');
      const kwFinal = finalBody.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
      const giFinal = finalBody.items.find(it => (it.type || it.key) === 'GIG_INSTRUCTION');
      console.log(`   FAQ: ${JSON.stringify(faqFinal?.valueData).slice(0, 300)}`);
      console.log(`   SEARCH_KEYWORD: ${JSON.stringify(kwFinal?.valueData).slice(0, 200)}`);
      console.log(`   GIG_INSTRUCTION: ${JSON.stringify(giFinal?.valueData).slice(0, 300)}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

probe().catch(e => console.error(e));
