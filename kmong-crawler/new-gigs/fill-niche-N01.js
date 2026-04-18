/**
 * N01 (아임웹 이사) draft 전체 재채움
 *
 * 기존 draft 764200 의 빈 필드를 한 번에 모두 채움:
 *  1) SPA warm-up + edit URL nav (direct URL 리다이렉트 우회)
 *  2) fillStep2 — 본문/패키지/메인이미지/기본 select (probeOnly=true: 저장 안함)
 *  3) fillExtraSelects — 업종/카테고리/플러그인 설치 x3
 *  4) fillRevision — 수정 및 재진행 안내
 *  5) fillSubGallery — 상세 이미지 3장
 *  6) 임시저장 한 번만
 *
 * 사용법: node fill-niche-N01.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');
const {
  fillStep2, fillRevision, fillSubGallery, fillExtraSelects,
} = require('./create-gig.js');

// create-gig.js가 discoverSelects를 export하지 않음 — 인라인 복제
async function discoverSelects(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[id^="react-select-"]').forEach(el => {
      if (!el.id.endsWith('-input')) return;
      let label = '';
      let cur = el;
      for (let i = 0; i < 12 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const ps = [...cur.querySelectorAll(':scope > p, :scope > div > p, :scope > label')];
        for (const p of ps) {
          const t = (p.innerText || '').trim().replace(/\*\s*$/, '').trim();
          if (t && t.length < 40 && t !== '편집' && t !== '변경하기') {
            label = t;
            break;
          }
        }
        if (label) break;
      }
      out.push({ inputId: el.id, label });
    });
    return out;
  });
}

const { PRODUCTS } = (() => {
  const m = require('./gig-data-niches.js');
  // gig-data-niches.js는 module.exports 없으면 PRODUCTS 상수만 존재
  // 로드 패턴: fs로 읽어서 eval
  return m;
})();

const { EXTRA } = require('./gig-data-niches-extra.js');

const IMAGE_DIR = path.join(__dirname, '03-images');
const SNAPSHOT_DIR = path.join(__dirname, 'screenshots');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function snap(page, name) {
  const p = path.join(SNAPSHOT_DIR, `${name}.png`);
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function main() {
  const productId = 'N01';
  const product = (PRODUCTS || []).find(p => p.id === productId);
  const extra = EXTRA[productId];

  if (!product) { console.error(`PRODUCTS에서 ${productId} 미발견`); process.exit(1); }
  if (!extra) { console.error(`EXTRA에서 ${productId} 미발견`); process.exit(1); }

  const editUrl = `https://kmong.com/my-gigs/edit/${extra.draftId}?rootCategoryId=6&subCategoryId=${extra.subCategoryId}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[fill-N01] ${product.title}`);
  console.log(`[fill-N01] draft=${extra.draftId} url=${editUrl}`);
  console.log(`${'='.repeat(60)}\n`);

  const { browser, page } = await login({ slowMo: 100 });
  const log = { at: new Date().toISOString(), id: productId, steps: [], errors: [] };

  try {
    // 1) warm-up + SPA nav
    console.log('[1] warm-up /my-gigs/new');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    console.log(`[2] SPA nav → ${editUrl}`);
    await page.evaluate((u) => { window.location.href = u; }, editUrl);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);
    await snap(page, `gig-N01-fill-initial`);

    // 2) fillStep2 (probeOnly=true: 저장 안함)
    console.log('\n[3] fillStep2 (저장 안함)');
    const s2 = await fillStep2(page, product, { probeOnly: true });
    log.steps.push({ name: 'fillStep2', ok: s2.ok });
    console.log(`   fillStep2 result: ok=${s2.ok}`);

    // 3) discoverSelects 재실행 (추가 select 탐색)
    console.log('\n[4] discoverSelects 재실행 (추가 select)');
    await sleep(2000);
    const selectMap = await discoverSelects(page);
    console.log(`   selects: ${selectMap.length}개`);
    selectMap.forEach(s => console.log(`     ${s.inputId} → "${s.label}"`));

    // 4) fillExtraSelects
    console.log('\n[5] fillExtraSelects (업종/카테고리/플러그인)');
    const esRes = await fillExtraSelects(page, selectMap, extra.extraSelects);
    log.steps.push({ name: 'fillExtraSelects', ...esRes });
    console.log(`   ok=${esRes.okCount}/${esRes.total}`);

    // 5) fillRevision
    console.log('\n[6] fillRevision');
    const rRes = await fillRevision(page, extra.revision);
    log.steps.push({ name: 'fillRevision', ok: rRes.ok });

    // 6) fillSubGallery
    console.log('\n[7] fillSubGallery (상세 이미지 3장)');
    const galleryPaths = extra.gallery.map(f => path.join(IMAGE_DIR, f));
    const gRes = await fillSubGallery(page, galleryPaths);
    log.steps.push({ name: 'fillSubGallery', ...gRes });

    await snap(page, `gig-N01-fill-all-done`);

    // 저장 전 React state commit 안정화 — 여러 번 blur 이벤트
    console.log('\n[8a] React state commit 안정화 (blur + wait)');
    await page.evaluate(() => {
      // 활성 요소 blur
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      // 모든 input/textarea blur event dispatch
      document.querySelectorAll('input, textarea').forEach(el => {
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await sleep(3000);

    // 7) 임시 저장 — save 버튼 여러 개일 수 있음, 모두 찾아서 last 클릭
    console.log('\n[8b] "임시 저장하기" 버튼 위치 확인');
    const saveButtons = page.locator('button:has-text("임시 저장하기")');
    const cnt = await saveButtons.count();
    console.log(`   버튼 ${cnt}개 발견`);
    if (cnt === 0) {
      log.steps.push({ name: 'save', ok: false, error: '임시 저장 버튼 미발견' });
      log.errors.push('임시 저장 버튼 미발견');
    } else {
      // 가장 아래(Step2 하단) 버튼 — last 가 보통 정답
      const saveBtn = saveButtons.last();
      await saveBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await sleep(1000);
      await snap(page, `gig-N01-fill-before-save`);

      // network 응답 감지 활성화
      const savePromise = page.waitForResponse(
        (resp) => resp.url().includes('my-gigs') && ['POST', 'PUT', 'PATCH'].includes(resp.request().method()),
        { timeout: 15000 }
      ).catch(() => null);

      console.log('   저장 버튼 클릭');
      await saveBtn.click({ force: true });
      const resp = await savePromise;
      if (resp) {
        console.log(`   API 응답: ${resp.status()} ${resp.url()}`);
        log.steps.push({ name: 'save-api', status: resp.status(), url: resp.url() });
      } else {
        console.log(`   ⚠ 저장 API 응답 감지 실패 (15s 타임아웃)`);
      }
      await sleep(5000);
      await snap(page, `gig-N01-fill-saved`);

      // 8) persist 검증 — 같은 페이지 reload 후 dump
      console.log('\n[9] reload 후 persist 검증');
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await sleep(5000);
      const verify = await page.evaluate(() => {
        const pms = [...document.querySelectorAll('.ProseMirror')].map(el => (el.innerText || '').trim().length);
        const ffImg = document.querySelectorAll('[id*="GALLERY"] img').length;
        const pkgTA = [...document.querySelectorAll('textarea')].filter(t => t.name && t.name.includes('packageValue') && !!t.value).length;
        return { descLens: pms, galleryImages: ffImg, packageFilled: pkgTA };
      });
      console.log(`   verify: descLens=${verify.descLens.join(',')} images=${verify.galleryImages} pkgFilled=${verify.packageFilled}/6`);
      log.steps.push({ name: 'verify-after-reload', ...verify });
      await snap(page, `gig-N01-fill-after-reload`);

      const persisted = verify.descLens.some(l => l > 10) && verify.packageFilled >= 3;
      log.steps.push({ name: 'save', ok: persisted, savedUrl: page.url(), persisted });
      console.log(persisted ? `   ✓ 저장 persist 확인` : `   ✗ 저장 persist 실패 — 데이터 유실`);
    }

    fs.writeFileSync(path.join(__dirname, 'fill-niche-N01-log.json'), JSON.stringify(log, null, 2));
    console.log('\n✅ fill-niche-N01 완료');
    console.log(JSON.stringify(log, null, 2));
  } catch (e) {
    console.error(`✗ FATAL: ${e.message}`);
    console.error(e.stack);
    log.errors.push(e.message);
    fs.writeFileSync(path.join(__dirname, 'fill-niche-N01-log.json'), JSON.stringify(log, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(e => { console.error('UNCAUGHT:', e); process.exit(1); });
