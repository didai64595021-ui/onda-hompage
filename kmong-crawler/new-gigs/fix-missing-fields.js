/**
 * 빈 필드만 타겟 보강 (v2) — 검증된 create-gig.js 헬퍼 재사용
 *
 * 변경: fillSelectByLabel / fillReactSelect / fillTipTap / discoverSelects 를 create-gig.js 에서 import
 *        (Search text 기반 매칭 + fallback 시에만 가장 가까운 값 선택)
 *
 * 동작:
 *   1) 현재 필드 상태 recon
 *   2) 빈 PREP 은 fillTipTap 사용
 *   3) 빈 select 는 fillSelectByLabel (force=true 로 기존 값도 덮어쓰기)
 *   4) 저장 + reload 검증
 *
 * 사용법: node fix-missing-fields.js <productId> [--force-all]
 *   --force-all : 이미 채워진 select 도 강제 덮어쓰기 (잘못 채운 fallback 수정용)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { login } = require('../lib/login');
const { fillSelectByLabel, fillTipTap, discoverSelects } = require('./create-gig.js');
const { PRODUCTS } = require('./gig-data-niches.js');
const { EXTRA } = require('./gig-data-niches-extra.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const productId = process.argv[2];
const forceAll = process.argv.includes('--force-all');
if (!productId) { console.error('node fix-missing-fields.js <productId> [--force-all]'); process.exit(1); }
const product = PRODUCTS.find(p => p.id === productId);
const extra = EXTRA[productId];
if (!product || !extra) { console.error(`${productId} 데이터 없음`); process.exit(1); }

async function checkPrep(page) {
  return await page.evaluate(() => {
    const el = document.querySelector('#DESCRIPTION_PREPARATION .ProseMirror');
    return el ? (el.innerText || '').trim().length : -1;
  });
}

// select 현재 값 조회 (label + selected)
async function discoverWithValue(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[id^="react-select-"]').forEach(el => {
      if (!el.id.endsWith('-input')) return;
      let label = '';
      let cur = el;
      for (let i = 0; i < 12 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const ps = [...cur.querySelectorAll(':scope > p, :scope > div > p, :scope > label')];
        for (const p of ps) {
          const t = (p.innerText || '').trim().replace(/\*\s*$/, '').trim();
          if (t && t.length < 40 && t !== '편집' && t !== '변경하기') { label = t; break; }
        }
        if (label) break;
      }
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      let selected = '';
      if (ctrl) {
        const sv = ctrl.querySelector('[class*="singleValue"]');
        if (sv) selected = (sv.innerText || '').trim();
      }
      out.push({ inputId: el.id, label, selected, empty: !selected });
    });
    return out;
  });
}

(async () => {
  const url = `https://kmong.com/my-gigs/edit/${extra.draftId}?rootCategoryId=6&subCategoryId=${extra.subCategoryId}${extra.thirdCategoryId ? `&thirdCategoryId=${extra.thirdCategoryId}` : ''}`;
  console.log(`\n[fix] ${productId} draft=${extra.draftId} force=${forceAll}`);
  const { browser, page } = await login({ slowMo: 80 });
  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    // 1) PREP fill
    const prepLen = await checkPrep(page);
    console.log(`[1] PREP 현재=${prepLen}자 target=${product.preparation.length}자`);
    if (prepLen < product.preparation.length - 50) {
      console.log(`   → fillTipTap 호출`);
      const r = await fillTipTap(page, 'DESCRIPTION_PREPARATION', product.preparation, '준비사항');
      console.log(`   → ${JSON.stringify(r)}`);
      await sleep(1500);
    } else {
      console.log(`   → 이미 채워짐, skip`);
    }

    // 2) 현재 select 상태
    await sleep(1000);
    const sMap = await discoverWithValue(page);
    console.log(`\n[2] select 상태: 전체 ${sMap.length}개, 빈 ${sMap.filter(s=>s.empty).length}개`);

    // 3) 목표 매핑 정의
    const targets = [
      { label: '기술 수준', nth: 0, value: product.features.tech || '중급' },
      { label: '팀 규모', nth: 0, value: product.features.team || '1인' },
      { label: '상주 여부', nth: 0, value: product.features.onsite || '상주 불가능' },
    ];
    // 작업 기간 / 수정 횟수 × 3
    for (let i = 0; i < 3; i++) {
      const pkg = product.packages[i];
      targets.push({ label: '작업 기간', nth: i, value: `${pkg.days}일` });
      targets.push({ label: '수정 횟수', nth: i, value: pkg.revisions === '제한없음' ? '제한없음' : `${pkg.revisions}회` });
    }
    // extraSelects (업종·카테고리·플러그인 설치 등 카테고리별)
    (extra.extraSelects || []).forEach(it => {
      targets.push({ label: it.label, nth: it.nth !== undefined ? it.nth : 0, value: it.value });
    });

    console.log(`\n[3] fill 대상 ${targets.length}개`);
    const results = [];
    for (const t of targets) {
      // 현재 상태 재조회 (select 값 변경 후 refresh)
      const current = await discoverWithValue(page);
      const matching = current.filter(s => s.label === t.label);
      if (matching.length <= t.nth) {
        console.log(`   [-] ${t.label}#${t.nth} — slot 없음`);
        continue;
      }
      const slot = matching[t.nth];
      const currentVal = slot.selected;
      if (!forceAll && !slot.empty && currentVal !== t.value) {
        // 값이 이미 있는데 의도한 값과 다름 — force 없이는 skip
        console.log(`   [skip] ${t.label}#${t.nth} current="${currentVal}" want="${t.value}" (force-all 필요)`);
        results.push({ ...t, skipped: true, current: currentVal });
        continue;
      }
      if (!slot.empty && currentVal === t.value) {
        console.log(`   [ok ] ${t.label}#${t.nth} 이미 "${t.value}"`);
        results.push({ ...t, alreadyOk: true });
        continue;
      }
      // 빈 상태 또는 force 모드 → fill
      const r = await fillSelectByLabel(page, current, t.label, t.value, t.nth);
      console.log(`   [fill] ${t.label}#${t.nth} ← "${t.value}" → ${r.picked || r.reason || '?'} ${r.fallback ? '(fallback)' : ''}`);
      results.push({ ...t, ok: r.ok, picked: r.picked, fallback: r.fallback });
      await sleep(900);
      // 드롭다운 안정화
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(300);
    }

    // 4) 저장 + verify
    console.log(`\n[4] blur + 저장`);
    await page.evaluate(() => {
      document.querySelectorAll('input, textarea').forEach(el => {
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await sleep(2500);
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) { console.log('   ✗ 저장 버튼'); process.exit(1); }
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    await btn.click({ force: true });
    await sleep(8000);

    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const v = await page.evaluate(() => {
      const pm = [...document.querySelectorAll('.ProseMirror')].map(el => (el.innerText || '').trim().length);
      const emptySelects = [...document.querySelectorAll('input[id^="react-select-"][id$="-input"]')]
        .filter(el => {
          let c = el;
          for (let i = 0; i < 10 && c; i++) {
            c = c.parentElement;
            if (c && typeof c.className === 'string' && c.className.includes('control')) break;
          }
          if (!c) return false;
          const sv = c.querySelector('[class*="singleValue"]');
          return !sv || !(sv.innerText || '').trim();
        }).length;
      return { descLens: pm, emptySelects };
    });
    console.log(`   persist: desc=${v.descLens.join(',')} emptySelects=${v.emptySelects}`);
  } finally {
    await browser.close().catch(() => {});
  }
})();
