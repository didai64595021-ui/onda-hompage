#!/usr/bin/env node
/**
 * Phase 8D-3 — 6개 draft 제목·이미지·본문 교체 RPA
 *  - improve-drafts-plan.json (새 제목/본문/…) + 03-images-improved/{slug}.png
 *  - 각 draft edit URL 진입 (Referer + direct nav 우회 — KMONG_CONTEXT 8-A)
 *  - 제목 input clear + 새 제목 입력
 *  - 메인 이미지 기존 삭제 → 새 이미지 업로드
 *  - TipTap 본문 Ctrl+A → Delete → keyboard.type (innerHTML 금지)
 *  - "임시 저장" 버튼 클릭
 *  - 성공/실패 텔레그램 보고
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const PLAN_PATH = path.join(__dirname, 'improve-drafts-plan.json');
const IMG_DIR = path.join(__dirname, '03-images-improved');
const OUT_PATH = path.join(__dirname, 'overwrite-drafts-log.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function tg(msg) {
  try { spawnSync('node', ['/home/onda/scripts/telegram-sender.js', msg], { stdio: 'ignore' }); } catch {}
}

async function overwriteDraft(page, plan, imgPath) {
  const url = plan.edit_url;
  if (!url || !url.includes('/edit/')) throw new Error(`invalid edit_url: ${url}`);

  console.log(`  [1/5] 우회 진입 (Referer + direct nav)`);
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await closeModals(page).catch(() => {});
  await page.evaluate((u) => { window.location.href = u; }, url);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(2000);
  const cur = page.url();
  if (!cur.includes('/edit/')) throw new Error(`URL 리다이렉트: ${cur.slice(0, 60)}`);

  // [2/5] 제목 수정
  console.log(`  [2/5] 제목 수정: "${plan.new_title}"`);
  const titleInput = page.locator('input[placeholder*="제목"], input[name*="title"], [id*="TITLE"] input').first();
  await titleInput.waitFor({ state: 'visible', timeout: 10000 });
  await titleInput.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await titleInput.fill(plan.new_title);
  await sleep(500);

  // [3/5] 메인 이미지 교체
  console.log(`  [3/5] 메인 이미지 업로드: ${path.basename(imgPath)}`);
  if (!fs.existsSync(imgPath)) throw new Error(`이미지 없음: ${imgPath}`);
  // 기존 이미지 삭제 버튼 (x / 삭제)
  const existingDel = page.locator('button[aria-label*="삭제"], [class*="delete"], [class*="remove"]').filter({ hasText: /삭제|×|X/ });
  if ((await existingDel.count()) > 0) {
    try { await existingDel.first().click(); await sleep(800); } catch {}
  }
  // 파일 input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(imgPath);
  await sleep(3000);

  // [4/5] TipTap 본문 교체 (#DESCRIPTION)
  console.log(`  [4/5] 본문 교체 (${(plan.new_description || '').length}자)`);
  const descContainer = page.locator('#DESCRIPTION .ProseMirror, [id*="DESCRIPTION"] [contenteditable="true"]').first();
  await descContainer.waitFor({ state: 'visible', timeout: 10000 });
  await descContainer.click();
  await sleep(300);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await sleep(300);
  // 긴 본문은 나눠서 타이핑 (이벤트 방해 회피)
  const desc = String(plan.new_description || '').slice(0, 19000);
  const chunkSize = 500;
  for (let i = 0; i < desc.length; i += chunkSize) {
    await page.keyboard.type(desc.slice(i, i + chunkSize), { delay: 2 });
  }
  await sleep(1000);

  // [5/5] 임시 저장
  console.log(`  [5/5] 임시 저장 클릭`);
  const saveBtn = page.locator('button:has-text("임시 저장"), button:has-text("임시저장")').first();
  await saveBtn.click({ timeout: 10000 });
  await sleep(4000);
  const finalUrl = page.url();

  return { ok: true, final_url: finalUrl, draft_id: finalUrl.match(/\/edit\/(\d+)/)?.[1] || plan.draft_id };
}

(async () => {
  if (!fs.existsSync(PLAN_PATH)) { console.error(`plan 파일 없음: ${PLAN_PATH}`); process.exit(1); }
  const { plans } = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf-8'));
  console.log(`▶ ${plans.length}개 draft 제목·이미지·본문 교체 시작`);
  tg(`🔄 Phase 8D-3 시작 — ${plans.length}개 draft 제목·이미지·본문 교체`);

  let browser;
  const log = { at: new Date().toISOString(), results: [] };

  try {
    const r = await login({ slowMo: 120 });
    browser = r.browser;
    const page = r.page;
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const imgPath = path.join(IMG_DIR, `${plan.slug}.png`);
      console.log(`\n[${i + 1}/${plans.length}] ${plan.slug} — "${plan.new_title}"`);

      const start = Date.now();
      try {
        const res = await overwriteDraft(page, plan, imgPath);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        log.results.push({ slug: plan.slug, ok: true, draft_id: res.draft_id, elapsed_sec: +elapsed });
        console.log(`  ✅ 완료 (${elapsed}s)`);
        tg(`✅ [${i + 1}/${plans.length}] ${plan.slug}\n"${plan.new_title}" draft #${res.draft_id} (${elapsed}s)`);
      } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        log.results.push({ slug: plan.slug, ok: false, error: e.message, elapsed_sec: +elapsed });
        console.log(`  ❌ 실패: ${e.message}`);
        tg(`❌ [${i + 1}/${plans.length}] ${plan.slug} 실패\n${e.message.slice(0, 150)}`);
      }
      fs.writeFileSync(OUT_PATH, JSON.stringify(log, null, 2));

      if (i < plans.length - 1) {
        await sleep(20000);  // 20초 간격
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const ok = log.results.filter(r => r.ok).length;
  const fail = log.results.length - ok;
  const report = `🏁 Phase 8D-3 완료 — ✅ ${ok} / ❌ ${fail}\n결과: ${OUT_PATH}`;
  console.log('\n' + report);
  tg(report);
})();
