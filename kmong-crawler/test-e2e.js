#!/usr/bin/env node
/**
 * End-to-End 테스트 스크립트
 * insta-core (CTR 0%, 노출 70) 대상으로 AI 소재 생성 → RPA 변경 테스트
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { notify } = require('./lib/telegram');

const TARGET_PRODUCT = 'insta-core'; // CTR 0% 최저성과

// ============================================================
// Step 1: 저성과 서비스 확인 (Supabase)
// ============================================================
async function getTargetMetrics() {
  const { supabase } = require('./lib/supabase');
  const { data } = await supabase
    .from('kmong_cpc_daily')
    .select('*')
    .eq('product_id', TARGET_PRODUCT)
    .order('date', { ascending: false })
    .limit(1);
  return data?.[0];
}

// ============================================================
// Step 2: AI 소재 생성 (패턴 없이 직접 생성)
// ============================================================
function generateTitle(productName, category) {
  const templates = {
    urgency: [
      `인스타그램 운영 3일 완성! ${productName} — 조회수 폭발 보장`,
      `지금 시작하면 1주일 후 팔로워 증가 | ${productName}`,
      `${productName} | 48시간 전략 수립 → 실행까지 원스톱`,
    ],
    problem_solution: [
      `인스타 해도 반응 없어요? → 핵심 전략으로 바꾸세요`,
      `팔로워 안 늘어요? ${productName}으로 해결`,
      `인스타 운영 막막할 때 | 전문가 전략 컨설팅`,
    ],
    social_proof: [
      `${productName} | 리뷰 98점 — 팔로워 3배 증가 비법`,
      `50건+ 완료! 인스타그램 핵심 전략 컨설팅`,
      `${productName} | 실제 성과 사례 다수 — 지금 상담`,
    ],
  };

  // urgency 패턴 사용 (CTR 향상에 가장 효과적)
  const selected = templates.urgency[Math.floor(Math.random() * templates.urgency.length)];
  return selected;
}

// ============================================================
// Step 3: change-creative.js로 실제 RPA 변경 (dry-run 먼저)
// ============================================================
async function runChangeCreative(productId, newTitle, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY-RUN] change-creative: ${productId} → "${newTitle}"`);
    return { success: true, message: 'dry-run OK', dryRun: true };
  }
  const { changeCreative } = require('./change-creative');
  return await changeCreative(productId, newTitle);
}

// ============================================================
// Step 4: edit-gig.js로 태그 수정 테스트
// ============================================================
async function runEditGig(productId, changes, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY-RUN] edit-gig: ${productId}`, JSON.stringify(changes));
    return { success: true, message: 'dry-run OK', dryRun: true };
  }
  const { editGig } = require('./edit-gig');
  return await editGig(productId, changes);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  크몽 소재최적화 End-to-End 테스트 시작       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  const startTime = Date.now();

  // Step 1: 현재 지표 확인
  console.log('[Step 1] 저성과 서비스 지표 확인...');
  const metrics = await getTargetMetrics();
  if (metrics) {
    console.log(`  → 대상: ${TARGET_PRODUCT}`);
    console.log(`  → 노출: ${metrics.impressions} | 클릭: ${metrics.clicks} | CTR: ${metrics.ctr||0}%`);
    console.log(`  → 기준일: ${metrics.date}`);
  } else {
    console.log(`  → ${TARGET_PRODUCT} 데이터 없음 (크롤링 필요)`);
  }

  // Step 2: AI 소재 생성
  console.log('\n[Step 2] AI 소재 생성...');
  const newTitle = generateTitle('인스타그램 핵심만 쏙쏙', '마케팅');
  console.log(`  → 생성된 타이틀: "${newTitle}"`);

  // Step 3: 실제 크몽 광고 타이틀 변경 (RPA)
  // insta-core는 광고 OFF라 click-up에서 소재 변경 가능 여부 확인 필요
  // 먼저 change-creative 모듈 방식 확인
  console.log('\n[Step 3] 광고 소재 변경 RPA 실행...');
  console.log(`  → 대상: ${TARGET_PRODUCT}`);
  console.log(`  → 새 타이틀: "${newTitle}"`);
  
  let creativeResult;
  try {
    const { changeCreative } = require('./change-creative');
    creativeResult = await changeCreative(TARGET_PRODUCT, newTitle);
    console.log('  → 결과:', JSON.stringify(creativeResult));
  } catch (err) {
    console.error('  → 에러:', err.message);
    creativeResult = { success: false, message: err.message };
  }

  // Step 4: 상세페이지 태그 수정 (edit-gig)
  console.log('\n[Step 4] 상세페이지 태그 수정 RPA...');
  const newTags = '인스타그램마케팅,SNS운영,콘텐츠전략,팔로워늘리기,인스타운영대행';
  
  let gigResult;
  try {
    const { editGig } = require('./edit-gig');
    gigResult = await editGig(TARGET_PRODUCT, { tags: newTags });
    console.log('  → 결과:', JSON.stringify(gigResult));
  } catch (err) {
    console.error('  → 에러:', err.message);
    gigResult = { success: false, message: err.message };
  }

  // 결과 보고
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const summary = [
    '🧪 E2E 테스트 완료 보고서',
    `대상: ${TARGET_PRODUCT} (CTR ${metrics?.ctr||0}%, 노출 ${metrics?.impressions||0})`,
    '',
    `[광고소재 변경] ${creativeResult?.success ? '✅ 성공' : '❌ 실패'}: ${creativeResult?.message?.substring(0,80) || ''}`,
    `[상세페이지 태그] ${gigResult?.success ? '✅ 성공' : '❌ 실패'}: ${gigResult?.message?.substring(0,80) || ''}`,
    '',
    `소요: ${elapsed}초`,
  ].join('\n');

  console.log('\n' + summary);
  await new Promise(r => setTimeout(r, 1000));
  notify(summary);

  console.log('\n[완료]');
}

main().catch(err => {
  console.error('[치명적 에러]', err);
  notify(`E2E 테스트 실패: ${err.message}`);
  process.exit(1);
});
