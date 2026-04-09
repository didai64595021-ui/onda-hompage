#!/usr/bin/env node
/**
 * 크몽 신규 등록 페이지 정밀 정찰 v2
 *
 * 목적:
 *   1) 1차 카테고리 옵션 전체 + IT·프로그래밍 하위 2차 카테고리 옵션 전체 덤프
 *   2) Step 2 (편집 페이지) 모든 입력 필드를 라벨/섹션 컨텍스트와 함께 매핑
 *      - 각 input/textarea/contenteditable 의 가장 가까운 label/h2/h3 + 부모 region
 *      - DOM path (조상 데이터-속성 / 클래스) 일부 캡처
 *
 * 안전:
 *   - "다음" 1회 클릭 후 Step 2 진입 (드래프트 1개 생성됨, 후처리 필요)
 *   - 임시저장/제출 절대 클릭 안 함
 *   - 정찰 후 browser 닫기 전에 page.evaluate 로 DOM 덤프 → recon-v2.json
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const SS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });

const TEMP_TITLE = '정찰임시 삭제예정 파이썬 자동화 봇 제작';

// page.evaluate 안에서 실행 — 모든 입력 필드를 컨텍스트와 함께 수집
function collectFields() {
  function nearestLabel(el) {
    // 1) 가장 가까운 label
    let cur = el;
    for (let i = 0; i < 8; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const lbl = cur.querySelector('label');
      if (lbl && lbl.innerText && lbl.innerText.trim()) return lbl.innerText.trim().slice(0, 60);
    }
    // 2) 가장 가까운 heading
    cur = el;
    for (let i = 0; i < 8; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const h = cur.querySelector('h1, h2, h3, h4');
      if (h && h.innerText && h.innerText.trim()) return h.innerText.trim().slice(0, 60);
    }
    return '';
  }

  function nearestSection(el) {
    let cur = el;
    for (let i = 0; i < 12; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      // section heading 또는 큰 div
      const heading = cur.querySelector(':scope > h2, :scope > h3, :scope > div > h2, :scope > div > h3');
      if (heading && heading.innerText) return heading.innerText.trim().slice(0, 60);
    }
    return '';
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getPathHints(el) {
    const hints = [];
    let cur = el;
    for (let i = 0; i < 6; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const cls = (cur.className || '').toString().slice(0, 60);
      const id = cur.id || '';
      const data = Array.from(cur.attributes || []).filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${(a.value || '').slice(0, 30)}`).join(',');
      hints.push(`${cur.tagName.toLowerCase()}${id ? '#' + id : ''}${cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : ''}${data ? '[' + data + ']' : ''}`);
    }
    return hints;
  }

  const out = { url: location.href, inputs: [], textareas: [], editors: [], buttons: [], fileInputs: [], regions: [] };

  // inputs
  document.querySelectorAll('input').forEach((el, idx) => {
    if (!isVisible(el) && el.type !== 'file') return;
    const o = {
      idx,
      type: el.type || 'text',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      label: nearestLabel(el),
      section: nearestSection(el),
      value: (el.value || '').slice(0, 60),
      hints: getPathHints(el),
    };
    if (el.type === 'file') out.fileInputs.push(o);
    else out.inputs.push(o);
  });

  // textareas
  document.querySelectorAll('textarea').forEach((el, idx) => {
    if (!isVisible(el)) return;
    out.textareas.push({
      idx,
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      label: nearestLabel(el),
      section: nearestSection(el),
      maxLength: el.maxLength || 0,
      hints: getPathHints(el),
    });
  });

  // contenteditable
  document.querySelectorAll('[contenteditable="true"]').forEach((el, idx) => {
    if (!isVisible(el)) return;
    out.editors.push({
      idx,
      cls: (el.className || '').toString().slice(0, 80),
      label: nearestLabel(el),
      section: nearestSection(el),
      hints: getPathHints(el),
    });
  });

  // buttons (의미 있는 텍스트만)
  document.querySelectorAll('button').forEach((el, idx) => {
    if (!isVisible(el)) return;
    const txt = (el.innerText || '').trim();
    if (!txt || txt.length > 60) return;
    out.buttons.push({
      idx,
      text: txt.slice(0, 60),
      type: el.type || '',
      label: nearestLabel(el),
      section: nearestSection(el),
    });
  });

  // section headings
  document.querySelectorAll('h1, h2, h3').forEach(el => {
    if (!isVisible(el)) return;
    const t = (el.innerText || '').trim();
    if (t) out.regions.push({ tag: el.tagName, text: t.slice(0, 80) });
  });

  return out;
}

(async () => {
  let browser;
  const result = { at: new Date().toISOString(), steps: [] };
  try {
    console.log('[recon-v2] 로그인...');
    const r = await login({ slowMo: 200 });
    browser = r.browser;
    const page = r.page;

    // ─── Step 1 진입 ───
    console.log('[recon-v2] /my-gigs/new');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await closeModals(page).catch(() => {});
    await page.screenshot({ path: path.join(SS, 'recon-v2-step1.png'), fullPage: true });

    // ─── 1차 카테고리 옵션 전체 덤프 ───
    // 드롭다운은 role="dialog"가 아닌 popover/portal — 클릭 후 페이지 전체에서 새로 등장한 텍스트를 수집
    console.log('[recon-v2] 1차 카테고리 클릭');
    const beforeCat1 = await page.evaluate(() =>
      [...document.querySelectorAll('button, li, [role="option"], div')].map(el => el.innerText || '').join('\n')
    );
    await page.locator('button:has-text("1차 카테고리")').first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SS, 'recon-v2-cat1-open.png'), fullPage: true });
    const cat1Dump = await page.evaluate(() => {
      // 카테고리 옵션은 일반 button 또는 li 안에 있음. 짧은 텍스트(2-15자) + 가시 + 아이콘 옆 텍스트
      const items = new Set();
      document.querySelectorAll('button, li, [role="option"], [role="menuitem"]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 30 || t.length < 2) return;
        if (/^(닫기|취소|확인|다음|이전|로그인|회원가입|검색|메뉴|1차 카테고리|2차 카테고리|어디에 보이나요\?|편집|변경하기|TIP)$/.test(t)) return;
        items.add(t);
      });
      return [...items];
    });
    console.log(`[recon-v2] 1차 옵션 후보 ${cat1Dump.length}개`);
    cat1Dump.slice(0, 40).forEach(t => console.log(`   - ${t}`));
    result.cat1Options = cat1Dump;

    // IT·프로그래밍 선택 (여러 셀렉터 시도)
    let cat1Picked = false;
    const cat1Selectors = [
      () => page.getByText(/^IT.*프로그래밍$/).first(),
      () => page.getByText('IT·프로그래밍', { exact: true }).first(),
      () => page.getByRole('button', { name: /IT.*프로그래밍/ }).first(),
      () => page.locator('button, li').filter({ hasText: /^IT.{0,3}프로그래밍$/ }).first(),
    ];
    for (const sel of cat1Selectors) {
      try {
        const loc = sel();
        if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
          await loc.click({ force: true });
          console.log('[recon-v2] IT·프로그래밍 선택 성공');
          cat1Picked = true;
          break;
        }
      } catch {}
    }
    if (!cat1Picked) {
      console.error('[recon-v2] IT·프로그래밍 미발견 — 정찰 실패');
      throw new Error('cat1 IT·프로그래밍 미발견');
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SS, 'recon-v2-cat1-picked.png'), fullPage: true });

    // ─── 2차 카테고리 옵션 전체 덤프 ───
    console.log('[recon-v2] 2차 카테고리 클릭');
    await page.locator('button:has-text("2차 카테고리")').first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SS, 'recon-v2-cat2-open.png'), fullPage: true });
    const cat2Dump = await page.evaluate(() => {
      const items = new Set();
      document.querySelectorAll('button, li, [role="option"], [role="menuitem"], div[class*="grid"] > div, div[class*="tile"]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 30 || t.length < 2) return;
        if (/^(닫기|취소|확인|다음|이전|편집|변경하기|TIP|어디에 보이나요\?|1차 카테고리|2차 카테고리|IT.프로그래밍)$/.test(t)) return;
        items.add(t);
      });
      return [...items];
    });
    console.log(`[recon-v2] 2차 옵션 후보 ${cat2Dump.length}개`);
    cat2Dump.slice(0, 60).forEach(t => console.log(`   - ${t}`));
    result.cat2Options_IT = cat2Dump;

    // 업무 자동화 선택해서 Step 2 진입
    const cat2Pick = page.getByText('업무 자동화', { exact: true }).first();
    if (await cat2Pick.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cat2Pick.click({ force: true });
      console.log('[recon-v2] 업무 자동화 선택');
      await page.waitForTimeout(2000);
    } else {
      // fallback 봇·챗봇
      const fb = page.getByText(/봇.*챗봇/).first();
      if (await fb.isVisible({ timeout: 1500 }).catch(() => false)) {
        await fb.click({ force: true });
        console.log('[recon-v2] cat2 fallback: 봇·챗봇');
        await page.waitForTimeout(2000);
      }
    }

    // 제목 채우고 다음
    await page.locator('input[placeholder*="제목"]').first().fill(TEMP_TITLE);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SS, 'recon-v2-step1-filled.png'), fullPage: true });

    console.log('[recon-v2] "다음" 클릭');
    await page.locator('button:has-text("다음")').first().click();
    await page.waitForTimeout(6000);

    console.log('[recon-v2] Step 2 URL:', page.url());
    await page.screenshot({ path: path.join(SS, 'recon-v2-step2.png'), fullPage: true });

    // ─── Step 2 정밀 덤프 ───
    const step2 = await page.evaluate(collectFields);
    console.log(`[recon-v2] Step 2: inputs=${step2.inputs.length} textareas=${step2.textareas.length} editors=${step2.editors.length} buttons=${step2.buttons.length} fileInputs=${step2.fileInputs.length} regions=${step2.regions.length}`);
    result.step2 = step2;
    result.draftUrl = page.url();

    fs.writeFileSync(path.join(__dirname, 'recon-v2.json'), JSON.stringify(result, null, 2));
    console.log('[recon-v2] 저장 완료: recon-v2.json');

  } catch (e) {
    console.error('[recon-v2 실패]', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
