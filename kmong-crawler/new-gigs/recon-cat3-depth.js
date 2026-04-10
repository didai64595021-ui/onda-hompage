#!/usr/bin/env node
/**
 * 크몽 마케팅 3차 카테고리 탐색
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('[RECON] 3차 카테고리 탐색...');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const targets = [
    { cat2: '바이럴·포스팅' },
    { cat2: '체험단 모집' },
    { cat2: '블로그 관리' },
  ];

  const results = {};

  for (const target of targets) {
    console.log(`\n[마케팅 > ${target.cat2}] 3차 카테고리 탐색...`);
    try {
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(2000);
      await closeModals(page).catch(() => {});

      // 제목 입력
      await page.locator('input[type="text"]').first().fill('3차 카테고리 정찰용 제목입니다');
      await sleep(500);

      // 1차 마케팅
      await page.locator('button').filter({ hasText: '1차 카테고리' }).first().click();
      await sleep(1500);
      await page.getByText('마케팅', { exact: true }).first().click();
      await sleep(1500);

      // 2차
      await page.locator('button').filter({ hasText: '2차 카테고리' }).first().click();
      await sleep(1500);
      await page.getByText(target.cat2, { exact: true }).first().click();
      await sleep(1500);

      // 3차 카테고리 버튼 클릭
      const cat3Btn = page.locator('button').filter({ hasText: '3차 카테고리' }).first();
      const cat3Exists = await cat3Btn.count();
      console.log(`  3차 카테고리 버튼 존재: ${cat3Exists > 0}`);

      if (cat3Exists > 0) {
        await cat3Btn.click();
        await sleep(1500);

        // 스크린샷
        await page.screenshot({
          path: path.join(__dirname, 'screenshots', `cat3-${target.cat2.replace(/[·\/]/g, '_')}.png`),
          fullPage: true
        });

        // 3차 옵션 수집
        const cat3Options = await page.evaluate(() => {
          const items = [];
          // Radix popover 찾기
          const popovers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
          for (const popover of popovers) {
            const rect = popover.getBoundingClientRect();
            if (rect.height > 0) { // 보이는 popover
              popover.querySelectorAll('*').forEach(el => {
                if (el.children.length === 0) { // 리프 노드
                  const t = (el.textContent || '').trim();
                  if (t && t.length >= 2 && t.length <= 30) {
                    if (!items.includes(t)) items.push(t);
                  }
                }
              });
            }
          }
          return items;
        });

        console.log(`  3차 옵션 (${cat3Options.length}개): ${cat3Options.join(', ')}`);
        results[target.cat2] = { cat3Options };

        // 각 3차 옵션으로 draft 생성해서 ID 추출
        for (const cat3Name of cat3Options.slice(0, 5)) {
          console.log(`\n    [${cat3Name}] 카테고리 ID 추출...`);
          try {
            // ESC로 현재 popover 닫기
            await page.keyboard.press('Escape');
            await sleep(500);

            // 페이지 새로 로드
            await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
            await sleep(2000);
            await closeModals(page).catch(() => {});

            // 제목
            await page.locator('input[type="text"]').first().fill('3차 카테고리 테스트 제목입니다');
            await sleep(500);

            // 1차 마케팅
            await page.locator('button').filter({ hasText: '1차 카테고리' }).first().click();
            await sleep(1500);
            await page.getByText('마케팅', { exact: true }).first().click();
            await sleep(1500);

            // 2차
            await page.locator('button').filter({ hasText: '2차 카테고리' }).first().click();
            await sleep(1500);
            await page.getByText(target.cat2, { exact: true }).first().click();
            await sleep(1500);

            // 3차
            await page.locator('button').filter({ hasText: '3차 카테고리' }).first().click();
            await sleep(1500);
            await page.getByText(cat3Name, { exact: true }).first().click();
            await sleep(1500);

            // 다음
            await page.locator('button').filter({ hasText: '다음' }).first().click();
            await page.waitForURL(/\/my-gigs\/edit\//, { timeout: 10000 });
            await sleep(1000);

            const url = page.url();
            const rootMatch = url.match(/rootCategoryId=(\d+)/);
            const subMatch = url.match(/subCategoryId=(\d+)/);
            const gigMatch = url.match(/\/edit\/(\d+)/);

            results[target.cat2][cat3Name] = {
              rootCategoryId: rootMatch?.[1],
              subCategoryId: subMatch?.[1],
              gigId: gigMatch?.[1],
              url
            };

            console.log(`    ✓ root=${rootMatch?.[1]}, sub=${subMatch?.[1]}, gig=${gigMatch?.[1]}`);

            // select 구조 확인
            await sleep(2000);
            const selectInfo = await page.evaluate(() => {
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

            results[target.cat2][cat3Name].selects = selectInfo;
            console.log(`    selects: ${selectInfo.length}개`);
            selectInfo.forEach(s => console.log(`      ${s.id} → "${s.label}"`));

          } catch (e) {
            console.log(`    실패: ${e.message.slice(0, 100)}`);
            results[target.cat2][cat3Name] = { error: e.message.slice(0, 200) };
          }
        }
      }
    } catch (e) {
      console.log(`  에러: ${e.message.slice(0, 150)}`);
      results[target.cat2] = { error: e.message.slice(0, 200) };
    }
  }

  const outPath = path.join(__dirname, 'recon-cat3-depth.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[DONE] 저장: ${outPath}`);

  const allDrafts = [];
  const extractDrafts = (obj) => {
    for (const v of Object.values(obj)) {
      if (v?.gigId) allDrafts.push(v.gigId);
      if (typeof v === 'object' && !Array.isArray(v)) extractDrafts(v);
    }
  };
  extractDrafts(results);
  if (allDrafts.length) console.log(`\n⚠ drafts: ${allDrafts.join(', ')}`);

  await browser.close();
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
