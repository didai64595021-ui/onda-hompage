#!/usr/bin/env node
/**
 * 크몽 메인이미지 업로드 v5 — 직진(direct nav + Referer) + 4중 검증
 *
 * v1~v4 실패 원인 (2026-04-15 진단):
 *   clickEditForDraft() 의 ancestor-walk 매칭이 잘못됨 — 모든 카드가 공통 부모 공유 시
 *   walk-up 첫 번째 ancestor 에 모든 draft ID 텍스트가 포함되어 첫 "편집하기" 버튼을
 *   잘못 클릭. 22건이 사실상 한 번도 방문되지 않음.
 *
 * v5 전략:
 *   1) listing 우회 — page.setExtraHTTPHeaders({ Referer: '/my-gigs/new' })
 *      + warm-up + page.goto direct URL
 *   2) URL 검증 — 진입 후 /edit/{targetDraftId} 일치 확인. 불일치 시 즉시 SKIP
 *   3) lib/upload-verifier — DOM count + img src + network XHR + (옵션) vision 4중
 *   4) 임시저장 → 페이지 리로드 → 재검증 (count + img 영속 확인)
 *
 * 사용:
 *   node replace-image-v5.js                  # 22건 전부
 *   node replace-image-v5.js --only=29,39     # productId 필터
 *   node replace-image-v5.js --vision         # vision LLM 추가 검증
 *   node replace-image-v5.js --dry            # 업로드 시도하되 결과 저장 안 함
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');
const { createUploadVerifier } = require('../lib/upload-verifier');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const argv = process.argv.slice(2);
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);
const USE_VISION = argv.includes('--vision');
const DRY = argv.includes('--dry');
const DRAFTS_PATH = argv.find(a => a.startsWith('--drafts='))?.replace('--drafts=', '')
  || path.join(__dirname, 'drafts-22-to-upload.json');

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(__dirname, 'diag-out', `v5-${TS}`);
fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT = path.join(__dirname, 'replace-image-v5-report.json');

(async () => {
  if (!fs.existsSync(DRAFTS_PATH)) {
    console.error(`drafts file not found: ${DRAFTS_PATH}`); process.exit(2);
  }
  let drafts = JSON.parse(fs.readFileSync(DRAFTS_PATH, 'utf-8'));
  if (ONLY.length) drafts = drafts.filter(d => ONLY.includes(String(d.productId)));
  console.log(`대상: ${drafts.length}건${ONLY.length ? ` (--only=${ONLY.join(',')})` : ''} | vision=${USE_VISION} | dry=${DRY}`);
  console.log(`OUT_DIR: ${OUT_DIR}`);

  const { browser, page } = await login({ slowMo: 80 });

  // 1) warm-up
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);

  // 2) Referer header — 이후 page.goto 시 자동 첨부
  await page.setExtraHTTPHeaders({ 'Referer': 'https://kmong.com/my-gigs/new' });

  const verifier = createUploadVerifier(page, { useVision: USE_VISION });
  console.log(`vision available: ${verifier.visionAvailable}`);

  const results = [];
  let ok = 0, ng = 0;

  for (const d of drafts) {
    const tag = `${d.productId}-${d.draftId}`;
    process.stdout.write(`\n[${tag}] ${d.label || d.image} → `);
    const imagePath = path.join(__dirname, '03-images', d.image);
    if (!fs.existsSync(imagePath)) { console.log(`✗ image not found ${d.image}`); ng++; results.push({ ...d, ok: false, reason: 'image not found' }); continue; }

    // 3) direct nav with Referer
    try {
      await page.goto(d.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.log(`✗ goto err ${e.message.slice(0, 80)}`); ng++; results.push({ ...d, ok: false, reason: `goto: ${e.message}` }); continue;
    }
    await sleep(4000);
    await closeModals(page).catch(() => {});

    // 4) URL 검증
    const cur = page.url();
    if (!cur.includes(`/edit/${d.draftId}`)) {
      console.log(`✗ wrong page url=${cur.slice(0, 80)}`);
      ng++; results.push({ ...d, ok: false, reason: 'wrong page after goto', url: cur });
      continue;
    }

    // 5) MAIN_GALLERY scroll
    await page.evaluate(() => {
      const g = document.querySelector('#MAIN_GALLERY');
      if (g) g.scrollIntoView({ block: 'center' });
    }).catch(() => {});
    await sleep(2000);

    // 6) 업로드 + 4중 검증
    const verifyOut = await verifier.runUpload({
      imagePath,
      targetDraftId: d.draftId,
      waitMs: 12000,
      screenshotDir: OUT_DIR,
    });

    if (!verifyOut.ok) {
      console.log(`✗ upload fail: ${verifyOut.reasons.join('; ')}`);
      ng++; results.push({ ...d, ok: false, verify: verifyOut });
      continue;
    }

    if (DRY) {
      console.log(`✓ upload ok (DRY — save skipped) sigs=${JSON.stringify(verifyOut.signals.evaluation)}`);
      ok++; results.push({ ...d, ok: true, dry: true, verify: verifyOut });
      continue;
    }

    // 7) 임시 저장
    const saveRes = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      for (const b of btns) {
        const t = (b.innerText || '').trim();
        if (t === '임시 저장하기' || t === '임시저장하기' || t === '임시저장') {
          b.scrollIntoView({ block: 'center' }); b.click();
          return { ok: true, text: t };
        }
      }
      return { ok: false };
    });
    await sleep(6000);

    // 8) 저장 후 재진입 검증 — 페이지 리로드해서 영속 확인
    await page.goto(d.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await sleep(4000);
    await page.evaluate(() => {
      const g = document.querySelector('#MAIN_GALLERY');
      if (g) g.scrollIntoView({ block: 'center' });
    }).catch(() => {});
    await sleep(1500);
    const final = await verifier.readDomState(page, '#MAIN_GALLERY');
    const counterStr = final.counters?.[0] || '';
    const m = counterStr.match(/(\d+)\s*\/\s*(\d+)/);
    const finalCurrent = m ? parseInt(m[1], 10) : -1;
    const persisted = finalCurrent > 0 && (final.imgs?.length || 0) > 0;

    if (persisted) {
      console.log(`✓ saved ${counterStr} imgs=${final.imgs.length} src=${final.imgs[0]?.src.slice(0, 60)}`);
      ok++; results.push({ ...d, ok: true, verify: verifyOut, save: saveRes, final: { counterStr, imgs: final.imgs.length } });
    } else {
      console.log(`✗ NOT persisted after save: ${counterStr} imgs=${final.imgs?.length || 0}`);
      ng++; results.push({ ...d, ok: false, reason: 'not persisted after save', verify: verifyOut, save: saveRes, final });
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, results }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ generated_at: new Date().toISOString(), total: drafts.length, ok, ng, results }, null, 2));
  console.log(`\n==== v5 완료 ====\n  OK ${ok} / NG ${ng}\n  report: ${REPORT}\n  diag : ${OUT_DIR}`);
  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
