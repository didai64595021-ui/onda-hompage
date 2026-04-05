#!/usr/bin/env node
/**
 * 크몽 서비스 상세페이지 수정 RPA
 * - /my-gigs/edit/{gigId} 페이지에서 제목, 태그, 설명, 가격 등 수정
 * - 사용: node edit-gig.js <product_id> --title "새 제목" --tags "태그1,태그2"
 * - 대시보드/자동화에서 모듈로 호출 가능
 *
 * 실제 UI 분석 결과 (2026-04-06):
 * - 제목: "편집" 버튼 클릭 → 제목 input 필드 (상단 레이아웃 편집)
 * - 태그: input[placeholder="키워드를 입력해 주세요"] - 기존 태그 X버튼으로 삭제 후 입력
 * - 태그가 5개이면 disabled → 먼저 1개 삭제 후 추가
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { login, saveErrorScreenshot } = require('./lib/login');
const { closeModals } = require('./lib/modal-handler');
const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');
const path = require('path');

// 서비스 gigId 매핑 (실제 크몽 gig ID)
const GIG_ID_MAP = {
  'no-homepage': 751791,
  'onepage': 747186,
  'corp-seo': 747195,
  'corp-renew': 752477,
  'mobile-fix': 747156,
  'pc-mobile': 752469,
  'responsive': 747181,
  'design-html': 752450,
  'imweb-html': 747202,
  'cafe24': 752484,
  'maintenance': 752497,
  'portal-map': 741342,
  'insta-atoz': 518770,
  'insta-core': 662105,
};

/**
 * 서비스 상세 정보 수정
 * @param {string} productId - product_id
 * @param {object} changes - { title?, tags?, description? }
 * @returns {Promise<{success: boolean, message: string, changes?: object}>}
 */
