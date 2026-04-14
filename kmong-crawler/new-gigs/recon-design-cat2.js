#!/usr/bin/env node
/**
 * 디자인 1차 카테고리의 2차 카테고리 옵션 텍스트를 정확히 dump.
 * "상세페이지·이미지편집" 등 매칭 실패 원인 파악용.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SHOT_DIR = path.join(__dirname, 'screenshots');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await login(page);
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await closeModals(page).catch(() => {});

  // 1차 카테고리 클릭 → "디자인" 선택
  const cat1Btn = page.locator('button:has-text("1차 카테고리")').first();
  await cat1Btn.click({ force: true });
  await sleep(2000);
  await page.screenshot({ path: path.join(SHOT_DIR, 'recon-design-cat1-popover.png'), fullPage: true }).catch(()=>{});

  // 디자인 옵션 dump 후 클릭
  const cat1Opts = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, li, div, span').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 30) return;
      if (['디자인','마케팅','IT·프로그래밍','영상·사진·음향','번역·통역','문서·글쓰기','비즈니스컨설팅','주문제작','세무·법무·노무','창업·투자·자금','직무역량 레슨','취업·入社','직무역량 강의','기타'].includes(t)) {
        out.push({ text: t, codes: [...t].map(c => c.codePointAt(0).toString(16)).join(',') });
      }
    });
    return out;
  });
  console.log('--- 1차 카테고리 popover 옵션 ---');
  console.log(JSON.stringify(cat1Opts, null, 2));

  await page.getByText('디자인', { exact: true }).first().click({ force: true });
  await sleep(2500);
  await page.screenshot({ path: path.join(SHOT_DIR, 'recon-design-after-cat1.png'), fullPage: true }).catch(()=>{});

  // 2차 카테고리 버튼 클릭
  const cat2Btn = page.locator('button:has-text("2차 카테고리")').first();
  const cat2Visible = await cat2Btn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('cat2 button visible:', cat2Visible);

  if (cat2Visible) {
    await cat2Btn.click({ force: true });
    await sleep(2000);
    await page.screenshot({ path: path.join(SHOT_DIR, 'recon-design-cat2-popover.png'), fullPage: true }).catch(()=>{});
  }

  // popover에 표시된 모든 텍스트 dump (2차 카테고리 옵션)
  const cat2Opts = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('button, li, div, span, a').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // 직계 자식이 텍스트인 것만 (중첩 배제)
      const directText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
      if (!directText) return;
      if (directText.length < 2 || directText.length > 30) return;
      // 카테고리 같은 한글 텍스트만
      if (!/[가-힣]/.test(directText)) return;
      if (seen.has(directText)) return;
      seen.add(directText);
      out.push({
        text: directText,
        codes: [...directText].map(c => c.codePointAt(0).toString(16)).join(','),
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 60),
      });
    });
    return out;
  });
  console.log('\n--- 디자인 진입 후 popover 텍스트 dump ---');
  console.log(JSON.stringify(cat2Opts, null, 2));

  // 특히 "상세" 또는 "이미지" 또는 "인쇄" 또는 "로고" 키워드 포함 항목만
  const filtered = cat2Opts.filter(o => /상세|이미지|인쇄|로고|홍보|편집|브랜딩/.test(o.text));
  console.log('\n--- 키워드 매칭 후보 ---');
  console.log(JSON.stringify(filtered, null, 2));

  fs.writeFileSync(path.join(__dirname, 'recon-design-cat2.json'), JSON.stringify({ cat1Opts, cat2Opts, filtered }, null, 2));
  console.log('\n저장: recon-design-cat2.json');

  await browser.close();
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
