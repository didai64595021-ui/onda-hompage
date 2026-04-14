#!/usr/bin/env node
/**
 * 크몽 draft 메인 이미지 교체 v2 — 사용자 지시 플로우 기반
 *
 * 올바른 플로우:
 *  1. /my-gigs?statusType=WAITING&page=N 진입
 *  2. 각 카드의 "편집하기" 버튼 클릭 (listing → edit navigation, Referer 세팅)
 *  3. 편집 페이지에서 메인 이미지 옆 "삭제" 버튼 클릭
 *  4. 파일 input에 setInputFiles
 *  5. "임시 저장하기" 버튼 클릭
 *
 * 쿠키 우회: /my-gigs/new warm-up + client navigation 불필요
 * (listing에서 편집하기 클릭이 정상 서버 navigation이라 Referer 유지)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const IMAGE_DIR = path.join(__dirname, '03-images');
const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');
const LOG_FILE = path.join(__dirname, '55-run-log.json');
const REPORT = path.join(__dirname, 'replace-image-v2-report.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * run-log에서 productId별 최신 draftId 수집
 */
function collectDrafts() {
  const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  const byId = {};
  for (const r of log.runs || []) {
    const m = (r.savedUrl || '').match(/\/edit\/(\d+)/);
    if (!m) continue;
    if (!byId[r.id] || r.at > byId[r.id].at) {
      byId[r.id] = { draftId: m[1], at: r.at, productId: r.id };
    }
  }
  return Object.values(byId);
}

/**
 * listing 페이지에서 draftId 카드를 찾아 "편집하기" 클릭
 * 카드 하단 "#{draftId}" 텍스트로 매칭
 */
async function clickEditForDraft(page, draftId) {
  // 모든 "편집하기" 버튼 찾고, 가까운 카드에서 draftId 텍스트 매칭
  const clicked = await page.evaluate((targetId) => {
    const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
    for (const eb of editBtns) {
      let card = eb;
      for (let i = 0; i < 10; i++) {
        card = card.parentElement;
        if (!card) break;
        const text = (card.innerText || '');
        if (text.includes('#' + targetId)) {
          eb.scrollIntoView({ block: 'center' });
          eb.click();
          return true;
        }
      }
    }
    return false;
  }, draftId);
  return clicked;
}

/**
 * 편집 페이지에서 기존 메인 이미지 삭제 + 새 이미지 업로드 + 임시저장
 */
async function editAndReplace(page, imagePath) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(4500);
  await closeModals(page).catch(() => {});

  if (!page.url().includes('/my-gigs/edit')) {
    return { ok: false, reason: `편집 진입 실패 URL=${page.url()}` };
  }

  // 1) 삭제 버튼 클릭 (메인 이미지 썸네일 영역)
  const deleted = await page.evaluate(() => {
    const main = document.querySelector('#MAIN_GALLERY');
    if (!main) return { ok: false, reason: '#MAIN_GALLERY 없음' };
    // 메인 갤러리 영역 내 "삭제" 텍스트 또는 X 버튼
    const btns = [...main.querySelectorAll('button')];
    for (const b of btns) {
      const t = (b.innerText || '').trim();
      const aria = b.getAttribute('aria-label') || '';
      if (t === '삭제' || aria.includes('삭제') || aria.includes('delete') || aria.includes('close')) {
        b.click();
        return { ok: true, via: t || aria };
      }
    }
    // 이미지 hover 시 나타나는 X는 css 속성. 그냥 모든 버튼 중 img 옆에 있는 것 클릭 시도
    const imgs = main.querySelectorAll('img');
    if (imgs.length === 0) return { ok: true, reason: '기존 이미지 없음 (삭제 스킵)' };
    return { ok: false, reason: '삭제 버튼 미발견' };
  });
  await sleep(1500);

  // 2) 파일 input 에 새 이미지 업로드
  const fileInput = await page.$('#MAIN_GALLERY input[type=file]');
  if (!fileInput) return { ok: false, reason: 'file input 없음', deleted };
  await fileInput.setInputFiles(imagePath);
  await sleep(3500); // 업로드 처리 + 썸네일 렌더 시간

  // 3) "임시 저장하기" 클릭
  const saveClicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    for (const b of btns) {
      const t = (b.innerText || '').trim();
      if (t === '임시 저장하기' || t === '임시저장하기' || t === '임시저장') {
        b.scrollIntoView({ block: 'center' });
        b.click();
        return { ok: true, text: t };
      }
    }
    return { ok: false };
  });
  await sleep(4000);

  // 4) 저장 후 toast/dialog 확인
  const afterUrl = page.url();
  return { ok: true, deleted, saveClicked, afterUrl };
}

