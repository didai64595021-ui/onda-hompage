/**
 * CMS 갤러리 시스템 통합 테스트 (Playwright)
 *
 * 검증 항목:
 * 1. 전 페이지 콘솔 에러 0건 (기존 기능 깨짐 없음)
 * 2. 갤러리 배열 있는 이미지 → .cms-gallery 슬라이더로 변환
 * 3. 슬라이더 네비게이션 (화살표, 도트) 정상 동작
 * 4. 객실 갤러리 CMS 동적 교체 정상
 * 5. admin.html 갤러리 에디터 렌더링 확인
 * 6. 단일 이미지 → 갤러리 미변환 (정상 단일 표시)
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3848;
const ROOT = __dirname;

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found: ' + urlPath); return; }
        const ext = path.extname(urlPath).toLowerCase();
        const types = {
          '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
          '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
          '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? '  \u2713' : '  \u2717') + ' ' + name + (detail ? ' \u2014 ' + detail : ''));
}

async function main() {
  const server = await startServer();
  console.log('Server: http://localhost:' + PORT + '\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // Supabase 인터셉트 → abort하여 로컬 JSON 폴백 강제
  // (Supabase에 아직 새 갤러리 키가 없을 수 있으므로)
  await ctx.route('**/*supabase*/**', route => route.abort());

  async function loadPage(name, url) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(e.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('supabase') && !msg.text().includes('ERR_FAILED')) consoleErrors.push(msg.text());
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    return { page, errors: consoleErrors };
  }

  const BASE = `http://localhost:${PORT}`;

  // ═══════════════════════════════════════
  // TEST 1: 전 페이지 콘솔 에러 0건
  // ═══════════════════════════════════════
  console.log('=== TEST 1: 전 페이지 콘솔 에러 체크 ===');
  const pages = ['index.html', 'about.html', 'rooms.html', 'rates.html', 'package.html', 'facilities.html', 'attractions.html', 'faq.html'];
  for (const pg of pages) {
    const { page, errors } = await loadPage(pg, `${BASE}/${pg}`);
    check(`${pg}: 콘솔 에러 0`, errors.length === 0, errors.length > 0 ? errors.slice(0, 3).join('; ') : '');
    await page.close();
  }

  // ═══════════════════════════════════════
  // TEST 2: 갤러리 슬라이더 변환 확인
  // ═══════════════════════════════════════
  console.log('\n=== TEST 2: 갤러리 슬라이더 변환 ===');

  // about.html: about-hero-imgs (3장) → .cms-gallery--hero 생성
  const { page: aboutPage } = await loadPage('about-gallery', `${BASE}/about.html`);
  const aboutHeroGallery = await aboutPage.locator('.cms-gallery--hero').count();
  check('about.html: 히어로 갤러리 슬라이더 생성', aboutHeroGallery >= 1, `${aboutHeroGallery}개`);

  const aboutHeroSlides = await aboutPage.locator('.cms-gallery--hero .cms-gallery-slide').count();
  check('about.html: 히어로 갤러리 슬라이드 >= 2', aboutHeroSlides >= 2, `${aboutHeroSlides}장`);

  // about-story-imgs 갤러리
  const aboutStoryGallery = await aboutPage.locator('.highlight-img-wrap .cms-gallery').count();
  check('about.html: 스토리 하이라이트 갤러리 생성', aboutStoryGallery >= 1, `${aboutStoryGallery}개`);

  // why-card 갤러리 (why-1-imgs ~ why-9-imgs)
  const whyGalleries = await aboutPage.locator('.why-card-img .cms-gallery').count();
  check('about.html: Why Us 카드 갤러리 >= 5', whyGalleries >= 5, `${whyGalleries}개`);
  await aboutPage.close();

  // rates.html: rates-hero-imgs (2장) → .cms-gallery--hero
  const { page: ratesPage } = await loadPage('rates-gallery', `${BASE}/rates.html`);
  const ratesHeroGallery = await ratesPage.locator('.cms-gallery--hero').count();
  check('rates.html: 히어로 갤러리 슬라이더 생성', ratesHeroGallery >= 1, `${ratesHeroGallery}개`);
  await ratesPage.close();

  // package.html: pkg-hero-imgs + pkg-pork-imgs + pkg-seafood-imgs
  const { page: pkgPage } = await loadPage('pkg-gallery', `${BASE}/package.html`);
  const pkgHeroGallery = await pkgPage.locator('.cms-gallery--hero').count();
  check('package.html: 히어로 갤러리 슬라이더 생성', pkgHeroGallery >= 1, `${pkgHeroGallery}개`);
  const pkgCardGalleries = await pkgPage.locator('.pkg-card-img .cms-gallery').count();
  check('package.html: 패키지 카드 갤러리 >= 2', pkgCardGalleries >= 2, `${pkgCardGalleries}개`);
  await pkgPage.close();

  // facilities.html: fac-hero-imgs + fac-detail-1-imgs
  const { page: facPage } = await loadPage('fac-gallery', `${BASE}/facilities.html`);
  const facHeroGallery = await facPage.locator('.cms-gallery--hero').count();
  check('facilities.html: 히어로 갤러리 슬라이더 생성', facHeroGallery >= 1, `${facHeroGallery}개`);
  const facDetailGallery = await facPage.locator('.highlight-img-wrap .cms-gallery').count();
  check('facilities.html: 시설 상세 갤러리 >= 1', facDetailGallery >= 1, `${facDetailGallery}개`);
  await facPage.close();

  // attractions.html
  const { page: attrPage } = await loadPage('attr-gallery', `${BASE}/attractions.html`);
  const attrHeroGallery = await attrPage.locator('.cms-gallery--hero').count();
  check('attractions.html: 히어로 갤러리 슬라이더 생성', attrHeroGallery >= 1, `${attrHeroGallery}개`);
  await attrPage.close();

  // faq.html
  const { page: faqPage } = await loadPage('faq-gallery', `${BASE}/faq.html`);
  const faqHeroGallery = await faqPage.locator('.cms-gallery--hero').count();
  check('faq.html: 히어로 갤러리 슬라이더 생성', faqHeroGallery >= 1, `${faqHeroGallery}개`);
  await faqPage.close();

  // ═══════════════════════════════════════
  // TEST 3: 갤러리 네비게이션 동작
  // ═══════════════════════════════════════
  console.log('\n=== TEST 3: 갤러리 네비게이션 ===');

  const { page: navPage } = await loadPage('nav-test', `${BASE}/about.html`);

  // 히어로 갤러리의 다음 버튼 클릭
  const heroNextBtn = navPage.locator('.cms-gallery--hero .cms-gallery-next').first();
  if (await heroNextBtn.count() > 0) {
    await heroNextBtn.click();
    await navPage.waitForTimeout(300);
    const activeDot = await navPage.locator('.cms-gallery--hero .cms-gallery-dot.active').count();
    check('갤러리 네비게이션: 다음 버튼 클릭 후 활성 도트 존재', activeDot >= 1);

    const counter = await navPage.locator('.cms-gallery--hero .cms-gallery-counter').first().textContent();
    check('갤러리 네비게이션: 카운터 업데이트', counter && counter.includes('2'), `counter=${counter}`);
  } else {
    check('갤러리 네비게이션: 히어로 다음 버튼 존재', false, '버튼 없음');
  }

  // 도트 클릭
  const firstDot = navPage.locator('.cms-gallery--hero .cms-gallery-dot').first();
  if (await firstDot.count() > 0) {
    await firstDot.click();
    await navPage.waitForTimeout(300);
    const counter2 = await navPage.locator('.cms-gallery--hero .cms-gallery-counter').first().textContent();
    check('갤러리 네비게이션: 도트 클릭 후 첫 슬라이드 복원', counter2 && counter2.startsWith('1'), `counter=${counter2}`);
  }
  await navPage.close();

  // ═══════════════════════════════════════
  // TEST 4: 객실 갤러리 CMS 동적 교체
  // ═══════════════════════════════════════
  console.log('\n=== TEST 4: 객실 갤러리 CMS 동적 교체 ===');

  const { page: roomPage } = await loadPage('rooms-gallery', `${BASE}/rooms.html`);

  // 소나무방 갤러리 슬라이드 수 확인 (cms-data.json에 3장)
  const sonamuSlides = await roomPage.locator('[data-cms-room-gallery="room-gallery-sonamu"] .room-slide').count();
  check('rooms.html: 소나무방 갤러리 슬라이드 3장', sonamuSlides === 3, `${sonamuSlides}장`);

  // 튤립방 갤러리 슬라이드 수 확인 (cms-data.json에 3장)
  const tulipSlides = await roomPage.locator('[data-cms-room-gallery="room-gallery-tulip"] .room-slide').count();
  check('rooms.html: 튤립방 갤러리 슬라이드 3장', tulipSlides === 3, `${tulipSlides}장`);

  // 히어로 갤러리 확인
  const roomsHeroGallery = await roomPage.locator('.cms-gallery--hero').count();
  check('rooms.html: 히어로 갤러리 슬라이더 생성', roomsHeroGallery >= 1, `${roomsHeroGallery}개`);

  // 민트방 (1장만) → 갤러리 미변환, 슬라이드 1개만
  const mintSlides = await roomPage.locator('[data-cms-room-gallery="room-gallery-mint"] .room-slide').count();
  check('rooms.html: 민트방 1장 (정상 유지)', mintSlides === 1, `${mintSlides}장`);
  await roomPage.close();

  // ═══════════════════════════════════════
  // TEST 5: admin.html 갤러리 에디터
  // ═══════════════════════════════════════
  console.log('\n=== TEST 5: admin 갤러리 에디터 ===');

  const { page: adminPage, errors: adminErrors } = await loadPage('admin', `${BASE}/admin.html`);
  const passInput = adminPage.locator('input[type="password"]');
  if (await passInput.count() > 0) {
    await passInput.fill('threeway123');
    await adminPage.locator('button').filter({ hasText: /확인|로그인/ }).first().click();
    await adminPage.waitForTimeout(1000);
  }

  // 갤러리 에디터 리스트 존재 확인
  const galleryEditors = await adminPage.locator('.gallery-admin-list').count();
  check('admin: 갤러리 에디터 섹션 >= 10', galleryEditors >= 10, `${galleryEditors}개`);

  // 갤러리에 이미지 추가 버튼 존재
  const addImageBtns = await adminPage.locator('button').filter({ hasText: /이미지 추가/ }).count();
  check('admin: 이미지 추가 버튼 >= 10', addImageBtns >= 10, `${addImageBtns}개`);

  check('admin: 콘솔 에러 0', adminErrors.length === 0, adminErrors.length > 0 ? adminErrors.slice(0, 3).join('; ') : '');
  await adminPage.close();

  // ═══════════════════════════════════════
  // TEST 6: index.html 기존 기능 정상
  // ═══════════════════════════════════════
  console.log('\n=== TEST 6: 기존 기능 정상 동작 ===');

  const { page: indexPage } = await loadPage('index-existing', `${BASE}/index.html`);

  // 히어로 슬라이더 (기존 hero-slides 배열)
  const heroSlides = await indexPage.locator('#heroSlider .hero-slide').count();
  check('index.html: 히어로 슬라이더 슬라이드 >= 3', heroSlides >= 3, `${heroSlides}개`);

  // 객실 미리보기 카드
  const roomCards = await indexPage.locator('#roomPreviewList > a.card').count();
  check('index.html: 객실 미리보기 카드 >= 3', roomCards >= 3, `${roomCards}개`);

  // 시설 스크롤 카드
  const facScrollCards = await indexPage.locator('#facScrollList > .hscroll-card').count();
  check('index.html: 시설 스크롤 카드 >= 5', facScrollCards >= 5, `${facScrollCards}개`);

  // BBQ 하이라이트 갤러리 (bbq-highlight-imgs 3장)
  const bbqGallery = await indexPage.locator('.highlight-img-wrap .cms-gallery').count();
  check('index.html: BBQ 하이라이트 갤러리 생성', bbqGallery >= 1, `${bbqGallery}개`);
  await indexPage.close();

  // ═══════════════════════════════════════
  // 결과 요약
  // ═══════════════════════════════════════
  await browser.close();
  server.close();

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log('\n' + '='.repeat(50));
  console.log(`TOTAL: ${ok}/${results.length} passed (${(ok/results.length*100).toFixed(1)}%)`);
  if (fail > 0) {
    console.log('\nFAILED:');
    results.filter(r => !r.ok).forEach(r => console.log(`  \u2717 ${r.name}${r.detail ? ' \u2014 ' + r.detail : ''}`));
  }
  console.log('='.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
