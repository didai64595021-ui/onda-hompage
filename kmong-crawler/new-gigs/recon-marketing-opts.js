#!/usr/bin/env node
/**
 * 마케팅 카테고리 select 옵션 프로브
 * - recon-select-options.js의 검증된 로직 사용, rootCategoryId=2
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  { name: '지도활성화', gigId: '761721', sub: '230' },
  { name: '블로그포스팅', gigId: '761730', sub: '243' },
  { name: '블로그체험단', gigId: '761731', sub: '235' },
];

async function dumpOptionsFor(page, inputId) {
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(150);
    await page.evaluate(() => document.body.click()).catch(() => {});
    await sleep(200);

    const input = page.locator(`#${inputId}`);
    if ((await input.count()) === 0) return { options: [], error: 'not found' };
    const control = input.locator('xpath=ancestor::div[contains(@class, "-control")][1]');
    if ((await control.count()) === 0) return { options: [], error: 'no control' };
    await control.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await sleep(150);
    await control.click({ force: true });
    await sleep(600);

    const options = await page.evaluate(() => {
      const all = [...document.querySelectorAll('div')]
        .filter((el) => {
          const cls = String(el.className || '');
          return cls.includes('!flex') && cls.includes('items-center') &&
            cls.includes('justify-between') && cls.includes('text-gray-900') && cls.includes('px-3');
        })
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      return [...new Set(all.map((el) => (el.innerText || '').trim()).filter((t) => t && t.length < 80))];
    });

    await page.keyboard.press('Escape').catch(() => {});
    await sleep(100);
    return { options };
  } catch (e) {
    return { options: [], error: e.message };
  }
}

async function main() {
  console.log('[recon-marketing-opts] Start');
  const { browser, page } = await login({ slowMo: 60 });
  const allResults = {};

  try {
    for (const t of TARGETS) {
      console.log(`\n═══ ${t.name} (gig=${t.gigId}, sub=${t.sub}) ═══`);
      const url = `https://kmong.com/my-gigs/edit/${t.gigId}?rootCategoryId=2&subCategoryId=${t.sub}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(6000);

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
              if (t && t.length < 40 && t !== '편집' && t !== '변경하기') { label = t; break; }
            }
            if (label) break;
          }
          const r = el.getBoundingClientRect();
          out.push({ inputId: el.id, label, visible: r.width > 0 && r.height > 0 });
        });
        return out;
      });

      console.log(`  selects: ${selects.length}개`);

      const catResults = [];
      for (const s of selects) {
        if (!s.visible) continue;
        const r = await dumpOptionsFor(page, s.inputId);
        catResults.push({ inputId: s.inputId, label: s.label, options: r.options, error: r.error });
        console.log(`  ${s.inputId} "${s.label}" → ${r.options.length}개${r.error ? ' [ERR: ' + r.error + ']' : ''}`);
        if (r.options.length > 0) {
          console.log(`    ${r.options.slice(0, 10).join(' / ')}${r.options.length > 10 ? ' ...' : ''}`);
        }
      }

      allResults[t.name] = catResults;
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(__dirname, 'recon-marketing-opts.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\n[DONE] ${outPath}`);
}

main().catch((e) => { console.error('[FATAL]', e.message); process.exit(1); });
