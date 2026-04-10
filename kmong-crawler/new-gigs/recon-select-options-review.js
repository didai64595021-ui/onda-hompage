#!/usr/bin/env node
/**
 * 크몽 마케팅 카테고리 select 옵션값 정찰
 * - 지도 활성화 (761721, sub=230)
 * - 블로그 포스팅 (761730, sub=243)
 * - 블로그 체험단 (761731, sub=235)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DRAFTS = [
  { name: '지도 활성화', gigId: 761721, root: 2, sub: 230 },
  { name: '블로그 포스팅', gigId: 761730, root: 2, sub: 243 },
  { name: '블로그 체험단', gigId: 761731, root: 2, sub: 235 },
];

async function probeSelectOptions(page, selectId) {
  // control 영역 클릭하여 메뉴 열기
  const input = page.locator(`#${selectId}`);
  const exists = await input.count();
  if (!exists) return null;

  // parent control div 찾기
  const controlClicked = await page.evaluate((id) => {
    const input = document.getElementById(id);
    if (!input) return false;
    let cur = input;
    for (let i = 0; i < 8 && cur; i++) {
      cur = cur.parentElement;
      if (cur && (cur.className || '').includes('-control')) {
        cur.click();
        return true;
      }
    }
    // fallback: input의 조부모 클릭
    const gp = input.parentElement?.parentElement;
    if (gp) { gp.click(); return true; }
    return false;
  }, selectId);

  if (!controlClicked) return null;
  await sleep(800);

  // 열린 메뉴에서 옵션 추출
  const options = await page.evaluate(() => {
    // 메뉴 찾기 (z-20, shadow 등)
    const menus = document.querySelectorAll('div[class*="menu"], div[class*="Menu"], div[class*="z-20"]');
    const items = [];
    menus.forEach(menu => {
      const rect = menu.getBoundingClientRect();
      if (rect.height > 20) {
        menu.querySelectorAll('div[class*="option"], div[class*="Option"]').forEach(opt => {
          const t = (opt.innerText || '').trim();
          if (t && t.length < 40 && !items.includes(t)) items.push(t);
        });
      }
    });

    // fallback: 시그니처 클래스
    if (items.length === 0) {
      document.querySelectorAll('div[class*="items-center"][class*="px-3"][class*="py-2"]').forEach(el => {
        const t = (el.innerText || '').trim();
        if (t && t.length < 40 && !items.includes(t)) items.push(t);
      });
    }

    return items;
  });

  // ESC + body click으로 닫기
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.body.click());
  await sleep(300);

  return options;
}

async function run() {
  console.log('[RECON] select 옵션값 정찰...');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const results = {};

  for (const draft of DRAFTS) {
    console.log(`\n[${draft.name}] gig=${draft.gigId}, sub=${draft.sub}`);
    try {
      const url = `https://kmong.com/my-gigs/edit/${draft.gigId}?rootCategoryId=${draft.root}&subCategoryId=${draft.sub}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(3000);
      await closeModals(page).catch(() => {});

      // select 목록 수집
      const selects = await page.evaluate(() => {
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
              if (t && t.length > 1 && t.length < 30) { label = t; break; }
            }
            if (label) break;
          }
          out.push({ id: el.id, label });
        });
        return out;
      });

      console.log(`  selects: ${selects.length}개`);

      const catResults = {};
      for (const sel of selects) {
        console.log(`  [${sel.id}] "${sel.label}" 옵션 조사...`);
        const options = await probeSelectOptions(page, sel.id);
        catResults[sel.label] = { id: sel.id, options: options || [] };
        console.log(`    → ${(options || []).length}개: ${(options || []).join(', ')}`);
      }

      results[draft.name] = { ...draft, selects: catResults };
    } catch (e) {
      console.log(`  실패: ${e.message.slice(0, 150)}`);
      results[draft.name] = { error: e.message.slice(0, 200) };
    }
  }

  const outPath = path.join(__dirname, 'recon-select-options-review.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[DONE] 저장: ${outPath}`);

  await browser.close();
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
