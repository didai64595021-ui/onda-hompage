#!/usr/bin/env node
/**
 * 비즈머니 v3 — 이전 달(2026.04) 이동 후 div 구조 dump
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

    // 체크박스 OFF
    const cb = page.locator('input[type="checkbox"]').first();
    if (await cb.count() > 0 && await cb.isChecked()) {
      await cb.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 월 필터 input (text type, value="2026.05") 옆 prev 버튼 찾기
    // button:has(svg) 4개 중 하나가 prev. 좌측 첫 번째 추정.
    console.log('=== 월 input 위치 + 주변 button 탐색 ===');
    const layout = await page.evaluate(() => {
      const monthInput = Array.from(document.querySelectorAll('input[type="text"]')).find(i => /\d{4}\.\d{1,2}/.test(i.value || ''));
      if (!monthInput) return { found: false };
      const rect = monthInput.getBoundingClientRect();
      const surrounding = [];
      document.querySelectorAll('button').forEach((b, i) => {
        const r = b.getBoundingClientRect();
        if (Math.abs(r.top - rect.top) < 60 && r.width < 60 && r.height < 60) {
          surrounding.push({
            i,
            x: Math.round(r.left), y: Math.round(r.top),
            w: Math.round(r.width), h: Math.round(r.height),
            text: (b.innerText || '').slice(0, 20),
            aria: b.getAttribute('aria-label') || '',
            cls: (b.className || '').slice(0, 60),
            relativeToInput: r.left < rect.left ? 'LEFT' : 'RIGHT',
          });
        }
      });
      return { found: true, monthInput: { value: monthInput.value, x: Math.round(rect.left), y: Math.round(rect.top) }, buttons: surrounding };
    });
    console.log(JSON.stringify(layout, null, 2));

    // 좌측 button 중 첫 번째 = 이전 달
    if (layout.found && layout.buttons.length > 0) {
      const prev = layout.buttons.find(b => b.relativeToInput === 'LEFT');
      if (prev) {
        console.log(`\n=== 이전 달 button[${prev.i}] 클릭 ===`);
        await page.locator('button').nth(prev.i).click();
        await page.waitForTimeout(2500);
        const newMonth = await page.locator('input[type="text"]').first().getAttribute('value').catch(() => '');
        console.log(`  이동 후 월: ${newMonth}`);
      }
    }

    // 4월 데이터 영역 dump
    console.log('\n=== 일별 내역 영역 (4월) ===');
    const text = await page.evaluate(() => {
      const all = (document.body.innerText || '').split('\n').map(l => l.trim());
      const idx = all.findIndex(l => l.includes('비즈머니 일별 내역'));
      return idx >= 0 ? all.slice(idx, idx + 80) : ['NOT FOUND'];
    });
    console.log(text.join('\n'));

    // div 구조 dump
    const containerHtml = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      let header = null;
      for (const el of all) {
        if ((el.innerText || '').trim() === '비즈머니 일별 내역') { header = el; break; }
      }
      if (!header) return 'NOT FOUND';
      let container = header;
      for (let i = 0; i < 8; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        if ((container.innerText || '').length > 800) break;
      }
      return container.outerHTML.slice(0, 12000);
    });
    fs.writeFileSync(path.join(OUT_DIR, 'bizmoney-container-april.html'), containerHtml);
    console.log(`\n  → bizmoney-container-april.html (${containerHtml.length} chars)`);

    await page.screenshot({ path: path.join(OUT_DIR, 'bizmoney-v3-april.png'), fullPage: true });
    console.log('  → bizmoney-v3-april.png');
  } catch (e) {
    console.error('[ERR]', e.message);
  } finally {
    await browser.close();
  }
})();
