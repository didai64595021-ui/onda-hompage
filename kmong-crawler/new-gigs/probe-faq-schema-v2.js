/**
 * FAQ / SEARCH_KEYWORD schema 재시도 — 서버가 조용히 무시하는 듯
 * GIG_INSTRUCTION 방식 참고: 서버가 [{content, isMandatory, selectedType, selections, sort}] 로 확장
 *
 * 동일 패턴 적용 시도:
 *   FAQ: [{ question, answer, sort: N }]
 *   SEARCH_KEYWORD: [{ keyword, sort: N }] 또는 그냥 keyword string
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
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
    const baseBody = JSON.parse(captured);

    async function tryPut(label, modifyFn) {
      const body = JSON.parse(JSON.stringify(baseBody));
      modifyFn(body);
      captured = null;
      const r = await page.evaluate(async ({ url, body }) => {
        const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body });
        return { status: r.status, text: (await r.text()).slice(0, 200) };
      }, { url: capturedUrl, body: JSON.stringify(body) });
      console.log(`   PUT 응답: ${JSON.stringify(r)}`);
      // reload 후 재캡처
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await sleep(4000);
      await page.locator('button:has-text("임시 저장하기")').last().click({ force: true }).catch(() => {});
      await sleep(6000);
      if (!captured) { console.log(`   재캡처 실패`); return null; }
      const verifyBody = JSON.parse(captured);
      const faq = verifyBody.items.find(it => (it.type || it.key) === 'FAQ');
      const kw = verifyBody.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
      console.log(`   [${label}] FAQ persist: ${JSON.stringify(faq?.valueData).slice(0, 200)}`);
      console.log(`   [${label}] KW persist: ${JSON.stringify(kw?.valueData).slice(0, 200)}`);
      return { faq: faq?.valueData, kw: kw?.valueData };
    }

    console.log('\n[A] FAQ {question, answer, sort} + KW {keyword, sort}');
    await tryPut('A', body => {
      const faq = body.items.find(it => (it.type || it.key) === 'FAQ');
      faq.valueData.faqs = [{ question: 'A 질문', answer: 'A 답변', sort: 1 }];
      const kw = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
      kw.valueData.keywords = [{ keyword: 'A키워드', sort: 1 }];
    });

    console.log('\n[B] FAQ {faqQuestion, faqAnswer} + KW plain');
    await tryPut('B', body => {
      const faq = body.items.find(it => (it.type || it.key) === 'FAQ');
      faq.valueData.faqs = [{ faqQuestion: 'B 질문', faqAnswer: 'B 답변' }];
      const kw = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
      kw.valueData.keywords = [{ name: 'B키워드' }];
    });

    console.log('\n[C] FAQ {content 안에 q/a 합쳐} + KW {value}');
    await tryPut('C', body => {
      const faq = body.items.find(it => (it.type || it.key) === 'FAQ');
      faq.valueData.faqs = [{ content: 'C 내용', sort: 1 }];
      const kw = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
      kw.valueData.keywords = [{ value: 'C키워드' }];
    });

    console.log('\n[D] FAQ 풀 fields (id:null, gigId, createdAt 없이)');
    await tryPut('D', body => {
      const faq = body.items.find(it => (it.type || it.key) === 'FAQ');
      faq.valueData.faqs = [{ id: null, question: 'D 질문', answer: 'D 답변', sort: 1, isDeleted: false }];
      const kw = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
      kw.valueData.keywords = [{ id: null, keyword: 'D키워드', sort: 1 }];
    });
  } finally {
    await browser.close().catch(() => {});
  }
})();
