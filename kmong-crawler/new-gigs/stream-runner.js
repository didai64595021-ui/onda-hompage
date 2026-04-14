#!/usr/bin/env node
/**
 * 크몽 55개 자동등록 — 스트리밍 모드 (준비된 순서대로 즉시 등록)
 *
 * 동작:
 *  - 30초 간격으로 gig-data-55.js를 다시 require (캐시 무효화)
 *  - "데이터 + 이미지 + 미완료" 조건 만족하는 상품을 동적으로 큐에 추가
 *  - 2 워커가 큐에서 꺼내 createGig(p, 'save') 실행
 *  - 1상품 임시저장 완료마다 텔레그램 (kmong 채팅) 즉시 발송
 *  - 모든 상품(55) 완료 또는 더 이상 신규 상품 없을 때 종료
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { createGig } = require('./create-gig');

const TG_SCRIPT = '/home/onda/scripts/telegram-sender.js';
const TG_CHAT = 'kmong';
const PROGRESS_FILE = path.join(__dirname, '55-progress.json');
const RUN_LOG = path.join(__dirname, '55-run-log.json');
const IMG_DIR = path.join(__dirname, '03-images');
const GIG_DATA_PATH = path.join(__dirname, 'gig-data-55.js');

const CONCURRENCY = 2;
const POLL_INTERVAL_MS = 30000; // 30초
const MAX_IDLE_LOOPS = 60;      // 30분 (60 × 30초) 신규 없으면 종료
const TARGET_TOTAL = 55;

function tg(msg) {
  return new Promise((resolve) => {
    const cmd = `node "${TG_SCRIPT}" send ${JSON.stringify(msg)} ${TG_CHAT}`;
    const child = exec(cmd, { timeout: 15000 }, () => resolve());
    child.on('error', () => resolve());
  });
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { done: [], failed: [], started_at: new Date().toISOString() }; }
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

function loadProductsFresh() {
  // require 캐시 클리어 → 파일 변경사항 즉시 반영
  delete require.cache[require.resolve(GIG_DATA_PATH)];
  try { return require(GIG_DATA_PATH).PRODUCTS || []; }
  catch (e) {
    console.warn(`[load] gig-data-55.js 로드 실패: ${e.message}`);
    return [];
  }
}

function getReady(products, progress, claimed) {
  return products.filter(p => {
    if (progress.done.includes(p.id)) return false;
    if (claimed.has(p.id)) return false;
    if (!p.image) return false;
    const imgPath = path.join(IMG_DIR, p.image);
    if (!fs.existsSync(imgPath)) return false;
    return true;
  });
}

async function processOne(p, workerNo) {
  const start = Date.now();
  const total = TARGET_TOTAL;
  console.log(`\n[W${workerNo}] ▶ ${p.id}/${total} ${p.title}`);

  let r;
  try {
    r = await createGig(p, 'save');
  } catch (e) {
    r = { ok: false, log: { id: p.id, title: p.title, errors: [e.message], steps: [] } };
  }
  const dur = Math.round((Date.now() - start) / 1000);

  const step2 = (r.log.steps || []).find(s => s.name === 'step2');
  const savedUrl = step2 && step2.savedUrl ? step2.savedUrl : '(URL 미확인)';
  const errs = r.log.errors || [];
  const priceTxt = `${p.packages[0].price.toLocaleString()}~${p.packages[2].price.toLocaleString()}원`;

  if (r.ok && errs.length === 0) {
    await tg(`✅ 크몽 임시저장 [W${workerNo}] (${dur}s)
🆔 ${p.id}/${total} ${p.title}
📂 ${p.cat1} > ${p.cat2}
💰 ${priceTxt}
🔗 ${savedUrl}`);
  } else if (r.ok) {
    await tg(`⚠️ 임시저장(경고) [W${workerNo}] (${dur}s)
🆔 ${p.id}/${total} ${p.title}
🔗 ${savedUrl}
경고: ${errs.slice(0, 2).join(' / ')}`);
  } else {
    await tg(`❌ 등록 실패 [W${workerNo}] (${dur}s)
🆔 ${p.id}/${total} ${p.title}
사유: ${errs.slice(0, 3).join(' / ')}`);
  }

  appendRunLog({ at: new Date().toISOString(), workerNo, id: p.id, title: p.title, ok: r.ok, dur, savedUrl, errors: errs });
  return { ok: r.ok && errs.length === 0, id: p.id, savedUrl, errors: errs };
}

// ─── 워커: 큐에서 가져와서 처리, 큐가 비면 sleep 후 다시 fetch ───
async function workerLoop(workerNo, sharedState) {
  let idleLoops = 0;
  while (!sharedState.shouldStop) {
    // 큐에서 하나 꺼내기 (atomic)
    let p = sharedState.queue.shift();
    if (!p) {
      // 큐 비면 새로 fetch 시도
      const products = loadProductsFresh();
      const progress = loadProgress();
      const ready = getReady(products, progress, sharedState.claimed);

      // 신규 상품들을 큐에 추가
      for (const r of ready) {
        if (!sharedState.claimed.has(r.id)) {
          sharedState.queue.push(r);
          sharedState.claimed.add(r.id);
        }
      }

      p = sharedState.queue.shift();
      if (!p) {
        // 정말로 처리할 게 없음
        idleLoops++;
        if (progress.done.length >= TARGET_TOTAL) {
          console.log(`[W${workerNo}] 모든 상품 완료 — 종료`);
          break;
        }
        if (idleLoops >= MAX_IDLE_LOOPS) {
          console.log(`[W${workerNo}] ${MAX_IDLE_LOOPS}회 연속 idle (${MAX_IDLE_LOOPS * POLL_INTERVAL_MS / 60000}분) — 종료`);
          break;
        }
        if (idleLoops % 10 === 0) {
          console.log(`[W${workerNo}] idle ${idleLoops}/${MAX_IDLE_LOOPS} — 완료 ${progress.done.length}/${TARGET_TOTAL}, 데이터 ${products.length}/${TARGET_TOTAL}`);
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }
    }
    idleLoops = 0;

    // 처리
    const r = await processOne(p, workerNo);

    // 진행파일 업데이트 (다시 로드 — 다른 워커 변경분 반영)
    const progress = loadProgress();
    if (r.ok) {
      if (!progress.done.includes(p.id)) progress.done.push(p.id);
      progress.failed = (progress.failed || []).filter(f => f.id !== p.id);
    } else {
      const fIdx = (progress.failed || []).findIndex(f => f.id === p.id);
      if (fIdx >= 0) progress.failed[fIdx] = { id: p.id, errors: r.errors, at: new Date().toISOString() };
      else (progress.failed = progress.failed || []).push({ id: p.id, errors: r.errors, at: new Date().toISOString() });
    }
    saveProgress(progress);

    // 다음 상품 전 짧은 휴식
    await new Promise(r => setTimeout(r, 4000));
  }
}

(async () => {
  const startedAt = new Date().toISOString();
  const sharedState = {
    queue: [],
    claimed: new Set(),
    shouldStop: false,
  };

  let progress = loadProgress();
  if (!progress.started_at) {
    progress.started_at = startedAt;
    saveProgress(progress);
  }

  await tg(`🚀 크몽 스트리밍 자동등록 시작 (병렬 ${CONCURRENCY})
- 데이터+이미지 준비된 상품을 즉시 picking
- 30초 간격 폴링, 신규 상품 자동 추가
- 1 임시저장마다 링크 즉시 발송
- 누적 완료: ${progress.done.length}/${TARGET_TOTAL}`);

  // 초기 큐 채우기
  const products = loadProductsFresh();
  const initialReady = getReady(products, progress, sharedState.claimed);
  for (const r of initialReady) {
    sharedState.queue.push(r);
    sharedState.claimed.add(r.id);
  }
  console.log(`[init] 초기 큐: ${sharedState.queue.length}개 (전체 데이터: ${products.length})`);

  // 워커 시작
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => workerLoop(i + 1, sharedState));
  await Promise.all(workers);

  // 최종 보고
  const finalProgress = loadProgress();
  await tg(`🎉 크몽 스트리밍 자동등록 종료
- 완료: ${finalProgress.done.length}/${TARGET_TOTAL}
- 실패: ${(finalProgress.failed || []).length}
- 시작: ${startedAt}
- 종료: ${new Date().toISOString()}`);
})().catch(async (e) => {
  console.error('치명적 오류:', e);
  await tg(`❌ 스트림 러너 치명적 오류: ${e.message}`);
  process.exit(1);
});
