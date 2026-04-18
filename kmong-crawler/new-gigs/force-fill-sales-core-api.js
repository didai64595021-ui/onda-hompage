/**
 * 판매 핵심 정보 3종 (FAQ, SEARCH_KEYWORD, GIG_INSTRUCTION) API PUT 으로 일괄 채움
 *
 * Schema (실측):
 *   FAQ.faqs: [{question, answer, sort}]
 *   SEARCH_KEYWORD.keywords: [{keyword, sort}]
 *   GIG_INSTRUCTION.gigInstructions: [{content}]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { PRODUCTS } = require('./gig-data-niches.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 공통 의뢰인 안내
const COMMON_INSTRUCTION = `작업 시작 전 다음을 준비해주세요.

1. 작업 범위 확인 (패키지 선택)
2. 필요한 정보·자료 전달
3. 참고 레퍼런스 (있으면)
4. 선호 브랜드 톤 / 색상

작업 중 커뮤니케이션은 크몽 메신저를 이용해주시고,
작업 결과는 안전결제 완료 후 전달해드립니다.

피드백·수정 요청은 한 번에 정리해서 주시면
더 빠르고 정확하게 반영됩니다.`;

// gig 별 검색 키워드 (niche 주제 기반)
const KEYWORDS_BY_ID = {
  'N01': ['아임웹이사', '아임웹탈출', '아임웹구독해지', '자체홈페이지', '홈페이지이전', '웹빌더이사', '아임웹대안', '구독료절약', '홈페이지무료호스팅', '아임웹에서이전'],
  'N02': ['식스샵이사', '식스샵탈출', '포트폴리오이전', '포트폴리오홈페이지', '크리에이터홈페이지', '작가홈페이지', '식스샵대안', '갤러리이전', '스튜디오홈페이지', '식스샵구독해지'],
  'N04': ['노션홈페이지', '노션사이트', '노션랜딩', '노션웹사이트', '노션전환', 'notion홈페이지', '노션커스텀도메인', '노션SEO', '스타트업랜딩', '노션사이트제작'],
  'N05': ['Wix이전', 'Wix이사', 'Squarespace이전', 'Framer이전', '해외웹빌더이전', 'Wix한국어', 'Wix대안', '영문사이트한국이전', 'Wix구독해지', 'Squarespace한국'],
  'N08': ['온라인예약시스템', 'B2B컨설팅홈페이지', '레슨예약', '상담예약시스템', '네이버예약대안', '예약시스템제작', '컨설팅웹사이트', '온라인예약페이지', '수수료없는예약', '자체예약시스템'],
  'N09': ['다국어홈페이지', '영문홈페이지', '일본어홈페이지', '중국어홈페이지', '다국어번역', '상세페이지번역', '이미지번역', '해외마케팅홈페이지', '관광객홈페이지', '글로벌사이트'],
  'N10': ['리뉴얼후순위유지', '301리다이렉트', '홈페이지리뉴얼SEO', '검색순위보존', '사이트이전SEO', '네이버순위유지', '구글순위유지', 'SEO이전', '리뉴얼검색노출', '홈페이지개편순위'],
};

function buildFAQ(product) {
  // 실제 UI 저장 body schema: [{ question, answer }] (sort 필드 없음)
  const faq = (product.faq || []).map((item) => ({
    question: item.q || item.question || '',
    answer: item.a || item.answer || '',
  })).filter(f => f.question && f.answer);
  return faq;
}

function buildKeywords(productId) {
  // 실제 UI 저장 body schema: ["string", "string"] (object 배열 아님!)
  return KEYWORDS_BY_ID[productId] || [];
}

async function forceFillSalesCore(gig) {
  const { id, draftId, sub, third } = gig;
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return { id, ok: false, error: 'product 없음' };

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
    const editUrl = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}${third ? `&thirdCategoryId=${third}` : ''}`;
    console.log(`\n===== ${id} (${draftId}) =====`);
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3500);
    await page.evaluate(u => { window.location.href = u; }, editUrl);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(3500);

    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(500);
    await btn.click({ force: true });
    await sleep(7000);

    if (!captured) { console.log('   ✗ 캡처 실패'); return { id, ok: false }; }
    const body = JSON.parse(captured);

    const faqItem = body.items.find(it => (it.type || it.key) === 'FAQ');
    const kwItem = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
    const giItem = body.items.find(it => (it.type || it.key) === 'GIG_INSTRUCTION');

    let changed = 0;
    if (faqItem && (faqItem.valueData.faqs || []).length === 0) {
      const faqs = buildFAQ(product);
      if (faqs.length > 0) {
        faqItem.valueData.faqs = faqs;
        console.log(`   FAQ 주입: ${faqs.length}개`);
        changed++;
      }
    }
    if (kwItem && (kwItem.valueData.keywords || []).length === 0) {
      const keywords = buildKeywords(id);
      if (keywords.length > 0) {
        kwItem.valueData.keywords = keywords;
        console.log(`   SEARCH_KEYWORD 주입: ${keywords.length}개`);
        changed++;
      }
    }
    if (giItem && (giItem.valueData.gigInstructions || []).length === 0) {
      giItem.valueData.gigInstructions = [{ content: COMMON_INSTRUCTION }];
      console.log(`   GIG_INSTRUCTION 주입: ${COMMON_INSTRUCTION.length}자`);
      changed++;
    }

    if (changed === 0) {
      console.log(`   ✓ 이미 모두 채움 — skip`);
      return { id, ok: true, skipped: true };
    }

    const res = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' },
        credentials: 'include',
        body,
      });
      return { ok: r.ok, status: r.status, text: (await r.text()).slice(0, 200) };
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   PUT 응답: ${JSON.stringify(res)}`);

    // verify: reload 후 body 재캡처
    captured = null;
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await sleep(4000);
    await page.locator('button:has-text("임시 저장하기")').last().click({ force: true }).catch(() => {});
    await sleep(7000);
    if (!captured) { console.log('   verify 재캡처 실패'); return { id, ok: false }; }
    const verifyBody = JSON.parse(captured);
    const vFaq = verifyBody.items.find(it => (it.type || it.key) === 'FAQ')?.valueData?.faqs || [];
    const vKw = verifyBody.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD')?.valueData?.keywords || [];
    const vGi = verifyBody.items.find(it => (it.type || it.key) === 'GIG_INSTRUCTION')?.valueData?.gigInstructions || [];
    console.log(`   persist: FAQ=${vFaq.length} KW=${vKw.length} GI=${vGi.length}`);
    return { id, ok: true, counts: { faq: vFaq.length, kw: vKw.length, gi: vGi.length } };
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  const gigs = [
    { id: 'N01', draftId: '764206', sub: '639', third: '63901' },
    { id: 'N02', draftId: '764211', sub: '601', third: '60113' },
    { id: 'N04', draftId: '764212', sub: '660', third: '66001' },
    { id: 'N05', draftId: '764213', sub: '601', third: '60113' },
    { id: 'N08', draftId: '764215', sub: '601', third: '60113' },
    { id: 'N09', draftId: '764216', sub: '601', third: '60113' },
    { id: 'N10', draftId: '764217', sub: '634', third: '' },
  ];
  const results = [];
  for (const g of gigs) {
    const r = await forceFillSalesCore(g);
    results.push(r);
  }
  console.log('\n\n===== 판매핵심정보 최종 =====');
  results.forEach(r => {
    if (r.skipped) console.log(`${r.id}: ✅ (이미 채움)`);
    else if (r.counts) console.log(`${r.id}: FAQ=${r.counts.faq} KW=${r.counts.kw} GI=${r.counts.gi} ${r.counts.faq > 0 && r.counts.kw > 0 && r.counts.gi > 0 ? '✅' : '⚠'}`);
    else console.log(`${r.id}: ❌ ${r.error || 'unknown'}`);
  });
})();
