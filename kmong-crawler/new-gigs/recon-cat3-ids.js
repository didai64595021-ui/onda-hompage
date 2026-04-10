#!/usr/bin/env node
/**
 * 크몽 3차 카테고리 ID 추출
 * - 바이럴·포스팅 > 블로그 포스팅
 * - 체험단 모집 > 블로그 체험단
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getCategoryId(page, cat2Text, cat3Text) {
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);
  await closeModals(page).catch(() => {});

  // 제목
  await page.locator('input[type="text"]').first().fill('카테고리 ID 추출 테스트입니다');
  await sleep(500);

  // 1차: 마케팅
  await page.locator('button').filter({ hasText: '1차 카테고리' }).first().click();
  await sleep(1500);
  await page.getByText('마케팅', { exact: true }).first().click();
  await sleep(1500);

  // 2차
  await page.locator('button').filter({ hasText: '2차 카테고리' }).first().click();
  await sleep(1500);
  await page.getByText(cat2Text, { exact: true }).first().click();
  await sleep(1500);

  // 3차 — 드롭다운 클릭 후 옵션 선택
  await page.locator('button').filter({ hasText: '3차 카테고리' }).first().click();
  await sleep(1500);

  // 3차 옵션 텍스트로 클릭
  await page.getByText(cat3Text, { exact: true }).first().click();
  await sleep(1500);

  // 다음 버튼 클릭
  await page.locator('button').filter({ hasText: '다음' }).first().click();
  await page.waitForURL(/\/my-gigs\/edit\//, { timeout: 15000 });
  await sleep(1500);

  const url = page.url();
  const rootMatch = url.match(/rootCategoryId=(\d+)/);
  const subMatch = url.match(/subCategoryId=(\d+)/);
  const gigMatch = url.match(/\/edit\/(\d+)/);

  return {
    rootCategoryId: rootMatch?.[1],
    subCategoryId: subMatch?.[1],
    gigId: gigMatch?.[1],
    url
  };
}

async function getSelectStructure(page) {
  await sleep(2000);
  return await page.evaluate(() => {
    const selects = [];
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
      selects.push({ id: el.id, label });
    });
    return selects;
  });
}

async function run() {
  console.log('[RECON] 3차 카테고리 ID 추출...');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const results = {};

  // 1. 바이럴·포스팅 > 블로그 포스팅
  console.log('\n[1] 마케팅 > 바이럴·포스팅 > 블로그 포스팅');
  try {
    const cat1 = await getCategoryId(page, '바이럴·포스팅', '블로그 포스팅');
    const selects = await getSelectStructure(page);
    results['블로그 포스팅'] = { ...cat1, selects };
    console.log(`  ✓ root=${cat1.rootCategoryId}, sub=${cat1.subCategoryId}, gig=${cat1.gigId}`);
    selects.forEach(s => console.log(`    ${s.id} → "${s.label}"`));
  } catch (e) {
    console.log(`  ✗ ${e.message.slice(0, 150)}`);
    results['블로그 포스팅'] = { error: e.message.slice(0, 200) };
  }

  // 2. 체험단 모집 > 블로그 체험단
  console.log('\n[2] 마케팅 > 체험단 모집 > 블로그 체험단');
  try {
    const cat2 = await getCategoryId(page, '체험단 모집', '블로그 체험단');
    const selects = await getSelectStructure(page);
    results['블로그 체험단'] = { ...cat2, selects };
    console.log(`  ✓ root=${cat2.rootCategoryId}, sub=${cat2.subCategoryId}, gig=${cat2.gigId}`);
    selects.forEach(s => console.log(`    ${s.id} → "${s.label}"`));
  } catch (e) {
    console.log(`  ✗ ${e.message.slice(0, 150)}`);
    results['블로그 체험단'] = { error: e.message.slice(0, 200) };
  }

  const outPath = path.join(__dirname, 'recon-cat3-ids.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[DONE] 저장: ${outPath}`);

  const draftIds = Object.values(results).filter(r => r.gigId).map(r => r.gigId);
  if (draftIds.length) console.log(`\n⚠ drafts: ${draftIds.join(', ')}`);

  await browser.close();
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
