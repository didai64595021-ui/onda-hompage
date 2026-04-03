#!/usr/bin/env node
/**
 * 크몽 로그인 페이지 탐색 (현재 UI 구조 파악용)
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function explore() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  // 1) /signup 페이지 탐색 (SPA)
  console.log('=== 1) /signup 페이지 ===');
  await page.goto('https://kmong.com/signup', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log(`URL: ${page.url()}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'explore-signup.png'), fullPage: true });

  // 페이지 내 모든 input/button/a 요소 추출
  const signupElements = await page.evaluate(() => {
    const results = { inputs: [], buttons: [], links: [] };
    document.querySelectorAll('input').forEach(el => {
      results.inputs.push({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, visible: el.offsetParent !== null });
    });
    document.querySelectorAll('button').forEach(el => {
      results.buttons.push({ text: el.innerText.trim().substring(0, 50), type: el.type, classes: el.className.substring(0, 80), visible: el.offsetParent !== null });
    });
    document.querySelectorAll('a').forEach(el => {
      const text = el.innerText.trim().substring(0, 50);
      if (text.includes('로그인') || text.includes('login') || el.href.includes('login') || el.href.includes('auth') || el.href.includes('signin')) {
        results.links.push({ text, href: el.href, visible: el.offsetParent !== null });
      }
    });
    return results;
  });
  console.log('inputs:', JSON.stringify(signupElements.inputs, null, 2));
  console.log('buttons:', JSON.stringify(signupElements.buttons, null, 2));
  console.log('login links:', JSON.stringify(signupElements.links, null, 2));

  // 2) /seller/click-up 접근 (auth-refreshing으로 리다이렉트 되는지)
  console.log('\n=== 2) /seller/click-up (보호 페이지) ===');
  await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log(`URL: ${page.url()}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'explore-seller-redirect.png'), fullPage: true });

  const sellerPageElements = await page.evaluate(() => {
    const results = { inputs: [], buttons: [], forms: [] };
    document.querySelectorAll('input').forEach(el => {
      results.inputs.push({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, visible: el.offsetParent !== null });
    });
    document.querySelectorAll('button').forEach(el => {
      results.buttons.push({ text: el.innerText.trim().substring(0, 50), type: el.type, visible: el.offsetParent !== null });
    });
    document.querySelectorAll('form').forEach(el => {
      results.forms.push({ action: el.action, method: el.method, id: el.id });
    });
    return results;
  });
  console.log('inputs:', JSON.stringify(sellerPageElements.inputs, null, 2));
  console.log('buttons:', JSON.stringify(sellerPageElements.buttons, null, 2));
  console.log('forms:', JSON.stringify(sellerPageElements.forms, null, 2));

  // 3) 메인 페이지 헤더 분석
  console.log('\n=== 3) 메인 페이지 헤더 ===');
  await page.goto('https://kmong.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log(`URL: ${page.url()}`);

  const headerLinks = await page.evaluate(() => {
    const links = [];
    // 상단 100px 영역의 모든 링크
    document.querySelectorAll('header a, nav a, [class*="header"] a, [class*="nav"] a').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < 100) {
        links.push({ text: el.innerText.trim().substring(0, 50), href: el.href, x: Math.round(rect.x), y: Math.round(rect.y) });
      }
    });
    // 로그인/회원가입 텍스트 포함 요소 전체 검색
    const allText = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text.includes('로그인') || text.includes('회원가입') || text.includes('Sign')) {
        const parent = walker.currentNode.parentElement;
        allText.push({ text: text.substring(0, 50), tag: parent.tagName, href: parent.getAttribute('href'), classes: (parent.className || '').substring(0, 80) });
      }
    }
    return { headerLinks: links, loginTexts: allText };
  });
  console.log('header links:', JSON.stringify(headerLinks.headerLinks, null, 2));
  console.log('login texts:', JSON.stringify(headerLinks.loginTexts, null, 2));

  await browser.close();
  console.log('\n=== 탐색 완료 ===');
}

explore().catch(console.error);
