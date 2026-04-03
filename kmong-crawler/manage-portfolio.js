#!/usr/bin/env node
/**
 * 크몽 포트폴리오 관리 RPA
 * - /seller/portfolios에서 포트폴리오 추가/수정
 * - 사용: node manage-portfolio.js list | add --title "제목" --image "/path/to/image.png"
 */

const { login, saveErrorScreenshot } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const { notify } = require('./lib/telegram');
const path = require('path');

const PORTFOLIOS_URL = 'https://kmong.com/seller/portfolios';

/**
 * 포트폴리오 목록 조회
 */
async function listPortfolios() {
  let browser;
  try {
    console.log('=== 포트폴리오 목록 조회 ===');
    const result = await login({ slowMo: 100 });
    browser = result.browser;
    const page = result.page;

    await page.goto(PORTFOLIOS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeModals(page);

    const portfolios = await page.evaluate(() => {
      const items = [];
      // 포트폴리오 카드/리스트 파싱
      const cards = document.querySelectorAll('[class*="portfolio"], [class*="card"], [class*="item"]');
      cards.forEach(card => {
        const title = card.querySelector('h3, h4, [class*="title"]')?.innerText?.trim() || '';
        const img = card.querySelector('img')?.src || '';
        const link = card.querySelector('a[href]')?.href || '';
        if (title || img) {
          items.push({ title: title.substring(0, 80), image: img.substring(0, 120), link });
        }
      });
      // 카드가 없으면 전체 텍스트에서 추출
      if (items.length === 0) {
        const text = document.body.innerText;
        const hasPortfolio = text.includes('포트폴리오');
        items.push({ title: `페이지 텍스트 (포트폴리오 언급: ${hasPortfolio})`, pageUrl: window.location.href });
      }
      return items;
    });

    console.log(`포트폴리오: ${portfolios.length}개`);
    for (const p of portfolios) {
      console.log(`  - ${p.title} ${p.link || ''}`);
    }

    await browser.close();
    return { success: true, portfolios };

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    if (browser) await browser.close();
    return { success: false, message: err.message };
  }
}

/**
 * 포트폴리오 추가
 * @param {object} opts - { title, description?, imagePath?, category? }
 */
async function addPortfolio(opts = {}) {
  if (!opts.title) {
    throw new Error('title 필수');
  }

  let browser;
  try {
    console.log(`=== 포트폴리오 추가: "${opts.title}" ===`);
    const result = await login({ slowMo: 200 });
    browser = result.browser;
    const page = result.page;

    await page.goto(PORTFOLIOS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeModals(page);

    // "포트폴리오 등록" 버튼 찾기
    const addBtn = page.locator('button:has-text("등록"), button:has-text("추가"), a:has-text("등록"), a:has-text("추가"), button:has-text("새 포트폴리오")').first();

    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 링크로 등록 페이지 직접 이동 시도
      const addLink = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href]');
        for (const l of links) {
          if (l.href.includes('portfolio') && (l.href.includes('new') || l.href.includes('create') || l.href.includes('add'))) {
            return l.href;
          }
        }
        return null;
      });

      if (addLink) {
        await page.goto(addLink, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
      } else {
        await saveErrorScreenshot(page, 'portfolio-no-add-btn');
        await browser.close();
        return { success: false, message: '포트폴리오 등록 버튼을 찾을 수 없음' };
      }
    } else {
      await addBtn.click();
      await page.waitForTimeout(3000);
    }

    await closeModals(page);
    console.log(`[등록 페이지] ${page.url()}`);

    // 제목 입력
    const titleInput = page.locator('input[placeholder*="제목"], input[placeholder*="포트폴리오"], input[name*="title"]').first();
    if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await titleInput.fill(opts.title);
      console.log('[제목] 입력 완료');
    }

    // 설명 입력
    if (opts.description) {
      const descInput = page.locator('textarea, [contenteditable="true"], .ql-editor').first();
      if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await descInput.click();
        await page.keyboard.type(opts.description, { delay: 10 });
        console.log('[설명] 입력 완료');
      }
    }

    // 이미지 업로드
    if (opts.imagePath) {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(opts.imagePath);
        await page.waitForTimeout(3000);
        console.log('[이미지] 업로드 완료');
      }
    }

    // 저장
    const saveBtn = page.locator('button:has-text("저장"), button:has-text("등록"), button:has-text("완료"), button[type="submit"]').first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(5000);

      // 확인 모달
      const confirmBtn = page.locator('button:has-text("확인")').first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    const msg = `포트폴리오 등록: "${opts.title}"`;
    console.log(`[완료] ${msg}`);
    notify(msg);
    await browser.close();
    return { success: true, message: msg };

  } catch (err) {
    const msg = `포트폴리오 등록 실패: ${err.message}`;
    console.error(`[에러] ${msg}`);
    notify(msg);
    if (browser) await browser.close();
    return { success: false, message: msg };
  }
}

module.exports = { listPortfolios, addPortfolio };

if (require.main === module) {
  const [,, action, ...args] = process.argv;

  if (action === 'list') {
    listPortfolios().then(r => process.exit(r.success ? 0 : 1));
  } else if (action === 'add') {
    const opts = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace('--', '');
      opts[key] = args[i + 1];
    }
    if (!opts.title) {
      console.log('사용법: node manage-portfolio.js add --title "제목" --description "설명" --imagePath "/path/image.png"');
      process.exit(1);
    }
    addPortfolio(opts).then(r => process.exit(r.success ? 0 : 1));
  } else {
    console.log('사용법:');
    console.log('  node manage-portfolio.js list');
    console.log('  node manage-portfolio.js add --title "제목" --description "설명"');
    process.exit(1);
  }
}
