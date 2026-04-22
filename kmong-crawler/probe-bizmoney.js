#!/usr/bin/env node
/**
 * 비즈머니 페이지 DOM 구조 덤프 (1회성 probe)
 * - /seller/bizmoney 진입
 * - 날짜 필터 input/button, 일자별 거래내역 테이블/리스트 텍스트 + HTML 덤프
 * - probe-out/bizmoney-* 파일로 저장
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');

const OUT_DIR = path.join(__dirname, 'probe-out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const { browser, page } = await login({ slowMo: 150 });
  try {
    await page.goto('https://kmong.com/seller/bizmoney', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4500);

    // 1) 전체 페이지 스크린샷 + HTML
    await page.screenshot({ path: path.join(OUT_DIR, 'bizmoney-full.png'), fullPage: true });
    const html = await page.content();
    fs.writeFileSync(path.join(OUT_DIR, 'bizmoney.html'), html);

    // 2) 텍스트 라인 (innerText) — 날짜 라벨/라디오 버튼 탐색용
    const lines = await page.evaluate(() => (document.body.innerText || '').split('\n').map(l => l.trim()).filter(Boolean));
    fs.writeFileSync(path.join(OUT_DIR, 'bizmoney-lines.txt'), lines.join('\n'));

    // 3) 날짜 관련 UI — input[type="date"], button/a, 라벨 근처 구조
    const dateUi = await page.evaluate(() => {
      const out = { dateInputs: [], buttons: [], tabs: [] };
      document.querySelectorAll('input').forEach((inp) => {
        const t = inp.type || inp.getAttribute('type') || '';
        const ph = inp.placeholder || inp.getAttribute('placeholder') || '';
        const val = inp.value || '';
        const cls = inp.className || '';
        if (t === 'date' || /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(val) || /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(ph) || /시작|종료|기간|date/i.test(ph + cls)) {
          out.dateInputs.push({ type: t, placeholder: ph, value: val, className: cls, name: inp.name || '' });
        }
      });
      document.querySelectorAll('button, a').forEach((el) => {
        const tx = (el.innerText || '').trim();
        if (!tx) return;
        if (/오늘|어제|이번 달|지난 7일|이번 주|지난|기간 직접|조회|적용|custom/i.test(tx)) {
          out.buttons.push({ tag: el.tagName, text: tx.slice(0, 40), className: (el.className || '').slice(0, 80) });
        }
      });
      // 탭 구조 추정
      document.querySelectorAll('[role="tab"], [class*="tab"]').forEach((el) => {
        const tx = (el.innerText || '').trim();
        if (tx) out.tabs.push({ text: tx.slice(0, 30), className: (el.className || '').slice(0, 80) });
      });
      return out;
    });
    fs.writeFileSync(path.join(OUT_DIR, 'bizmoney-date-ui.json'), JSON.stringify(dateUi, null, 2));

    // 4) 테이블 구조 — thead 헤더 + tbody 첫 10행
    const tables = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('table').forEach((tbl, idx) => {
        const headers = Array.from(tbl.querySelectorAll('thead th, thead td')).map(h => (h.innerText || '').trim());
        const rows = Array.from(tbl.querySelectorAll('tbody tr')).slice(0, 10).map(r =>
          Array.from(r.querySelectorAll('td')).map(td => (td.innerText || '').trim())
        );
        out.push({ idx, headers, rowCount: tbl.querySelectorAll('tbody tr').length, rowsSample: rows });
      });
      return out;
    });
    fs.writeFileSync(path.join(OUT_DIR, 'bizmoney-tables.json'), JSON.stringify(tables, null, 2));

    // 5) URL 쿼리 테스트 — ?start=yesterday&end=yesterday 패턴 후보 시도
    const yesterday = new Date(Date.now() + 9 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const candidateUrls = [
      `https://kmong.com/seller/bizmoney?startedDate=${yesterday}&endedDate=${yesterday}`,
      `https://kmong.com/seller/bizmoney?startDate=${yesterday}&endDate=${yesterday}`,
      `https://kmong.com/seller/bizmoney?start=${yesterday}&end=${yesterday}`,
      `https://kmong.com/seller/bizmoney?from=${yesterday}&to=${yesterday}`,
    ];
    const urlResults = [];
    for (const u of candidateUrls) {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);
      const res = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, value: i.value, placeholder: i.placeholder, name: i.name }));
        const tableCount = document.querySelectorAll('table tbody tr').length;
        return { url: location.href, inputs: inputs.filter(i => i.value || /date|시작|종료|기간/i.test(i.placeholder || i.name || '')), tableCount };
      });
      urlResults.push(res);
    }
    fs.writeFileSync(path.join(OUT_DIR, 'bizmoney-url-tests.json'), JSON.stringify(urlResults, null, 2));

    console.log('[OK] probe-out/bizmoney-* 생성 완료');
    console.log('  - bizmoney-full.png / bizmoney.html / bizmoney-lines.txt');
    console.log('  - bizmoney-date-ui.json / bizmoney-tables.json / bizmoney-url-tests.json');
  } catch (e) {
    console.error('[ERR]', e.message);
  } finally {
    await browser.close();
  }
})();
