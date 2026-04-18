/**
 * 모든 gig 의 REVISION (수정 및 재진행 안내) 를 API PUT 으로 강제 fill
 *
 * body.items[].type === 'REVISION' 의 valueData.revision 이 빈 경우 → COMMON_REVISION 주입
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { COMMON_REVISION } = require('./gig-data-niches-extra.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function forceFillRevision({ id, draftId, sub, third }) {
  const { browser, page } = await login({ slowMo: 60 });
  let capturedBody = null, capturedUrl = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('api.kmong.com') && u.includes('/draft') && req.method() === 'PUT' && !capturedBody) {
      capturedBody = req.postData();
      capturedUrl = u;
    }
  });
  try {
    const editUrl = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}${third ? `&thirdCategoryId=${third}` : ''}`;
    console.log(`\n===== ${id} (draft ${draftId}) =====`);
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

    if (!capturedBody) { console.log('   ✗ body 캡처 실패'); return { id, ok: false }; }

    const body = JSON.parse(capturedBody);
    const rev = body.items.find(it => it.type === 'REVISION' || it.key === 'REVISION');
    if (!rev) { console.log('   ✗ REVISION item 없음'); return { id, ok: false }; }
    const current = (rev.valueData?.revision || '').trim();
    console.log(`   현재 길이: ${current.length}자`);
    if (current.length >= 100) {
      console.log('   ✓ 이미 채워짐 skip');
      return { id, ok: true, skipped: true };
    }

    rev.valueData.revision = COMMON_REVISION;
    console.log(`   주입: ${COMMON_REVISION.length}자`);

    const res = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' },
        credentials: 'include',
        body,
      });
      return { ok: r.ok, status: r.status, text: (await r.text()).slice(0, 200) };
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   PUT: ${JSON.stringify(res)}`);

    // verify
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(4000);
    const len = await page.evaluate(() => {
      const ta = document.querySelector('textarea[name="REVISION.valueData.revision"]');
      return ta ? (ta.value || '').trim().length : -1;
    });
    console.log(`   reload 후 길이: ${len}`);
    return { id, ok: len > 100, finalLen: len };
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
    const r = await forceFillRevision(g);
    results.push(r);
  }
  console.log('\n\n===== REVISION 최종 =====');
  results.forEach(r => {
    console.log(`${r.id}: ${r.ok ? '✅' : '❌'} ${r.skipped ? '(이미 채움)' : `len=${r.finalLen}`}`);
  });
})();
