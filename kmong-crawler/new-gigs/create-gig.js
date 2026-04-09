#!/usr/bin/env node
/**
 * 크몽 신규 서비스 등록 RPA v2 (Step 1 + Step 2 풀필 지원)
 *
 * - 진입: https://kmong.com/my-gigs/new
 * - Step 1: 제목 + 1차/2차 카테고리 → 다음
 * - Step 2 (편집 페이지): 서비스 설명 + 주요특징 + 메인이미지 + 절차 + 준비사항 + 패키지 3개 → 임시저장 또는 제출
 *
 * 셀렉터 출처: recon-v2.json (정찰 v2)
 *  - 본문 에디터 3개: #DESCRIPTION / #DESCRIPTION_PROGRESS / #DESCRIPTION_PREPARATION (TipTap)
 *  - 메인이미지: #MAIN_GALLERY input[type=file] (hidden)
 *  - 주요 특징 react-select: #react-select-2/3/4-input (기술수준/팀규모/상주)
 *  - 작업 기간 react-select: #react-select-5/6/7-input (STD/DLX/PRM)
 *  - 수정 횟수 react-select: #react-select-8/9/10-input (STD/DLX/PRM)
 *  - 패키지 textarea: name="PACKAGE_OPTION_GROUP.valueData.packages.{i}.values.{j}.packageValue"
 *  - 임시 저장: button:has-text("임시 저장하기")
 *  - 제출: button[type=submit]:has-text("제출하기")
 *
 * 사용법:
 *   node create-gig.js --product 1 --mode probe        # 1번 상품, select 옵션 탐색만
 *   node create-gig.js --product 1 --mode save         # 1번 상품, 임시저장(안전)
 *   node create-gig.js --product all --mode save       # 6개 모두 임시저장
 *   node create-gig.js --product 1 --mode submit       # 1번 상품, 실제 발행
 *
 * 안전 기본:
 *   - 기본 mode = 'probe' (실 등록 없이 select 옵션만 탐색)
 *   - 'save' 는 임시저장만 (사용자가 직접 검수 후 제출)
 *   - 'submit' 만 실제 발행 — 명시적으로 지정 필요
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');
const { PRODUCTS } = require('./gig-data');
const { EXTRA } = require('./gig-data-extra');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const IMAGE_DIR = path.join(__dirname, '03-images');
const LOG_PATH = path.join(__dirname, 'create-gig-log.json');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ──────────────────────────────────────────
// 헬퍼: 스크린샷
// ──────────────────────────────────────────
async function snap(page, label) {
  const out = path.join(SCREENSHOT_DIR, `${label}.png`);
  await page.screenshot({ path: out, fullPage: true }).catch(() => {});
  return out;
}

// ──────────────────────────────────────────
// 헬퍼: 페이지의 모든 react-select 찾아 label 매핑 빌드
//  - 반환: [{ inputId, label, controlSelector }]
//  - label은 nearest preceding label (P 태그 또는 LABEL)
// ──────────────────────────────────────────
async function discoverSelects(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[id^="react-select-"]').forEach(el => {
      if (!el.id.endsWith('-input')) return;
      // control ancestor
      let ctrl = el;
      for (let i = 0; i < 8 && ctrl; i++) {
        ctrl = ctrl.parentElement;
        if (ctrl && (String(ctrl.className || '').includes('-control') || String(ctrl.className || '').includes('css-b62m3t-container'))) break;
      }
      // nearest preceding label/p
      let label = '';
      let cur = el;
      for (let i = 0; i < 12 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        // p 태그 (kmong이 label 대신 사용)
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

// ──────────────────────────────────────────
// 헬퍼: label 기반 react-select 채우기 (라벨로 inputId 찾고 fillReactSelect 호출)
//  - selectMap: discoverSelects 결과
//  - labelKey: 매칭할 라벨 (정확 일치 우선)
//  - nthOfLabel: 같은 라벨이 여러 개일 때 idx (default 0)
// ──────────────────────────────────────────
async function fillSelectByLabel(page, selectMap, labelKey, value, nthOfLabel = 0) {
  const matches = selectMap.filter(s => s.label === labelKey);
  if (matches.length === 0) {
    console.log(`  ⚠ "${labelKey}" select 미발견 (skip)`);
    return { ok: false, skipped: true };
  }
  if (nthOfLabel >= matches.length) {
    console.log(`  ⚠ "${labelKey}" select #${nthOfLabel} 없음 (전체 ${matches.length}개)`);
    return { ok: false, skipped: true };
  }
  const target = matches[nthOfLabel];
  return await fillReactSelect(page, target.inputId, value, `${labelKey}#${nthOfLabel}`);
}

// ──────────────────────────────────────────
// 헬퍼: react-select 채우기 (inputId 직접)
// ──────────────────────────────────────────
async function fillReactSelect(page, inputId, value, label = '') {
  const tag = label ? `[${label}]` : '';
  const input = page.locator(`#${inputId}`);
  if ((await input.count()) === 0) {
    console.log(`  ✗ ${tag} ${inputId} 미발견`);
    return { ok: false, error: `${inputId} 미발견` };
  }

  // react-select의 input 은 dummyInput(hidden) — 부모 control div를 클릭
  // structure: container > control > valueContainer > input
  const control = input.locator('xpath=ancestor::div[contains(@class, "-control")][1]');
  if ((await control.count()) === 0) {
    console.log(`  ✗ ${tag} ${inputId} control ancestor 미발견`);
    return { ok: false, error: `${inputId} control 미발견` };
  }

  // 0. 이전 열린 메뉴 닫기 (ESC + page.body 클릭)
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(200);
  await page.evaluate(() => {
    // 모든 열린 dropdown 닫기 — body 클릭 dispatch
    document.body.click();
  }).catch(() => {});
  await sleep(300);

  // 1. 스크롤 + 클릭
  await control.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await sleep(300);
  await control.click({ force: true });
  await sleep(800);

  // 2. 열린 kmong 커스텀 드롭다운에서만 옵션 수집
  // 메뉴 클래스: "!z-20 ... bg-white ... shadow-[0px_4px_16px_..."
  // 옵션 클래스: "!flex items-center justify-between px-3 py-2.5 text-[16px] text-gray-900 ..."
  const options = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div')].filter(el => {
      const cls = String(el.className || '');
      // kmong 옵션 시그니처
      return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between')
        && cls.includes('text-gray-900') && cls.includes('px-3');
    }).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return all.map(el => (el.innerText || '').trim()).filter(t => t && t.length < 60);
  });

  if (options.length === 0) {
    console.log(`  ✗ ${tag} 옵션 0개 — 드롭다운 미오픈?`);
    await page.keyboard.press('Escape').catch(() => {});
    return { ok: false, error: 'no options', options: [] };
  }

  // 3. 매칭 전략: 정확 일치 → 포함(value→option) → 포함(option→value) → 첫번째
  const target = String(value);
  let pick = options.find(o => o === target);
  if (!pick) pick = options.find(o => o.includes(target));
  if (!pick) pick = options.find(o => target.includes(o));
  if (!pick) pick = options[0];
  const fallback = pick !== target;

  // 4. 옵션 클릭 — kmong 커스텀 옵션 (전체 텍스트 매칭)
  // mousedown + mouseup + click 모두 dispatch (react-select 가 onMouseDown 도 listening)
  const ok = await page.evaluate((pickText) => {
    const all = [...document.querySelectorAll('div')].filter(el => {
      const cls = String(el.className || '');
      return cls.includes('!flex') && cls.includes('items-center') && cls.includes('justify-between')
        && cls.includes('text-gray-900') && cls.includes('px-3');
    }).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const target = all.find(el => (el.innerText || '').trim() === pickText);
    if (target) {
      const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
      const mu = new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
      target.dispatchEvent(md);
      target.dispatchEvent(mu);
      target.click();
      return true;
    }
    return false;
  }, pick);
  if (ok) {
    // react-select 의 form state commit 까지 충분한 시간 대기
    await sleep(1800);
    console.log(`  ✓ ${tag} ${inputId} = "${pick}"${fallback ? ` (fallback, 요청="${value}")` : ''}`);
    return { ok: true, picked: pick, fallback, options };
  }
  // fallback: keyboard Enter (커서가 옵션 위에 있을 때)
  await page.keyboard.press('Enter').catch(() => {});
  await sleep(800);
  console.log(`  ⚠ ${tag} ${inputId} keyboard fallback "${pick}"`);
  return { ok: true, picked: pick, fallback, viaKeyboard: true, options };
}

// ──────────────────────────────────────────
// 헬퍼: TipTap 에디터 채우기
// ──────────────────────────────────────────
async function fillTipTap(page, containerId, text, label = '') {
  const tag = label ? `[${label}]` : '';
  const editor = page.locator(`#${containerId} .ProseMirror`);
  if (!(await editor.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log(`  ✗ ${tag} #${containerId} ProseMirror 미발견`);
    return { ok: false };
  }
  await editor.click({ force: true });
  await sleep(300);
  // 기존 내용 비우기 (Ctrl+A → Delete)
  await page.keyboard.press('Control+A').catch(() => {});
  await sleep(150);
  await page.keyboard.press('Delete').catch(() => {});
  await sleep(150);

  // 줄바꿈 처리: \n → Shift+Enter (TipTap softbreak) 또는 Enter (paragraph)
  // 단순화: type 으로 처리하되 \n 은 Enter 로 대체
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
  await sleep(400);
  console.log(`  ✓ ${tag} #${containerId} (${text.length}자)`);
  return { ok: true };
}

// ──────────────────────────────────────────
// 헬퍼: 카테고리 클릭 (모달 대신 popover)
// ──────────────────────────────────────────
async function selectCategory(page, label, value) {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) {
    return { ok: false, error: `${label} 버튼 미발견` };
  }
  await btn.click({ force: true });
  await sleep(2000);

  const opt = page.getByText(value, { exact: true }).first();
  if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await opt.click({ force: true });
    await sleep(1500);
    return { ok: true };
  }
  // 부분 일치
  const partial = page.locator('button, li').filter({ hasText: value }).first();
  if (await partial.isVisible({ timeout: 1500 }).catch(() => false)) {
    await partial.click({ force: true });
    await sleep(1500);
    return { ok: true, partial: true };
  }
  await page.keyboard.press('Escape').catch(() => {});
  return { ok: false, error: `${label} 옵션 "${value}" 미발견` };
}

// ──────────────────────────────────────────
// Step 1: 제목 + 카테고리 → 다음
// ──────────────────────────────────────────
async function fillStep1(page, product) {
  console.log(`\n[Step1] /my-gigs/new`);
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await closeModals(page).catch(() => {});

  // 제목
  console.log(`[Step1] 제목 입력: "${product.title}" (${product.title.length}자)`);
  const titleInput = page.locator('input[placeholder*="제목"]').first();
  if (!(await titleInput.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error('제목 input 미발견');
  }
  await titleInput.click();
  await titleInput.fill(product.title);
  await sleep(800);

  // 1차 카테고리
  console.log(`[Step1] 1차 카테고리: ${product.cat1}`);
  const r1 = await selectCategory(page, '1차 카테고리', product.cat1);
  if (!r1.ok) throw new Error(`1차 카테고리 실패: ${r1.error}`);

  // 2차 카테고리
  console.log(`[Step1] 2차 카테고리: ${product.cat2}`);
  const r2 = await selectCategory(page, '2차 카테고리', product.cat2);
  if (!r2.ok) throw new Error(`2차 카테고리 실패: ${r2.error}`);

  await snap(page, `gig-${product.id}-step1-filled`);

  // 다음 클릭
  console.log(`[Step1] "다음" 클릭`);
  await page.locator('button:has-text("다음")').first().click();
  await sleep(6000);

  console.log(`[Step1] Step 2 진입 — URL: ${page.url()}`);
  return { ok: true, draftUrl: page.url() };
}

// ──────────────────────────────────────────
// 헬퍼: "패키지로 설정" 토글 활성화 (hidden checkbox)
// ──────────────────────────────────────────
async function enablePackageMode(page) {
  const result = await page.evaluate(() => {
    // 1. 가장 좁은 "패키지로 설정" 텍스트 element 찾기
    const labels = [...document.querySelectorAll('p, label, span, div')].filter(el => {
      const t = (el.innerText || '').trim();
      return t === '패키지로 설정';
    });
    if (labels.length === 0) return { ok: false, reason: 'label not found' };
    labels.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
    const label = labels[0];

    // 2. 주변에 hidden checkbox(role="switch") 찾기 — 부모 5단계 안에서
    let cur = label;
    for (let i = 0; i < 6 && cur; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const cb = cur.querySelector('input[type="checkbox"][role="switch"], input[type="checkbox"]');
      if (cb) {
        if (cb.checked) return { ok: true, alreadyOn: true };
        // hidden 이라도 .click() 으로 dispatch 됨 (React onChange 트리거)
        cb.click();
        return { ok: true, clicked: true, isChecked: cb.checked };
      }
    }
    return { ok: false, reason: 'checkbox not found near label' };
  });
  return result;
}

// ──────────────────────────────────────────
// Step 2: 풀필 → 임시저장
// ──────────────────────────────────────────
async function fillStep2(page, product, opts = {}) {
  const probeOnly = opts.probeOnly === true;
  console.log(`\n[Step2] 풀필 시작 (probeOnly=${probeOnly})`);
  await snap(page, `gig-${product.id}-step2-initial`);

  // ─── 1. 서비스 설명 본문 ───
  await fillTipTap(page, 'DESCRIPTION', product.description, '서비스 설명');

  // ─── 2. "패키지로 설정" 토글 (가장 먼저 — 이후 select ID 가 변동됨) ───
  console.log(`[Step2] "패키지로 설정" 토글`);
  const toggleRes = await enablePackageMode(page);
  console.log(`  → ${JSON.stringify(toggleRes)}`);
  await sleep(2500);
  await snap(page, `gig-${product.id}-step2-after-toggle`);

  // ─── 3. select 매핑 발견 (토글 이후 시점) ───
  const selectMap = await discoverSelects(page);
  console.log(`[Step2] select ${selectMap.length}개 발견:`);
  selectMap.forEach(s => console.log(`   ${s.inputId} → "${s.label}"`));

  // ─── 4. 주요 특징 (label-based) ───
  console.log(`[Step2] 주요 특징`);
  await fillSelectByLabel(page, selectMap, '기술 수준', product.features.tech);
  // 카테고리별 추가 필드 — 라벨이 다양해서 모두 시도, 발견된 것만 채움
  // 봇·챗봇(617): 플랫폼 + 용도
  await fillSelectByLabel(page, selectMap, '플랫폼', product.features.messenger || '텔레그램');
  await fillSelectByLabel(page, selectMap, '용도', product.features.botField || '알림');
  // 맞춤형 챗봇·GPT(667): 사용하는 AI 툴 + 활용 목적
  await fillSelectByLabel(page, selectMap, '사용하는 AI 툴', product.features.aiTool || 'Claude');
  await fillSelectByLabel(page, selectMap, '활용 목적', product.features.purpose || '챗봇');
  // 공통
  await fillSelectByLabel(page, selectMap, '팀 규모', product.features.team);
  await fillSelectByLabel(page, selectMap, '상주 여부', product.features.onsite);

  // ─── 5. 메인 이미지 업로드 ───
  console.log(`[Step2] 메인 이미지`);
  const imagePath = path.join(IMAGE_DIR, product.image);
  if (!fs.existsSync(imagePath)) throw new Error(`이미지 없음: ${imagePath}`);
  const mainFileInput = page.locator('#MAIN_GALLERY input[type=file]');
  if (await mainFileInput.count() > 0) {
    await mainFileInput.setInputFiles(imagePath);
    await sleep(4000);
    console.log(`  ✓ 메인 이미지 업로드: ${product.image}`);
  } else {
    console.log(`  ✗ #MAIN_GALLERY input[type=file] 미발견`);
  }

  // ─── 6. 서비스 제공 절차 ───
  await fillTipTap(page, 'DESCRIPTION_PROGRESS', product.progress, '제공 절차');

  // ─── 7. 의뢰인 준비사항 ───
  await fillTipTap(page, 'DESCRIPTION_PREPARATION', product.preparation, '준비사항');

  // ─── 8. 패키지 (3개) 채우기 ───
  console.log(`[Step2] 패키지 정보 (3 tier)`);
  await snap(page, `gig-${product.id}-step2-before-package`);

  // textarea 매핑 — 토글 이후 6개 모두 enabled 가정
  // name 패턴: packages.0.values.{0|1|2}.packageValue (제목)
  //           packages.1.values.{0|1|2}.packageValue (설명)
  // 토글 후 -1 → 0/1/2 로 변화
  const taInfo = await page.evaluate(() => {
    return [...document.querySelectorAll('textarea')].map((el, idx) => ({
      idx,
      name: el.name || '',
      disabled: el.disabled,
    }));
  });
  console.log(`  textarea ${taInfo.length}개:`);
  taInfo.forEach(t => console.log(`     ${t.idx} ${t.disabled ? 'DIS' : 'ON '} ${t.name}`));

  const allTextareas = page.locator('textarea');
  // 패키지 0 (제목 group): 0/1/2 (STD/DLX/PRM)
  // 패키지 1 (설명 group): 3/4/5 (STD/DLX/PRM)
  for (let i = 0; i < 3; i++) {
    const pkg = product.packages[i];
    const titleEl = allTextareas.nth(i);
    const descEl = allTextareas.nth(3 + i);
    try {
      await titleEl.click({ force: true });
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await titleEl.fill(pkg.title);
      await descEl.click({ force: true });
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await descEl.fill(pkg.desc);
      console.log(`  ✓ 패키지 ${i} (${pkg.name}) 제목/설명 OK`);
    } catch (e) {
      console.log(`  ✗ 패키지 ${i} (${pkg.name}) 채우기 실패: ${e.message}`);
    }
  }

  // 금액 input — label "금액(VAT 포함)" 인 visible text input 3개
  console.log(`[Step2] 금액`);
  const priceTargets = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type="text"]').forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (el.id && el.id.startsWith('react-select')) return;
      let lbl = '';
      let cur = el;
      for (let i = 0; i < 8 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const lblEl = cur.querySelector('label, p');
        if (lblEl) {
          const t = (lblEl.innerText || '').trim();
          if (t.includes('금액')) { lbl = t; break; }
        }
      }
      if (lbl) out.push({ idx, label: lbl });
    });
    return out;
  });
  console.log(`  금액 input ${priceTargets.length}개`);
  if (priceTargets.length >= 3) {
    const allTI = page.locator('input[type="text"]');
    for (let i = 0; i < 3; i++) {
      const pkg = product.packages[i];
      try {
        const el = allTI.nth(priceTargets[i].idx);
        await el.click({ force: true });
        await page.keyboard.press('Control+A').catch(() => {});
        await page.keyboard.press('Delete').catch(() => {});
        await el.fill(String(pkg.price));
        console.log(`  ✓ ${pkg.name} 금액: ${pkg.price.toLocaleString()}`);
      } catch (e) {
        console.log(`  ✗ ${pkg.name} 금액 실패: ${e.message}`);
      }
    }
  }

  // 작업 기간 (label "작업 기간" × 3)
  console.log(`[Step2] 작업 기간`);
  // 토글 이후 select 매핑 다시 발견 (옵션 갯수 변할 수 있음)
  const map2 = await discoverSelects(page);
  for (let i = 0; i < 3; i++) {
    const pkg = product.packages[i];
    await fillSelectByLabel(page, map2, '작업 기간', `${pkg.days}일`, i);
  }

  // 수정 횟수 (label "수정 횟수" × 3)
  console.log(`[Step2] 수정 횟수`);
  for (let i = 0; i < 3; i++) {
    const pkg = product.packages[i];
    const v = pkg.revisions === '제한없음' ? '제한없음' : `${pkg.revisions}회`;
    await fillSelectByLabel(page, map2, '수정 횟수', v, i);
  }

  await snap(page, `gig-${product.id}-step2-filled`);

  // ─── 9. 저장 ───
  if (probeOnly) {
    console.log(`\n[Step2] probeOnly=true — 저장 안 함`);
    return { ok: true, mode: 'probe', selectMap, selectMapAfter: map2 };
  }

  console.log(`\n[Step2] "임시 저장하기" 클릭`);
  const saveBtn = page.locator('button:has-text("임시 저장하기")').first();
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click({ force: true });
    await sleep(6000);
    await snap(page, `gig-${product.id}-step2-saved`);
    console.log(`  ✓ 임시 저장 완료 — URL: ${page.url()}`);
    return { ok: true, mode: 'save', savedUrl: page.url() };
  }
  return { ok: false, error: '임시 저장 버튼 미발견' };
}

// ──────────────────────────────────────────
// Step 3 (선택): 제출하기
// ──────────────────────────────────────────
async function submitGig(page, product) {
  console.log(`\n[Submit] "제출하기" 클릭`);
  const submitBtn = page.locator('button[type=submit]:has-text("제출하기"), button:has-text("제출하기")').first();
  if (!(await submitBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    return { ok: false, error: '제출하기 버튼 미발견' };
  }
  await submitBtn.click({ force: true });
  await sleep(6000);
  await snap(page, `gig-${product.id}-submitted`);
  console.log(`  ✓ 제출 시도 — URL: ${page.url()}`);
  return { ok: true, url: page.url() };
}

// ──────────────────────────────────────────
// Phase E: 빈 필드 보강용 헬퍼들
// ──────────────────────────────────────────

// REVISION (수정 및 재진행 안내) textarea 채우기
async function fillRevision(page, text) {
  const ta = page.locator('textarea[name="REVISION.valueData.revision"]').first();
  if (!(await ta.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log(`  ✗ REVISION textarea 미발견`);
    return { ok: false, error: 'REVISION 미발견' };
  }
  await ta.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  await sleep(200);
  await ta.click({ force: true });
  await page.keyboard.press('Control+A').catch(() => {});
  await sleep(100);
  await page.keyboard.press('Delete').catch(() => {});
  await sleep(100);
  await ta.fill(text);
  console.log(`  ✓ REVISION (${text.length}자)`);
  return { ok: true, length: text.length };
}

// 상세 이미지 갤러리 (#IMAGE_GALLERY) — 9슬롯 multi-upload
async function fillSubGallery(page, imagePaths) {
  if (!imagePaths || imagePaths.length === 0) return { ok: true, skipped: true };
  // 존재 검증
  const existing = imagePaths.filter((p) => fs.existsSync(p));
  if (existing.length === 0) {
    console.log(`  ✗ 갤러리 이미지 0장 (모두 없음): ${imagePaths.join(', ')}`);
    return { ok: false, error: 'all images missing' };
  }
  const inp = page.locator('#IMAGE_GALLERY input[type="file"]').first();
  if ((await inp.count()) === 0) {
    console.log(`  ✗ #IMAGE_GALLERY input 미발견`);
    return { ok: false, error: 'IMAGE_GALLERY input 미발견' };
  }
  // multi-upload 시도
  try {
    await inp.setInputFiles(existing);
    await sleep(6000);
    console.log(`  ✓ 갤러리 ${existing.length}장 multi-upload`);
    return { ok: true, count: existing.length, mode: 'multi' };
  } catch (e) {
    // 한 장씩 시도
    let count = 0;
    for (const p of existing) {
      try {
        await inp.setInputFiles(p);
        await sleep(4000);
        count++;
      } catch (e2) {
        console.log(`  ⚠ 갤러리 ${path.basename(p)} 실패: ${e2.message}`);
      }
    }
    console.log(`  ${count > 0 ? '✓' : '✗'} 갤러리 ${count}/${existing.length}장 (single mode)`);
    return { ok: count > 0, count, mode: 'single', requested: existing.length };
  }
}

// extraSelects 배열 처리 — { label, value, nth? }
// react state commit 안정화를 위해 각 select 사이 sleep 추가
async function fillExtraSelects(page, selectMap, items) {
  if (!items || items.length === 0) return { ok: true, skipped: true, results: [] };
  const counter = {};
  const results = [];
  for (const item of items) {
    const nth = item.nth !== undefined ? item.nth : (counter[item.label] || 0);
    counter[item.label] = (counter[item.label] || 0) + 1;
    const r = await fillSelectByLabel(page, selectMap, item.label, item.value, nth);
    results.push({ label: item.label, value: item.value, nth, ok: r.ok, picked: r.picked, fallback: r.fallback, skipped: r.skipped });
    // 각 select 사이 1초 sleep — react state commit + dropdown 닫기 안정화
    await sleep(1000);
  }
  const okCount = results.filter((r) => r.ok).length;
  return { ok: okCount > 0, results, okCount, total: items.length };
}

// react-select 선택값 검증 (singleValue text)
async function getSelectedValue(page, inputId) {
  return await page.evaluate((iid) => {
    const el = document.getElementById(iid);
    if (!el) return null;
    let cur = el;
    for (let i = 0; i < 12; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      if (typeof cur.className === 'string' && cur.className.includes('control')) {
        const sv = cur.querySelector('[class*="singleValue"]');
        if (sv) return (sv.innerText || '').trim();
        return '';
      }
    }
    return '';
  }, inputId);
}

// ──────────────────────────────────────────
// Phase E: update 모드 — 기존 draft 페이지에 빈 필드만 채워서 다시 임시저장
// ──────────────────────────────────────────
async function updateDraft(product, mode = 'update') {
  const extra = EXTRA[product.id];
  if (!extra) {
    return { ok: false, log: { id: product.id, errors: [`EXTRA[${product.id}] 미정의`] } };
  }
  const probeOnly = mode === 'update-probe';
  const url = `https://kmong.com/my-gigs/edit/${extra.draftId}?rootCategoryId=6&subCategoryId=${extra.subCategoryId}`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[update] 상품 ${product.id} — ${product.title}`);
  console.log(`[update] draftId=${extra.draftId} cat=${extra.subCategoryId} probeOnly=${probeOnly}`);
  console.log(`${'='.repeat(60)}`);

  const log = {
    id: product.id,
    title: product.title,
    mode,
    draftId: extra.draftId,
    steps: [],
    errors: [],
    at: new Date().toISOString(),
  };

  let browser;
  try {
    const r = await login({ slowMo: 100 });
    browser = r.browser;
    const page = r.page;

    console.log(`[update] goto ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(7000);
    await closeModals(page).catch(() => {});
    await snap(page, `gig-${product.id}-update-initial`);

    // 1. extraSelects (카테고리별 추가 select)
    console.log(`\n[update] extraSelects (${(extra.extraSelects || []).length}개)`);
    const selectMap = await discoverSelects(page);
    console.log(`  selectMap=${selectMap.length}개`);
    const sRes = await fillExtraSelects(page, selectMap, extra.extraSelects || []);
    log.steps.push({ name: 'extraSelects', ...sRes });

    // 2. REVISION
    console.log(`\n[update] REVISION`);
    const rRes = await fillRevision(page, extra.revision);
    log.steps.push({ name: 'revision', ...rRes });

    // 3. 갤러리 이미지
    console.log(`\n[update] 상세 이미지 갤러리`);
    const galleryPaths = (extra.gallery || []).map((f) => path.join(IMAGE_DIR, f));
    const gRes = await fillSubGallery(page, galleryPaths);
    log.steps.push({ name: 'gallery', ...gRes });

    await snap(page, `gig-${product.id}-update-filled`);

    // 4. 임시 저장
    if (probeOnly) {
      console.log(`\n[update] probeOnly=true — 저장 안 함`);
      log.steps.push({ name: 'save', skipped: true, mode: 'probe' });
    } else {
      console.log(`\n[update] "임시 저장하기" 클릭`);
      const saveBtn = page.locator('button:has-text("임시 저장하기")').first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click({ force: true });
        await sleep(7000);
        await snap(page, `gig-${product.id}-update-saved`);
        log.steps.push({ name: 'save', ok: true, savedUrl: page.url() });
        console.log(`  ✓ 임시 저장 완료 — URL: ${page.url()}`);
      } else {
        log.steps.push({ name: 'save', ok: false, error: '임시 저장 버튼 미발견' });
        log.errors.push('임시 저장 버튼 미발견');
      }
    }

    return { ok: log.errors.length === 0, log };
  } catch (e) {
    console.error(`✗ update 실패: ${e.message}`);
    log.errors.push(e.message);
    return { ok: false, log };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ──────────────────────────────────────────
// 단일 상품 등록
// ──────────────────────────────────────────
async function createGig(product, mode) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`상품 ${product.id} — ${product.title}`);
  console.log(`mode=${mode} cat=${product.cat1} > ${product.cat2} image=${product.image}`);
  console.log('='.repeat(60));

  let browser;
  const log = { id: product.id, title: product.title, mode, steps: [], errors: [], at: new Date().toISOString() };

  try {
    const r = await login({ slowMo: 150 });
    browser = r.browser;
    const page = r.page;

    // Step 1
    const s1 = await fillStep1(page, product);
    log.steps.push({ name: 'step1', ...s1 });

    // Step 2
    const s2 = await fillStep2(page, product, { probeOnly: mode === 'probe' });
    log.steps.push({ name: 'step2', ...s2 });

    // Step 3 (제출)
    if (mode === 'submit') {
      const s3 = await submitGig(page, product);
      log.steps.push({ name: 'submit', ...s3 });
    }

    return { ok: true, log };
  } catch (e) {
    console.error(`✗ 실패: ${e.message}`);
    log.errors.push(e.message);
    return { ok: false, log };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ──────────────────────────────────────────
// CLI
// ──────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { product: 'all', mode: 'probe' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--product' && args[i + 1]) opts.product = args[++i];
    else if (args[i] === '--mode' && args[i + 1]) opts.mode = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') { console.log(usage()); process.exit(0); }
  }
  return opts;
}

function usage() {
  return `사용법:
  node create-gig.js --product 1 --mode probe          # 1번 상품, 옵션 탐색만
  node create-gig.js --product 1 --mode save           # 1번 상품, 신규 임시 저장
  node create-gig.js --product all --mode save         # 8개 모두 신규 임시 저장
  node create-gig.js --product 1 --mode submit         # 1번 상품, 실제 발행
  node create-gig.js --product 1 --mode update-probe   # Phase E 빈 필드 보강 dry-run
  node create-gig.js --product 1 --mode update         # Phase E 빈 필드 보강 + 저장
  node create-gig.js --product all --mode update       # 8개 모두 Phase E 보강

Modes:
  probe         드롭다운 옵션 탐색만, 저장 X (안전, 첫 실행 권장)
  save          모든 필드 채운 후 "임시 저장하기" 클릭 (신규 등록)
  submit        "제출하기" 클릭 (실 발행, 비용 발생 가능)
  update-probe  Phase E (빈 필드 보강) — 기존 draft URL 진입 후 dry-run, 저장 X
  update        Phase E — 기존 draft URL 진입 후 빈 필드 채우고 다시 임시저장
`;
}

// require('./create-gig') 시 자동 실행 차단 — CLI 직접 호출일 때만 IIFE 동작
if (require.main !== module) {
  module.exports = { createGig, updateDraft, fillStep1, fillStep2, fillRevision, fillSubGallery, fillExtraSelects };
  return;
}

(async () => {
  const opts = parseArgs();
  const targets = opts.product === 'all'
    ? PRODUCTS
    : PRODUCTS.filter(p => p.id === String(opts.product).padStart(2, '0'));

  if (targets.length === 0) {
    console.error(`상품 "${opts.product}" 미발견. 01~06 또는 all`);
    console.error(usage());
    process.exit(1);
  }

  const VALID_MODES = ['probe', 'save', 'submit', 'update', 'update-probe'];
  if (!VALID_MODES.includes(opts.mode)) {
    console.error(`잘못된 mode: ${opts.mode}. ${VALID_MODES.join('/')} 중 하나`);
    process.exit(1);
  }

  console.log(`▶ 실행: product=${opts.product} mode=${opts.mode} 대상=${targets.length}개`);

  const isUpdateMode = opts.mode === 'update' || opts.mode === 'update-probe';
  const results = [];
  for (const p of targets) {
    const r = isUpdateMode ? await updateDraft(p, opts.mode) : await createGig(p, opts.mode);
    results.push(r);
    // 다음 상품 전 잠시 대기
    if (targets.length > 1) await sleep(3000);
  }

  // 로그 저장 (기존 형식과 무관하게 신규 형식으로 누적)
  let allRuns = [];
  try {
    const prev = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
    if (Array.isArray(prev.runs)) allRuns = prev.runs;
  } catch {}
  allRuns.push({ at: new Date().toISOString(), opts, results: results.map(r => r.log) });
  fs.writeFileSync(LOG_PATH, JSON.stringify({ runs: allRuns }, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log('실행 요약');
  console.log('='.repeat(60));
  results.forEach(r => {
    const s = r.ok ? '✓' : '✗';
    const errs = r.log.errors.length ? ` (${r.log.errors.join('; ')})` : '';
    console.log(`  ${s} ${r.log.id} ${r.log.title}${errs}`);
  });

  const failCount = results.filter(r => !r.ok).length;
  process.exit(failCount > 0 ? 2 : 0);
})();
