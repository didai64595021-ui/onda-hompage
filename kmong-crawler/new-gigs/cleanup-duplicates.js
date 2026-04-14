#!/usr/bin/env node
/**
 * 크몽 WAITING 탭 중복·잉여 draft 정리
 *  - 55-run-log.json에서 상품별 latest draftId 55개 추출 → KEEP 리스트
 *  - WAITING 탭 전수 조사 → KEEP에 없는 draft 삭제
 *
 * 안전장치:
 *  - 기본 dry-run, --execute 명시해야 실제 삭제
 *  - SELLING 탭 건드리지 않음
 *  - 최대 삭제 한도 50개
 *  - 55개 KEEP 리스트가 실제로 존재하지 않으면 abort
 *
 * 사용: node cleanup-duplicates.js          # dry-run
 *       node cleanup-duplicates.js --execute # 실제 삭제
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const isExecute = args.includes('--execute');

const MAX_PAGES = 10;
const MAX_DELETES = 50;
const REPORT = path.join(__dirname, 'cleanup-duplicates-report.json');

function buildKeepList() {
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '55-run-log.json'), 'utf-8'));
  const byId = {};
  for (const r of log.runs || []) {
    const m = (r.savedUrl || '').match(/\/edit\/(\d+)/);
    if (!m) continue;
    if (!byId[r.id] || r.at > byId[r.id].at) {
      byId[r.id] = { draftId: m[1], productId: r.id, at: r.at };
    }
  }
  return Object.values(byId);
}

async function collectAllVisibleDrafts(page) {
  const all = [];
  const seen = new Set();
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const url = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
    await page.evaluate((u) => { window.location.href = u; }, url);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await sleep(4000);
    for (let i = 0; i < 4; i++) { await page.evaluate(() => window.scrollBy(0, 1200)); await sleep(300); }

    const drafts = await page.evaluate(() => {
      const editBtns = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === '편집하기');
      const out = [];
      for (const eb of editBtns) {
        let card = eb;
        for (let i = 0; i < 10; i++) {
          card = card.parentElement;
          if (!card) break;
          const r = card.getBoundingClientRect();
          if (card.querySelector('img') && r.height > 80 && r.height < 250) break;
        }
        if (!card) continue;
        const text = (card.innerText || '').trim();
        const m = text.match(/#(\d{6,})/);
        if (!m) continue;
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        const title = lines.find((l) => l.length > 8 && l.length < 80 && !/^#|판매중|승인|편집|임시|^\d+$/.test(l)) || '';
        out.push({ id: m[1], title: title.slice(0, 60) });
      }
      return out;
    });

    let newCount = 0;
    for (const d of drafts) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      all.push({ ...d, page: pageNo });
      newCount++;
    }
    console.log(`  [page ${pageNo}] visible=${drafts.length} new=${newCount} total=${all.length}`);
    if (newCount === 0) break;
  }
  return all;
}

async function deleteDraftById(page, targetId) {
  const opened = await page.evaluate((id) => {
    const editBtns = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === '편집하기');
    for (const eb of editBtns) {
      let card = eb;
      for (let i = 0; i < 10; i++) {
        card = card.parentElement;
        if (!card) break;
        const r = card.getBoundingClientRect();
        if (card.querySelector('img') && r.height > 80 && r.height < 250) break;
      }
      if (!card) continue;
      const text = (card.innerText || '').trim();
      const m = text.match(/#(\d{6,})/);
      if (!m || m[1] !== id) continue;
      const moreBtn = [...card.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '더보기');
      if (moreBtn) { moreBtn.scrollIntoView({ block: 'center' }); moreBtn.click(); return true; }
    }
    return false;
  }, targetId);
  if (!opened) return { ok: false, reason: '더보기 미발견' };
  await sleep(900);

  const delClicked = await page.evaluate(() => {
    const dropdowns = [...document.querySelectorAll('div')].filter((d) => {
      const cls = String(d.className || '');
      return cls.includes('absolute') && cls.includes('z-10') && cls.includes('w-[160px]');
    });
    for (const dd of dropdowns) {
      const r = dd.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const btn = [...dd.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '삭제' || (b.innerText || '').trim() === '삭제하기');
      if (btn) { btn.click(); return { ok: true, via: 'dropdown' }; }
    }
    const cands = [...document.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const t = (b.innerText || '').trim();
      return t === '삭제' || t === '삭제하기';
    });
    if (cands.length === 0) return { ok: false };
    cands.sort((a, b) => { const ar = a.getBoundingClientRect(); const br = b.getBoundingClientRect(); return br.width * br.height - ar.width * ar.height; });
    cands[0].click();
    return { ok: true, via: 'fallback' };
  });
  if (!delClicked.ok) return { ok: false, reason: '삭제 메뉴 미발견' };
  await sleep(2000);

  const confirmed = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="Modal" i]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    let buttons = [];
    if (dialogs.length > 0) {
      for (const d of dialogs) {
        buttons.push(...[...d.querySelectorAll('button')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }));
      }
    } else {
      buttons = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    }
    const cands = buttons.filter((b) => /^(삭제|삭제하기|확인|예|네)$/.test((b.innerText || '').trim()));
    if (cands.length === 0) return { ok: false };
    cands.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
    cands[0].click();
    return { ok: true };
  });
  if (!confirmed.ok) return { ok: false, reason: '확인 다이얼로그 미발견' };
  await sleep(2500);
  return { ok: true };
}

(async () => {
  const keep = buildKeepList();
  if (keep.length < 50) {
    console.error(`[FATAL] KEEP 리스트가 비정상적으로 작음: ${keep.length}개 (55-run-log.json 이상?) — abort`);
    process.exit(1);
  }
  const keepSet = new Set(keep.map((k) => k.draftId));
  console.log(`KEEP 리스트: ${keep.length}개 (상품별 latest draft)`);
  console.log(`mode: ${isExecute ? 'EXECUTE' : 'DRY-RUN'}`);

  const report = { at: new Date().toISOString(), mode: isExecute ? 'execute' : 'dry', keep, found: [], toDelete: [], deleted: [], errors: [], remaining: [] };

  const { browser, page } = await login({ slowMo: 150 });
  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3500);

    console.log('\n=== Phase 1: WAITING 전수 조사 ===');
    const all = await collectAllVisibleDrafts(page);
    report.found = all;
    console.log(`\n전체 WAITING: ${all.length}개`);

    const toDelete = all.filter((d) => !keepSet.has(d.id));
    const keepPresent = all.filter((d) => keepSet.has(d.id));
    report.toDelete = toDelete;
    console.log(`KEEP 확인: ${keepPresent.length}/${keep.length}개 WAITING에 존재`);
    console.log(`삭제 대상: ${toDelete.length}개`);
    toDelete.slice(0, 20).forEach((d, i) => console.log(`  [${i + 1}] #${d.id} "${d.title}"`));
    if (toDelete.length > 20) console.log(`  ... 외 ${toDelete.length - 20}개`);

    if (!isExecute) {
      console.log('\n[DRY-RUN] --execute 플래그 추가하면 실제 삭제');
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
      await browser.close();
      return;
    }

    if (toDelete.length > MAX_DELETES) {
      console.error(`[ABORT] 삭제 대상 ${toDelete.length}개 > 한도 ${MAX_DELETES} — 안전 차원 abort`);
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(2);
    }

    console.log(`\n=== Phase 2: 삭제 실행 (${toDelete.length}개) ===`);
    for (let i = 0; i < toDelete.length; i++) {
      const t = toDelete[i];
      console.log(`\n[${i + 1}/${toDelete.length}] #${t.id} "${t.title}" 삭제 시도`);
      // 해당 페이지로 이동 후 삭제 시도 (최대 3페이지 순회)
      let done = false;
      for (let pn = Math.max(1, t.page || 1); pn <= Math.min(MAX_PAGES, 10) && !done; pn++) {
        await page.evaluate((u) => { window.location.href = u; }, `https://kmong.com/my-gigs?statusType=WAITING&page=${pn}`);
        await sleep(3500);
        for (let s = 0; s < 4; s++) { await page.evaluate(() => window.scrollBy(0, 1200)); await sleep(300); }
        const res = await deleteDraftById(page, t.id);
        if (res.ok) {
          console.log(`  ✓ 삭제 완료 (page ${pn})`);
          report.deleted.push({ id: t.id, title: t.title, page: pn });
          done = true;
          break;
        }
      }
      if (!done) {
        console.log(`  ✗ 삭제 실패`);
        report.errors.push({ id: t.id, title: t.title });
      }
      await sleep(800);
    }

    console.log('\n=== Phase 3: 잔여 확인 ===');
    const after = await collectAllVisibleDrafts(page);
    const remainingNonKeep = after.filter((d) => !keepSet.has(d.id));
    report.remaining = after;
    report.remainingNonKeep = remainingNonKeep;
    console.log(`\n전체 WAITING: ${after.length} (KEEP ${after.length - remainingNonKeep.length} + 잔여 noise ${remainingNonKeep.length})`);

    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(`\n리포트: ${REPORT}`);
    await browser.close();
    process.exit(remainingNonKeep.length === 0 ? 0 : 2);
  } catch (e) {
    console.error('[FATAL]', e.message);
    report.fatal = e.message;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
