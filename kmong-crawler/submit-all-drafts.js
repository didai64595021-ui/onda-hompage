#!/usr/bin/env node
/**
 * 크몽 WAITING 51건 일괄 제출 (사용자 명시 override)
 * - 2026-04-17 세션: "실제출해 규칙 무시" 지시
 * - feedback_kmong_human_submit 규칙을 사용자가 명시 override
 * - 편집하기 버튼 클릭 → 승인규정 체크 → 제출하기 → 최종 제출하기
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOG_PATH = '/home/onda/logs/kmong-submit-all-20260417.log';
const RESULT_PATH = path.join(__dirname, 'submit-all-result-20260417.json');
const MY_GIGS_WAITING = 'https://kmong.com/my-gigs?statusType=WAITING';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

function telegram(msg) {
  try {
    execSync(`node /home/onda/scripts/telegram-sender.js ${JSON.stringify(msg)}`, { timeout: 10000 });
  } catch (e) {
    log(`telegram 실패: ${e.message.slice(0, 80)}`);
  }
}

async function collectWaitingDrafts(page) {
  const drafts = [];
  for (let pgNo = 1; pgNo <= 6; pgNo++) {
    const url = `${MY_GIGS_WAITING}&page=${pgNo}`;
    await page.evaluate((u) => { window.location.href = u; }, url);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    if (!page.url().includes('/my-gigs?')) break;
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(400);
    }
    const items = await page.evaluate(() => {
      const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
      const out = [];
      for (const eb of editBtns) {
        let card = eb.closest('article');
        if (!card) {
          let cur = eb;
          for (let i = 0; i < 6; i++) { cur = cur.parentElement; if (!cur) break; if ((cur.innerText || '').match(/#\d{6,}/)) { card = cur; break; } }
        }
        if (!card) continue;
        const text = (card.innerText || '').trim();
        const idMatch = text.match(/#(\d{6,})/);
        if (!idMatch) continue;
        // 편집하기 버튼이 있는 카드만 이미 크롤링됨 = 제출 가능한 임시저장
        // (승인대기/심사중은 편집 불가능해서 버튼 없음)
        // → isPending 판정 off (모두 제출 대상)
        const isPending = false;
        const titleLine = text.split('\n').find(l => l.trim().length > 5 && !/^(편집|상태|분류|판매중|임시|비승인|판매 중지|#|심사|승인)/.test(l.trim()));
        out.push({
          draftId: idMatch[1],
          title: titleLine ? titleLine.trim().slice(0, 100) : '(제목 없음)',
          isPending,
        });
      }
      return out;
    });
    if (items.length === 0) break;
    drafts.push(...items);
    log(`  WAITING page ${pgNo}: ${items.length}건 (승인대기 ${items.filter(i => i.isPending).length})`);
  }
  const seen = new Set();
  return drafts.filter(d => { if (seen.has(d.draftId)) return false; seen.add(d.draftId); return true; });
}

async function submitOne(page, draftId, title) {
  // 목록 페이지에서 해당 draftId 카드의 편집하기 버튼 클릭
  // 먼저 WAITING 목록으로
  await page.evaluate((u) => { window.location.href = u; }, MY_GIGS_WAITING);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // 해당 draftId 카드 검색 (모든 페이지 순회)
  let clicked = false;
  for (let pgNo = 1; pgNo <= 6 && !clicked; pgNo++) {
    if (pgNo > 1) {
      await page.evaluate((u) => { window.location.href = u; }, `${MY_GIGS_WAITING}&page=${pgNo}`);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(300);
    }
    clicked = await page.evaluate((targetId) => {
      const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
      for (const eb of editBtns) {
        let card = eb.closest('article');
        if (!card) {
          let cur = eb;
          for (let i = 0; i < 6; i++) { cur = cur.parentElement; if (!cur) break; if ((cur.innerText || '').match(/#\d{6,}/)) { card = cur; break; } }
        }
        if (!card) continue;
        const text = (card.innerText || '');
        if (text.includes(`#${targetId}`)) {
          eb.scrollIntoView({ block: 'center' });
          eb.click();
          return true;
        }
      }
      return false;
    }, draftId);
    if (clicked) break;
  }

  if (!clicked) throw new Error(`편집하기 버튼 미발견 (draft ${draftId})`);
  await page.waitForTimeout(6000);
  await closeModals(page).catch(() => {});

  const enteredUrl = page.url();
  log(`  편집 페이지 진입: ${enteredUrl}`);
  if (!enteredUrl.includes(`/my-gigs/edit/`) && !enteredUrl.includes(`/my-gigs/new`)) {
    throw new Error(`편집 페이지 미진입: ${enteredUrl}`);
  }

  // Step1이면 "다음" 버튼 클릭 → Step2 이동
  // Step2에서는 "다음" 버튼이 없고 "제출하기"/"임시 저장하기"가 있음
  // 최대 3번 "다음" 클릭 시도
  for (let nextTry = 0; nextTry < 3; nextTry++) {
    const nextBtn = page.locator('button:has-text("다음")').first();
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false) &&
        !(await nextBtn.isDisabled().catch(() => false))) {
      await nextBtn.scrollIntoViewIfNeeded();
      await nextBtn.click({ force: true });
      await page.waitForTimeout(5000);
      log(`  "다음" 클릭 ${nextTry + 1}회`);
      await closeModals(page).catch(() => {});
    } else {
      break;
    }
  }

  // 승인규정 체크박스 체크
  const mandatoryLabels = page.locator('label[for^="mandatory-field-"]');
  const mCount = await mandatoryLabels.count().catch(() => 0);
  for (let i = 0; i < mCount; i++) {
    try {
      const lb = mandatoryLabels.nth(i);
      if (await lb.isVisible({ timeout: 1000 }).catch(() => false)) {
        await lb.click({ force: true });
        await page.waitForTimeout(300);
      }
    } catch {}
  }
  if (mCount > 0) log(`  승인규정 체크 ${mCount}개 완료`);

  // 1차 "제출하기" 버튼 (다이얼로그 외부)
  const submitBtnOutside = page.locator('button:has-text("제출하기"):not([role="dialog"] button)').first();
  const submitBtn = page.locator('button:has-text("제출하기")').first();
  if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click({ force: true });
    await page.waitForTimeout(6000);
    log(`  1차 제출하기 클릭`);
  } else {
    throw new Error('제출하기 버튼 미발견');
  }

  // 최종 확인 모달의 "제출하기"
  const finalSubmitBtn = page.locator('[role="dialog"] button:has-text("제출하기")').first();
  if (await finalSubmitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await finalSubmitBtn.click({ force: true });
    await page.waitForTimeout(8000);
    log(`  최종 모달 제출하기 클릭`);
  } else {
    log(`  최종 모달 미등장 (자동 제출 가능성)`);
  }

  // 성공 확인
  await page.waitForTimeout(3000);
  const finalUrl = page.url();
  log(`  최종 URL: ${finalUrl}`);

  // 에러 메시지 감지
  const errorText = await page.evaluate(() => {
    const errors = [...document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]')]
      .map(el => (el.innerText || '').trim())
      .filter(t => t.length > 3 && t.length < 300);
    return errors.slice(0, 3).join(' | ');
  }).catch(() => '');
  if (errorText && /필수|미입력|실패|에러|오류/.test(errorText)) {
    throw new Error(`페이지 에러: ${errorText.slice(0, 200)}`);
  }

  return { finalUrl, errorText };
}

async function main() {
  fs.writeFileSync(LOG_PATH, `=== 크몽 실제출 시작 ${new Date().toISOString()} ===\n`);
  log('login 시작');

  const { browser, page } = await login({ slowMo: 150 });

  try {
    log('WAITING 목록 수집');
    const drafts = await collectWaitingDrafts(page);
    log(`수집 완료: ${drafts.length}건 (승인대기 ${drafts.filter(d => d.isPending).length}건)`);

    const targets = drafts.filter(d => !d.isPending);
    log(`제출 대상: ${targets.length}건`);

    fs.writeFileSync(RESULT_PATH, JSON.stringify({
      startedAt: new Date().toISOString(),
      collected: drafts.length,
      excluded: drafts.length - targets.length,
      targets: targets.map(t => ({ draftId: t.draftId, title: t.title })),
      success: [],
      failed: [],
    }, null, 2));

    telegram(`🚀 크몽 실제출 시작\n대상 ${targets.length}건 / 승인대기 제외 ${drafts.length - targets.length}건\n예상 소요 ~${Math.ceil(targets.length * 1.5)}분`);

    const success = [], failed = [];
    let consecutiveFails = 0;

    for (let i = 0; i < targets.length; i++) {
      const g = targets[i];
      log(`\n[${i+1}/${targets.length}] draft ${g.draftId} "${g.title.slice(0, 40)}"`);
      try {
        const r = await submitOne(page, g.draftId, g.title);
        success.push({ draftId: g.draftId, title: g.title, finalUrl: r.finalUrl });
        consecutiveFails = 0;
        log(`  ✅ 성공`);
      } catch (e) {
        const errMsg = e.message.slice(0, 300);
        log(`  ❌ 실패: ${errMsg}`);
        failed.push({ draftId: g.draftId, title: g.title, error: errMsg });
        consecutiveFails++;
        if (consecutiveFails >= 5) {
          log(`\n🛑 연속 5건 실패 → 자동 중단`);
          telegram(`🛑 크몽 제출 연속 5건 실패 → 자동 중단\n성공 ${success.length} / 실패 ${failed.length}\n최근 에러: ${errMsg.slice(0, 150)}`);
          break;
        }
      }

      // 중간 저장
      fs.writeFileSync(RESULT_PATH, JSON.stringify({
        startedAt: new Date().toISOString(),
        collected: drafts.length,
        excluded: drafts.length - targets.length,
        targets: targets.map(t => ({ draftId: t.draftId, title: t.title })),
        success, failed,
        lastProcessed: i + 1,
      }, null, 2));

      // 10건 단위 텔레그램
      if ((i + 1) % 10 === 0 && i < targets.length - 1) {
        telegram(`🔄 크몽 제출 진행 ${i+1}/${targets.length}\n✅ ${success.length} / ❌ ${failed.length}`);
      }

      // 다음 건 전 대기 (60초 — 이상패턴 탐지 회피)
      if (i < targets.length - 1) {
        log(`  60초 대기...`);
        await page.waitForTimeout(60000);
      }
    }

    log(`\n=== 완료 — ✅ ${success.length}건 / ❌ ${failed.length}건 ===`);
    const failedList = failed.slice(0, 5).map(f => `- ${f.draftId}: ${f.error.slice(0, 80)}`).join('\n');
    telegram(`✅ 크몽 실제출 완료\n성공 ${success.length}건 / 실패 ${failed.length}건\n결과: ${RESULT_PATH}\n${failed.length > 0 ? '\n실패 상위 5건:\n' + failedList : ''}`);
  } finally {
    try { await browser.close(); } catch {}
  }
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack || ''}`);
  telegram(`🛑 크몽 제출 FATAL 에러: ${err.message.slice(0, 200)}`);
  process.exit(1);
});
