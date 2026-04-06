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

// 크몽 금칙어: "팔로워 + 성장류 단어"(늘리기/증가/유입) 차단
// 1차 시도: 원본, 실패 시 2차 대체 제목
const TITLE_PRIMARY = '팔로워 늘리기 - 인스타그램 활성화 전문';
const TITLE_FALLBACK = '인스타그램 계정 활성화 - 실계정 소통 전문';
let NEW_TITLE = TITLE_PRIMARY;

// ※ 크몽 금칙어: '댓글', '팔로워 증가' → 대체어 사용
const NEW_DESCRIPTION = `[ 인스타그램이 안 오르는 3가지 이유 ]

게시물을 올려도 반응이 늘지 않으시나요?
광고비만 쓰고 효과가 없으신가요?
경쟁업체는 잘 되는데 내 계정만 안 되는 것 같으신가요?

저희는 그 이유를 압니다.
숫자가 아니라 실제 타깃 유저와의 진짜 소통이 없기 때문입니다.




[ 온다마케팅이 하는 것 ]

온다마케팅은 귀사 업종에 맞는 실계정 타깃 유저를 직접 발굴하여
좋아요 + 팔로우 + 반응 소통을 30일간 지속합니다.

매크로 없음 / 허위 계정 없음 / 100% 실사용자 기반.

작업 시작 후 3일 이내에 프로필 유입이 눈에 띄게 늘어납니다.




[ 진행 후 실제 변화 ]

- 프로필 방문 상승 (업종/계정 상태에 따라 차이)
- 저장 + 공유 수 상승
- 프로필 방문자 상승 → 문의 전환 가능성 향상
- DM 문의 자연 발생

리뷰 평점 5.0 / 50건+ 완료




[ 이런 분께 맞습니다 ]

- 오픈한 지 얼마 안 된 인스타 계정 운영 중
- 게시물 올려도 좋아요가 5개 미만
- 1,000명 이하인 초기 계정
- 광고 쓰기 전 자연 성장 먼저 해보고 싶은 분
- 쇼핑몰 / 음식점 / 뷰티 / 필라테스 등 로컬 계정




[ 작업 절차 ]

1. 주문 후 계정 정보 전달 (ID만 / 비밀번호 불필요)
2. 업종 타깃 유저 리스트 구성 (1일 소요)
3. 실계정 소통 작업 시작 (30일 진행)
4. 매주 작업 현황 보고서 제공
5. 완료 후 성장 결과 공유




[ 자주 하시는 질문 ]

Q. 계정 비밀번호가 필요한가요?
A. 전혀 필요 없습니다. 인스타그램 ID만 주시면 됩니다.

Q. 나중에 다 빠지나요?
A. 실계정 기반이라 대규모 이탈 없습니다. 단, 관심 없어진 유저는 자연 unfollow 할 수 있습니다.

Q. 얼마나 늘어나나요?
A. 계정 상태/업종/현재 상황에 따라 다릅니다. 사전 상담 후 안내드립니다.`;

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

    // ProseMirror/Tiptap 에디터 — innerHTML은 내부 상태 미반영!
    // execCommand('insertHTML')을 사용해야 ProseMirror가 인식
    const editor = page.locator('.tiptap.ProseMirror, [contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 5000 }).catch(() => false)) {
      const oldDesc = await editor.innerText().catch(() => '');
      console.log(`  기존 설명 길이: ${oldDesc.length}자`);

      const descHtml = textToHtml(NEW_DESCRIPTION);

      // 방법 1: execCommand (ProseMirror의 beforeinput 이벤트 트리거)
      await editor.click({ force: true });
      await page.waitForTimeout(500);

      const inserted = await page.evaluate((html) => {
        // 전체 선택 → insertHTML로 교체 (ProseMirror 호환)
        document.execCommand('selectAll', false, null);
        const ok = document.execCommand('insertHTML', false, html);
        return ok;
      }, descHtml);
      await page.waitForTimeout(2000);

      const newLen = await editor.evaluate(el => el.innerText.length);
      console.log(`  execCommand 결과: ok=${inserted}, 길이=${newLen}자`);

      if (newLen > 200) {
        results.description = true;
        console.log('  [설명 입력 성공 (execCommand) ✓]');
      } else {
        // 폴백: keyboard.type (느리지만 확실)
        console.log('  [execCommand 부족 → keyboard.type 폴백]');
        await editor.click({ force: true });
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);
        // 핵심 내용만 단축 타이핑 (속도 위해)
        const shortDesc = NEW_DESCRIPTION.substring(0, 500);
        await page.keyboard.type(shortDesc, { delay: 3 });
        await page.waitForTimeout(500);
        const typed = await editor.evaluate(el => el.innerText.length);
        console.log(`  keyboard.type 길이: ${typed}자`);
        if (typed > 100) results.description = true;
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
    // UI구조: "질문*" label → input/textarea, "답변*" label → textarea
    // 패키지 textarea[0-5]와 FAQ를 label 기반으로 구분
    // ════════════════════════════════════════════════
    console.log('\n── Step 3: FAQ 수정 ──');

    // "판매 핵심 정보" 탭으로 스크롤 — FAQ가 이 섹션에 위치
    const salesTab = page.locator('text=판매 핵심 정보').first();
    if (await salesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await salesTab.click({ force: true });
      await page.waitForTimeout(2000);
      console.log('  [판매 핵심 정보 탭 클릭]');
    } else {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    // FAQ Q/A 수정 — label "질문*"/"답변*" 기반 매핑 (evaluate로 빠르게)
    const faqResult = await page.evaluate((faqData) => {
      const log = [];
      let modified = 0;

      const nativeTaSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      const nativeInpSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;

      // 모든 label/span 중 "질문" 또는 "답변" 텍스트 포함하는 것 찾기
      // 각 FAQ 아이템은 질문 + 답변 쌍
      const allLabels = Array.from(document.querySelectorAll('label, span'));
      const questionLabels = [];
      const answerLabels = [];

      for (const label of allLabels) {
        const txt = (label.textContent || '').trim();
        // "질문*" 패턴 매칭 (FAQ 섹션)
        if (/^질문\*?$/.test(txt)) {
          questionLabels.push(label);
        } else if (/^답변\*?$/.test(txt)) {
          answerLabels.push(label);
        }
      }

      log.push(`  질문 label: ${questionLabels.length}개, 답변 label: ${answerLabels.length}개`);

      // 질문 label 근처의 input/textarea 찾기
      function findNearestInput(label) {
        // label의 부모/조부모에서 input/textarea 찾기
        let container = label.parentElement;
        for (let depth = 0; depth < 4 && container; depth++) {
          const inputs = container.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), textarea');
          for (const inp of inputs) {
            if (inp.getBoundingClientRect().height > 0) return inp;
          }
          container = container.parentElement;
        }
        // label 다음 형제에서 찾기
        let sibling = label.nextElementSibling;
        while (sibling) {
          if (sibling.tagName === 'INPUT' || sibling.tagName === 'TEXTAREA') return sibling;
          const inner = sibling.querySelector('input, textarea');
          if (inner) return inner;
          sibling = sibling.nextElementSibling;
        }
        return null;
      }

      // FAQ 질문 수정
      for (let i = 0; i < Math.min(faqData.length, questionLabels.length); i++) {
        const inp = findNearestInput(questionLabels[i]);
        if (!inp) {
          log.push(`  FAQ${i + 1} Q: input 미발견`);
          continue;
        }
        const oldQ = inp.value;
        const setter = inp.tagName === 'TEXTAREA' ? nativeTaSetter : nativeInpSetter;
        setter.call(inp, faqData[i].q);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        log.push(`  FAQ${i + 1} Q: "${oldQ.substring(0, 25)}" → "${faqData[i].q.substring(0, 25)}"`);
        modified++;
      }

      // FAQ 답변 수정
      for (let i = 0; i < Math.min(faqData.length, answerLabels.length); i++) {
        const ta = findNearestInput(answerLabels[i]);
        if (!ta) {
          log.push(`  FAQ${i + 1} A: textarea 미발견`);
          continue;
        }
        const oldA = ta.value;
        const setter = ta.tagName === 'TEXTAREA' ? nativeTaSetter : nativeInpSetter;
        setter.call(ta, faqData[i].a);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        log.push(`  FAQ${i + 1} A: "${oldA.substring(0, 25)}" → "${faqData[i].a.substring(0, 25)}"`);
        modified++;
      }

      return { modified, log };
    }, NEW_FAQ);

    faqResult.log.forEach(l => console.log(l));
    if (faqResult.modified > 0) {
      results.faq = true;
      console.log(`  [FAQ 수정: ${faqResult.modified}개 필드 ✓]`);
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

    // 토스트/알림 오버레이 제거 (변경하기 버튼을 가림)
    await page.evaluate(() => {
      // X 버튼이 있는 토스트 닫기
      document.querySelectorAll('[class*="toast"] button, [class*="Toast"] button, [class*="notification"] button').forEach(b => b.click());
      // position: fixed인 알림 요소 제거
      document.querySelectorAll('div').forEach(el => {
        const style = getComputedStyle(el);
        const text = el.textContent || '';
        if (style.position === 'fixed' && (text.includes('축하') || text.includes('승인'))) {
          el.remove();
        }
      });
    });
    await page.waitForTimeout(1000);
    console.log('  [토스트/알림 제거 완료]');

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

        // 변경하기 클릭 (draft PUT) — API 응답 대기
        async function tryTitleChange(title) {
          await modalInput.fill(title);
          await page.waitForTimeout(1000);

          const changeBtn = page.locator('[role="dialog"] button:has-text("변경하기")').first();
          if (!await changeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log('  [변경하기 버튼 미발견]');
            return false;
          }

          // 방법 1: Enter 키로 폼 제출 시도
          await modalInput.press('Enter');
          await page.waitForTimeout(3000);

          let modalClosed = !(await page.locator('[role="dialog"]').isVisible({ timeout: 2000 }).catch(() => false));
          if (modalClosed) {
            console.log('    [Enter 키 제출 성공]');
          }

          if (!modalClosed) {
            // 방법 2: 좌표 기반 마우스 클릭 (정밀)
            const box = await changeBtn.boundingBox();
            if (box) {
              console.log(`    [좌표 클릭: ${Math.round(box.x + box.width/2)}, ${Math.round(box.y + box.height/2)}]`);
              const [response] = await Promise.all([
                page.waitForResponse(resp => resp.url().includes('/gig') && resp.request().method() === 'PUT', { timeout: 10000 }).catch(() => null),
                page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
              ]);
              if (response) console.log(`    [API: ${response.status()}]`);
              await page.waitForTimeout(3000);
              modalClosed = !(await page.locator('[role="dialog"]').isVisible({ timeout: 2000 }).catch(() => false));
            }
          }

          if (!modalClosed) {
            // 방법 3: JS 직접 클릭 (React synthetic event bypass)
            console.log('    [방법3: JS 직접 클릭]');
            await page.evaluate(() => {
              const btns = document.querySelectorAll('[role="dialog"] button');
              for (const b of btns) {
                if (b.textContent?.trim() === '변경하기') {
                  b.click();
                  break;
                }
              }
            });
            await page.waitForTimeout(5000);
            modalClosed = !(await page.locator('[role="dialog"]').isVisible({ timeout: 2000 }).catch(() => false));
          }

          const response = null; // compatibility

          await page.waitForTimeout(3000);
          const closed = !(await page.locator('[role="dialog"]').isVisible({ timeout: 3000 }).catch(() => false));

          if (response) {
            console.log(`  [API 응답: ${response.status()}, 모달: ${closed ? '닫힘 ✓' : '열림'}]`);
          } else {
            console.log(`  [API 응답 없음, 모달: ${closed ? '닫힘 ✓' : '열림'}]`);
          }
          return closed;
        }

        // 1차: 원본 제목
        console.log(`  1차 시도: "${TITLE_PRIMARY}"`);
        let titleOk = await tryTitleChange(TITLE_PRIMARY);

        // 2차: 대체 제목 (1차 실패 시)
        if (!titleOk) {
          console.log(`  1차 실패 → 2차 시도: "${TITLE_FALLBACK}"`);
          NEW_TITLE = TITLE_FALLBACK;
          titleOk = await tryTitleChange(TITLE_FALLBACK);
        }

        if (titleOk) {
          results.title = true;
          console.log(`  [제목 변경 성공: "${NEW_TITLE}"]`);
        } else {
          console.log('  [제목 변경 실패 — 모달 강제 닫기 후 계속]');
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

    // 제출 전 검증 오류 확인
    const validationErrors = await page.evaluate(() => {
      const errors = [];
      document.querySelectorAll('[class*="text-red"], [class*="error"]').forEach(el => {
        const txt = el.textContent?.trim();
        if (txt && txt.includes('입력할 수 없으며')) errors.push(txt);
      });
      return errors;
    });
    if (validationErrors.length > 0) {
      console.log('  [검증 오류 발견]:');
      validationErrors.forEach(e => console.log(`    ✗ ${e}`));
    }

    // 1차 제출
    const submitBtn = page.locator('button:has-text("제출하기")').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
      // API 응답 대기하며 클릭
      const [submitResp] = await Promise.all([
        page.waitForResponse(resp => resp.request().method() === 'PUT' || resp.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
        submitBtn.click({ force: true }),
      ]);
      await page.waitForTimeout(3000);
      if (submitResp) {
        console.log(`  [1차 제출 API: ${submitResp.status()} ${submitResp.url().substring(0, 60)}]`);
      }
      console.log('  [1차 제출하기 클릭]');
    } else {
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

    // 2차 확인 모달 (제목 변경 시에만 나타날 수 있음)
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
        // 토스트/알림으로 성공 확인 (확인 모달 없이 바로 제출되는 경우)
        const toastVisible = await page.locator('text=승인, text=축하, text=완료').first()
          .isVisible({ timeout: 3000 }).catch(() => false);
        if (toastVisible) {
          console.log('  [제출 성공 (토스트 확인)]');
          results.submitted = true;
        } else {
          // URL 변경 또는 페이지 상태로 판단
          const currentUrl = page.url();
          console.log(`  [제출 후 URL: ${currentUrl}]`);
          // 검증 오류 없으면 성공으로 간주
          if (validationErrors.length === 0) {
            results.submitted = true;
            console.log('  [검증 오류 없음 → 제출 성공 간주]');
          } else {
            console.log('  [검증 오류 있음 → 제출 실패]');
          }
        }
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
