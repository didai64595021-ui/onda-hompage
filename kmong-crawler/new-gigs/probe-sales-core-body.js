/**
 * 판매 핵심 정보 섹션 관련 body 필드 구조 파악
 *
 * 1) 저장 1회로 PUT body 캡처
 * 2) 모든 items / 모든 valueData 키 전수 dump
 * 3) 특히 FAQ / SEARCH_KEYWORD / GIG_INSTRUCTION 비어있는지 확인
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
  let captured = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('api.kmong.com') && u.includes('/draft') && req.method() === 'PUT' && !captured) {
      captured = req.postData();
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
    await sleep(8000);

    if (!captured) { console.log('body 캡처 실패'); return; }
    const body = JSON.parse(captured);
    console.log(`[1] body items ${body.items.length}개:`);
    body.items.forEach((it, i) => {
      const type = it.type || it.key;
      const keys = Object.keys(it.valueData || {});
      let summary = '';
      if (type === 'FAQ') {
        summary = `(faqs=${(it.valueData.faqs || []).length}개)`;
      } else if (type === 'SEARCH_KEYWORD') {
        summary = `(keywords=${(it.valueData.keywords || []).length}개)`;
      } else if (type === 'GIG_INSTRUCTION') {
        const g = it.valueData.gigInstructions || [];
        summary = `(instructions=${g.length}, empty=${g.filter(x => !x.content || !x.content.trim()).length})`;
      } else if (type === 'REVISION') {
        summary = `(len=${(it.valueData.revision || '').length})`;
      } else if (type === 'PACKAGE_OPTION_GROUP') {
        const opts = it.valueData.options || [];
        const pkgs = it.valueData.packages || [];
        summary = `(options=${opts.length}, packages=${pkgs.length})`;
      } else if (type === 'METADATA') {
        const g = it.valueData.gigMetaGroups || [];
        const empties = g.filter(gr => !gr.gigMetaGroupItems.some(i => i.isSelected));
        summary = `(groups=${g.length}, empty=${empties.length}: ${empties.map(e => e.name).join(',')})`;
      }
      console.log(`  [${i}] ${type} keys=[${keys.join(',')}] ${summary}`);
    });

    // FAQ / SEARCH_KEYWORD / GIG_INSTRUCTION 상세
    console.log('\n[2] FAQ 상세');
    const faq = body.items.find(it => (it.type || it.key) === 'FAQ');
    if (faq) {
      console.log(JSON.stringify(faq.valueData, null, 2).slice(0, 600));
    }

    console.log('\n[3] SEARCH_KEYWORD 상세');
    const kw = body.items.find(it => (it.type || it.key) === 'SEARCH_KEYWORD');
    if (kw) {
      console.log(JSON.stringify(kw.valueData, null, 2).slice(0, 400));
    }

    console.log('\n[4] GIG_INSTRUCTION 상세');
    const gi = body.items.find(it => (it.type || it.key) === 'GIG_INSTRUCTION');
    if (gi) {
      console.log(JSON.stringify(gi.valueData, null, 2).slice(0, 800));
    }

    fs.writeFileSync(path.join(__dirname, 'probe-sales-core-body.json'), JSON.stringify(body, null, 2));
    console.log('\n저장: probe-sales-core-body.json');
  } finally {
    await browser.close().catch(() => {});
  }
})();
