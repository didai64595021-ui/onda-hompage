/**
 * 정찰 v2: 모든 react-select의 옵션 dump + 추가 가격/판매 핵심 정보 섹션 확장 dump
 *
 * 사용법: node recon-select-options.js <draftId> <subCategoryId>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');

const draftId = process.argv[2] || '761240';
const subCategoryId = process.argv[3] || '605';
const OUT_PATH = path.join(__dirname, `recon-select-options-${draftId}.json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[recon-opts] draftId=${draftId} cat=${subCategoryId}`);
  const { browser, page } = await login({ slowMo: 60 });
  try {
    const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${subCategoryId}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6000);

    // 1) discoverSelects (label 매핑) — create-gig.js 와 동일 로직
    const selects = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[id^="react-select-"]').forEach((el) => {
        if (!el.id.endsWith('-input')) return;
        let label = '';
        let cur = el;
        for (let i = 0; i < 12 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const ps = [...cur.querySelectorAll(':scope > p, :scope > div > p, :scope > label')];
          for (const p of ps) {
            const t = (p.innerText || '').trim().replace(/\*\s*$/, '').trim();
            if (t && t.length < 40 && t !== '편집' && t !== '변경하기') {
              label = t;
              break;
            }
          }
          if (label) break;
        }
        // 현재 선택값
        let container = null;
        cur = el;
        for (let i = 0; i < 10 && cur && !container; i++) {
          cur = cur.parentElement;
          if (cur && typeof cur.className === 'string' && cur.className.includes('control')) container = cur;
        }
        let selected = '';
        if (container) {
          const sv = container.querySelector('[class*="singleValue"]');
          if (sv) selected = (sv.innerText || '').trim();
        }
        const r = el.getBoundingClientRect();
        out.push({
          inputId: el.id,
          label,
          selected,
          empty: !selected,
          visible: r.width > 0 && r.height > 0,
        });
      });
      return out;
    });
    console.log(`[recon-opts] selects total=${selects.length}, visible=${selects.filter((s) => s.visible).length}, empty=${selects.filter((s) => s.empty).length}`);

    // 2) 각 select 옵션 dump — empty 인 것만
    const results = [];
    for (const s of selects) {
      if (!s.visible) continue;
      // 모두 dump 하지 말고 empty 또는 라벨이 모호한 것만 (시간 절약)
      const r = await dumpOptionsFor(page, s.inputId);
      results.push({ inputId: s.inputId, label: s.label, selected: s.selected, empty: s.empty, options: r.options, error: r.error });
      console.log(`  ${s.empty ? '✗' : '✓'} ${s.inputId} "${s.label}" (sel=${s.selected || '-'}) → ${r.options.length} options${r.error ? ' [' + r.error + ']' : ''}`);
    }

    // 3) "추가 가격" / "판매 핵심 정보" 섹션 확장 시도 (클릭 후 dump)
    const expandedSections = await tryExpandSections(page);

    fs.writeFileSync(
      OUT_PATH,
      JSON.stringify({ draftId, subCategoryId, at: new Date().toISOString(), selects: results, expandedSections }, null, 2)
    );
    console.log(`[recon-opts] saved: ${OUT_PATH}`);
  } finally {
    await browser.close();
  }
}

async function dumpOptionsFor(page, inputId) {
  try {
    // ESC + body click — 이전 메뉴 닫기
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(150);
    await page.evaluate(() => document.body.click()).catch(() => {});
    await sleep(200);

    const input = page.locator(`#${inputId}`);
    if ((await input.count()) === 0) return { options: [], error: 'inputId 미발견' };
    const control = input.locator('xpath=ancestor::div[contains(@class, "-control")][1]');
    if ((await control.count()) === 0) return { options: [], error: 'control 미발견' };
    await control.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await sleep(150);
    await control.click({ force: true });
    await sleep(500);

    const options = await page.evaluate(() => {
      const all = [...document.querySelectorAll('div')]
        .filter((el) => {
          const cls = String(el.className || '');
          return (
            cls.includes('!flex') &&
            cls.includes('items-center') &&
            cls.includes('justify-between') &&
            cls.includes('text-gray-900') &&
            cls.includes('px-3')
          );
        })
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      return [...new Set(all.map((el) => (el.innerText || '').trim()).filter((t) => t && t.length < 80))];
    });

    // 닫기
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(100);
    return { options };
  } catch (e) {
    return { options: [], error: e.message };
  }
}

async function tryExpandSections(page) {
  // "판매 핵심 정보" / "추가 가격" 등 collapsed 섹션을 클릭해서 expand 시도
  const targets = ['판매 핵심 정보', '추가 가격', '서비스 이용 정책', '연락 가능 시간', '검색 태그', '태그'];
  const results = [];
  for (const t of targets) {
    try {
      const found = await page.evaluate((title) => {
        const els = [...document.querySelectorAll('h1, h2, h3, h4, p, div, button, span')]
          .filter((el) => {
            const txt = (el.innerText || '').trim();
            return txt === title || txt.startsWith(title + '\n') || txt.startsWith(title + ' ');
          })
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
        if (els.length === 0) return null;
        // 가장 작은 element (헤더 자체) 선택
        els.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return ra.width * ra.height - rb.width * rb.height;
        });
        const target = els[0];
        // scroll into view
        target.scrollIntoView({ block: 'center' });
        // click
        target.click();
        // 부모 5단계까지 button 찾아 클릭 시도
        let cur = target;
        for (let i = 0; i < 5 && cur; i++) {
          if (cur.tagName === 'BUTTON') {
            cur.click();
            break;
          }
          cur = cur.parentElement;
        }
        return { rect: target.getBoundingClientRect(), tag: target.tagName };
      }, t);
      if (found) {
        await sleep(800);
        // 확장 후 페이지의 inputs/textareas 다시 dump
        const after = await page.evaluate(() => {
          const inputs = [];
          document.querySelectorAll('input').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || el.type === 'hidden' || el.type === 'file') return;
            inputs.push({ type: el.type, id: el.id, name: el.name, value: (el.value || '').slice(0, 60), placeholder: el.placeholder });
          });
          const textareas = [];
          document.querySelectorAll('textarea').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0) return;
            textareas.push({ id: el.id, name: el.name, value: (el.value || '').slice(0, 60), placeholder: el.placeholder });
          });
          return { inputCount: inputs.length, textareaCount: textareas.length };
        });
        results.push({ section: t, expanded: true, ...after });
      } else {
        results.push({ section: t, expanded: false });
      }
    } catch (e) {
      results.push({ section: t, error: e.message });
    }
  }
  return results;
}

main().catch((e) => {
  console.error('[recon-opts] FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
