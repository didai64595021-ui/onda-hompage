#!/usr/bin/env node
/**
 * 크몽 서비스 상세페이지 수정 RPA
 * - /my-gigs/edit/{gigId} 페이지에서 제목, 태그, 설명, 가격 등 수정
 * - 사용: node edit-gig.js <product_id> --title "새 제목" --tags "태그1,태그2"
 * - 대시보드/자동화에서 모듈로 호출 가능
 */

const { login, saveErrorScreenshot } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');
const { closeModals } = require('./lib/modal-handler');
const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');

const MY_GIGS_URL = 'https://kmong.com/my-gigs';

// 서비스 gigId 매핑 (탐색에서 확인된 실제 gigId)
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

    const result = await login({ slowMo: 200 });
    browser = result.browser;
    const page = result.page;

    // my-gigs에서 해당 서비스의 "편집하기" 클릭
    await page.goto(MY_GIGS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeModals(page);

    // 해당 gig 링크가 있는 행에서 편집 버튼 찾기
    const gigLink = page.locator(`a[href="/gig/${gigId}"]`).first();
    if (!await gigLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await browser.close();
      return { success: false, message: `서비스를 찾을 수 없음: gig/${gigId}` };
    }

    // 해당 서비스 카드/행의 편집 버튼
    const gigCard = gigLink.locator('xpath=ancestor::*[contains(@class, "card") or contains(@class, "item") or self::tr or self::li][1]');
    let editBtn = gigCard.locator('button:has-text("편집하기")').first();
    if (!await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // 전체에서 가장 가까운 편집 버튼 사용
      editBtn = page.locator('button:has-text("편집하기")').first();
    }

    await closeModals(page);
    await editBtn.click({ force: true });
    await page.waitForTimeout(5000);
    console.log(`[편집 페이지] ${page.url()}`);
    await closeModals(page);

    const applied = {};

    // 제목 수정
    if (changes.title) {
      console.log(`[제목] → "${changes.title.substring(0, 40)}"`);
      // 편집 페이지의 첫 번째 큰 입력 필드가 서비스 제목
      const titleInput = page.locator('input[name*="title"], input[placeholder*="서비스"], input[placeholder*="제목"]').first();
      if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const oldTitle = await titleInput.inputValue();
        await titleInput.clear();
        await titleInput.fill(changes.title);
        applied.title = { old: oldTitle, new: changes.title };
      } else {
        console.log('[제목] 입력 필드를 찾을 수 없음');
      }
    }

    // 태그 수정
    if (changes.tags) {
      console.log(`[태그] → "${changes.tags}"`);
      const tagInput = page.locator('input[placeholder*="태그"], input[placeholder*="키워드"], input[name*="tag"]').first();
      if (await tagInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        // 기존 태그 삭제 후 새 태그 입력
        const tagList = changes.tags.split(',').map(t => t.trim()).filter(Boolean);
        for (const tag of tagList) {
          await tagInput.fill(tag);
          await tagInput.press('Enter');
          await page.waitForTimeout(300);
        }
        applied.tags = tagList;
      }
    }

    // 설명 수정 (상세 설명은 보통 리치 에디터)
    if (changes.description) {
      console.log(`[설명] → "${changes.description.substring(0, 40)}..."`);
      // 에디터 영역 찾기
      const editor = page.locator('[contenteditable="true"], .ql-editor, .ProseMirror, textarea[name*="description"]').first();
      if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
        const oldDesc = await editor.innerText().catch(() => '');
        await editor.click();
        // 전체 선택 후 교체
        await page.keyboard.press('Control+a');
        await page.keyboard.type(changes.description, { delay: 10 });
        applied.description = { old: oldDesc.substring(0, 50), new: changes.description.substring(0, 50) };
      }
    }

    if (Object.keys(applied).length === 0) {
      await saveErrorScreenshot(page, 'edit-gig-no-fields');
      await browser.close();
      return { success: false, message: '수정 가능한 필드를 찾을 수 없음' };
    }

    // 저장 버튼 클릭
    const saveBtn = page.locator('button:has-text("저장"), button:has-text("수정 완료"), button:has-text("심사 요청"), button[type="submit"]').first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(5000);
      console.log(`[저장] URL: ${page.url()}`);

      // 확인 모달이 뜨면 확인
      const confirmBtn = page.locator('button:has-text("확인"), button:has-text("네")').first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // 변경 이력 저장
    for (const [field, val] of Object.entries(applied)) {
      await supabase.from('kmong_creative_changes').insert({
        product_id: productId,
        change_date: new Date().toISOString().split('T')[0],
        change_type: `gig_${field}`,
        old_value: typeof val === 'object' ? val.old : '',
        new_value: typeof val === 'object' ? val.new : JSON.stringify(val),
      }).catch(() => {});
    }

    const msg = `서비스 수정 완료: ${productId} | ${Object.keys(applied).join(', ')} 변경`;
    console.log(`[완료] ${msg}`);
    notify(msg);
    await browser.close();
    return { success: true, message: msg, changes: applied };

  } catch (err) {
    const msg = `서비스 수정 실패: ${err.message}`;
    console.error(`[에러] ${msg}`);
    notify(msg);
    if (browser) await browser.close();
    return { success: false, message: msg };
  }
}

module.exports = { editGig, GIG_ID_MAP };

if (require.main === module) {
  const args = process.argv.slice(2);
  const productId = args[0];
  const changes = {};

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const val = args[i + 1];
    if (key && val) changes[key] = val;
  }

  if (!productId || Object.keys(changes).length === 0) {
    console.log('사용법: node edit-gig.js <product_id> --title "새 제목" --tags "태그1,태그2" --description "새 설명"');
    console.log('예: node edit-gig.js onepage --title "소상공인 원페이지 제작"');
    process.exit(1);
  }
  editGig(productId, changes).then(r => process.exit(r.success ? 0 : 1));
}
