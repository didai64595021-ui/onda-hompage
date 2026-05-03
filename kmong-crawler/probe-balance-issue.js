#!/usr/bin/env node
/**
 * 비즈머니 ₩168K 있는데 "잔액부족" 거부되는 원인 진단
 * - /seller/click-up: 각 광고 행 잔액부족 텍스트 정확 캡처
 * - /seller/bizmoney: 잔액 상세 + 일주일 내 소멸 등 추가 정보
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');

const OUT = path.join(__dirname, 'probe-out');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const { browser, page } = await login({ slowMo: 200 });
  try {
    // === 1. click-up 페이지 — 각 광고 행 풀 텍스트 ===
    console.log('=== /seller/click-up 진입 ===');
    await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    try { await page.evaluate(() => { const m = document.querySelector('.kmong-modal-root'); if (m) m.remove(); }); } catch {}

    await page.screenshot({ path: path.join(OUT, 'clickup-full.png'), fullPage: true });

    const rows = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('table tbody tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || '').trim());
        if (cells.length >= 3) {
          // 토글 상태
          const toggle = tr.querySelector('input[type="checkbox"], input[role="switch"]');
          const checked = toggle ? toggle.checked : null;
          // 잔액부족/중지 영역 텍스트 + 옆 anchor/button
          const fullText = (tr.innerText || '').trim().slice(0, 400);
          const links = Array.from(tr.querySelectorAll('a, button')).map(a => (a.innerText || '').trim()).filter(Boolean);
          out.push({ cells: cells.slice(0, 6), checked, fullText, links });
        }
      });
      return out;
    });

    console.log('\n=== 광고 행 분석 ===');
    rows.forEach((r, i) => {
      console.log(`\n[${i + 1}] toggle=${r.checked === true ? 'ON' : r.checked === false ? 'OFF' : '?'}`);
      console.log('  cells:', r.cells.map(c => c.replace(/\n/g, ' ').slice(0, 50)));
      console.log('  links:', r.links.slice(0, 8));
      // 잔액부족 관련 키워드 추출
      const m = r.fullText.match(/잔액\s*부족|충전|중지|희망\s*클릭\s*비용|일일\s*예산|₩\s*[\d,]+|[\d,]+\s*원/g);
      if (m) console.log('  키워드:', m.slice(0, 10));
    });

    fs.writeFileSync(path.join(OUT, 'clickup-rows.json'), JSON.stringify(rows, null, 2));

    // === 2. bizmoney 페이지 — 잔액 + 추가 안내 ===
    console.log('\n=== /seller/bizmoney 진입 ===');
    await page.goto('https://kmong.com/seller/bizmoney', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    try { await page.evaluate(() => { const m = document.querySelector('.kmong-modal-root'); if (m) m.remove(); }); } catch {}

    await page.screenshot({ path: path.join(OUT, 'bizmoney-full-v2.png'), fullPage: true });

    const bizText = await page.evaluate(() => (document.body.innerText || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 80));
    console.log('\n=== bizmoney 화면 텍스트 (Top 80줄) ===');
    bizText.forEach((l, i) => console.log(`  ${(i+1).toString().padStart(2)}: ${l.slice(0, 80)}`));

    // === 3. 광고 1개에서 "변경" 버튼 클릭해서 일일 예산 확인 ===
    console.log('\n=== corp-seo 행 "변경" 버튼 클릭해서 잔액 요구 메시지 확인 ===');
    await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    try { await page.evaluate(() => { const m = document.querySelector('.kmong-modal-root'); if (m) m.remove(); }); } catch {}

    // corp-seo 행에서 "변경" 클릭
    const clicked = await page.evaluate(() => {
      const trs = document.querySelectorAll('table tbody tr');
      for (const tr of trs) {
        const txt = tr.innerText || '';
        if (txt.includes('기업 홈페이지 리뉴얼') || txt.includes('SEO까지')) {
          const btn = Array.from(tr.querySelectorAll('button')).find(b => (b.innerText || '').trim() === '변경');
          if (btn) { btn.click(); return true; }
        }
      }
      return false;
    });

    if (clicked) {
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, 'corp-seo-modify.png'), fullPage: true });
      const modalText = await page.evaluate(() => (document.body.innerText || '').slice(0, 3000));
      const balanceLines = modalText.split('\n').filter(l => /잔액|충전|예산|광고비|희망|일일|₩|원/.test(l)).slice(0, 30);
      console.log('  잔액 관련 텍스트:');
      balanceLines.forEach(l => console.log('    ' + l.trim().slice(0, 100)));
    } else {
      console.log('  corp-seo 행 변경 버튼 못 찾음');
    }

    console.log('\n[OK] 캡처 완료:');
    console.log('  - probe-out/clickup-full.png');
    console.log('  - probe-out/clickup-rows.json');
    console.log('  - probe-out/bizmoney-full-v2.png');
    console.log('  - probe-out/corp-seo-modify.png');

  } finally {
    await browser.close();
  }
})().catch(e => { console.error('[ERR]', e.message); process.exit(1); });