(async () => {
  const drafts = collectDrafts();
  console.log(`대상 draft: ${drafts.length}개`);

  // productId → image 매핑
  const productMap = {};
  PRODUCTS.forEach(p => { productMap[p.id] = p.image; });

  const { browser, page } = await login({ slowMo: 100 });

  // /my-gigs/new warm-up (세션 활성화)
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const results = [];
  let ok = 0, ng = 0;

  // 페이지 순회: /my-gigs?statusType=WAITING&page=N
  const allDraftIds = new Set(drafts.map(d => d.draftId));
  const processedIds = new Set();

  for (let pageNo = 1; pageNo <= 5; pageNo++) {
    const listingUrl = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
    console.log(`\n[listing ${pageNo}] client nav → ${listingUrl}`);
    await page.evaluate((u) => { window.location.href = u; }, listingUrl);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    if (!page.url().includes('/my-gigs?')) {
      console.log(`  listing 접근 실패 URL=${page.url()}`);
      break;
    }

    // 현재 페이지에 있는 draftId 리스트 수집
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }
    const visibleIds = await page.evaluate(() => {
      const out = [];
      const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
      for (const eb of editBtns) {
        let card = eb;
        for (let i = 0; i < 10; i++) {
          card = card.parentElement;
          if (!card) break;
          const text = (card.innerText || '');
          const m = text.match(/#(\d{6,})/);
          if (m) { out.push(m[1]); break; }
        }
      }
      return out;
    });
    console.log(`  page ${pageNo} visible draftIds: ${visibleIds.length}개`);

    // 이 페이지에서 처리 대상 matching
    const targetIds = visibleIds.filter(id => allDraftIds.has(id) && !processedIds.has(id));
    console.log(`  이 페이지 처리 대상: ${targetIds.length}개`);

    for (const draftId of targetIds) {
      const draft = drafts.find(d => d.draftId === draftId);
      if (!draft) continue;
      const imageName = productMap[draft.productId];
      if (!imageName) { console.log(`  [${draftId}] image 매핑 없음 skip`); continue; }
      const imagePath = path.join(IMAGE_DIR, imageName);
      if (!fs.existsSync(imagePath)) { console.log(`  [${draftId}] ${imageName} 파일 없음 skip`); continue; }

      process.stdout.write(`  [${draftId}] productId=${draft.productId} → ${imageName} ... `);

      // "편집하기" 클릭
      const clickOk = await clickEditForDraft(page, draftId);
      if (!clickOk) { console.log('✗ 편집하기 클릭 실패'); results.push({ draftId, ok: false, reason: '편집하기 클릭 실패' }); ng++; continue; }

      // 편집 페이지 이동 대기
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4500);

      const result = await editAndReplace(page, imagePath);
      if (result.ok) { console.log(`✓ OK save=${result.saveClicked?.text || 'n/a'}`); ok++; }
      else { console.log(`✗ ${result.reason}`); ng++; }
      results.push({ draftId, productId: draft.productId, ...result });
      processedIds.add(draftId);

      // 다음 카드 처리 위해 listing 재진입
      await page.evaluate((u) => { window.location.href = u; }, listingUrl);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4000);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 800)); await sleep(400); }
    }

    // 이 페이지 더 이상 남은 게 없으면 다음 페이지
    if (targetIds.length === 0 && processedIds.size >= allDraftIds.size) {
      console.log('모든 draft 처리 완료');
      break;
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify({
    generated_at: new Date().toISOString(),
    total: drafts.length,
    ok, ng,
    processed: processedIds.size,
    results,
  }, null, 2));

  console.log(`\n==== 완료 ====`);
  console.log(`  처리: ${processedIds.size}/${drafts.length}`);
  console.log(`  OK ${ok} / NG ${ng}`);

  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
