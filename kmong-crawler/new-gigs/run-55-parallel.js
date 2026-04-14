#!/usr/bin/env node
/**
 * 크몽 55개 자동등록 오케스트레이터 (2 병렬 워커)
 *
 * 동작:
 *  - gig-data-55.js의 PRODUCTS를 큐로 분배
 *  - 2개 워커가 동시에 createGig(p, 'save') 호출 → 임시저장
 *  - 1상품 완료마다 텔레그램 보고 (성공/실패 모두)
 *  - 진행상황은 55-progress.json에 저장 (재개 가능)
 *
 * 사용법:
 *   node run-55-parallel.js                    # 2 병렬 (기본)
 *   node run-55-parallel.js --concurrency 1    # 1 직렬
 *   node run-55-parallel.js --only 01,02,03    # 특정 ID만
 *   node run-55-parallel.js --resume           # 진행파일 기반 이어서
 *   node run-55-parallel.js --reset            # 진행파일 초기화 후 시작
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let PRODUCTS;
try {
  PRODUCTS = require('./gig-data-55').PRODUCTS;
} catch (e) {
  console.error('✗ gig-data-55.js 로드 실패:', e.message);
  console.error('먼저 백그라운드 에이전트로 gig-data-55.js를 생성해야 합니다.');
  process.exit(1);
}

const { createGig } = require('./create-gig');

const TG_SCRIPT = '/home/onda/scripts/telegram-sender.js';
const TG_CHAT = 'kmong'; // -1003738825402 그룹
const PROGRESS_FILE = path.join(__dirname, '55-progress.json');
const RUN_LOG = path.join(__dirname, '55-run-log.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { concurrency: 2, only: null, resume: false, reset: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--concurrency' && args[i + 1]) opts.concurrency = parseInt(args[++i], 10);
    else if (args[i] === '--only' && args[i + 1]) opts.only = args[++i].split(',').map(s => s.trim());
    else if (args[i] === '--resume') opts.resume = true;
    else if (args[i] === '--reset') opts.reset = true;
  }
  return opts;
}

function tg(msg) {
  return new Promise((resolve) => {
    const cmd = `node "${TG_SCRIPT}" send ${JSON.stringify(msg)} ${TG_CHAT}`;
    const child = exec(cmd, { timeout: 15000 }, () => resolve());
    child.on('error', () => resolve());
  });
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { done: [], failed: [], started_at: null }; }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}
function appendRunLog(entry) {
  let runs = [];
  try { const prev = JSON.parse(fs.readFileSync(RUN_LOG, 'utf-8')); if (Array.isArray(prev.runs)) runs = prev.runs; } catch {}
  runs.push(entry);
  fs.writeFileSync(RUN_LOG, JSON.stringify({ runs }, null, 2));
}

async function processOne(p, workerNo) {
  const start = Date.now();
  console.log(`\n[W${workerNo}] ▶ ${p.id} ${p.title}`);
  let r;
  try {
    r = await createGig(p, 'save');
  } catch (e) {
    r = { ok: false, log: { id: p.id, title: p.title, errors: [e.message], steps: [] } };
  }
  const dur = Math.round((Date.now() - start) / 1000);

  // 임시저장 URL 추출
  const step2 = (r.log.steps || []).find(s => s.name === 'step2');
  const savedUrl = step2 && step2.savedUrl ? step2.savedUrl : '(URL 미확인)';

  const errs = r.log.errors || [];
  const priceTxt = `${p.packages[0].price.toLocaleString()}~${p.packages[2].price.toLocaleString()}원`;

  if (r.ok && errs.length === 0) {
    await tg(
      `✅ 크몽 임시저장 [W${workerNo}] (${dur}s)
🆔 ${p.id}/${PRODUCTS.length} ${p.title}
📂 ${p.cat1} > ${p.cat2}
💰 ${priceTxt}
🔗 ${savedUrl}`
    );
  } else if (r.ok && errs.length > 0) {
    await tg(
      `⚠️ 크몽 임시저장(부분 경고) [W${workerNo}] (${dur}s)
🆔 ${p.id}/${PRODUCTS.length} ${p.title}
🔗 ${savedUrl}
경고: ${errs.slice(0, 2).join(' / ')}`
    );
  } else {
    await tg(
      `❌ 크몽 등록 실패 [W${workerNo}] (${dur}s)
🆔 ${p.id}/${PRODUCTS.length} ${p.title}
사유: ${errs.slice(0, 3).join(' / ')}`
    );
  }

  appendRunLog({ at: new Date().toISOString(), workerNo, id: p.id, title: p.title, ok: r.ok, dur, savedUrl, errors: errs });
  return { ok: r.ok && errs.length === 0, id: p.id, savedUrl, errors: errs, dur };
}

async function workerLoop(workerNo, queue, results, progress) {
  while (queue.length > 0) {
    const p = queue.shift();
    if (!p) break;
    if (progress.done.includes(p.id)) {
      console.log(`[W${workerNo}] ⏩ ${p.id} 이미 완료 — skip`);
      continue;
    }
    const r = await processOne(p, workerNo);
    results.push(r);
    if (r.ok) {
      if (!progress.done.includes(p.id)) progress.done.push(p.id);
      progress.failed = (progress.failed || []).filter(f => f.id !== p.id);
    } else {
      progress.failed = (progress.failed || []).filter(f => f.id !== p.id).concat([{ id: p.id, errors: r.errors, at: new Date().toISOString() }]);
    }
    saveProgress(progress);

    // 다음 상품 전 짧은 휴식 (Kmong rate-limit 회피)
    await new Promise(r => setTimeout(r, 4000));
  }
}

(async () => {
  const opts = parseArgs();
  let progress = loadProgress();

  if (opts.reset) {
    console.log('🔄 진행파일 초기화');
    progress = { done: [], failed: [], started_at: new Date().toISOString() };
    saveProgress(progress);
  }
  if (!progress.started_at) {
    progress.started_at = new Date().toISOString();
    saveProgress(progress);
  }

  // 큐 구성
  let candidates = PRODUCTS.slice();
  if (opts.only && opts.only.length > 0) {
    candidates = candidates.filter(p => opts.only.includes(p.id));
  }
  // 이미 완료된 상품 제외
  const queue = candidates.filter(p => !progress.done.includes(p.id));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`크몽 55개 자동등록 오케스트레이터`);
  console.log(`전체: ${PRODUCTS.length} | 후보: ${candidates.length} | 진행대상: ${queue.length}`);
  console.log(`완료: ${progress.done.length} | 병렬: ${opts.concurrency}`);
  console.log('='.repeat(60));

  if (queue.length === 0) {
    await tg(`✅ 크몽 자동등록 — 모든 상품 이미 완료\n총 ${PRODUCTS.length}개 / 완료 ${progress.done.length}`);
    return;
  }

  await tg(
    `🚀 크몽 자동등록 시작 (병렬 ${opts.concurrency})
큐: ${queue.length}개 (전체 ${PRODUCTS.length} 중)
진행파일 기준 완료: ${progress.done.length}
1상품 임시저장마다 텔레그램 보고`
  );

  const results = [];
  const workers = Array.from({ length: opts.concurrency }, (_, i) => workerLoop(i + 1, queue, results, progress));
  await Promise.all(workers);

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  await tg(
    `🎉 크몽 자동등록 일괄 종료
이번 실행 성공: ${ok}
이번 실행 실패: ${fail}
누적 완료: ${progress.done.length}/${PRODUCTS.length}
누적 실패: ${(progress.failed || []).length}`
  );
})().catch(async (e) => {
  console.error('치명적 오류:', e);
  await tg(`❌ 크몽 오케스트레이터 치명적 오류: ${e.message}`);
  process.exit(1);
});
