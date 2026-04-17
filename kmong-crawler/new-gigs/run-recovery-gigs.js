#!/usr/bin/env node
/**
 * 9개 gig draft 임시저장 오케스트레이터 (Phase 8C)
 *  - recovery-gigs-full.json 을 create-gig.js 의 PRODUCTS 포맷으로 변환
 *  - 각 gig 순차 생성 (concurrency 1 — 크몽 인증/세션 충돌 회피)
 *  - mode='save' 고정 (submit 절대 금지 — 사용자 드라이런 원칙)
 *  - 결과/draft URL 수집 → run-recovery-log.json 저장
 *  - 매 gig 완료마다 텔레그램 진행 보고
 */
const fs = require('fs');
const path = require('path');
const { createGig } = require('./create-gig');

const IN_PATH = path.join(__dirname, 'recovery-gigs-full.json');
const OUT_PATH = path.join(__dirname, 'run-recovery-log.json');
const IMAGES_DIR = path.join(__dirname, '03-images');

// 9개 gig 각각에 할당할 썸네일 (55-01 ~ 55-09 재활용)
const THUMBNAILS = {
  'onepage-recovery':       '55-01.png',  // 랜딩
  'old-site-renew':         '55-02.png',
  'cafe24-fix':             '55-03.png',
  'imweb-to-html':          '55-04.png',
  'design-to-html':         '55-05.png',
  'monthly-maintenance':    '55-06.png',
  'insta-account-active':   '55-07.png',
  'speed-optimize':         '55-08.png',
  'multilingual':           '55-09.png',
};

function toProduct(gig, idx) {
  const image = THUMBNAILS[gig.slug] || '55-01.png';
  return {
    id: String(idx + 1).padStart(2, '0'),
    cat1: gig.cat1,
    cat2: gig.cat2,
    image,
    title: gig.title,
    description: gig.description || '(본문 없음)',
    progress: gig.progress || '1. 상담 → 2. 계약 → 3. 작업 → 4. 피드백 → 5. 납품',
    preparation: gig.preparation || '업종/용도, 참고 사이트, 원하는 방향',
    packages: gig.packages,
    features: { tech: '중급', team: '1인', onsite: '상주 불가능', purpose: gig.cat2 },
    // Phase 6 ~ 중요: '상주 불가능', '제한없음' 어휘 주의 (KMONG_CONTEXT 7.4)
  };
}

async function notify(msg) {
  try {
    const { spawnSync } = require('child_process');
    spawnSync('node', ['/home/onda/scripts/telegram-sender.js', msg], { stdio: 'ignore' });
  } catch {}
}

async function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error(`입력 파일 없음: ${IN_PATH} — 먼저 generate-recovery-bodies.js 실행`);
    process.exit(1);
  }
  const { gigs } = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  console.log(`▶ 9개 gig 임시저장 시작 — 총 ${gigs.length}개`);
  await notify(`🛠️ 크몽 9개 gig draft 임시저장 시작 (Phase 8C). 각 3~5분 예상, 순차 진행.`);

  const log = { started_at: new Date().toISOString(), results: [] };
  for (let i = 0; i < gigs.length; i++) {
    const gig = gigs[i];
    const product = toProduct(gig, i);
    console.log(`\n[${i + 1}/${gigs.length}] ${gig.title}`);

    // 본문 누락이면 스킵 (다음 단계에서 수동 보강)
    if (gig._error) {
      console.log(`  ⏭ 본문 생성 실패(${gig._error}) — 스킵`);
      log.results.push({ slug: gig.slug, title: gig.title, skipped: true, reason: gig._error });
      continue;
    }

    const start = Date.now();
    try {
      const r = await createGig(product, 'save');
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const finalUrl = r.log?.steps?.find(s => s.name === 'step2')?.finalUrl || null;
      const draftId = finalUrl?.match(/\/edit\/(\d+)/)?.[1] || null;
      const entry = {
        slug: gig.slug,
        title: gig.title,
        ok: r.ok,
        draft_id: draftId,
        edit_url: finalUrl,
        elapsed_sec: +elapsed,
        errors: r.log?.errors || [],
      };
      log.results.push(entry);
      if (r.ok) {
        console.log(`  ✅ 성공 (${elapsed}s) draft=${draftId}`);
        await notify(`✅ [${i + 1}/${gigs.length}] ${gig.title}\n  draft #${draftId} (${elapsed}s)\n  ${finalUrl || ''}`);
      } else {
        console.log(`  ❌ 실패: ${(r.log?.errors || []).join(', ')}`);
        await notify(`❌ [${i + 1}/${gigs.length}] ${gig.title}\n  실패: ${(r.log?.errors || []).join(', ').slice(0, 120)}`);
      }
    } catch (e) {
      console.log(`  ❌ 예외: ${e.message}`);
      log.results.push({ slug: gig.slug, title: gig.title, ok: false, exception: e.message });
      await notify(`❌ [${i + 1}/${gigs.length}] ${gig.title} 예외: ${e.message.slice(0, 120)}`);
    }

    // 진행 상태 수시 저장 (중단 대비)
    fs.writeFileSync(OUT_PATH, JSON.stringify(log, null, 2));

    // 상품 간 간격 (크몽 제한 회피)
    if (i < gigs.length - 1) {
      console.log('  ⏳ 30초 간격 대기...');
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  log.finished_at = new Date().toISOString();
  const ok = log.results.filter(r => r.ok).length;
  const fail = log.results.filter(r => !r.ok && !r.skipped).length;
  const skip = log.results.filter(r => r.skipped).length;
  fs.writeFileSync(OUT_PATH, JSON.stringify(log, null, 2));

  const report = `🏁 크몽 9개 gig 임시저장 완료
  ✅ 성공 ${ok} / ❌ 실패 ${fail} / ⏭ 스킵 ${skip}
  결과: ${OUT_PATH}`;
  console.log('\n' + report);
  await notify(report);
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
