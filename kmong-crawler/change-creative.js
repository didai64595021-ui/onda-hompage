#!/usr/bin/env node
/**
 * 크몽 광고 소재(타이틀) 변경 RPA
 *
 * [실제 UI 분석 결과 2026-04-06]
 * - click-up 페이지의 "변경" 버튼 = 입찰가/기간 변경 (소재 변경 아님)
 * - "상세보기" 버튼 = 키워드 검색어 통계 팝업
 * - 광고 소재(제목) 변경은 edit-gig.js의 title 변경으로 대체
 *
 * 따라서 이 함수는 edit-gig.js의 editGig()를 내부적으로 호출함
 * (API 호환성 유지를 위해 인터페이스는 동일)
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { editGig } = require('./edit-gig');
const { notify } = require('./lib/telegram');
const { supabase } = require('./lib/supabase');

/**
 * 광고 소재(타이틀) 변경 — edit-gig 방식으로 구현
 * @param {string} productId - product_id (예: 'onepage')
 * @param {string} newTitle - 새 광고 타이틀
 * @returns {Promise<{success: boolean, message: string, oldTitle?: string}>}
 */
async function changeCreative(productId, newTitle) {
  if (!productId || !newTitle) {
    throw new Error('사용법: node change-creative.js <product_id> "<new_title>"');
  }

  console.log(`=== 소재 변경: ${productId} → "${newTitle.substring(0, 40)}..." ===`);
  console.log('[방식] 서비스 상세페이지 제목 변경 (edit-gig)');

  // edit-gig의 title 변경으로 위임
  const result = await editGig(productId, { title: newTitle });

  if (result.success) {
    const oldTitle = result.changes?.title?.old || '';
    const msg = `광고 소재 변경 완료: ${productId} | "${oldTitle.substring(0, 20)}" → "${newTitle.substring(0, 20)}"`;
    console.log(`[완료] ${msg}`);
    
    // 변경 이력 저장
    try {
      await supabase.from('kmong_creative_changes').insert({
        product_id: productId,
        change_date: new Date().toISOString().split('T')[0],
        change_type: 'title',
        old_value: oldTitle,
        new_value: newTitle,
      });
    } catch {}

    return { success: true, message: msg, oldTitle };
  } else {
    const errMsg = `소재 변경 실패: ${productId} — ${result.message}`;
    console.error(`[실패] ${errMsg}`);
    return { success: false, message: errMsg };
  }
}

module.exports = { changeCreative };

if (require.main === module) {
  const [,, productId, newTitle] = process.argv;
  if (!productId || !newTitle) {
    console.log('사용법: node change-creative.js <product_id> "<new_title>"');
    console.log('예: node change-creative.js insta-core "인스타그램 핵심 전략 | 팔로워 증가"');
    process.exit(1);
  }
  changeCreative(productId, newTitle).then(r => {
    console.log('결과:', JSON.stringify(r));
    process.exit(r.success ? 0 : 1);
  });
}
