require('dotenv').config({ path: '/home/onda/projects/onda-hompage/kmong-crawler/.env' });
const { login } = require('/home/onda/projects/onda-hompage/kmong-crawler/lib/login');
const { notify } = require('/home/onda/projects/onda-hompage/kmong-crawler/lib/telegram');
const path = require('path');

const NEW_TITLE = '팔로워 늘리기 - 인스타그램 활성화 전문';

const NEW_DESCRIPTION = `[ 인스타그램이 안 오르는 이유, 알고 계신가요? ]

게시물을 올려도 팔로워가 늘지 않으시나요?
광고비만 쓰고 반응이 없으신가요?
경쟁 계정은 잘 되는데 내 계정만 안 되는 것 같으신가요?

저희는 그 이유를 압니다.
팔로워 수가 아니라 실제 타깃 유저와의 진짜 소통이 없기 때문입니다.




[ 온다마케팅이 하는 것 ]

온다마케팅은 귀사 업종에 맞는 실계정 타깃 유저를 직접 발굴하여
좋아요 + 팔로우 + 댓글 소통을 30일간 지속합니다.

매크로 없음 / 허위 계정 없음 / 100% 실사용자 기반.

작업 시작 후 3일 이내에 팔로워 증가 + 프로필 유입이 눈에 띄게 늘어납니다.




[ 진행 후 실제 변화 ]

- 팔로워 수 증가 (업종 + 계정 상태에 따라 차이)
- 저장 + 공유 수 증가
- 프로필 방문자 증가 + 문의 전환 가능성 상승
- DM 문의 자연 증가

리뷰 평점 5.0 / 50건 완료




[ 이런 분께 맞습니다 ]

- 오픈한 지 얼마 안 된 인스타 계정 운영 중
- 게시물 올려도 좋아요가 5개 미만
- 팔로워 1,000명 이하인 초기 계정
- 광고 전에 자연 성장 먼저 해보고 싶은 분
- 쇼핑몰 / 음식점 / 뷰티 / 필라테스 등 로컬 + 커머스 계정




[ 작업 절차 ]

1. 주문 후 계정 정보 전달 (ID만 / 비밀번호 불필요)
2. 업종 타깃 유저 리스트 구성 (1일 소요)
3. 실계정 소통 작업 시작 (30일 진행)
4. 매주 작업 현황 보고서 제공
5. 완료 후 팔로워 증가 결과 공유`;

const NEW_KEYWORDS = [
  '인스타그램 팔로워 늘리기',
  '인스타그램 활성화',
  '인스타그램 마케팅',
  'SNS 마케팅',
  '인스타그램 홍보',
];

const NEW_FAQS = [
  {
    q: '계정 비밀번호가 필요한가요?',
    a: '전혀 필요 없습니다. 인스타그램 ID(아이디)만 주시면 작업 진행이 가능합니다.',
  },
  {
    q: '팔로워가 나중에 다 빠지나요?',
    a: '저희는 실계정 기반으로 진행합니다. 매크로나 허위 계정이 아니기 때문에 대규모 이탈은 없습니다. 다만 팔로우 후 관심 없어진 유저가 자연스럽게 언팔할 수 있습니다.',
  },
  {
    q: '팔로워가 얼마나 늘어나나요?',
    a: '계정 상태, 업종, 현재 팔로워 수에 따라 결과가 다릅니다. 주문 전 문의하시면 예상치 안내드립니다.',
  },
  {
    q: '작업이 얼마나 걸리나요?',
    a: '주문 후 1일 내 타깃 구성 완료, 이후 30일간 실계정 소통 작업이 진행됩니다.',
  },
  {
    q: '업무시간이 어떻게 되나요?',
    a: '평일 10:00~19:00입니다. 공휴일 및 주말은 제외입니다.',
  },
  {
    q: '어떤 업종에 효과적인가요?',
    a: '쇼핑몰, 음식점, 뷰티, 필라테스 + PT, 인테리어, 공방 등 로컬 + 커머스 계정에 가장 효과적입니다. 사전 상담 후 업종 맞춤 전략을 제안드립니다.',
  },
];

