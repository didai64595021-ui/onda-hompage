/**
 * "판매 핵심 정보" 드랍다운 섹션 전개 후 추가 필드 구조 정찰
 *
 * 사용법: node probe-sales-core-info.js <draftId> <subCategoryId> [thirdCategoryId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const draftId = process.argv[2] || '764206';
  const subCategoryId = process.argv[3] || '639';
  const thirdCategoryId = process.argv[4] || '63901';
  const editUrl = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${subCategoryId}${thirdCategoryId ? `&thirdCategoryId=${thirdCategoryId}` : ''}`;

  const { browser, page } = await login({ slowMo: 80 });
  try {
    console.log(`[probe] warm-up + nav ${editUrl}`);
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, editUrl);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    // "판매 핵심 정보" 섹션 찾기 + 전개
    console.log(`\n[1] "판매 핵심 정보" 섹션 탐색`);
    const secInfo = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('h1, h2, h3, h4, button, p, span, div')]
        .filter(el => {
          const t = (el.innerText || '').trim();
          return t.length > 0 && t.length < 40 && (t.includes('판매 핵심 정보') || t.includes('판매 핵심정보'));
        });
      return candidates.slice(0, 5).map(el => ({
        tag: el.tagName,
        text: (el.innerText || '').trim().slice(0, 80),
        cls: (el.className || '').slice(0, 100),
        rect: el.getBoundingClientRect(),
      }));
    });
    console.log(`   발견: ${secInfo.length}개`);
    secInfo.forEach(s => console.log(`   - ${s.tag} "${s.text}" class="${s.cls}"`));

    // 가장 확률 높은 토글 button 클릭
    console.log(`\n[2] 섹션 헤더 클릭 (드랍다운 전개)`);
    const clicked = await page.evaluate(() => {
      const hits = [...document.querySelectorAll('button, [role="button"], div[class*="accordion"], div[class*="collapse"], h3, h4, p')]
        .filter(el => ((el.innerText || '').trim() === '판매 핵심 정보' || (el.innerText || '').trim() === '판매 핵심정보'));
      if (hits.length === 0) {
        // fallback: 가장 가까운 clickable ancestor
        const el = [...document.querySelectorAll('*')].find(e => (e.innerText || '').trim() === '판매 핵심 정보');
        if (!el) return { ok: false, reason: 'not found' };
        let cur = el;
        for (let i = 0; i < 6 && cur; i++) {
          cur = cur.parentElement;
          if (cur && (cur.tagName === 'BUTTON' || cur.getAttribute('role') === 'button' || getComputedStyle(cur).cursor === 'pointer')) break;
        }
        if (cur) { cur.scrollIntoView({ block: 'center' }); cur.click(); return { ok: true, mode: 'ancestor' }; }
        return { ok: false, reason: 'no clickable ancestor' };
      }
      hits[0].scrollIntoView({ block: 'center' });
      hits[0].click();
      return { ok: true, mode: 'direct', text: hits[0].innerText };
    });
    console.log(`   클릭 결과: ${JSON.stringify(clicked)}`);
    await sleep(2500);

    // 전개 후 새로 나타난 필드 dump
    console.log(`\n[3] 전개 후 필드 dump`);
    const fields = await page.evaluate(() => {
      function nearestLabel(el) {
        let cur = el;
        for (let i = 0; i < 8 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const lbl = cur.querySelector('label, p');
          if (lbl) {
            const t = (lbl.innerText || '').trim();
            if (t && t.length < 80) return t;
          }
        }
        return '';
      }
      const inputs = [...document.querySelectorAll('input, textarea, select')]
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.type !== 'hidden' && el.type !== 'file';
        })
        .map((el, i) => ({
          i, tag: el.tagName, type: el.type || '', name: el.name || '', id: el.id || '',
          placeholder: el.placeholder || '',
          value: (el.value || '').slice(0, 80),
          empty: !el.value,
          label: nearestLabel(el).slice(0, 60),
          disabled: el.disabled,
        }));
      return inputs;
    });
    console.log(`   inputs/textareas ${fields.length}개`);
    fields.forEach(f => console.log(`   [${f.i}] ${f.tag} name="${f.name || f.id}" label="${f.label}" empty=${f.empty} val="${f.value}"`));

    // 최종 스크린샷
    await page.screenshot({ path: path.join(__dirname, 'screenshots', `probe-sales-core-${draftId}.png`), fullPage: true });
    const out = { draftId, at: new Date().toISOString(), secInfo, clicked, fields };
    fs.writeFileSync(path.join(__dirname, `probe-sales-core-${draftId}.json`), JSON.stringify(out, null, 2));
    console.log(`\n[결과] probe-sales-core-${draftId}.json`);
  } finally {
    await browser.close().catch(() => {});
  }
})();
