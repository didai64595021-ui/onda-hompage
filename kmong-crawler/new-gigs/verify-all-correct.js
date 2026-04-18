/**
 * 올바른 verify 로직 — kmong 커스텀 UI 기준으로 실제 값 읽기
 *
 * 관찰:
 *   - control 내부에 label p (예: "업종") + value p (예: "가구·인테리어") 구조
 *   - singleValue/multiValue 클래스 안 씀
 *   - 값 텍스트는 control 의 input 과 같은 수준의 <p> 요소에
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function recon(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[id^="react-select-"][id$="-input"]').forEach(el => {
      // label (bound LABEL 태그)
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
      // control ancestor
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      if (!ctrl) { out.push({ inputId: el.id, label, values: [], empty: true }); return; }

      // 가장 robust: control 의 innerText 전체에서 label 제거 → 남은게 값
      // (kmong 커스텀 UI: control 안에 <p>label</p> + <p>value</p> 구조)
      const controlText = (ctrl.innerText || '').trim();
      // label 제거
      let rest = controlText.replace(label, '').trim();
      // 라인 단위로 분리 (multi-select의 경우 ',' 로 여러 값)
      const lines = rest.split(/\n+|\s*,\s*/).map(s => s.trim()).filter(Boolean);
      // placeholder 제외
      const placeholders = ['선택해주세요', '선택', 'Select', '선택하세요'];
      const values = lines.filter(v => !placeholders.includes(v) && v !== '*' && v.length < 80);

      out.push({ inputId: el.id, label, values, empty: values.length === 0 });
    });
    return out;
  });
}

(async () => {
  const gigs = [
    { id: 'N01', draft: '764206', sub: '639', third: '63901' },
    { id: 'N02', draft: '764211', sub: '601', third: '60113' },
    { id: 'N04', draft: '764212', sub: '660', third: '66001' },
    { id: 'N05', draft: '764213', sub: '601', third: '60113' },
    { id: 'N08', draft: '764215', sub: '601', third: '60113' },
    { id: 'N09', draft: '764216', sub: '601', third: '60113' },
    { id: 'N10', draft: '764217', sub: '634', third: '' },
  ];

  const { browser, page } = await login({ slowMo: 60 });
  const summary = [];
  try {
    for (const g of gigs) {
      const url = `https://kmong.com/my-gigs/edit/${g.draft}?rootCategoryId=6&subCategoryId=${g.sub}${g.third ? `&thirdCategoryId=${g.third}` : ''}`;
      console.log(`\n=== ${g.id} (${g.draft}) ===`);
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      await page.evaluate(u => { window.location.href = u; }, url);
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await sleep(4000);

      const r = await recon(page);
      const empties = r.filter(x => x.empty);
      console.log(`   전체 ${r.length}개 / 빈 ${empties.length}개`);
      r.forEach(x => console.log(`   [${x.label.padEnd(12)}] ${x.empty ? '(빈)' : x.values.join(', ')}`));
      summary.push({ id: g.id, draft: g.draft, total: r.length, emptyCount: empties.length, empties: empties.map(e => e.label), all: r });
    }

    console.log('\n=== 최종 요약 ===');
    summary.forEach(s => console.log(`${s.id}: 전체 ${s.total} 빈 ${s.emptyCount} ${s.emptyCount === 0 ? '✅' : '- 빈: ' + s.empties.join(',')}`));
    require('fs').writeFileSync(require('path').join(__dirname, 'verify-all-final.json'), JSON.stringify(summary, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
})();
