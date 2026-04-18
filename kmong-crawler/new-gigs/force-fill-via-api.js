/**
 * N04 카테고리 API 직접 PUT 으로 강제 persist
 *
 * 전략:
 *   1) 평소처럼 저장 버튼 클릭 → PUT body 캡처
 *   2) body JSON 파싱 → items[3].valueData.gigMetaGroups 에서 id=451 (카테고리) 찾기
 *   3) gigMetaGroupItems 에서 원하는 값 → isSelected = true
 *   4) 수정된 body 를 같은 endpoint 로 PUT (브라우저 cookie 사용)
 *   5) reload + 확인
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function apiForcefillCategory(draftId, sub, third, categoryGroupId, selectName) {
  const { browser, page } = await login({ slowMo: 80 });
  let capturedBody = null;
  let capturedUrl = null;
  let capturedHeaders = null;

  // PUT request 캡처
  page.on('request', req => {
    const u = req.url();
    if (u.includes('api.kmong.com') && u.includes('/draft') && req.method() === 'PUT' && !capturedBody) {
      capturedBody = req.postData() || '';
      capturedUrl = u;
      capturedHeaders = req.headers();
    }
  });

  try {
    const editUrl = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}${third ? `&thirdCategoryId=${third}` : ''}`;
    console.log(`[1] nav ${editUrl}`);
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await page.evaluate(u => { window.location.href = u; }, editUrl);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(4000);

    // 1차 저장 → body 캡처
    console.log('[2] 1차 저장 (body 캡처용)');
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(500);
    await btn.click({ force: true });
    await sleep(8000);

    if (!capturedBody) {
      console.log('   ✗ PUT body 캡처 실패');
      return { ok: false };
    }
    console.log(`   ✓ 캡처됨 ${capturedBody.length} bytes`);

    // 2차: body 수정
    console.log('[3] body 수정');
    const body = JSON.parse(capturedBody);
    const metaItem = body.items.find(it => it.type === 'METADATA' || it.key === 'METADATA');
    if (!metaItem) { console.log('   ✗ METADATA item 없음'); return { ok: false }; }
    const groups = metaItem.valueData.gigMetaGroups || [];
    const group = groups.find(g => g.id === categoryGroupId || g.name === '카테고리');
    if (!group) { console.log(`   ✗ 카테고리 group 없음`); return { ok: false }; }
    console.log(`   group: id=${group.id} name="${group.name}" items=${group.gigMetaGroupItems.length}`);
    const targetItem = group.gigMetaGroupItems.find(i => i.name === selectName)
      || group.gigMetaGroupItems[0];
    console.log(`   target: "${targetItem.name}" (id=${targetItem.id})`);
    targetItem.isSelected = true;

    // 3차: 수정된 body 로 PUT
    console.log('[4] 수정된 body 로 PUT');
    const res = await page.evaluate(async ({ url, body }) => {
      try {
        const r = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
          },
          credentials: 'include',
          body,
        });
        const text = await r.text();
        return { ok: r.ok, status: r.status, text: text.slice(0, 500) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   결과: ${JSON.stringify(res)}`);

    // reload + verify
    console.log('[5] reload + 검증');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const verify = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h1,h2,h3,h4')].find(h => (h.innerText || '').includes('주요 특징'));
      if (h) h.scrollIntoView({ behavior: 'auto', block: 'start' });
      // 카테고리 필드 값 읽기
      const inputs = [...document.querySelectorAll('input[id^="react-select-"][id$="-input"]')];
      for (const el of inputs) {
        let label = '';
        let cur = el;
        for (let i = 0; i < 12 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const lbls = [...cur.querySelectorAll(':scope > label, :scope > div > label')];
          for (const l of lbls) {
            const t = (l.innerText || '').trim().replace(/\*\s*$/, '').trim();
            if (t && t.length < 40) { label = t.split('\n')[0]; break; }
          }
          if (label) break;
        }
        if (label === '카테고리') {
          let ctrl = el;
          for (let i = 0; i < 10 && ctrl; i++) {
            ctrl = ctrl.parentElement;
            if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
          }
          const full = (ctrl?.innerText || '').trim();
          return { label, full, value: full.replace(label, '').trim() };
        }
      }
      return { err: 'not found' };
    });
    console.log(`   최종 UI: ${JSON.stringify(verify)}`);
    return { ok: true, verify };
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  // N04 노션 카테고리 fill
  console.log('===== N04 노션 카테고리 API 강제 fill =====');
  await apiForcefillCategory('764212', '660', '66001', 451, '개인 홈페이지');
})();
