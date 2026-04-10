#!/usr/bin/env node
/**
 * 크몽 마케팅 카테고리 ID 정찰
 * - 신규등록 페이지에서 마케팅 > 2차 카테고리 선택 후 URL에서 ID 추출
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('[RECON] 마케팅 카테고리 ID 정찰 시작...');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const results = {};

  // 타겟 2차 카테고리 — 영수증리뷰, 블로그리뷰에 해당하는 후보
  const targets = [
    '지도 활성화',
    '지도 세팅',
    '지도 최적화노출',
    '바이럴·포스팅',
    '체험단 모집',
    '블로그 관리',
    '인플루언서 마케팅',
  ];

  for (const target of targets) {
    console.log(`\n[${target}] 카테고리 ID 탐색...`);
    try {
      // 신규등록 페이지 이동
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(2000);
      await closeModals(page).catch(() => {});

      // 제목 입력 (필수)
      const titleInput = page.locator('input[placeholder*="제목"], input[name*="title"]').first();
      await titleInput.fill('테스트 카테고리 정찰용');
      await sleep(500);

      // 1차 카테고리 "마케팅" 선택
      const cat1Btn = page.locator('button').filter({ hasText: '1차 카테고리' }).first();
      await cat1Btn.click();
      await sleep(1500);

      // 마케팅 클릭 — getByText가 실패하면 evaluate 사용
      const clicked1 = await page.evaluate(() => {
        const els = [...document.querySelectorAll('button, li, div, span, a')];
        for (const el of els) {
          const t = (el.innerText || '').trim();
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

      if (!clicked1) {
        console.log('  1차 마케팅 클릭 실패');
        continue;
      }
      await sleep(1500);

      // 2차 카테고리 버튼 클릭
      const cat2Btn = page.locator('button').filter({ hasText: '2차 카테고리' }).first();
      await cat2Btn.click();
      await sleep(1500);

      // 타겟 카테고리 클릭
      const clicked2 = await page.evaluate((targetText) => {
        const els = [...document.querySelectorAll('button, li, div, span, a')];
        for (const el of els) {
          const t = (el.innerText || '').trim();
          if (t === targetText) {
            const rect = el.getBoundingClientRect();
            if (rect.height > 5 && rect.height < 60) {
              el.click();
              return true;
            }
          }
        }
        return false;
      }, target);

      if (!clicked2) {
        console.log(`  2차 "${target}" 클릭 실패`);
        continue;
      }
      await sleep(1500);

      // "다음" 버튼 클릭하여 편집 페이지로 이동 (URL에서 ID 추출)
      const nextBtn = page.locator('button').filter({ hasText: '다음' }).first();
      await nextBtn.click();

      // URL 변경 대기 (edit 페이지로 이동)
      await page.waitForURL(/\/my-gigs\/edit\//, { timeout: 15000 }).catch(() => {});
      await sleep(1000);

      const url = page.url();
      console.log(`  URL: ${url}`);

      // rootCategoryId, subCategoryId 추출
      const rootMatch = url.match(/rootCategoryId=(\d+)/);
      const subMatch = url.match(/subCategoryId=(\d+)/);
      const gigMatch = url.match(/\/edit\/(\d+)/);

      const rootId = rootMatch ? rootMatch[1] : null;
      const subId = subMatch ? subMatch[1] : null;
      const gigId = gigMatch ? gigMatch[1] : null;

      results[target] = { rootCategoryId: rootId, subCategoryId: subId, gigId, url };
      console.log(`  rootCategoryId=${rootId}, subCategoryId=${subId}, gigId=${gigId}`);

      // Step 2 페이지에서 react-select 구조도 확인
      if (url.includes('/edit/')) {
        await sleep(2000);

        const selectInfo = await page.evaluate(() => {
          const selects = [];
          document.querySelectorAll('input[id^="react-select-"]').forEach(el => {
            if (!el.id.endsWith('-input')) return;
            // nearest label 찾기
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

        results[target].selects = selectInfo;
        console.log(`  react-selects: ${selectInfo.length}개`);
        selectInfo.forEach(s => console.log(`    ${s.id} → "${s.label}"`));
      }

      // 생성된 draft 삭제 방지를 위해 gigId 기록
      if (gigId) {
        console.log(`  ⚠ draft ${gigId} 생성됨 — 정리 필요`);
      }

    } catch (e) {
      console.log(`  실패: ${e.message}`);
      results[target] = { error: e.message };
    }
  }

  // 저장
  const outPath = path.join(__dirname, 'recon-marketing-categories.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[DONE] 결과 저장: ${outPath}`);

  // 생성된 draft IDs 출력
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
