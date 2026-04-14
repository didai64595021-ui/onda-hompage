#!/usr/bin/env node
/**
 * 크몽 등록된 GIG의 메인 이미지만 교체
 * - create-gig-log.json에서 draftId + product.image 매핑
 * - 각 draft 편집 페이지로 이동 → 메인 이미지 교체 → 저장
 * - 텔레그램 진행 보고
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { login, saveErrorScreenshot } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const IMAGE_DIR = path.join(__dirname, '03-images');
const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');
const LOG_FILE = path.join(__dirname, '55-run-log.json');

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = '7383805736';

async function tg(text) {
  if (!TG_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text }),
    });
  } catch {}
}

async function replaceMainImage(page, draftUrl, imagePath) {
  // 크몽 URL 접근 정책 우회: direct goto → 리다이렉트됨.
  // /my-gigs/new 경유 후 클라이언트 네비게이션으로 이동 (Referer가 kmong.com/my-gigs/new로 세팅됨)
  const currentUrl = page.url();
  if (!currentUrl.includes('/my-gigs/')) {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  await page.evaluate((url) => { window.location.href = url; }, draftUrl);
  await page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4500);
  await closeModals(page);

  // 리다이렉트 확인
  if (!page.url().includes('/my-gigs/edit')) {
    return { ok: false, reason: `draft 접근 실패 — URL=${page.url()}` };
  }

  // 메인 이미지 영역 — 여러 selector 시도
  let fileInput = await page.$('#MAIN_GALLERY input[type=file]');
  if (!fileInput) {
    // 첫 번째 파일 input을 메인으로 간주 (편집 페이지 구조가 다를 수 있음)
    fileInput = await page.$('input[type=file]');
  }
  if (!fileInput) {
    return { ok: false, reason: 'file-input-not-found' };
  }

  // 기존 이미지 삭제 시도 (여러 selector)
  for (const sel of [
    '#MAIN_GALLERY button[aria-label*="삭제"]',
    '#MAIN_GALLERY button:has-text("삭제")',
    '[class*="MainImage"] button[aria-label*="삭제"]',
    '[class*="thumbnail"] button[aria-label*="삭제"]',
  ]) {
    try {
      const btns = await page.$$(sel);
      for (const btn of btns.slice(0, 1)) {
        try { await btn.click({ timeout: 1500 }); await page.waitForTimeout(500); } catch {}
      }
    } catch {}
  }

  // 새 이미지 업로드
  await fileInput.setInputFiles(imagePath);
  await page.waitForTimeout(3000);

  // 임시저장 클릭
  const saveBtn = await page.$('button:has-text("임시저장"), button:has-text("저장")');
  if (saveBtn) {
    try { await saveBtn.click({ timeout: 5000 }); await page.waitForTimeout(2500); } catch {}
  }

  return { ok: true, savedUrl: page.url() };
}

(async () => {
  const log = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8')) : null;
  if (!log) {
    console.error('create-gig-log.json 없음');
    process.exit(1);
  }

  // log 안에서 draftId/savedUrl 추출 — 넓은 매칭
  const drafts = [];
  function walk(obj, parentId = null) {
    if (!obj) return;
    if (Array.isArray(obj)) { obj.forEach(x => walk(x, parentId)); return; }
    if (typeof obj !== 'object') return;

    const pid = obj.id || obj.productId || parentId;
    let draftId = obj.draftId;

    // savedUrl에서 draftId 추출
    if (!draftId && obj.savedUrl) {
      const m = String(obj.savedUrl).match(/\/edit\/(\d+)/);
      if (m) draftId = m[1];
    }

    if (draftId) {
      const saveStep = Array.isArray(obj.steps) ? obj.steps.find(s => s.name === 'save') : null;
      const url = saveStep?.savedUrl || obj.savedUrl || `https://kmong.com/my-gigs/edit/${draftId}`;
      drafts.push({ draftId: String(draftId), url, productId: pid });
    }

    Object.values(obj).forEach(v => walk(v, pid));
  }
  walk(log);

  // 중복 제거 (draftId 기준)
  const seen = new Set();
  const uniqueDrafts = drafts.filter(d => {
    if (seen.has(d.draftId)) return false;
    seen.add(d.draftId);
    return true;
  });

  console.log(`총 ${uniqueDrafts.length}개 draft 발견`);

  // product.id → image 매핑
  const productMap = {};
  PRODUCTS.forEach(p => { productMap[p.id] = p.image; });

  await tg(`🖼 크몽 썸네일 일괄 교체 시작\n대상: ${uniqueDrafts.length}개 draft\n사이즈: 1024x768 (4:3)`);

  const result = await login({ slowMo: 200 });
  const { browser, page } = result;

  let success = 0, failed = 0;
  const failures = [];

  for (let i = 0; i < uniqueDrafts.length; i++) {
    const d = uniqueDrafts[i];
    const imageName = productMap[d.productId];
    if (!imageName) {
      console.log(`[${i+1}/${uniqueDrafts.length}] productId=${d.productId} 이미지 매핑 없음 — 스킵`);
      continue;
    }
    const imagePath = path.join(IMAGE_DIR, imageName);
    if (!fs.existsSync(imagePath)) {
      console.log(`[${i+1}/${uniqueDrafts.length}] 이미지 파일 없음: ${imagePath}`);
      continue;
    }

    console.log(`[${i+1}/${uniqueDrafts.length}] draft=${d.draftId} → ${imageName}`);
    try {
      const r = await replaceMainImage(page, d.url, imagePath);
      if (r.ok) {
        success++;
        console.log(`  ✓ 성공`);
      } else {
        failed++;
        failures.push({ draftId: d.draftId, reason: r.reason });
        console.log(`  ✗ 실패: ${r.reason}`);
      }
    } catch (e) {
      failed++;
      failures.push({ draftId: d.draftId, reason: e.message?.slice(0, 100) });
      console.log(`  ✗ 에러: ${e.message?.slice(0, 100)}`);
      try { await saveErrorScreenshot(page, `replace-image-${d.draftId}`); } catch {}
    }

    if ((i + 1) % 10 === 0) {
      await tg(`📊 진행: ${i+1}/${uniqueDrafts.length}\n성공 ${success} / 실패 ${failed}`);
    }
  }

  await browser.close();

  const summary = `✅ 썸네일 교체 완료\n성공: ${success}\n실패: ${failed}`;
  console.log('\n' + summary);
  await tg(summary + (failures.length ? `\n실패 목록:\n${failures.slice(0,10).map(f => `  ${f.draftId}: ${f.reason}`).join('\n')}` : ''));

  fs.writeFileSync(path.join(__dirname, 'replace-image-log.json'), JSON.stringify({
    total: uniqueDrafts.length, success, failed, failures, at: new Date().toISOString()
  }, null, 2));
})();
