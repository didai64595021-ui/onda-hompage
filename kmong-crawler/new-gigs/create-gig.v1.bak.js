#!/usr/bin/env node
/**
 * 크몽 신규 서비스 등록 RPA (Step 5)
 *
 * - 진입: https://kmong.com/my-gigs/new
 * - 제목 30자 한도, 특수문자 ": + - # / . ( )" 만 허용 (정찰 확정)
 * - 다단계 마법사 형태:
 *     Step 1: 제목 + 카테고리 (1차/2차)
 *     Step 2~: 패키지/설명/이미지/태그/FAQ (후속 정찰 필요)
 *
 * 사용법:
 *   DRY_RUN=1 node create-gig.js 1               # 상품 1만 dry-run (실제 제출 X)
 *   DRY_RUN=1 node create-gig.js all             # 6개 모두 dry-run
 *   node create-gig.js 1                          # 실제 등록 (현재는 미지원, 안전상 거부)
 *
 * 안전:
 * - 기본은 DRY_RUN=1 강제. DRY_RUN을 명시적으로 0으로 설정해도
 *   현재 버전은 후속 단계 셀렉터 미정찰로 실제 제출 거부.
 * - 단계별 스크린샷 자동 저장: screenshots/create-gig-N-stepM.png
 * - 등록 흐름의 모든 단계를 텔레그램에 진행 알림
 *
 * spec 로드:
 * - 02-product-specs/0X-*.md 의 ## 크몽 제목 코드 블록을 파싱
 * - 30자 초과 시 ERROR
 * - 허용 문자 외 발견 시 ERROR
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const SPEC_DIR = path.join(__dirname, '02-product-specs');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const IMAGE_DIR = path.join(__dirname, '03-images');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ALLOWED_TITLE_CHARS = /^[가-힣a-zA-Z0-9\s:+\-#\/\.()]+$/;
const TITLE_MAX = 30;

// 6개 상품 메타 — 인덱스 + spec 파일명
const PRODUCTS = [
  { id: '01', spec: '01-telegram-alert-bot.md',     image: '01-openai.png', cat1: 'IT·프로그래밍', cat2: '봇·챗봇' },
  { id: '02', spec: '02-seller-price-monitor.md',   image: '02-openai.png', cat1: 'IT·프로그래밍', cat2: 'PC·웹 프로그램' },
  { id: '03', spec: '03-doc-gpt-automation.md',     image: '03-openai.png', cat1: 'IT·프로그래밍', cat2: 'PC·웹 프로그램' },
  { id: '04', spec: '04-pdf-chatbot.md',            image: '04-openai.png', cat1: 'IT·프로그래밍', cat2: '데이터·AI' },
  { id: '05', spec: '05-rag-enterprise.md',         image: '05-openai.png', cat1: 'IT·프로그래밍', cat2: '데이터·AI' },
  { id: '06', spec: '06-fullstack-channel.md',      image: '06-openai.png', cat1: 'IT·프로그래밍', cat2: '데이터·AI' },
];

// ─── spec 파싱: ## 크몽 제목 코드 블록 → 첫 줄 ───
function parseSpec(specPath) {
  const md = fs.readFileSync(specPath, 'utf-8');
  // ## 크몽 제목 ... ``` ... ```
  const titleSection = md.match(/##\s*크몽\s*제목[^\n]*\n+```\n?([^\n]+)\n?```/);
  const title = titleSection ? titleSection[1].trim() : '';

  // ## 태그 ... 1. `xxx` 2. `xxx` ...
  const tagsSection = md.match(/##\s*태그[\s\S]*?(?=\n##\s)/);
  let tags = [];
  if (tagsSection) {
    tags = [...tagsSection[0].matchAll(/`([^`]+)`/g)].map(m => m[1]);
  }

  // 가격: ### Standard ₩XX,XXX
  const stdMatch = md.match(/###\s*Standard\s*₩([\d,]+)/);
  const dlxMatch = md.match(/###\s*Deluxe\s*₩([\d,]+)/);
  const prmMatch = md.match(/###\s*Premium\s*₩([\d,]+)/);
  const prices = {
    standard: stdMatch ? parseInt(stdMatch[1].replace(/,/g, ''), 10) : null,
    deluxe: dlxMatch ? parseInt(dlxMatch[1].replace(/,/g, ''), 10) : null,
    premium: prmMatch ? parseInt(prmMatch[1].replace(/,/g, ''), 10) : null,
  };

  return { title, tags, prices, raw: md };
}

function validateTitle(title) {
  const errs = [];
  if (!title) errs.push('제목 비어있음');
  if (title.length > TITLE_MAX) errs.push(`제목 ${title.length}자 (한도 ${TITLE_MAX}자 초과)`);
  if (!ALLOWED_TITLE_CHARS.test(title)) {
    const bad = [...title].filter(c => !ALLOWED_TITLE_CHARS.test(c));
    errs.push(`허용되지 않는 문자: ${[...new Set(bad)].join('')}`);
  }
  if (title.length < 10) errs.push(`제목 ${title.length}자 (최소 10자 미만)`);
  return errs;
}

async function snap(page, label) {
  const out = path.join(SCREENSHOT_DIR, `${label}.png`);
  await page.screenshot({ path: out, fullPage: true }).catch(() => {});
  console.log(`  📸 ${out}`);
  return out;
}

async function selectCategory(page, label, value) {
  console.log(`  → ${label} 선택: "${value}"`);
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) {
    return { ok: false, error: `${label} 버튼 미발견` };
  }
  await btn.click({ force: true });
  await page.waitForTimeout(2000);

  // 옵션 클릭 — 정확 일치 또는 부분 일치
  const opt = page.locator(`[role="dialog"] button, [role="listbox"] [role="option"], [class*="modal"] button`).filter({ hasText: value }).first();
  if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await opt.click({ force: true });
    await page.waitForTimeout(1500);
    return { ok: true };
  }
  // 부분 일치 fallback
  const partial = value.split(/[·\s]/)[0];
  const opt2 = page.locator(`[role="dialog"] button, [role="listbox"] [role="option"]`).filter({ hasText: partial }).first();
  if (await opt2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await opt2.click({ force: true });
    await page.waitForTimeout(1500);
    return { ok: true, partial: true };
  }
  // 모달 닫기
  await page.keyboard.press('Escape').catch(() => {});
  return { ok: false, error: `${label} 옵션 "${value}" 미발견` };
}

async function createGigDryRun(product, opts = {}) {
  const dryRun = opts.dryRun !== false;
  const spec = parseSpec(path.join(SPEC_DIR, product.spec));
  console.log(`\n=== 상품 ${product.id} — ${spec.title} ===`);
  console.log(`  태그: ${spec.tags.slice(0, 5).join(', ')}`);
  console.log(`  가격: ${JSON.stringify(spec.prices)}`);
  console.log(`  카테고리: ${product.cat1} > ${product.cat2}`);
  console.log(`  이미지: ${product.image}`);
  console.log(`  DRY_RUN: ${dryRun}`);

  const titleErrs = validateTitle(spec.title);
  if (titleErrs.length > 0) {
    console.error(`  ✗ 제목 검증 실패:`, titleErrs);
    return { ok: false, errors: titleErrs };
  }

  const imagePath = path.join(IMAGE_DIR, product.image);
  if (!fs.existsSync(imagePath)) {
    console.error(`  ✗ 이미지 없음: ${imagePath}`);
    return { ok: false, errors: [`이미지 없음 ${imagePath}`] };
  }

  let browser;
  const log = { product: product.id, dryRun, steps: [], errors: [] };
  try {
    const r = await login({ slowMo: 200 });
    browser = r.browser;
    const page = r.page;

    // ─── Step 1: 진입 ───
    console.log(`[Step1] /my-gigs/new 진입`);
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await closeModals(page).catch(() => {});
    await snap(page, `create-gig-${product.id}-step1-initial`);
    log.steps.push({ name: 'step1-initial', url: page.url() });

    // ─── Step 1: 제목 입력 ───
    console.log(`[Step1] 제목 입력: "${spec.title}" (${spec.title.length}자)`);
    const titleInput = page.locator('input[placeholder*="제목을 입력"]').first();
    if (!(await titleInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      throw new Error('제목 input 미발견');
    }
    await titleInput.click();
    await titleInput.fill(spec.title);
    await page.waitForTimeout(800);
    const inserted = await titleInput.inputValue();
    log.steps.push({ name: 'step1-title', value: inserted });

    // ─── Step 1: 1차 카테고리 ───
    const r1 = await selectCategory(page, '1차 카테고리', product.cat1);
    log.steps.push({ name: 'step1-cat1', ...r1 });
    if (!r1.ok) log.errors.push(r1.error);

    // ─── Step 1: 2차 카테고리 ───
    const r2 = await selectCategory(page, '2차 카테고리', product.cat2);
    log.steps.push({ name: 'step1-cat2', ...r2 });
    if (!r2.ok) log.errors.push(r2.error);

    await snap(page, `create-gig-${product.id}-step1-filled`);

    // ─── Step 1 → 다음 ───
    if (dryRun) {
      console.log(`[Step1] DRY_RUN — "다음" 미클릭, 종료`);
      log.steps.push({ name: 'dry-run-stop', note: 'DRY_RUN: 다음 버튼 미클릭, 후속 단계 진행 안 함' });
      await snap(page, `create-gig-${product.id}-step1-final`);
      return { ok: true, dryRun: true, log };
    }

    // 실제 모드 — 후속 단계는 추가 정찰 필요. 안전상 거부.
    throw new Error('후속 단계 셀렉터 미정찰. 현재 버전은 dry-run 전용. DRY_RUN=1로 실행하세요.');

  } catch (e) {
    console.error(`  ✗ 실패: ${e.message}`);
    log.errors.push(e.message);
    if (browser) {
      try {
        const pages = browser.contexts()[0].pages();
        if (pages[0]) await snap(pages[0], `create-gig-${product.id}-ERROR`);
      } catch {}
    }
    return { ok: false, log };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

(async () => {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';
  const dryRun = process.env.DRY_RUN !== '0';
  if (!dryRun) {
    console.error('⚠ DRY_RUN=0 명시됨. 그러나 현재 버전은 후속 단계 셀렉터 미정찰로 실제 등록 거부합니다.');
    console.error('  DRY_RUN=1로 다시 실행하세요. (1단계까지만 dry-run)');
    process.exit(2);
  }

  const targets = target === 'all'
    ? PRODUCTS
    : PRODUCTS.filter(p => p.id === String(target).padStart(2, '0'));

  if (targets.length === 0) {
    console.error(`상품 ID "${target}" 없음. 01~06 또는 all`);
    process.exit(1);
  }

  const results = [];
  for (const p of targets) {
    const r = await createGigDryRun(p, { dryRun });
    results.push({ product: p.id, ...r });
  }

  console.log('\n=== 요약 ===');
  for (const r of results) {
    const status = r.ok ? `✓ dry-run OK` : `✗ ${r.log?.errors?.join('; ') || 'fail'}`;
    console.log(`  ${r.product}: ${status}`);
  }
  fs.writeFileSync(
    path.join(__dirname, 'create-gig-log.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2)
  );

  const failCount = results.filter(r => !r.ok).length;
  process.exit(failCount > 0 ? 2 : 0);
})();

module.exports = { parseSpec, validateTitle, PRODUCTS };
