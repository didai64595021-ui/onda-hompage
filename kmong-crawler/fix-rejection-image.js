#!/usr/bin/env node
/**
 * 비승인 이미지 자동 교체 + 재제출
 *
 * 흐름:
 *  1) DB에서 rejection_log 로드 (id 인자)
 *  2) Opus로 이미지 컨셉 프롬프트 생성 (제목/카테고리 → 깨끗한 일러스트 컨셉, 금지문구 X)
 *  3) OpenAI gpt-image-1 으로 이미지 생성 (1536x1024)
 *  4) sharp로 652x488 (크몽 권장) 리사이즈/크롭
 *  5) Playwright: /my-gigs?REJECTED → 편집하기 → 메인이미지 삭제 → 새이미지 업로드
 *  6) 승인규정 체크 → 제출하기 → 모달 제출하기
 *  7) DB 업데이트 (applied/resubmitted) + 텔레그램 보고
 *
 * 사용: node fix-rejection-image.js <rejection_id> [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { supabase } = require('./lib/supabase');
const { login } = require('./lib/login');
const { generateMainImage } = require('./lib/openai-image-gen');
const { askClaude } = require('./lib/claude-max');

function notifyPlain(text) {
  return new Promise((resolve) => {
    const child = spawn('node', ['/home/onda/scripts/telegram-sender.js', text], { stdio: 'ignore' });
    child.on('close', resolve);
    setTimeout(resolve, 8000);
  });
}

function parseArgs() {
  const a = process.argv.slice(2);
  const reuseIdx = a.indexOf('--reuse-image');
  return {
    rejectionId: a.find(x => /^\d+$/.test(x)),
    apply: !a.includes('--dry-run'),
    reuseImage: reuseIdx >= 0 ? a[reuseIdx + 1] : null,
  };
}

async function buildImagePrompt({ gig_title, reason_text }) {
  const r = await askClaude({
    system: `당신은 크몽 메인 이미지 컨셉 디자이너입니다.
핵심 원칙:
1. 제목의 핵심 메타포가 이미지에 명확히 드러나야 함 (서비스 정체성 = 매출).
2. 텍스트/숫자/통화기호/할인표시 일체 금지 (크몽 정책).
3. 깔끔한 플랫 일러스트, 모던 미니멀, 의미 전달 우선.`,
    messages: [{
      role: 'user',
      content: `서비스 제목: ${gig_title}
직전 비승인 사유 (이런 요소는 절대 포함 금지): ${(reason_text || '').slice(0, 600)}

작업:
1. 먼저 제목을 분석 — 핵심 키워드 / 시각적 메타포 / 변화의 방향(from→to) 추출
2. 그 메타포를 강하게 드러내는 영문 시각 컨셉을 80~120 단어로 작성
3. 제목의 모든 핵심 명사가 시각 요소로 1:1 대응되도록 (예: "이사" → moving boxes/truck, "탈출" → broken chain or open door, "월구독료" → recurring cycle/calendar loop, "자체홈페이지" → standalone house/anchored building)
4. 텍스트/숫자/통화/브랜드로고 일체 금지

결과: 영문 비주얼 컨셉 텍스트만 출력 (설명·번역·메타정보 X). 첫 줄에 핵심 메타포 한 문장.`,
    }],
    model: 'opus',
    max_tokens: 1200,
  });
  if (!r.ok) throw new Error('이미지 컨셉 생성 실패: ' + r.error);
  return r.text.trim();
}

async function ensureSize652x488(inputPath, outputPath) {
  await sharp(inputPath).resize(652, 488, { fit: 'cover', position: 'center' }).png({ compressionLevel: 6 }).toFile(outputPath);
  return outputPath;
}

async function clickEditFor(page, draftId) {
  // REJECTED 와 WAITING(승인 전) 둘 다 검색 — 재제출 후엔 WAITING 으로 이동
  const tabs = ['REJECTED', 'WAITING', 'SELLING'];
  for (const tab of tabs) {
    await page.goto(`https://kmong.com/my-gigs?statusType=${tab}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    for (let i = 0; i < 5; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await page.waitForTimeout(400); }
    const r = await page.evaluate((did) => {
      const btns = [...document.querySelectorAll('button')].filter(b => (b.innerText||'').trim() === '편집하기');
      for (const b of btns) {
        let card = b.closest('article');
        if (!card) {
          let cur = b;
          for (let i = 0; i < 6; i++) { cur = cur.parentElement; if (!cur) break; if ((cur.innerText || '').match(/#\d{6,}/)) { card = cur; break; } }
        }
        if (card && (card.innerText || '').includes('#' + did)) { b.click(); return true; }
      }
      return false;
    }, String(draftId));
    if (r) {
      console.log(`[편집진입] ${tab} 탭에서 발견`);
      await page.waitForTimeout(8000);
      return;
    }
  }
  throw new Error(`#${draftId} 편집 버튼 미발견 (REJECTED/WAITING/SELLING 전체 검색)`);
}

async function deleteCurrentMainImage(page) {
  // "메인 이미지" 섹션 안의 "삭제" 버튼 클릭
  const ok = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('h3,h4,div,label,span')].filter(el => /^메인\s*이미지/.test((el.innerText||'').trim()));
    if (!headers.length) return false;
    const root = headers[0].closest('section,div');
    if (!root) return false;
    const dels = [...root.querySelectorAll('button')].filter(b => (b.innerText||'').trim() === '삭제');
    if (!dels.length) return false;
    dels[0].click();
    return true;
  });
  if (!ok) console.log('[삭제] 기존 이미지 삭제 버튼 못 찾음 (이미 비어있을 수 있음)');
  await page.waitForTimeout(2000);
  // 확인 모달 처리
  try {
    const ok2 = await page.locator('button:has-text("확인")').first().isVisible({ timeout: 2000 }).catch(() => false);
    if (ok2) { await page.locator('button:has-text("확인")').first().click({ force: true }); await page.waitForTimeout(1500); }
  } catch {}
}

async function uploadNewMainImage(page, imagePath) {
  // file input은 보통 hidden — 메인이미지 섹션 내부 input[type=file] 찾아서 setInputFiles
  const fileInput = await page.evaluateHandle(() => {
    const headers = [...document.querySelectorAll('h3,h4,div,label,span')].filter(el => /^메인\s*이미지/.test((el.innerText||'').trim()));
    if (!headers.length) return null;
    const root = headers[0].closest('section,div');
    if (!root) return null;
    return root.querySelector('input[type=file]');
  });
  const el = fileInput.asElement();
  if (!el) {
    // fallback: 페이지 전역 첫번째 file input
    const all = await page.$$('input[type=file]');
    if (!all.length) throw new Error('input[type=file] 못 찾음');
    await all[0].setInputFiles(imagePath);
  } else {
    await el.setInputFiles(imagePath);
  }
  console.log('[업로드] setInputFiles 완료 →', imagePath);
  await page.waitForTimeout(8000);
}

async function submitForApproval(page) {
  console.log('[제출] 페이지 맨 아래로 스크롤');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  // 승인규정 체크박스
  try {
    const checks = await page.$$('input[type=checkbox]');
    console.log('[제출] 체크박스', checks.length, '개');
    for (const c of checks) {
      try { if (!(await c.isChecked())) await c.check({ force: true }); } catch {}
    }
  } catch (e) { console.log('[제출] 체크박스 처리 실패:', e.message); }
  await page.waitForTimeout(1000);

  // 제출하기 버튼 — exact match로 locator
  console.log('[제출] 제출하기 버튼 찾기');
  const submitBtn = page.getByRole('button', { name: '제출하기', exact: true }).first();
  await submitBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  if (!(await submitBtn.isVisible({ timeout: 6000 }).catch(() => false))) {
    throw new Error('제출하기 버튼 미발견 (페이지 맨 아래)');
  }
  await submitBtn.click({ force: true });
  console.log('[제출] 제출하기 클릭 완료');
  await page.waitForTimeout(4000);

  // 최종 확인 모달 — 다시 "제출하기"
  const modalSubmit = page.locator('div[role=dialog]').getByRole('button', { name: '제출하기', exact: true }).first();
  if (await modalSubmit.isVisible({ timeout: 6000 }).catch(() => false)) {
    await modalSubmit.click({ force: true });
    console.log('[제출] 모달 제출하기 클릭');
    await page.waitForTimeout(6000);
    return { ok: true, via: 'modal' };
  }
  return { ok: true, via: 'direct' };
}

async function main() {
  const args = parseArgs();
  if (!args.rejectionId) { console.error('사용: node fix-rejection-image.js <rejection_id>'); process.exit(2); }

  const startTime = Date.now();
  console.log(`=== fix-rejection-image #${args.rejectionId} ${args.apply ? '(자동적용)' : '(dry-run)'} ===`);

  // 1) DB 로드
  const { data: log, error } = await supabase
    .from('kmong_gig_rejection_log').select('*').eq('id', args.rejectionId).single();
  if (error || !log) { console.error('rejection_log 못 찾음:', error?.message); process.exit(1); }
  console.log(`[로드] #${log.id} ${log.gig_title} draft=${log.draft_id} pid=${log.product_id}`);

  if (!log.draft_id) { console.error('draft_id 없음 — 편집 진입 불가'); process.exit(1); }

  let resized;
  if (args.reuseImage) {
    if (!fs.existsSync(args.reuseImage)) { console.error('reuseImage 파일 없음:', args.reuseImage); process.exit(1); }
    resized = args.reuseImage;
    console.log('[재사용] 기존 이미지 사용:', resized);
  } else {
    // 2) 이미지 컨셉 프롬프트
    console.log('[컨셉] Opus 호출');
    const conceptPrompt = await buildImagePrompt({ gig_title: log.gig_title, reason_text: log.reason_raw });
    console.log('[컨셉] 길이', conceptPrompt.length);

    // 3) OpenAI 이미지 생성
    const genRes = await generateMainImage({
      prompt: conceptPrompt,
      size: '1536x1024',
      outDir: path.join(__dirname, 'tmp-gen-images'),
      filenamePrefix: `rej${log.id}`,
    });
    if (!genRes.ok) { console.error('이미지 생성 실패:', genRes.error); process.exit(1); }
    console.log('[생성] OK', genRes.file_path);

    // 4) 652x488 리사이즈
    resized = genRes.file_path.replace(/\.png$/, '_652x488.png');
    await ensureSize652x488(genRes.file_path, resized);
    console.log('[리사이즈] OK', resized, fs.statSync(resized).size, 'bytes');
  }

  if (!args.apply) {
    console.log('[dry-run] 업로드/제출 스킵. 생성된 이미지:', resized);
    await notifyPlain(`#${log.id} 이미지 생성 완료 (dry-run): ${resized}`);
    return;
  }

  // 5~6) Playwright
  const { browser, page } = await login({ slowMo: 200 });
  let outcome = { ok: false };
  try {
    await clickEditFor(page, log.draft_id);
    console.log('[진입] 편집 페이지', page.url());

    await deleteCurrentMainImage(page);
    await uploadNewMainImage(page, resized);

    outcome = await submitForApproval(page);
    console.log('[제출]', outcome);
  } catch (e) {
    console.error('[예외]', e.message);
    outcome = { ok: false, error: e.message };
  } finally {
    await browser.close();
  }

  // 7) DB 업데이트 + 텔레그램
  await supabase.from('kmong_gig_rejection_log')
    .update({
      applied: outcome.ok,
      applied_at: new Date().toISOString(),
      apply_result: { ok: outcome.ok, error: outcome.error, via: outcome.via, image_path: resized },
      resubmitted: outcome.ok,
      resubmitted_at: outcome.ok ? new Date().toISOString() : null,
    })
    .eq('id', log.id);

  await notifyPlain([
    `${outcome.ok ? '✅' : '❌'} 비승인 이미지 자동교체 #${log.id}`,
    `서비스: ${log.gig_title}`,
    `사유: ${log.reason_summary}`,
    `이미지: ${path.basename(resized)}`,
    `결과: ${outcome.ok ? '재제출 완료 (' + outcome.via + ')' : '실패: ' + (outcome.error || '?')}`,
    `소요: ${((Date.now() - startTime) / 1000).toFixed(1)}초`,
  ].join('\n'));

  console.log(`[OK] ${((Date.now() - startTime) / 1000).toFixed(1)}초`);
}

main().catch(async (err) => {
  console.error('[치명적]', err);
  await notifyPlain('fix-rejection-image 치명적 실패: ' + err.message);
  process.exit(1);
});
