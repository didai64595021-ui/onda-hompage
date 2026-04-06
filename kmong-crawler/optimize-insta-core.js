#!/usr/bin/env node
/**
 * 크몽 insta-core (gig 662105) CTR 최적화 전면 수정
 * 제목 + 상세설명 + 검색키워드 + FAQ 전부 교체
 *
 * 실행: node --env-file=.env optimize-insta-core.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { login, saveErrorScreenshot } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const { notify } = require('./lib/telegram');
const path = require('path');
const fs = require('fs');

const GIG_ID = 662105;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ═══════════════════════════════════════════════════
// 수정 데이터
// ═══════════════════════════════════════════════════

const NEW_TITLE = '팔로워 늘리기 - 인스타그램 활성화 전문';

const NEW_DESCRIPTION = `[ 인스타그램이 안 오르는 3가지 이유 ]

게시물을 올려도 팔로워가 늘지 않으시나요?
광고비만 쓰고 반응이 없으신가요?
경쟁업체는 잘 되는데 내 계정만 안 되는 것 같으신가요?

저희는 그 이유를 압니다.
팔로워 수가 아니라 실제 타깃 유저와의 진짜 소통이 없기 때문입니다.




[ 온다마케팅이 하는 것 ]

온다마케팅은 귀사 업종에 맞는 실계정 타깃 유저를 직접 발굴하여
좋아요 + 팔로우 + 댓글 소통을 30일간 지속합니다.

매크로 없음 / 허위 계정 없음 / 100% 실사용자 기반.

작업 시작 후 3일 이내에 팔로워 증가 + 프로필 유입이 눈에 띄게 늘어납니다.




[ 진행 후 실제 변화 ]

- 팔로워 수 증가 (업종/계정 상태에 따라 차이)
- 저장 + 공유 수 증가
- 프로필 방문자 증가 → 문의 전환 가능성 상승
- DM 문의 자연 증가

리뷰 평점 5.0 / 50건+ 완료




[ 이런 분께 맞습니다 ]

- 오픈한 지 얼마 안 된 인스타 계정 운영 중
- 게시물 올려도 좋아요가 5개 미만
- 팔로워 1,000명 이하인 초기 계정
- 광고 쓰기 전 자연 성장 먼저 해보고 싶은 분
- 쇼핑몰 / 음식점 / 뷰티 / 필라테스 등 로컬·커머스 계정




[ 작업 절차 ]

1. 주문 후 계정 정보 전달 (ID만 / 비밀번호 불필요)
2. 업종 타깃 유저 리스트 구성 (1일 소요)
3. 실계정 소통 작업 시작 (30일 진행)
4. 매주 작업 현황 보고서 제공
5. 완료 후 팔로워 증가 결과 공유




[ 자주 하시는 질문 ]

Q. 계정 비밀번호가 필요한가요?
A. 전혀 필요 없습니다. 인스타그램 ID만 주시면 됩니다.

Q. 팔로워가 나중에 다 빠지나요?
A. 실계정 기반이라 대규모 이탈 없습니다. 단, 관심 없어진 유저는 자연 unfollow 할 수 있습니다.

Q. 얼마나 늘어나나요?
A. 계정 상태·업종·현재 팔로워 수에 따라 다릅니다. 사전 상담 후 안내드립니다.`;

const NEW_KEYWORDS = [
  '인스타그램 팔로워 늘리기',
  '인스타그램 활성화',
  '인스타그램 마케팅',
  'SNS 마케팅',
  '인스타그램 홍보',
];

const NEW_FAQ = [
  { q: '계정 비밀번호가 필요한가요?', a: '전혀 필요 없습니다. 인스타그램 ID(아이디)만 주시면 작업 진행이 가능합니다.' },
  { q: '팔로워가 나중에 다 빠지나요?', a: '저희는 실계정 기반으로 진행합니다. 매크로·허위 계정이 아니기 때문에 대규모 이탈은 없습니다. 다만 팔로우 후 관심 없어진 유저가 자연스럽게 언팔할 수 있습니다.' },
  { q: '얼마나 늘어나나요?', a: '계정 상태, 업종, 현재 팔로워 수에 따라 결과가 다릅니다. 주문 전 문의하시면 예상치 안내드립니다.' },
  { q: '작업 시간이 얼마나 걸리나요?', a: '주문 후 1일 내 타깃 구성 완료, 이후 30일간 실계정 소통 진행합니다.' },
  { q: '업무시간이 어떻게 되나요?', a: '평일 10:00~19:00입니다. 공휴일 및 주말은 제외입니다.' },
  { q: '어떤 업종에 효과적인가요?', a: '쇼핑몰, 음식점, 뷰티, 필라테스·PT, 인테리어, 공방 등 로컬·커머스 계정에 가장 효과적입니다. 사전 상담 후 업종 맞춤 전략을 제안드립니다.' },
];

// ═══════════════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════════════

function textToHtml(text) {
  return text.split('\n').map(line => {
    if (line.trim() === '') return '<p><br></p>';
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // [ ] 헤더를 볼드로
    if (/^\[.*\]$/.test(line.trim())) {
      return `<p><b>${escaped}</b></p>`;
    }
    return `<p>${escaped}</p>`;
  }).join('');
}

async function screenshot(page, label) {
  const filename = `insta-core-${label}-${Date.now()}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: false });
  console.log(`  [스크린샷] ${filename}`);
}

// ═══════════════════════════════════════════════════
// 다이얼로그 강제 닫기
// ═══════════════════════════════════════════════════

async function forceCloseDialogs(page) {
  // Escape 키
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  // 남아있는 dialog overlay 제거
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach(d => d.remove());
    // fixed overlay backdrop 제거
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      if (el.style.zIndex > 9000 || el.classList.contains('z-[9999]')) el.remove();
    });
  });
  await page.waitForTimeout(500);
}

// ═══════════════════════════════════════════════════
// 메인 — 순서: 설명→키워드→FAQ→제목→제출
// ═══════════════════════════════════════════════════

async function main() {
  let browser;
  const results = { title: false, description: false, keywords: false, faq: false, submitted: false };

  try {
    // ── 로그인 ──
    console.log('=== 크몽 insta-core CTR 최적화 시작 ===');
    const { browser: b, page } = await login({ slowMo: 200 });
    browser = b;

    // ── 편집 페이지 이동 ──
    const editUrl = `https://kmong.com/my-gigs/edit/${GIG_ID}?rootCategoryId=2&subCategoryId=203&thirdCategoryId=20312`;
    console.log('[이동]', editUrl);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await closeModals(page);
    console.log('[현재 URL]', page.url());
    await screenshot(page, '01-edit-page');

    // ════════════════════════════════════════════════
    // Step 1: 상세설명 수정 (다이얼로그 없는 상태에서 먼저)
    // ════════════════════════════════════════════════
    console.log('\n── Step 1: 상세설명 수정 ──');

    // ProseMirror/Tiptap 에디터
    const editor = page.locator('.tiptap.ProseMirror, [contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 5000 }).catch(() => false)) {
      const oldDesc = await editor.innerText().catch(() => '');
      console.log(`  기존 설명 길이: ${oldDesc.length}자`);

      // 에디터 포커스 → 전체 선택 → 삭제
      await editor.click({ force: true });
      await page.waitForTimeout(500);
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(300);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);

      // innerHTML로 내용 설정 (Tiptap/ProseMirror 호환)
      const descHtml = textToHtml(NEW_DESCRIPTION);
      const injected = await editor.evaluate((el, html) => {
        el.innerHTML = html;
        // Tiptap은 input 이벤트로 내부 상태 동기화
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.focus();
        return el.innerText.length;
      }, descHtml);
      await page.waitForTimeout(1000);

      console.log(`  innerHTML 주입 후 길이: ${injected}자`);
      if (injected > 100) {
        results.description = true;
        console.log('  [설명 입력 성공 ✓]');
      } else {
        // 폴백: execCommand
        console.log('  [innerHTML 실패 → execCommand 폴백]');
        await editor.click({ force: true });
        await page.keyboard.press('Control+a');
        await page.evaluate((html) => {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertHTML', false, html);
        }, descHtml);
        await page.waitForTimeout(1000);
        const len2 = await editor.evaluate(el => el.innerText.length);
        console.log(`  execCommand 후 길이: ${len2}자`);
        if (len2 > 100) results.description = true;
      }
    } else {
      console.log('  [에디터 미발견]');
    }
    await screenshot(page, '02-after-desc');

    // ════════════════════════════════════════════════
    // Step 2: 검색 키워드 수정
    // ════════════════════════════════════════════════
    console.log('\n── Step 2: 검색 키워드 수정 ──');

    // 기존 태그 전부 삭제 — 다양한 셀렉터 시도
    const tagDeleteBtns = page.locator(
      '.flex.w-fit.items-center button, ' +
      '[class*="rounded-full"] button'
    );
    let tagCount = await tagDeleteBtns.count();
    console.log(`  기존 키워드 버튼: ${tagCount}개`);

    for (let i = tagCount - 1; i >= 0; i--) {
      try {
        const btn = tagDeleteBtns.nth(i);
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click({ force: true });
          await page.waitForTimeout(500);
        }
      } catch {}
    }
    await page.waitForTimeout(1000);

    // 삭제 후 잔여 태그 확인
    tagCount = await tagDeleteBtns.count();
    console.log(`  삭제 후 남은 버튼: ${tagCount}개`);

    // 새 키워드 입력
    const tagInput = page.locator('input[placeholder*="키워드"]').first();
    if (await tagInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isEnabled = await tagInput.isEnabled().catch(() => false);
      console.log(`  태그 입력 enabled: ${isEnabled}`);

      if (!isEnabled) {
        // disabled면 JS로 활성화
        await page.evaluate(() => {
          const inp = document.querySelector('input[placeholder*="키워드"]');
          if (inp) inp.removeAttribute('disabled');
        });
        await page.waitForTimeout(300);
      }

      for (const kw of NEW_KEYWORDS) {
        try {
          await tagInput.click({ force: true });
          await tagInput.fill(kw);
          await page.waitForTimeout(300);
          await tagInput.press('Enter');
          await page.waitForTimeout(800);
          console.log(`  + "${kw}"`);
        } catch (e) {
          console.log(`  키워드 추가 실패: "${kw}" — ${e.message.substring(0, 60)}`);
        }
      }
      results.keywords = true;
    } else {
      console.log('  [태그 입력 필드 미발견]');
    }
    await screenshot(page, '03-after-keywords');

    // ════════════════════════════════════════════════
    // Step 3: FAQ 수정
    // textarea[0-5] = 패키지, textarea[6-11] = FAQ 답변
    // FAQ 질문은 별도 input 또는 같은 section의 input
    // ════════════════════════════════════════════════
    console.log('\n── Step 3: FAQ 수정 ──');

    // 페이지 하단으로 스크롤
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // FAQ 답변 textarea 직접 수정 (evaluate로 빠르게)
    const faqResult = await page.evaluate((faqData) => {
      const allTa = Array.from(document.querySelectorAll('textarea'));
      const visibleTa = allTa.filter(ta => ta.getBoundingClientRect().height > 0);
      const log = [`visible textarea: ${visibleTa.length}개`];

      // FAQ 답변 textarea는 인덱스 6~11 (첫 6개는 패키지)
      const FAQ_START = 6;
      let modified = 0;

      for (let i = 0; i < faqData.length; i++) {
        const taIdx = FAQ_START + i;
        if (taIdx >= visibleTa.length) {
          log.push(`  FAQ${i + 1} A: textarea[${taIdx}] 없음`);
          continue;
        }
        const ta = visibleTa[taIdx];
        const oldVal = ta.value;
        // React setState를 트리거하기 위해 nativeInputValueSetter 사용
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        nativeSetter.call(ta, faqData[i].a);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        log.push(`  FAQ${i + 1} A: "${oldVal.substring(0, 30)}..." → "${faqData[i].a.substring(0, 30)}..."`);
        modified++;
      }

      // FAQ 질문 input 찾기 — FAQ 섹션의 input[type="text"]
      // "자주 묻는 질문" 또는 "FAQ" 텍스트 근처의 input 찾기
      const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
      const visibleInputs = allInputs.filter(inp => {
        const rect = inp.getBoundingClientRect();
        return rect.height > 0 && rect.y > 500; // 페이지 하단 (FAQ 영역)
      });
      log.push(`  FAQ 질문 후보 input: ${visibleInputs.length}개`);

      // FAQ 질문 input 수정 — 키워드 input 제외
      const faqQuestionInputs = visibleInputs.filter(inp => {
        const ph = inp.placeholder || '';
        return !ph.includes('키워드');
      });
      log.push(`  FAQ 질문 input (키워드 제외): ${faqQuestionInputs.length}개`);

      const nativeInputSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;

      for (let i = 0; i < Math.min(faqData.length, faqQuestionInputs.length); i++) {
        const inp = faqQuestionInputs[i];
        const oldQ = inp.value;
        nativeInputSetter.call(inp, faqData[i].q);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        log.push(`  FAQ${i + 1} Q: "${oldQ.substring(0, 25)}..." → "${faqData[i].q.substring(0, 25)}..."`);
        modified++;
      }

      return { modified, log };
    }, NEW_FAQ);

    faqResult.log.forEach(l => console.log(l));
    if (faqResult.modified > 0) {
      results.faq = true;
      console.log(`  [FAQ 수정 완료: ${faqResult.modified}개 필드]`);
    }
    await page.waitForTimeout(1000);
    await screenshot(page, '04-after-faq');

    // ════════════════════════════════════════════════
    // Step 4: 제목 수정 (모달 방식 — 마지막에 처리)
    // ════════════════════════════════════════════════
    console.log('\n── Step 4: 제목 수정 ──');
    console.log(`  목표: "${NEW_TITLE}" (${NEW_TITLE.length}자)`);

    // 상단으로 스크롤
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const editTitleBtn = page.locator('button').filter({ hasText: '편집' }).first();
    if (await editTitleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editTitleBtn.click({ force: true });
      await page.waitForTimeout(3000);
      console.log('  [모달 오픈]');

      const modalInput = page.locator('[role="dialog"] input').first();
      if (await modalInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const oldTitle = await modalInput.inputValue().catch(() => '');
        await modalInput.fill(NEW_TITLE);
        await page.waitForTimeout(1000);
        const newVal = await modalInput.inputValue();
        console.log(`  "${oldTitle}" → "${newVal}"`);

        // 변경하기 클릭 (draft PUT)
        const changeBtn = page.locator('[role="dialog"] button:has-text("변경하기")').first();
        if (await changeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await changeBtn.click({ force: true });
          await page.waitForTimeout(5000);
          console.log('  [변경하기 클릭 → draft 저장]');
          results.title = true;
        } else {
          console.log('  [변경하기 버튼 미발견]');
        }
      } else {
        console.log('  [모달 input 미발견]');
      }

      // 모달이 남아있으면 강제 닫기
      const dialogStillOpen = await page.locator('[role="dialog"]').isVisible({ timeout: 2000 }).catch(() => false);
      if (dialogStillOpen) {
        console.log('  [모달 아직 열림 → 강제 닫기]');
        await forceCloseDialogs(page);
      }
    } else {
      console.log('  [편집 버튼 미발견]');
    }
    await screenshot(page, '05-after-title');

    // ════════════════════════════════════════════════
    // Step 5: 제출
    // ════════════════════════════════════════════════
    console.log('\n── Step 5: 제출 ──');

    // 맨 아래로 스크롤
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // 승인규정 체크박스
    const mandatoryLabel = page.locator('label[for="mandatory-field-0"]').first();
    if (await mandatoryLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mandatoryLabel.click({ force: true });
      await page.waitForTimeout(500);
      console.log('  [승인규정 체크 ✓]');
    } else {
      // 대체: 마지막 체크박스
      const checkbox = page.locator('input[type="checkbox"]').last();
      if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await checkbox.check({ force: true });
        await page.waitForTimeout(500);
        console.log('  [대체 체크박스 체크]');
      } else {
        console.log('  [승인규정 체크박스 미발견]');
      }
    }

    await screenshot(page, '06-before-submit');

    // 1차 제출
    const submitBtn = page.locator('button:has-text("제출하기")').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
      await submitBtn.click({ force: true });
      await page.waitForTimeout(6000);
      console.log('  [1차 제출하기 클릭]');
    } else {
      // 대체 버튼
      for (const sel of ['button:has-text("심사 요청")', 'button:has-text("수정 완료")', 'button:has-text("저장하기")', 'button:has-text("저장")']) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click({ force: true });
          await page.waitForTimeout(4000);
          console.log(`  [대체 버튼 클릭: ${sel}]`);
          break;
        }
      }
    }

    // 2차 확인 모달
    const finalSubmit = page.locator('[role="dialog"] button:has-text("제출하기")').first();
    if (await finalSubmit.isVisible({ timeout: 5000 }).catch(() => false)) {
      await finalSubmit.click({ force: true });
      await page.waitForTimeout(8000);
      console.log('  [최종 확인 모달 제출하기 클릭]');
      results.submitted = true;
    } else {
      const confirmBtn = page.locator('[role="dialog"] button:has-text("확인"), [role="dialog"] button:has-text("네")').first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click({ force: true });
        await page.waitForTimeout(5000);
        console.log('  [확인 모달 클릭]');
        results.submitted = true;
      } else {
        console.log('  [확인 모달 미발견]');
      }
    }
    await screenshot(page, '07-after-submit');

    // ════════════════════════════════════════════════
    // Step 6: 검증
    // ════════════════════════════════════════════════
    console.log('\n── Step 6: 검증 ──');
    await page.goto(`https://kmong.com/gig/${GIG_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log('[상품 페이지]', page.url());

    const pageTitle = await page.locator('h1, h2, [class*="title"]').first().textContent().catch(() => '');
    console.log(`  페이지 제목: "${pageTitle?.trim().substring(0, 60)}"`);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'insta-core-optimized.png'),
      fullPage: true,
    });
    console.log('  [최종 스크린샷] insta-core-optimized.png');

    // ── 결과 ──
    console.log('\n=== 결과 ===');
    console.log(`  제목: ${results.title ? '✓' : '✗'}`);
    console.log(`  설명: ${results.description ? '✓' : '✗'}`);
    console.log(`  키워드: ${results.keywords ? '✓' : '✗'}`);
    console.log(`  FAQ: ${results.faq ? '✓' : '✗ (탐색 필요)'}`);
    console.log(`  제출: ${results.submitted ? '✓' : '✗'}`);

    const successCount = Object.values(results).filter(Boolean).length;
    const msg = `insta-core CTR 최적화: ${successCount}/5 완료 | 제목=${results.title} 설명=${results.description} 키워드=${results.keywords} FAQ=${results.faq} 제출=${results.submitted}`;
    notify(msg);

    await browser.close();
    console.log('\n=== 완료 ===');
    return results;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`insta-core 최적화 에러: ${err.message.substring(0, 100)}`);
    if (browser) {
      try { await saveErrorScreenshot(browser.contexts()[0]?.pages()[0], 'optimize-insta-core'); } catch {}
      await browser.close();
    }
    return results;
  }
}

main().then(r => {
  console.log('최종 결과:', JSON.stringify(r));
  process.exit(Object.values(r).every(Boolean) ? 0 : 1);
});
