/**
 * cascade select 완전 채움 + 다중 방법 루프
 *
 * 대상: 업종 → 카테고리 → 개발 언어 → 프런트엔드 → 백엔드 → DB → 클라우드 → 기타·소프트웨어
 *   (상위 선택해야 하위 활성화 가능성 — cascade)
 *
 * 각 필드에 대해 방법 A~E 순차 시도, persist 검증 후 다음
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// discoverSelects (create-gig.js) 동등 — inline
async function discoverSelects(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[id^="react-select-"]').forEach(el => {
      if (!el.id.endsWith('-input')) return;
      let label = '';
      let cur = el;
      for (let i = 0; i < 12 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const lbls = [...cur.querySelectorAll(':scope > label, :scope > div > label')];
        for (const l of lbls) {
          const t = (l.innerText || '').trim().replace(/\*\s*$/, '').trim();
          if (t && t.length < 40) { label = t; break; }
        }
        if (label) break;
      }
      if (!label) {
        cur = el;
        for (let i = 0; i < 12 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const ps = [...cur.querySelectorAll(':scope > p, :scope > div > p')];
          for (const p of ps) {
            const t = (p.innerText || '').trim().replace(/\*\s*$/, '').trim();
            if (t && t.length < 40 && t !== '편집' && t !== '변경하기') { label = t; break; }
          }
          if (label) break;
        }
      }
      // selected
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      const sv = ctrl ? ctrl.querySelector('[class*="singleValue"]') : null;
      const selected = sv ? (sv.innerText || '').trim() : '';
      out.push({ inputId: el.id, label, selected, empty: !selected });
    });
    return out;
  });
}

async function openControl(page, inputId) {
  const control = page.locator(`#${inputId}`).locator('xpath=ancestor::div[contains(@class, "-control")][1]');
  await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(400);
  await control.click({ force: true });
  await sleep(1000);
}

async function closeDropdown(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => document.body.click());
  await sleep(400);
}

// Method A: fiber.selectOption(data)
async function methodA(page, targetText) {
  return await page.evaluate(t => {
    const opts = [...document.querySelectorAll('[role="option"]')];
    if (!opts.length) return { ok: false, error: 'no options' };
    const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    const tn = norm(t);
    let target = opts.find(el => (el.innerText || '').trim() === t)
      || opts.find(el => norm(el.innerText) === tn)
      || opts.find(el => norm(el.innerText).includes(tn) || tn.includes(norm(el.innerText)))
      || opts[0];
    const picked = (target.innerText || '').trim();
    const fk = Object.keys(target).find(k => k.startsWith('__reactFiber'));
    if (!fk) return { ok: false, error: 'no fiber' };
    let f = target[fk];
    for (let i = 0; i < 30 && f; i++) {
      const mp = f.memoizedProps;
      if (mp?.selectOption && mp.data) {
        try { mp.selectOption(mp.data); return { ok: true, picked, method: 'A-selectOption' }; }
        catch (e) { return { ok: false, error: 'A-throw: ' + e.message }; }
      }
      f = f.return;
    }
    return { ok: false, error: 'selectOption not in fiber' };
  }, targetText);
}

// Method B: setValue(data, 'select-option')
async function methodB(page, targetText) {
  return await page.evaluate(t => {
    const opts = [...document.querySelectorAll('[role="option"]')];
    if (!opts.length) return { ok: false, error: 'no options' };
    const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    let target = opts.find(el => (el.innerText || '').trim() === t)
      || opts.find(el => norm(el.innerText) === norm(t))
      || opts[0];
    const picked = (target.innerText || '').trim();
    const fk = Object.keys(target).find(k => k.startsWith('__reactFiber'));
    let f = target[fk];
    for (let i = 0; i < 30 && f; i++) {
      const mp = f.memoizedProps;
      if (mp?.setValue && mp.data) {
        try { mp.setValue(mp.data, 'select-option'); return { ok: true, picked, method: 'B-setValue' }; }
        catch (e) { return { ok: false, error: 'B-throw: ' + e.message }; }
      }
      f = f.return;
    }
    return { ok: false, error: 'setValue not in fiber' };
  }, targetText);
}

// Method C: SelectContainer의 onChange 호출 (가장 상위 react-select 컨테이너)
async function methodC(page, targetText) {
  return await page.evaluate(t => {
    const opts = [...document.querySelectorAll('[role="option"]')];
    if (!opts.length) return { ok: false, error: 'no options' };
    const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    let target = opts.find(el => (el.innerText || '').trim() === t)
      || opts.find(el => norm(el.innerText) === norm(t))
      || opts[0];
    const picked = (target.innerText || '').trim();
    const fk = Object.keys(target).find(k => k.startsWith('__reactFiber'));
    let f = target[fk];
    // optionData 따로 확보
    let optionData = null;
    let scan = f;
    for (let i = 0; i < 15 && scan; i++) {
      if (scan.memoizedProps?.data) { optionData = scan.memoizedProps.data; break; }
      scan = scan.return;
    }
    if (!optionData) return { ok: false, error: 'no optionData' };

    // 최상위 SelectContainer 찾고 onChange 호출
    let f2 = f;
    let selectContainer = null;
    for (let i = 0; i < 30 && f2; i++) {
      const et = f2.elementType?.displayName || f2.elementType?.name;
      if (et === 'SelectContainer' || et === 'Select') {
        selectContainer = f2;
        break;
      }
      f2 = f2.return;
    }
    if (selectContainer?.memoizedProps?.onChange) {
      try {
        selectContainer.memoizedProps.onChange(optionData, { action: 'select-option', option: optionData });
        return { ok: true, picked, method: 'C-onChange' };
      } catch (e) { return { ok: false, error: 'C-throw: ' + e.message }; }
    }
    return { ok: false, error: 'Select onChange not found' };
  }, targetText);
}

async function tryFillField(page, inputId, targetValue, label = '') {
  const methods = [
    { name: 'A', fn: methodA },
    { name: 'B', fn: methodB },
    { name: 'C', fn: methodC },
  ];
  for (const m of methods) {
    await openControl(page, inputId);
    const r = await m.fn(page, targetValue);
    await sleep(1200);
    if (!r.ok) {
      console.log(`     method ${m.name}: fail - ${r.error}`);
      await closeDropdown(page);
      continue;
    }
    // UI 확인
    const verify = await page.evaluate(id => {
      const el = document.getElementById(id);
      let ctrl = el;
      for (let i = 0; i < 10 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
      }
      const sv = ctrl?.querySelector('[class*="singleValue"]');
      return sv ? (sv.innerText || '').trim() : '';
    }, inputId);
    if (verify) {
      console.log(`     method ${m.name}: ✓ UI 반영 — selected="${verify}"`);
      await closeDropdown(page);
      return { ok: true, method: m.name, selected: verify, picked: r.picked };
    } else {
      console.log(`     method ${m.name}: selectOption 성공했지만 UI 반영 안됨`);
      await closeDropdown(page);
    }
  }
  return { ok: false, error: 'all methods failed' };
}

(async () => {
  const draftId = process.argv[2] || '764211';
  const sub = process.argv[3] || '601';
  const third = process.argv[4] || '60113';
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}${third ? `&thirdCategoryId=${third}` : ''}`;

  // cascade 순서로 채울 필드
  const cascadeTargets = [
    { label: '업종', value: '자영업' },  // 한번 '가구·인테리어' fallback 있었으니 다른 값 테스트
    { label: '카테고리', value: '기업 홈페이지' },
    { label: '개발 언어', value: 'JavaScript' },
    { label: '프런트엔드', value: 'React' },
    { label: '백엔드', value: 'Node.js' },
    { label: '데이터베이스', value: 'MySQL' },
    { label: '클라우드', value: 'AWS' },
    { label: '기타·소프트웨어', value: 'Git' },
  ];

  const { browser, page } = await login({ slowMo: 80 });
  try {
    console.log(`[fill-cascade] draft=${draftId}`);
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    // 현재 상태
    console.log('\n[상태] 현재 select:');
    const sBefore = await discoverSelects(page);
    sBefore.forEach(s => console.log(`   ${s.inputId} "${s.label}" selected="${s.selected}" empty=${s.empty}`));

    // cascade 순차 fill
    const results = [];
    for (const t of cascadeTargets) {
      // 최신 select map 재조회
      const cur = await discoverSelects(page);
      const slot = cur.find(s => s.label === t.label);
      if (!slot) { console.log(`\n[${t.label}] slot 없음, skip`); continue; }
      if (!slot.empty) { console.log(`\n[${t.label}] 이미 "${slot.selected}", skip`); continue; }

      console.log(`\n[${t.label}] → "${t.value}" 시도 (inputId=${slot.inputId})`);
      const r = await tryFillField(page, slot.inputId, t.value, t.label);
      results.push({ ...t, ...r });
      if (!r.ok) {
        console.log(`   ❌ 모든 방법 실패`);
      }
      // cascade 안정화 sleep
      await sleep(1500);
    }

    // 저장
    console.log('\n[저장]');
    await page.evaluate(() => {
      document.querySelectorAll('input,textarea').forEach(el => {
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await sleep(2500);
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    await btn.click({ force: true });
    await sleep(8000);

    // reload + verify
    console.log('\n[verify] reload');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const sAfter = await discoverSelects(page);
    const empties = sAfter.filter(s => s.empty);
    console.log(`   최종 빈 select ${empties.length}개:`);
    empties.forEach(s => console.log(`     ${s.label.split('\n')[0]}`));
    const allSelected = sAfter.filter(s => !s.empty);
    console.log(`   채워진 select ${allSelected.length}개:`);
    allSelected.forEach(s => console.log(`     ${s.label.split('\n')[0]} = "${s.selected}"`));

    const draftSuffix = draftId;
    fs.writeFileSync(path.join(__dirname, `fill-cascade-${draftSuffix}-result.json`), JSON.stringify({ results, empties, allSelected }, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
})();
