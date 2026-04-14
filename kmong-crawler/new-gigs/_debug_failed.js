#!/usr/bin/env node
/**
 * 실패한 8개 draft 페이지의 input[type=file] 셀렉터 분석
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const FAILED = ['763026', '763027', '763028'];

(async () => {
  const { browser, page } = await login({ slowMo: 300 });

  for (const draftId of FAILED) {
    console.log(`\n=== draft ${draftId} ===`);
    const url = `https://kmong.com/my-gigs/edit/${draftId}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      await closeModals(page);

      // 모든 file input 찾기
      const inputs = await page.$$eval('input[type=file]', els => els.map((el, i) => ({
        idx: i,
        id: el.id || '(no-id)',
        name: el.name || '(no-name)',
        accept: el.accept || '',
        parentId: el.closest('[id]')?.id || '(no-parent-id)',
        parentClass: (el.closest('[class]')?.className || '').slice(0, 80),
      })));
      console.log(`  파일 input: ${inputs.length}개`);
      inputs.forEach(i => console.log(`    [${i.idx}] id=${i.id} parent=${i.parentId}`));

      // 페이지 카테고리/제목 정보
      const title = await page.title();
      const url2 = page.url();
      console.log(`  title: ${title.slice(0, 50)}`);
      console.log(`  url: ${url2}`);

      // MAIN_GALLERY 존재 여부
      const hasMainGallery = await page.$('#MAIN_GALLERY');
      const hasImageGallery = await page.$('#IMAGE_GALLERY');
      console.log(`  #MAIN_GALLERY: ${!!hasMainGallery}, #IMAGE_GALLERY: ${!!hasImageGallery}`);

      // 카테고리 표시 (있으면)
      const breadcrumb = await page.$$eval('[class*="breadcrumb"], [class*="category"], h1, h2', els =>
        els.slice(0, 5).map(el => el.textContent?.trim()).filter(Boolean)
      ).catch(() => []);
      console.log(`  컨텍스트: ${breadcrumb.slice(0, 3).join(' | ')}`);

    } catch (e) {
      console.log(`  ERROR: ${e.message?.slice(0, 100)}`);
    }
  }
  await browser.close();
})();