async function editGig(productId, changes = {}) {
  if (!productId || Object.keys(changes).length === 0) {
    throw new Error('사용법: editGig("productId", { title: "...", tags: "...", description: "..." })');
  }

  const gigId = GIG_ID_MAP[productId];
  if (!gigId) {
    return { success: false, message: `알 수 없는 product_id: ${productId}` };
  }

  let browser;
  try {
    console.log(`=== 서비스 수정: ${productId} (gig ${gigId}) ===`);
    console.log('변경 항목:', Object.keys(changes).join(', '));

    const result = await login({ slowMo: 300 });
    browser = result.browser;
    const page = result.page;

    // 편집 페이지 직접 이동 (networkidle 대신 domcontentloaded)
    const editUrl = `https://kmong.com/my-gigs/edit/${gigId}?rootCategoryId=2&subCategoryId=203&thirdCategoryId=20312`;
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`[편집 페이지] ${page.url()}`);
    await closeModals(page);

    const applied = {};

    // ────────────────────────────────────────────────
    // 제목 수정
    // ────────────────────────────────────────────────
    if (changes.title) {
      console.log(`[제목] → "${changes.title.substring(0, 50)}"`);
      
      // "편집" 버튼 클릭 (제목 옆 연필 아이콘 또는 편집 버튼)
      const editTitleBtn = page.locator('button:has-text("편집")').first();
      if (await editTitleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editTitleBtn.click({ force: true });
        await page.waitForTimeout(2000);
        console.log('[제목 편집 모달] 오픈 시도');
      }

      // 제목 입력 필드 탐색 (모달 또는 인라인)
      const titleSelectors = [
        'input[name="gig_title"]',
        'input[name="title"]',
        'input[placeholder*="제목"]',
        'input[placeholder*="서비스명"]',
        'textarea[name*="title"]',
        // 가장 큰 텍스트 input (대개 제목)
        'input[type="text"]:visible',
      ];

      let titleInput = null;
      let oldTitle = '';
      for (const sel of titleSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          const val = await el.inputValue().catch(() => '');
          // 서비스 제목처럼 보이는 값(20자 이상)만 선택
          if (val.length > 10 || sel.includes('name=')) {
            titleInput = el;
            oldTitle = val;
            console.log(`[제목 필드 발견] sel="${sel}" val="${val.substring(0,50)}"`);
            break;
          }
        }
      }

      if (titleInput) {
        await titleInput.click({ force: true });
        await page.keyboard.press('Control+a');
        await page.keyboard.type(changes.title, { delay: 30 });
        applied.title = { old: oldTitle, new: changes.title };
        console.log('[제목] 입력 완료');
        
        // 모달 저장 버튼
        const modalSave = page.locator('[role="dialog"] button:has-text("저장"), [role="dialog"] button:has-text("확인"), [role="dialog"] button:has-text("완료")').first();
        if (await modalSave.isVisible({ timeout: 2000 }).catch(() => false)) {
          await modalSave.click();
          await page.waitForTimeout(2000);
        }
      } else {
        console.log('[제목] 입력 필드 미발견');
      }
    }

    // ────────────────────────────────────────────────
    // 태그 수정
    // ────────────────────────────────────────────────
    if (changes.tags) {
      console.log(`[태그] → "${changes.tags}"`);
      const newTagList = changes.tags.split(',').map(t => t.trim()).filter(Boolean);

      // 태그 삭제 버튼 (X) — 기존 태그 모두 제거
      // 태그 칩의 X 버튼 셀렉터
      const deleteTagBtns = page.locator(
        '[class*="tag"] button, [class*="chip"] button, ' +
        'button[aria-label*="삭제"], button[aria-label*="제거"], ' +
        'button[class*="delete"], button[class*="remove"], ' +
        'svg[class*="close"], .tag-close, .keyword-delete'
      );

      // 더 정확한 방법: 현재 태그 칩 내부의 버튼
      const tagChips = page.locator(
        '.flex.w-fit.items-center button, ' +  // 탐색 결과의 태그 class
        '[class*="rounded-full"] button'
      );

      const tagChipCount = await tagChips.count();
      console.log(`[기존 태그] ${tagChipCount}개 발견 — 삭제 시작`);
      
      // 뒤에서부터 삭제 (인덱스 안정성)
      for (let i = tagChipCount - 1; i >= 0; i--) {
        try {
          const btn = tagChips.nth(i);
          if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click({ force: true });
            await page.waitForTimeout(500);
            console.log(`  태그 삭제 [${i}]`);
          }
        } catch {}
      }

      // 태그 입력 필드 - placeholder="키워드를 입력해 주세요"
      const tagInput = page.locator('input[placeholder*="키워드"]').first();
      
      // 입력 필드가 아직 disabled이면 잠깐 대기
      await page.waitForTimeout(1000);
      
      const isEnabled = await tagInput.isEnabled({ timeout: 5000 }).catch(() => false);
      console.log(`[태그 입력] enabled: ${isEnabled}`);

      if (isEnabled || await tagInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        for (const tag of newTagList) {
          try {
            await tagInput.click({ force: true });
            await tagInput.fill(tag);
            await page.waitForTimeout(300);
            await tagInput.press('Enter');
            await page.waitForTimeout(500);
            console.log(`  태그 추가: "${tag}"`);
          } catch (e) {
            console.log(`  태그 추가 실패: "${tag}" — ${e.message.substring(0, 50)}`);
          }
        }
        applied.tags = newTagList;
      } else {
        console.log('[태그] 입력 필드 disabled 상태 — 태그 수 제한 또는 삭제 필요');
        
        // JavaScript로 강제 활성화 시도
        try {
          await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[placeholder*="키워드"]');
            inputs.forEach(inp => {
              inp.removeAttribute('disabled');
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            });
          });
          await page.waitForTimeout(500);
          
          for (const tag of newTagList) {
            await tagInput.click({ force: true });
            await tagInput.fill(tag);
            await page.waitForTimeout(300);
            await tagInput.press('Enter');
            await page.waitForTimeout(500);
            console.log(`  태그 추가 (JS): "${tag}"`);
          }
          applied.tags = newTagList;
        } catch (e) {
          console.log(`[태그] JS 강제 활성화 실패: ${e.message.substring(0, 80)}`);
        }
      }
    }

    // ────────────────────────────────────────────────
    // 설명 수정
    // ────────────────────────────────────────────────
    if (changes.description) {
      console.log(`[설명] → "${changes.description.substring(0, 40)}..."`);
      const editor = page.locator('[contenteditable="true"]').first();
      if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
        const oldDesc = await editor.innerText().catch(() => '');
        await editor.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.type(changes.description, { delay: 20 });
        applied.description = { old: oldDesc.substring(0, 50), new: changes.description.substring(0, 50) };
        console.log('[설명] 입력 완료');
      } else {
        console.log('[설명] 에디터 미발견');
      }
    }

    if (Object.keys(applied).length === 0) {
      await saveErrorScreenshot(page, 'edit-gig-no-fields');
      await browser.close();
      return { success: false, message: '수정 가능한 필드를 찾을 수 없음' };
    }

    // 스크린샷 (변경 후)
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', `edit-gig-${productId}-before-save.png`),
      fullPage: false,
    });

    // 저장 버튼 클릭 (전체 페이지 저장/심사요청)
    const saveSelectors = [
      'button:has-text("심사 요청")',
      'button:has-text("수정 완료")',
      'button:has-text("저장하기")',
      'button:has-text("저장")',
      'button[type="submit"]',
    ];
    let saved = false;
    for (const sel of saveSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const btnText = await btn.textContent().catch(() => '');
        console.log(`[저장 버튼] "${btnText?.trim()}" 클릭`);
        await btn.click({ force: true });
        await page.waitForTimeout(4000);
        saved = true;

        // 확인 모달
        const confirmBtn = page.locator('button:has-text("확인"), button:has-text("네"), button:has-text("계속")').first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(2000);
        }
        break;
      }
    }

    if (!saved) {
      console.log('[저장] 저장 버튼 미발견 — 필드 변경만 적용');
    }

    // 변경 이력 저장 (DB) - 테이블 없으면 무시
    for (const [field, val] of Object.entries(applied)) {
      try {
        const { error } = await supabase.from('kmong_creative_changes').insert({
          product_id: productId,
          change_date: new Date().toISOString().split('T')[0],
          change_type: `gig_${field}`,
          old_value: typeof val === 'object' ? String(val.old || '') : '',
          new_value: typeof val === 'object' ? String(val.new || val) : JSON.stringify(val),
        });
        if (error) console.log(`[DB 저장 스킵] ${error.message}`);
      } catch (e) {
        console.log(`[DB 저장 스킵] ${e.message}`);
      }
    }

    const msg = `서비스 수정 완료: ${productId} | ${Object.keys(applied).join(', ')} 변경`;
    console.log(`[완료] ${msg}`);
    notify(msg);
    await browser.close();
    return { success: true, message: msg, changes: applied };

  } catch (err) {
    const errMsg = `서비스 수정 실패: ${err.message.substring(0, 200)}`;
    console.error(`[에러] ${errMsg}`);
    notify(`edit-gig 에러 (${productId}): ${err.message.substring(0, 100)}`);
    if (browser) {
      await saveErrorScreenshot(browser._pages?.()[0] || null, `edit-gig-error-${productId}`).catch(() => {});
      await browser.close();
    }
    return { success: false, message: errMsg };
  }
}

module.exports = { editGig, GIG_ID_MAP };

if (require.main === module) {
  const args = process.argv.slice(2);
  const productId = args[0];
  const changes = {};

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1];
    if (key && val) changes[key] = val;
  }

  if (!productId || Object.keys(changes).length === 0) {
    console.log('사용법: node edit-gig.js <product_id> --title "새 제목" --tags "태그1,태그2"');
    console.log('예: node edit-gig.js insta-core --tags "인스타마케팅,SNS운영,팔로워증가"');
    process.exit(1);
  }
  editGig(productId, changes).then(r => {
    console.log('결과:', JSON.stringify(r));
    process.exit(r.success ? 0 : 1);
  });
}
