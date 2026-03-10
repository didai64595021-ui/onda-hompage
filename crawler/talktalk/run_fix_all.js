#!/usr/bin/env node
/**
 * run_fix_all.js
 * 통합 실행 스크립트
 * 순서: 스팸처리 → 엔티티수정 → placeUrl있는것 OCR → 통계 출력
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');
const SPAM_NAME_LIMIT = 50;

function getStats() {
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const all = Object.values(history.crawled);
  const total = all.length;
  const o = all.filter(b => b.talktalkButton === 'O').length;
  const x = all.filter(b => b.talktalkButton === 'X').length;
  const unknown = all.filter(b => b.talktalkButton === '미확인' || !b.talktalkButton).length;
  const noPid = all.filter(b => b.talktalkVerified === 'no_pid').length;
  const noPidFinal = all.filter(b => b.talktalkVerified === 'no_pid_final').length;
  const ocr = all.filter(b => b.talktalkVerified === 'ocr').length;
  const ocrFail = all.filter(b => b.talktalkVerified === 'ocr_fail').length;
  const spam = all.filter(b => b.talktalkVerified === 'spam').length;
  const html = all.filter(b => b.talktalkVerified === 'html').length;
  const withPlace = all.filter(b => b.placeUrl).length;
  return { total, o, x, unknown, noPid, noPidFinal, ocr, ocrFail, spam, html, withPlace };
}

function printStats(label, stats) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 ${label}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  전체: ${stats.total}`);
  console.log(`  💬 톡톡O: ${stats.o} | ❌ 톡톡X: ${stats.x} | ? 미확인: ${stats.unknown}`);
  console.log(`  📈 톡톡 보유율: ${(stats.o / Math.max(1, stats.o + stats.x) * 100).toFixed(1)}%`);
  console.log(`  📍 placeUrl 보유: ${stats.withPlace}`);
  console.log(`  검증: ocr=${stats.ocr} html=${stats.html} spam=${stats.spam} ocr_fail=${stats.ocrFail}`);
  console.log(`  미처리: no_pid=${stats.noPid} no_pid_final=${stats.noPidFinal}`);
  const processed = stats.o + stats.x + stats.spam + stats.noPidFinal;
  console.log(`  처리율: ${(processed / Math.max(1, stats.total) * 100).toFixed(1)}% (${processed}/${stats.total})`);
}

function runStep(label, scriptPath) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`▶ ${label}`);
  console.log(`${'─'.repeat(50)}`);
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit', timeout: 3600000 });
    return true;
  } catch (e) {
    console.log(`  ❌ ${label} 실패: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 전체 수정 파이프라인 시작');
  console.log(`📅 ${new Date().toLocaleString('ko-KR')}\n`);

  const before = getStats();
  printStats('변경 전 현황', before);

  // ═══ STEP 1: 스팸 업체 자동 X 처리 ═══
  console.log(`\n${'═'.repeat(50)}`);
  console.log('🗑️ STEP 1: 스팸 업체 자동 처리 (이름 50자 초과)');
  console.log(`${'═'.repeat(50)}`);

  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  let spamCount = 0;
  for (const [, biz] of Object.entries(history.crawled)) {
    if (biz.talktalkVerified === 'spam') continue; // 이미 처리됨
    if (biz.name && biz.name.length > SPAM_NAME_LIMIT) {
      biz.talktalkButton = 'X';
      biz.talktalkVerified = 'spam';
      spamCount++;
    }
  }
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log(`✅ 스팸 처리: ${spamCount}건`);
  console.log('[STEP-DONE] 스팸처리 완료');

  // ═══ STEP 2: 엔티티 수정 ═══
  runStep('STEP 2: HTML 엔티티 수정', path.join(__dirname, 'fix_entities.js'));

  // ═══ STEP 3: placeUrl 있는 no_pid OCR ═══
  runStep('STEP 3: placeUrl 있는 no_pid OCR 확인', path.join(__dirname, 'fix_known_pids.js'));

  // ═══ 최종 통계 ═══
  const after = getStats();
  printStats('변경 후 현황', after);

  // 변경 비교
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📈 변경 비교');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  톡톡O: ${before.o} → ${after.o} (+${after.o - before.o})`);
  console.log(`  톡톡X: ${before.x} → ${after.x} (+${after.x - before.x})`);
  console.log(`  미확인: ${before.unknown} → ${after.unknown} (${after.unknown - before.unknown})`);
  console.log(`  스팸: ${before.spam} → ${after.spam} (+${after.spam - before.spam})`);
  console.log(`  no_pid: ${before.noPid} → ${after.noPid} (${after.noPid - before.noPid})`);

  console.log(`\n✅ 전체 파이프라인 완료!`);
  console.log(`📅 ${new Date().toLocaleString('ko-KR')}`);
  console.log('[STEP-DONE] 전체 파이프라인 완료');
}

main().catch(console.error);
