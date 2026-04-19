#!/usr/bin/env node
/**
 * 클릭업 부모 페이지의 날짜 필터 UI 탐색
 * - "어제" 필터 있음 확인, 그 외 커스텀 날짜 선택기 존재 여부
 * - 결과: probe-out/parent-date-probe.json + probe-out/parent-full.html
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');

const OUT = path.join(__dirname, 'probe-out');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const { browser, page } = await login({ slowMo: 150 });
  await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  try { const b = page.locator('button:has-text("확인")').first(); if (await b.isVisible({ timeout: 1500 }).catch(()=>false)) await b.click(); } catch {}
  await page.waitForTimeout(1000);

  // 전체 필터/버튼 탐색
  const probe = await page.evaluate(() => {
    const rounded = Array.from(document.querySelectorAll('a.rounded-full, button.rounded-full')).map(e => (e.innerText || '').trim()).filter(Boolean);
    const allInputs = Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder, value: i.value, readonly: i.readOnly }));
    const dateLike = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = (el.textContent || '').trim();
      return /^\d{4}[\.\-/]\d{1,2}[\.\-/]\d{1,2}$/.test(t) && t.length < 15;
    }).slice(0, 30).map(el => ({ tag: el.tagName, text: el.textContent.trim(), cls: el.className?.slice(0, 80) }));
    const calendarBtns = Array.from(document.querySelectorAll('button, a')).filter(el => {
      const svg = el.querySelector('svg');
      if (!svg) return false;
      const s = svg.outerHTML.toLowerCase();
      return s.includes('calendar') || s.includes('clock');
    }).map(el => ({ tag: el.tagName, text: (el.innerText || '').trim(), hasClickHandler: !!el.onclick, cls: el.className?.slice(0, 100) }));
    return { rounded, inputCount: allInputs.length, inputs: allInputs.slice(0, 20), dateLike, calendarBtns };
  });

  fs.writeFileSync(path.join(OUT, 'parent-date-probe.json'), JSON.stringify(probe, null, 2));
  console.log('=== 부모 페이지 탐색 결과 ===');
  console.log('rounded-full 버튼:', probe.rounded);
  console.log('input 총 개수:', probe.inputCount);
  console.log('input 샘플:', probe.inputs);
  console.log('날짜 패턴 텍스트:', probe.dateLike);
  console.log('달력 아이콘 버튼:', probe.calendarBtns);

  // 전체 HTML (주요 부분만)
  const html = await page.content();
  fs.writeFileSync(path.join(OUT, 'parent-full.html'), html);
  await page.screenshot({ path: path.join(OUT, 'parent-full.png'), fullPage: true });

  await browser.close();
})();
