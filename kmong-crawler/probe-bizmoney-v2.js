#!/usr/bin/env node
/**
 * 비즈머니 페이지 v2 probe (2026-05-01)
 * - 월 필터 클릭해서 2026.04로 이동
 * - "내역이 있는 날만 보기" 체크박스 OFF
 * - 그 후 div grid 구조에서 일별 내역 추출 가능 여부 확인
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');

const OUT_DIR = path.join(__dirname, 'probe-out');

(async () => {
  const { browser, page } = await login({ slowMo: 200 });
  try {
    await page.goto('https://kmong.com/seller/bizmoney', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4500);

    console.log('=== 0. 진입 후 텍스트 (일별 내역 영역) ===');
    let snapshot = await page.evaluate(() => {
      const all = (document.body.innerText || '').split('\n').map(l => l.trim());
      const idx = all.findIndex(l => l.includes('비즈머니 일별 내역'));
      return idx >= 0 ? all.slice(idx, idx + 30) : ['NOT FOUND'];
    });
    console.log(snapshot.join('\n'));

    // 1) 체크박스 OFF
    console.log('\n=== 1. "내역이 있는 날만 보기" 체크박스 OFF ===');
    const cbCount = await page.locator('input[type="checkbox"]').count();
    console.log(`  체크박스 ${cbCount}개 발견`);
    if (cbCount > 0) {
      const checked = await page.locator('input[type="checkbox"]').first().isChecked();
      console.log(`  현재 상태: ${checked ? 'CHECKED' : 'UNCHECKED'}`);
      if (checked) {
        await page.locator('input[type="checkbox"]').first().click({ force: true });
        await page.waitForTimeout(2000);
        console.log('  → OFF 처리');
      }
    }

    // 2) 월 필터를 2026.04로 변경 (이전 달 버튼 클릭)
    console.log('\n=== 2. 월 필터를 2026.04로 변경 ===');
    const monthBefore = await page.locator('input[value]').first().getAttribute('value').catch(() => '');
    console.log(`  현재 월: ${monthBefore}`);
    // 이전 달 버튼 후보
    for (const sel of ['button[aria-label*="이전"]', 'button[aria-label*="prev"]', 'button:has(svg)']) {
      const cnt = await page.locator(sel).count();
      if (cnt > 0) {
        console.log(`  selector "${sel}" → ${cnt}개`);
      }
    }

    // 3) 텍스트 다시 dump (체크박스 OFF 후)
    console.log('\n=== 3. 체크박스 OFF 후 일별 내역 영역 ===');
    snapshot = await page.evaluate(() => {
      const all = (document.body.innerText || '').split('\n').map(l => l.trim());
      const idx = all.findIndex(l => l.includes('비즈머니 일별 내역'));
      return idx >= 0 ? all.slice(idx, idx + 50) : ['NOT FOUND'];
    });
    console.log(snapshot.join('\n'));

    // 4) "비즈머니 일별 내역" 컨테이너 HTML dump (div 구조 파악)
    console.log('\n=== 4. 일별 내역 컨테이너 HTML 구조 ===');
    const containerHtml = await page.evaluate(() => {
      // "비즈머니 일별 내역" 텍스트가 있는 헤더 찾기
      const all = document.querySelectorAll('*');
      let header = null;
      for (const el of all) {
        const txt = (el.innerText || '').trim();
        if (txt === '비즈머니 일별 내역' || (txt.startsWith('비즈머니 일별 내역') && txt.length < 50)) {
          header = el;
          break;
        }
      }
      if (!header) return 'NOT FOUND';
      // 부모 컨테이너
      let container = header;
      for (let i = 0; i < 6; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        if ((container.innerText || '').length > 500) break;
      }
      return container.outerHTML.slice(0, 5000);
    });
    fs.writeFileSync(path.join(OUT_DIR, 'bizmoney-container.html'), containerHtml);
    console.log(`  → bizmoney-container.html (${containerHtml.length} chars)`);

    // 5) 스크린샷
    await page.screenshot({ path: path.join(OUT_DIR, 'bizmoney-v2-full.png'), fullPage: true });
    console.log('\n  → bizmoney-v2-full.png');

    console.log('\n[OK] v2 probe 완료');
  } catch (e) {
    console.error('[ERR]', e.message);
  } finally {
    await browser.close();
  }
})();