const EDIT_URL = 'https://kmong.com/my-gigs/edit/662105?rootCategoryId=2&subCategoryId=203&thirdCategoryId=20312';
const SCREENSHOTS = '/home/onda/projects/onda-hompage/kmong-crawler/screenshots';

async function main() {
  const { browser, page } = await login({ slowMo: 200 });
  
  try {
    // ── Step 1: 제목 수정 ──────────────────────────────
    console.log('\n[Step 1] 제목 수정...');
    await page.goto(EDIT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    const editBtn = page.locator('button').filter({ hasText: '편집' }).first();
    await editBtn.click({ force: true });
    await page.waitForTimeout(3000);
    
    const modalInput = page.locator('[role="dialog"] input').first();
    if (await modalInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modalInput.fill(NEW_TITLE);
      await page.waitForTimeout(1000);
      console.log('  제목 입력:', await modalInput.inputValue());
      
      const changeBtn = page.locator('[role="dialog"] button:has-text("변경하기")').first();
      await changeBtn.click({ force: true });
      await page.waitForTimeout(5000);
      console.log('  [OK] 제목 모달 변경 완료');
    }
    
    // ── Step 2: 상세설명 수정 ──────────────────────────
    console.log('\n[Step 2] 상세설명 수정...');
    const editor = page.locator('[contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editor.scrollIntoViewIfNeeded();
      await editor.click();
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(500);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);
      
      // 줄바꿈 처리하며 입력
      const lines = NEW_DESCRIPTION.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) {
          await page.keyboard.type(lines[i], { delay: 5 });
        }
        if (i < lines.length - 1) {
          await page.keyboard.press('Enter');
          await page.waitForTimeout(30);
        }
      }
      console.log('  [OK] 설명 입력 완료');
    } else {
      console.log('  [SKIP] 에디터 미발견');
    }
    
    // ── Step 3: 검색 키워드 수정 ──────────────────────
    console.log('\n[Step 3] 검색 키워드 수정...');
    
    // 판매핵심정보 탭으로 이동
    const keyTab = page.locator('button:has-text("판매 핵심 정보")').first();
    if (await keyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keyTab.click({ force: true });
      await page.waitForTimeout(2000);
    }
    
    // 기존 키워드 삭제 (X 버튼들)
    // 여러 번 반복해서 모두 삭제
    for (let attempt = 0; attempt < 10; attempt++) {
      const deleteBtn = page.locator('button[aria-label*="삭제"], button[aria-label*="제거"], button[class*="delete"], button[class*="remove"], [class*="tag"] button, [class*="chip"] button, [class*="keyword"] button').first();
      if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await deleteBtn.click({ force: true });
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
    
    // 새 키워드 추가
    const keywordInput = page.locator('input[placeholder="키워드를 입력해 주세요"]').first();
    if (await keywordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      for (const kw of NEW_KEYWORDS) {
        await keywordInput.click({ force: true });
        await keywordInput.fill(kw);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);
        console.log(`  키워드 추가: "${kw}"`);
      }
      console.log('  [OK] 키워드 입력 완료');
    } else {
      console.log('  [SKIP] 키워드 input 미발견');
    }
    
    // ── Step 4: FAQ 수정 ──────────────────────────────
    console.log('\n[Step 4] FAQ 수정...');
    
    // FAQ 질문 inputs (현재 가진 6개)
    const faqQInputs = await page.locator('input[placeholder=""]').all();
    const faqATextareas = await page.locator('textarea[name*="FAQ"]').all();
    
    console.log(`  FAQ 질문 input 수: ${faqQInputs.length}, 답변 textarea 수: ${faqATextareas.length}`);
    
    // 답변 수정
    for (let i = 0; i < Math.min(NEW_FAQS.length, faqATextareas.length); i++) {
      const ta = faqATextareas[i];
      if (await ta.isVisible({ timeout: 1000 }).catch(() => false)) {
        await ta.fill(NEW_FAQS[i].a);
        await page.waitForTimeout(300);
        console.log(`  FAQ[${i+1}] 답변 입력`);
      }
    }
    
    // 질문 수정 — FAQ 질문 input 찾기 (값이 있는 text input 중 FAQ 관련)
    const allInputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="text"]')).map((el, i) => ({
        idx: i,
        value: el.value?.substring(0, 50),
        name: el.name,
        placeholder: el.placeholder,
      })).filter(el => el.value && el.value.length > 5 && !el.value.includes(','));
    });
    
    // FAQ 질문들 (값에 "?" 또는 "나요"가 포함된 것)
    const faqQIndices = allInputs.filter(el => el.value.includes('나요') || el.value.includes('?') || el.value.includes('어떻게'));
    console.log(`  FAQ 질문 후보: ${faqQIndices.length}개`);
    
    for (let i = 0; i < Math.min(NEW_FAQS.length, faqQIndices.length); i++) {
      const inputEl = page.locator('input[type="text"]').nth(faqQIndices[i].idx);
      if (await inputEl.isVisible({ timeout: 1000 }).catch(() => false)) {
        await inputEl.fill(NEW_FAQS[i].q);
        await page.waitForTimeout(300);
        console.log(`  FAQ[${i+1}] 질문: "${NEW_FAQS[i].q}"`);
      }
    }
    
    console.log('  [OK] FAQ 수정 완료');
    
    // 스크린샷
    await page.screenshot({ path: path.join(SCREENSHOTS, 'insta-core-before-submit.png'), fullPage: false });
    
    // ── Step 5: 상세정보 탭으로 돌아가서 제출 ─────────
    console.log('\n[Step 5] 제출 시작...');
    
    const detailTab = page.locator('button:has-text("상세 정보")').first();
    if (await detailTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await detailTab.click({ force: true });
      await page.waitForTimeout(2000);
    }
    
    // 승인규정 체크
    const mandatoryLabel = page.locator('label[for="mandatory-field-0"]').first();
    if (await mandatoryLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mandatoryLabel.click({ force: true });
      await page.waitForTimeout(500);
      console.log('  승인규정 체크 완료');
    }
    
    // 1차 제출
    const submitBtn = page.locator('button:has-text("제출하기")').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.scrollIntoViewIfNeeded();
      await submitBtn.click({ force: true });
      await page.waitForTimeout(6000);
      console.log('  1차 제출하기 클릭');
    }
    
    // 최종 확인 모달
    const finalSubmit = page.locator('[role="dialog"] button:has-text("제출하기")').first();
    if (await finalSubmit.isVisible({ timeout: 5000 }).catch(() => false)) {
      await finalSubmit.click({ force: true });
      await page.waitForTimeout(8000);
      console.log('  [OK] 최종 제출 완료');
    }
    
    // ── 라이브 확인 ───────────────────────────────────
    console.log('\n[라이브 확인]');
    await page.goto('https://kmong.com/gig/662105', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);
    const liveTitle = await page.locator('h1').first().textContent().catch(() => '');
    console.log('  라이브 제목:', liveTitle?.trim());
    await page.screenshot({ path: path.join(SCREENSHOTS, 'insta-core-optimized.png') });
    console.log('  [스크린샷] insta-core-optimized.png');
    
    await notify(`✅ insta-core CTR 최적화 완료\n제목: ${liveTitle?.trim()}\n- 설명/키워드/FAQ 전면 교체\nhttps://kmong.com/gig/662105`);
    
  } finally {
    await browser.close();
  }
}

main().then(() => {
  console.log('\n=== 전체 완료 ===');
  process.exit(0);
}).catch(e => {
  console.error('에러:', e.message);
  process.exit(1);
});
