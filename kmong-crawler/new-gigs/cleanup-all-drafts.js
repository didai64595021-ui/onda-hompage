#!/usr/bin/env node
/**
 * 크몽 셀러 계정의 모든 임시저장(draft) 서비스 일괄 삭제
 *
 * 안전장치:
 *  - /my-gigs?statusType=WAITING 탭에서만 작동 (임시저장/검토중만)
 *  - SELLING(판매중/발행된) 서비스는 절대 손대지 않음 (URL 파라미터로 완전 격리)
 *  - 기본 dry-run, --execute 명시해야 실제 삭제
 *  - 삭제 전 ID 리스트 콘솔 출력
 *  - 첫 삭제 후 1초 대기 (rate limit)
 *
 * 사용법:
 *   node cleanup-all-drafts.js          # dry-run (조회만)
 *   node cleanup-all-drafts.js --execute # 실제 삭제
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');

const SS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });

const MAX_PAGES = 10; // 안전 한도
const MAX_DELETES = 100; // 안전 한도

// 페이지 내 모든 draft 카드 정보 수집
async function collectDrafts(page) {
  return await page.evaluate(() => {
    const editBtns = [...document.querySelectorAll('button')].filter(
      (b) => (b.innerText || '').trim() === '편집하기'
    );
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
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

      // ID 추출 (#761234)
      let id = '';
      const m = text.match(/#(\d{6,})/);
      if (m) id = m[1];

      // 제목 추정 (가장 긴 의미있는 줄)
      const title =
        lines.find(
          (l) => l.length > 8 && l.length < 80 && !/^#|판매중|승인|편집|임시|^\d+$/.test(l)
        ) ||
        lines[0] ||
        '';

      // 상태 라벨 (임시저장/검토중 등)
      const status = lines.find((l) => /임시저장|검토중|승인|대기|반려/.test(l)) || '';

      out.push({ id, title: title.slice(0, 60), status });
    }
    return out;
  });
}

// 특정 ID의 draft 1개 삭제
async function deleteDraftById(page, targetId) {
  // 1) 더보기 클릭
  const opened = await page.evaluate((id) => {
    const editBtns = [...document.querySelectorAll('button')].filter(
      (b) => (b.innerText || '').trim() === '편집하기'
    );
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
      const cid = m ? m[1] : '';
      if (cid !== id) continue;
      const moreBtn = [...card.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === '더보기'
      );
      if (moreBtn) {
        moreBtn.scrollIntoView({ block: 'center' });
        moreBtn.click();
        return true;
      }
    }
    return false;
  }, targetId);
  if (!opened) return { ok: false, reason: '더보기 버튼 미발견' };
  await sleep(900);

  // 2) 드롭다운에서 "삭제" 클릭
  const delClicked = await page.evaluate(() => {
    // z-10 dropdown 컨테이너 우선
    const dropdowns = [...document.querySelectorAll('div')].filter((d) => {
      const cls = String(d.className || '');
      return cls.includes('absolute') && cls.includes('z-10') && cls.includes('w-[160px]');
    });
    for (const dd of dropdowns) {
      const r = dd.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const btn = [...dd.querySelectorAll('button')].find(
        (b) => (b.innerText || '').trim() === '삭제' || (b.innerText || '').trim() === '삭제하기'
      );
      if (btn) {
        btn.click();
        return { ok: true, via: 'dropdown' };
      }
    }
    // Fallback: 가장 큰 삭제 버튼
    const cands = [...document.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const t = (b.innerText || '').trim();
      return t === '삭제' || t === '삭제하기';
    });
    if (cands.length === 0) return { ok: false };
    cands.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.width * br.height - ar.width * ar.height;
    });
    cands[0].click();
    return { ok: true, via: 'fallback' };
  });
  if (!delClicked || !delClicked.ok) return { ok: false, reason: '삭제 메뉴 미발견' };
  await sleep(2000);

  // 3) 확인 다이얼로그
  const confirmed = await page.evaluate(() => {
    const dialogs = [
      ...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="Modal" i]'),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    let buttons = [];
    if (dialogs.length > 0) {
      for (const d of dialogs) {
        buttons.push(
          ...[...d.querySelectorAll('button')].filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
        );
      }
    } else {
      buttons = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    }
    const cands = buttons.filter((b) => {
      const t = (b.innerText || '').trim();
      return /^(삭제|삭제하기|확인|예|네)$/.test(t);
    });
    if (cands.length === 0) return { ok: false };
    cands.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
    cands[0].click();
    return { ok: true };
  });
  if (!confirmed || !confirmed.ok) return { ok: false, reason: '확인 다이얼로그 미발견' };
  await sleep(2500);
  return { ok: true };
}

(async () => {
  console.log(`[cleanup-all-drafts] mode=${isExecute ? 'EXECUTE' : 'DRY'}`);
  const report = {
    at: new Date().toISOString(),
    mode: isExecute ? 'execute' : 'dry',
    found: [],
    deleted: [],
    errors: [],
  };

  let browser;
  try {
    const r = await login({ slowMo: 150 });
    browser = r.browser;
    const page = r.page;

    // === Phase 1: 전수 조사 — 모든 페이지 순회해서 draft 수집 ===
    console.log('\n=== Phase 1: 전수 조사 (모든 draft ID 수집) ===');
    const allDrafts = [];
    const seenIds = new Set();
    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const url = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
      console.log(`\n[페이지 ${pageNo}] ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 1200));
        await sleep(400);
      }

      const drafts = await collectDrafts(page);
      console.log(`  ${drafts.length}개 카드 발견`);
      if (drafts.length === 0) {
        console.log('  더 이상 카드 없음 — 조사 종료');
        break;
      }

      // 중복 제거 (다음 페이지가 같은 카드를 반환하는 경우 방지)
      let newCount = 0;
      for (const d of drafts) {
        const key = d.id || `noid-${allDrafts.length}-${d.title}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        allDrafts.push(d);
        newCount++;
      }
      console.log(`  신규 ${newCount}개 추가 (누적 ${allDrafts.length})`);
      if (newCount === 0) {
        console.log('  신규 카드 없음 — 같은 페이지 반복으로 판단, 종료');
        break;
      }
    }

    report.found = allDrafts;
    console.log(`\n=== 수집 완료: 총 ${allDrafts.length}개 draft ===`);
    allDrafts.forEach((d, i) => {
      console.log(`  [${i + 1}] #${d.id || '?'} | "${d.title}" | 상태: ${d.status}`);
    });

    if (allDrafts.length === 0) {
      console.log('\n삭제할 draft가 없습니다. 종료.');
      fs.writeFileSync(
        path.join(__dirname, 'cleanup-all-drafts-report.json'),
        JSON.stringify(report, null, 2)
      );
      return;
    }

    if (!isExecute) {
      console.log(`\n[DRY-RUN] 실제 삭제하려면 --execute 플래그 추가`);
      fs.writeFileSync(
        path.join(__dirname, 'cleanup-all-drafts-report.json'),
        JSON.stringify(report, null, 2)
      );
      return;
    }

    // === Phase 2: 삭제 실행 ===
    console.log(`\n=== Phase 2: 삭제 실행 (총 ${allDrafts.length}개) ===`);
    let deletedCount = 0;

    // ID 있는 것부터 삭제 (안정적)
    const targetIds = allDrafts.filter((d) => d.id).map((d) => d.id);
    const noIdCount = allDrafts.length - targetIds.length;
    if (noIdCount > 0) {
      console.log(`⚠ ID 없는 카드 ${noIdCount}개 — ID 기반 삭제 후 잔여 체크 단계에서 처리`);
    }

    for (let i = 0; i < targetIds.length; i++) {
      const id = targetIds[i];
      if (deletedCount >= MAX_DELETES) {
        console.log(`⚠ 안전 한도 ${MAX_DELETES}개 도달 — 중단`);
        break;
      }
      console.log(`\n[${i + 1}/${targetIds.length}] #${id} 삭제 시도...`);

      // 매번 페이지 1을 새로 로드 (삭제 후 re-render 안정)
      await page.goto('https://kmong.com/my-gigs?statusType=WAITING&page=1', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(3500);
      for (let s = 0; s < 4; s++) {
        await page.evaluate(() => window.scrollBy(0, 1200));
        await sleep(300);
      }

      const res = await deleteDraftById(page, id);
      if (res.ok) {
        console.log(`  ✓ #${id} 삭제 완료`);
        report.deleted.push({ id });
        deletedCount++;
      } else {
        // 페이지 1에 없으면 다른 페이지 시도
        let found = false;
        for (let pn = 2; pn <= MAX_PAGES; pn++) {
          await page.goto(`https://kmong.com/my-gigs?statusType=WAITING&page=${pn}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await sleep(3000);
          const res2 = await deleteDraftById(page, id);
          if (res2.ok) {
            console.log(`  ✓ #${id} 삭제 완료 (page ${pn})`);
            report.deleted.push({ id });
            deletedCount++;
            found = true;
            break;
          }
        }
        if (!found) {
          console.log(`  ✗ #${id} 삭제 실패: ${res.reason}`);
          report.errors.push({ id, reason: res.reason });
          try {
            await page.screenshot({
              path: path.join(SS, `cleanup-fail-${id}-${Date.now()}.png`),
              fullPage: false,
            });
          } catch {}
        }
      }

      // rate limit 보호 (첫 삭제 후 1초, 이후 500ms)
      await sleep(i === 0 ? 1000 : 500);
    }

    // === Phase 3: 잔여 체크 (ID 없는 카드 포함) ===
    console.log(`\n=== Phase 3: 잔여 체크 ===`);
    await page.goto('https://kmong.com/my-gigs?statusType=WAITING&page=1', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(3500);
    for (let s = 0; s < 4; s++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await sleep(300);
    }
    const remaining = await collectDrafts(page);
    console.log(`잔여 draft: ${remaining.length}개`);
    remaining.forEach((d, i) => {
      console.log(`  [${i + 1}] #${d.id || '?'} | "${d.title}"`);
    });
    report.remaining = remaining;

    console.log(`\n=== 요약 ===`);
    console.log(`발견: ${report.found.length}`);
    console.log(`삭제 성공: ${report.deleted.length}`);
    console.log(`삭제 실패: ${report.errors.length}`);
    console.log(`잔여: ${remaining.length}`);

    fs.writeFileSync(
      path.join(__dirname, 'cleanup-all-drafts-report.json'),
      JSON.stringify(report, null, 2)
    );
    console.log(`\n리포트: ${path.join(__dirname, 'cleanup-all-drafts-report.json')}`);
  } catch (e) {
    console.error('[FATAL]', e.message);
    report.fatal = e.message;
    fs.writeFileSync(
      path.join(__dirname, 'cleanup-all-drafts-report.json'),
      JSON.stringify(report, null, 2)
    );
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
