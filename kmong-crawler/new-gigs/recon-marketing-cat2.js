#!/usr/bin/env node
/**
 * 크몽 마케팅 2차 카테고리 ID 정찰 v2
 * - includes 매칭으로 바이럴, 체험단, 블로그 등 특수문자 포함 카테고리 처리
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('[RECON v2] 마케팅 2차 카테고리 정찰...');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const targets = [
    { search: '바이럴', display: '바이럴·포스팅' },
    { search: '체험단', display: '체험단 모집' },
    { search: '블로그 관리', display: '블로그 관리' },
  ];

  const results = {};

  for (const target of targets) {
    console.log(`\n[${target.display}] 정찰...`);
    try {
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(2000);
      await closeModals(page).catch(() => {});

      // 제목 입력
      const titleInput = page.locator('input').first();
      await titleInput.fill('카테고리 정찰 테스트');
      await sleep(500);

      // 1차 카테고리 클릭
      const cat1Btn = page.locator('button').filter({ hasText: '1차 카테고리' }).first();
      await cat1Btn.click();
      await sleep(2000);

      // 마케팅 클릭 (includes 매칭)
      const clicked1 = await page.evaluate(() => {
        // data-radix popover 내부의 버튼/옵션 찾기
        const popover = document.querySelector('[data-radix-popper-content-wrapper]');
        const scope = popover || document;
        const els = scope.querySelectorAll('button, li, div, span, a, p');
        for (const el of els) {
          const t = (el.textContent || '').trim();
          if (t === '마케팅') {
            el.click();
            return true;
          }
        }
        // fallback: 모든 가시 요소
        const all = document.querySelectorAll('*');
        for (const el of all) {
          if (el.children.length > 0) continue; // 리프 노드만
          const t = (el.textContent || '').trim();
          if (t === '마케팅') {
            const rect = el.getBoundingClientRect();
            if (rect.height > 5 && rect.height < 60) {
              el.click();
              return true;
            }
          }
        }
        return false;
      });

      if (!clicked1) { console.log('  1차 마케팅 클릭 실패'); continue; }
      console.log('  1차 마케팅 선택 완료');
      await sleep(2000);

      // 2차 카테고리 버튼
      const cat2Btn = page.locator('button').filter({ hasText: '2차 카테고리' }).first();
      await cat2Btn.click();
      await sleep(2000);

      // 스크린샷
      await page.screenshot({
        path: path.join(__dirname, 'screenshots', `cat2-${target.search}.png`),
        fullPage: true
      });

      // 2차 카테고리 클릭 (includes 매칭)
      const clicked2 = await page.evaluate((searchText) => {
        const popover = document.querySelector('[data-radix-popper-content-wrapper]');
        const scope = popover || document;
        const els = scope.querySelectorAll('*');

        for (const el of els) {
          const t = (el.textContent || '').trim();
          // includes 매칭 — "바이럴" 검색 시 "바이럴·포스팅" 매칭
          if (t.includes(searchText) && t.length < 30) {
            const rect = el.getBoundingClientRect();
            if (rect.height > 5 && rect.height < 60 && rect.width > 30) {
              // 리프 노드 우선
              if (el.children.length === 0) {
                el.click();
                return { clicked: t, leaf: true };
              }
            }
          }
        }

        // fallback: 비리프 노드
        for (const el of els) {
          const t = (el.textContent || '').trim();
          if (t.includes(searchText) && t.length < 30) {
            const rect = el.getBoundingClientRect();
            if (rect.height > 5 && rect.height < 60 && rect.width > 30) {
              el.click();
              return { clicked: t, leaf: false };
            }
          }
        }

        return null;
      }, target.search);

      if (!clicked2) {
        console.log(`  2차 "${target.search}" 클릭 실패`);

        // 디버그: 모든 popover 내 텍스트 출력
        const debugTexts = await page.evaluate(() => {
          const popover = document.querySelector('[data-radix-popper-content-wrapper]');
          if (!popover) return ['NO POPOVER FOUND'];
          const texts = [];
          popover.querySelectorAll('*').forEach(el => {
            if (el.children.length === 0) {
              const t = (el.textContent || '').trim();
              if (t && t.length > 1 && t.length < 30) texts.push(t);
            }
          });
          return [...new Set(texts)];
        });
        console.log('  디버그 popover 텍스트:', debugTexts.slice(0, 20));
        continue;
      }

      console.log(`  2차 클릭: "${clicked2.clicked}" (leaf: ${clicked2.leaf})`);
      await sleep(1500);

      // "다음" 버튼 클릭
      const nextBtn = page.locator('button').filter({ hasText: '다음' }).first();
      await nextBtn.click();

      // URL 변경 대기
      await page.waitForURL(/\/my-gigs\/edit\//, { timeout: 15000 }).catch(() => {});
      await sleep(2000);

      const url = page.url();
      console.log(`  URL: ${url}`);

      const rootMatch = url.match(/rootCategoryId=(\d+)/);
      const subMatch = url.match(/subCategoryId=(\d+)/);
      const gigMatch = url.match(/\/edit\/(\d+)/);

      results[target.display] = {
        rootCategoryId: rootMatch?.[1] || null,
        subCategoryId: subMatch?.[1] || null,
        gigId: gigMatch?.[1] || null,
        url
      };

      console.log(`  rootCategoryId=${rootMatch?.[1]}, subCategoryId=${subMatch?.[1]}`);

      // Step 2 페이지에서 select 구조 확인
      if (url.includes('/edit/')) {
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
                if (t && t.length > 1 && t.length < 30 && !t.includes('react-select')) {
                  label = t;
                  break;
                }
              }
              if (label) break;
            }
            selects.push({ id: el.id, label });
          });
          return selects;
        });

        results[target.display].selects = selectInfo;
        console.log(`  react-selects: ${selectInfo.length}개`);
        selectInfo.forEach(s => console.log(`    ${s.id} → "${s.label}"`));
      }

    } catch (e) {
      console.log(`  실패: ${e.message}`);
      results[target.display] = { error: e.message };
    }
  }

  // 저장
  const outPath = path.join(__dirname, 'recon-marketing-cat2.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[DONE] 결과 저장: ${outPath}`);

  // draft 목록
  const draftIds = Object.values(results).filter(r => r.gigId).map(r => r.gigId);
  if (draftIds.length > 0) {
    console.log(`\n⚠ 정리 필요한 draft IDs: ${draftIds.join(', ')}`);
  }

  await browser.close();
}

run().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
