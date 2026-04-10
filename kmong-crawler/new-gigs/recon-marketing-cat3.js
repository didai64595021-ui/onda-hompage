#!/usr/bin/env node
/**
 * 크몽 마케팅 2차 카테고리 ID 정찰 v3
 * - Playwright 네이티브 locator 사용 (getByText, getByRole)
 * - 카테고리 선택 확인 후 다음 진행
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function selectCategory(page, cat1Text, cat2Text) {
  // 1차 카테고리 선택
  const cat1Btn = page.locator('button').filter({ hasText: '1차 카테고리' }).first();
  const cat1Exists = await cat1Btn.count();

  // 이미 선택된 경우 (버튼 텍스트가 카테고리명으로 변경됨)
  if (cat1Exists === 0) {
    // 이미 선택됨 — 리셋이 필요할 수 있음
    console.log('  1차 카테고리 버튼 없음 (이미 선택됨?)');
  } else {
    await cat1Btn.click();
    await sleep(1500);

    // popover 내에서 마케팅 찾기
    // Playwright getByText 사용
    const marketingOption = page.getByText(cat1Text, { exact: true });
    const count = await marketingOption.count();
    console.log(`  1차 "${cat1Text}" 옵션 ${count}개 발견`);

    if (count > 0) {
      // 가장 작은 요소 클릭 (리프 노드 우선)
      for (let i = 0; i < count; i++) {
        const el = marketingOption.nth(i);
        const box = await el.boundingBox();
        if (box && box.height > 10 && box.height < 80) {
          await el.click();
          console.log(`  1차 "${cat1Text}" 선택 완료 (nth: ${i})`);
          break;
        }
      }
    }
    await sleep(1500);
  }

  // 2차 카테고리 선택
  const cat2Btn = page.locator('button').filter({ hasText: '2차 카테고리' }).first();
  const cat2Exists = await cat2Btn.count();

  if (cat2Exists === 0) {
    console.log('  2차 카테고리 버튼 없음');
    return false;
  }

  await cat2Btn.click();
  await sleep(2000);

  // 디버그: popover 스크린샷
  await page.screenshot({
    path: path.join(__dirname, 'screenshots', `cat2-popover-${cat2Text.replace(/[·\/]/g, '_')}.png`),
    fullPage: true
  });

  // popover 안에서 2차 카테고리 찾기
  // getByText로 시도
  const cat2Option = page.getByText(cat2Text, { exact: true });
  const cat2Count = await cat2Option.count();
  console.log(`  2차 "${cat2Text}" 옵션 ${cat2Count}개 발견`);

  if (cat2Count > 0) {
    for (let i = 0; i < cat2Count; i++) {
      const el = cat2Option.nth(i);
      const box = await el.boundingBox();
      if (box && box.height > 10 && box.height < 80) {
        await el.click();
        console.log(`  2차 "${cat2Text}" 선택 완료 (nth: ${i})`);
        await sleep(1000);
        return true;
      }
    }
  }

  // fallback: contains 매칭
  console.log('  exact 실패, contains 매칭 시도...');
  const keyword = cat2Text.split(/[·\s]/)[0]; // "바이럴" or "체험단"
  const fallback = page.locator(`text=${keyword}`);
  const fbCount = await fallback.count();
  console.log(`  "${keyword}" contains 매칭: ${fbCount}개`);

  if (fbCount > 0) {
    for (let i = 0; i < fbCount; i++) {
      const el = fallback.nth(i);
      const text = await el.textContent();
      const box = await el.boundingBox();
      if (box && box.height > 10 && box.height < 80 && text.length < 30) {
        await el.click();
        console.log(`  2차 fallback 선택: "${text}" (nth: ${i})`);
        await sleep(1000);
        return true;
      }
    }
  }

  return false;
}

async function run() {
  console.log('[RECON v3] 마케팅 2차 카테고리 ID 정찰...');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const targets = [
    { cat2: '바이럴·포스팅' },
    { cat2: '체험단 모집' },
    { cat2: '블로그 관리' },
  ];

  const results = {};

  for (const target of targets) {
    console.log(`\n[${target.cat2}] 정찰...`);
    try {
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(2000);
      await closeModals(page).catch(() => {});

      // 제목 입력 (10자 이상 필수)
      const titleInput = page.locator('input[type="text"]').first();
      await titleInput.fill('카테고리 정찰용 테스트 제목입니다');
      await sleep(500);

      // 카테고리 선택
      const selected = await selectCategory(page, '마케팅', target.cat2);
      if (!selected) {
        console.log(`  카테고리 선택 실패`);
        results[target.cat2] = { error: 'category selection failed' };
        continue;
      }

      // 선택 후 스크린샷
      await page.screenshot({
        path: path.join(__dirname, 'screenshots', `after-select-${target.cat2.replace(/[·\/]/g, '_')}.png`),
        fullPage: true
      });

      // "다음" 버튼 활성화 확인
      const nextBtn = page.locator('button').filter({ hasText: '다음' }).first();
      const isDisabled = await nextBtn.isDisabled().catch(() => null);
      console.log(`  "다음" 버튼 disabled: ${isDisabled}`);

      // 다음 클릭
      await nextBtn.click();
      console.log('  "다음" 클릭 완료, URL 변경 대기...');

      // URL 변경 대기
      try {
        await page.waitForURL(/\/my-gigs\/edit\//, { timeout: 10000 });
      } catch {
        // URL이 변경되지 않은 경우 — 에러 메시지 확인
        const errors = await page.evaluate(() => {
          const errEls = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"], .text-red-500, [class*="warning"]');
          const texts = [];
          errEls.forEach(el => {
            const t = (el.innerText || '').trim();
            if (t) texts.push(t);
          });
          return texts;
        });
        console.log(`  URL 변경 안됨. 에러 메시지: ${errors.join('; ') || 'none'}`);

        // 현재 선택 상태 확인
        const btnTexts = await page.evaluate(() => {
          return [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(t => t.length < 30);
        });
        console.log(`  현재 버튼들: ${btnTexts.slice(0, 10).join(' | ')}`);
      }

      await sleep(1000);
      const url = page.url();
      console.log(`  최종 URL: ${url}`);

      const rootMatch = url.match(/rootCategoryId=(\d+)/);
      const subMatch = url.match(/subCategoryId=(\d+)/);
      const gigMatch = url.match(/\/edit\/(\d+)/);

      results[target.cat2] = {
        rootCategoryId: rootMatch?.[1] || null,
        subCategoryId: subMatch?.[1] || null,
        gigId: gigMatch?.[1] || null,
        url
      };

      if (gigMatch) {
        console.log(`  ✓ rootCategoryId=${rootMatch?.[1]}, subCategoryId=${subMatch?.[1]}, gigId=${gigMatch?.[1]}`);

        // react-select 구조
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

        results[target.cat2].selects = selectInfo;
        selectInfo.forEach(s => console.log(`    ${s.id} → "${s.label}"`));
      }

    } catch (e) {
      console.log(`  에러: ${e.message}`);
      results[target.cat2] = { error: e.message };
    }
  }

  const outPath = path.join(__dirname, 'recon-marketing-cat3.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[DONE] 저장: ${outPath}`);

  const draftIds = Object.values(results).filter(r => r.gigId).map(r => r.gigId);
  if (draftIds.length > 0) console.log(`\n⚠ draft IDs: ${draftIds.join(', ')}`);

  await browser.close();
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
