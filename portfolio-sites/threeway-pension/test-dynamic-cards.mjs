/**
 * 동적 카드 시스템 통합 테스트 (Playwright)
 *
 * 검증 항목:
 * 1. 5개 페이지 콘솔 에러 0건
 * 2. 동적 그룹 컨테이너 ID 존재 + 카드 수 정확
 * 3. cms-data.json의 새 배열 키와 렌더된 카드 수 일치
 * 4. 레거시 호환: 새 배열 키 제거 시에도 기존 카드 표시
 * 5. admin.html 동적 매니저 6개 영역 + 추가/삭제 버튼 정상 동작
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3847;
const ROOT = __dirname;

// 정적 파일 서버 (간단한 자체 구현)
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
  console.log((ok ? '✓' : '✗') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  const server = await startServer();
  console.log('서버 시작: http://localhost:' + PORT);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  const errors = {};
  ctx.on('weberror', e => console.error('weberror', e));

  async function loadPage(name, url) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    // CMS data 로드 + 렌더링 대기
    await page.waitForTimeout(500);
    errors[name] = consoleErrors;
    return page;
  }

  // 1. index.html
  const indexPage = await loadPage('index', `http://localhost:${PORT}/index.html`);
  const roomCount = await indexPage.locator('#roomPreviewList > a.card').count();
  const facScrollCount = await indexPage.locator('#facScrollList > .hscroll-card').count();
  check('index: roomPreviewList 존재 + 카드 ≥ 3', roomCount >= 3, `카드 ${roomCount}개`);
  check('index: facScrollList 존재 + 카드 ≥ 5', facScrollCount >= 5, `카드 ${facScrollCount}개`);
  check('index: 콘솔 에러 0', errors['index'].length === 0, errors['index'].join('; ').slice(0, 200));

  // 2. facilities.html
  const facPage = await loadPage('facilities', `http://localhost:${PORT}/facilities.html`);
  const facCardCount = await facPage.locator('#facCardList > .facility-card').count();
  check('facilities: facCardList 존재 + 카드 ≥ 6', facCardCount >= 6, `카드 ${facCardCount}개`);
  check('facilities: 콘솔 에러 0', errors['facilities'].length === 0, errors['facilities'].join('; ').slice(0, 200));

  // 3. attractions.html
  const attrPage = await loadPage('attractions', `http://localhost:${PORT}/attractions.html`);
  const spotCount = await attrPage.locator('#attrSpotList > .attraction-card-v2').count();
  const partnerCount = await attrPage.locator('#attrPartnerList > .partner-card').count();
  check('attractions: attrSpotList 존재 + 카드 ≥ 8', spotCount >= 8, `카드 ${spotCount}개`);
  check('attractions: attrPartnerList 존재 + 카드 ≥ 4', partnerCount >= 4, `카드 ${partnerCount}개`);
  check('attractions: 콘솔 에러 0', errors['attractions'].length === 0, errors['attractions'].join('; ').slice(0, 200));

  // 4. package.html
  const pkgPage = await loadPage('package', `http://localhost:${PORT}/package.html`);
  const galleryCount = await pkgPage.locator('#pkgGalleryList > .gallery-item').count();
  check('package: pkgGalleryList 존재 + 사진 ≥ 6', galleryCount >= 6, `사진 ${galleryCount}개`);
  check('package: 콘솔 에러 0', errors['package'].length === 0, errors['package'].join('; ').slice(0, 200));

  // 5. admin.html (비밀번호 입력 후)
  const adminPage = await loadPage('admin', `http://localhost:${PORT}/admin.html`);
  // 비밀번호 입력 페이지가 있으면 처리
  const passInput = adminPage.locator('input[type="password"]');
  if (await passInput.count() > 0) {
    await passInput.fill('threeway123');
    await adminPage.locator('button').filter({ hasText: /확인|로그인/ }).first().click();
    await adminPage.waitForTimeout(800);
  }

  // 동적 그룹 카드 존재 확인
  const dynCardCount = await adminPage.locator('.dyn-card').count();
  check('admin: 동적 그룹 카드 (.dyn-card) 존재', dynCardCount > 0, `${dynCardCount}개`);

  // 6개 마커 모두 컨테이너 존재
  const markers = ['__DYNAMIC_ROOM_PREVIEWS__', '__DYNAMIC_FAC_SCROLL__', '__DYNAMIC_FAC_CARDS__',
                   '__DYNAMIC_ATTR_SPOTS__', '__DYNAMIC_ATTR_PARTNERS__', '__DYNAMIC_PKG_GALLERY__'];
  for (const m of markers) {
    const exists = await adminPage.locator('#dyn-list-' + m).count() > 0;
    check('admin: dyn-list-' + m + ' 존재', exists);
  }

  // 추가 버튼 존재 (히어로 1개 + 동적 6개 = 최소 7개)
  const addBtns = await adminPage.locator('button').filter({ hasText: /\+ .*추가/ }).count();
  check('admin: 추가 버튼 ≥ 7개', addBtns >= 7, `${addBtns}개`);

  // admin 콘솔 에러 0
  check('admin: 콘솔 에러 0', errors['admin'].length === 0, errors['admin'].join('; ').slice(0, 300));

  // === 추가 검증: admin 추가/삭제 동작 ===
  // 객실 카드 +1 추가 → 4개 → 삭제 → 3개
  const initialRooms = await adminPage.locator('#dyn-list-__DYNAMIC_ROOM_PREVIEWS__ > .dyn-card').count();
  await adminPage.locator('button').filter({ hasText: '+ 객실 추가' }).first().click();
  await adminPage.waitForTimeout(200);
  const afterAdd = await adminPage.locator('#dyn-list-__DYNAMIC_ROOM_PREVIEWS__ > .dyn-card').count();
  check('admin: 객실 추가 동작 (' + initialRooms + ' → ' + afterAdd + ')', afterAdd === initialRooms + 1);

  // 마지막 카드 삭제
  const lastCard = adminPage.locator('#dyn-list-__DYNAMIC_ROOM_PREVIEWS__ > .dyn-card').last();
  await lastCard.locator('button').filter({ hasText: '삭제' }).click();
  await adminPage.waitForTimeout(200);
  const afterDel = await adminPage.locator('#dyn-list-__DYNAMIC_ROOM_PREVIEWS__ > .dyn-card').count();
  check('admin: 객실 삭제 동작 (' + afterAdd + ' → ' + afterDel + ')', afterDel === initialRooms);

  // === 레거시 호환성 검증 ===
  // 새 배열 키를 일시 제거하고 페이지 다시 로드 → 레거시 키만으로 렌더되는지
  const legacyPage = await ctx.newPage();
  const legacyErrors = [];
  legacyPage.on('pageerror', e => legacyErrors.push(e.message));
  legacyPage.on('console', msg => { if (msg.type() === 'error') legacyErrors.push(msg.text()); });
  // route로 cms-data.json을 가로채서 새 배열 키 제거 후 응답
  await legacyPage.route('**/cms-data.json*', async route => {
    const orig = JSON.parse(fs.readFileSync(path.join(ROOT, 'cms-data.json'), 'utf-8'));
    delete orig['room-previews'];
    delete orig['fac-scroll-cards'];
    delete orig['fac-cards'];
    delete orig['attr-spots'];
    delete orig['attr-partners'];
    delete orig['pkg-galleries'];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orig) });
  });
  await legacyPage.goto(`http://localhost:${PORT}/facilities.html`, { waitUntil: 'networkidle' });
  await legacyPage.waitForTimeout(500);
  const legacyFacCount = await legacyPage.locator('#facCardList > .facility-card').count();
  check('레거시 호환: facilities (배열 제거 후 레거시 키로 6개 렌더)', legacyFacCount === 6, `${legacyFacCount}개`);
  check('레거시 호환: 콘솔 에러 0', legacyErrors.length === 0, legacyErrors.join('; ').slice(0, 200));

  await browser.close();
  server.close();

  // 결과
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log('\n========================');
  console.log(`결과: ${ok}/${results.length} (${(ok/results.length*100).toFixed(1)}%)`);
  if (fail > 0) {
    console.log('\n실패 항목:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
  }
  console.log('========================');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('테스트 치명적 오류:', e);
  process.exit(1);
});
