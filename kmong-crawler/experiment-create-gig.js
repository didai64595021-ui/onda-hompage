#!/usr/bin/env node
/**
 * A/B 실험 신규 상품 초안 등록
 * - state='approved_to_create' 실험 1건 처리
 * - 원본(A)의 gig-data 템플릿 + Opus 제안(B title/subtitle/desc/thumb)을 합성 → 임시 gig-data 파일 생성
 * - new-gigs/create-gig.js --mode save 로 호출 → 크몽 draft 등록
 * - 성공 시 state='created' + variant_b_kmong_gig_id 저장
 *
 * 사용법:
 *   node experiment-create-gig.js --experiment-id 1     # id=1 실험 진행
 *   node experiment-create-gig.js --list-approved       # 승인 대기 목록
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const { supabase } = require('./lib/supabase');
const adminDb = require('./lib/supabase-admin');
const { notifyTyped } = require('./lib/notify-filter');

const TMP_DATA_DIR = path.join(__dirname, 'tmp-experiment-data');
fs.mkdirSync(TMP_DATA_DIR, { recursive: true });

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.includes(`--${name}`);

async function listApproved() {
  const { data } = await supabase.from('kmong_ab_experiments')
    .select('id, variant_a_product_id, variant_b_title, state, user_approval')
    .in('state', ['drafted', 'approved_to_create'])
    .order('id', { ascending: true });
  console.log('승인 대기:');
  for (const r of data || []) {
    console.log(`  id=${r.id} | A=${r.variant_a_product_id} | state=${r.state} | user_approval=${r.user_approval || '-'} | B제목: ${r.variant_b_title?.slice(0, 40)}`);
  }
}

async function loadExperiment(id) {
  const { data, error } = await supabase.from('kmong_ab_experiments').select('*').eq('id', id).single();
  if (error) throw new Error(`실험 ${id} 조회 실패: ${error.message}`);
  return data;
}

async function loadOriginalGigData(productId) {
  // new-gigs/gig-data.js 또는 gig-data-55.js 에서 원본 상품 데이터 찾기
  const candidates = ['./new-gigs/gig-data.js', './new-gigs/gig-data-55.js'];
  for (const p of candidates) {
    try {
      delete require.cache[require.resolve(p)];
      const mod = require(p);
      const products = mod.PRODUCTS || mod.default?.PRODUCTS;
      if (!products) continue;
      const found = products.find(x => x.productId === productId || x.product_id === productId || x.id === productId);
      if (found) return { source: p, product: found };
    } catch {}
  }
  return null;
}

function synthesizeVariantB(original, exp) {
  // 원본 구조 복제 + B variant 필드 교체
  const b = JSON.parse(JSON.stringify(original));
  b.productId = `${original.productId || 'ab'}-b${exp.id}`;
  b.title = exp.variant_b_title || original.title;
  b.subtitle = exp.variant_b_subtitle || original.subtitle;
  if (exp.variant_b_description) {
    // description은 Opus의 후킹 요약만 있으므로 원본 설명 앞에 prepend
    const prefix = `[A/B 실험 id=${exp.id}]\n${exp.variant_b_description}\n\n---\n\n`;
    b.description = prefix + (original.description || '');
  }
  return b;
}

async function writeTmpGigData(product, expId) {
  const filePath = path.join(TMP_DATA_DIR, `gig-data-exp-${expId}.js`);
  const content = `// Auto-generated for A/B experiment ${expId}\nmodule.exports.PRODUCTS = ${JSON.stringify([product], null, 2)};\n`;
  fs.writeFileSync(filePath, content);
  return filePath;
}

async function runCreateGig(gigDataPath, mode = 'save') {
  const env = { ...process.env, GIG_DATA: gigDataPath };
  const { stdout, stderr } = await execFileAsync('node',
    ['new-gigs/create-gig.js', '--product', '1', '--mode', mode],
    { cwd: __dirname, env, maxBuffer: 20 * 1024 * 1024, timeout: 600000 }
  );
  return { stdout, stderr };
}

function extractGigIdFromOutput(output) {
  // create-gig.js가 완료 시 draft URL 또는 gigId 출력한다고 가정
  const m = output.match(/(?:gigId|gig_id|draft[_\s]id|mygig\/)\s*[:=\/]?\s*['"]?([0-9]{5,})/i);
  return m ? m[1] : null;
}

async function updateExperiment(id, patch) {
  const pg = await supabase.from('kmong_ab_experiments').update(patch).eq('id', id);
  if (pg.error) {
    const admin = await adminDb.updateById('kmong_ab_experiments', id, patch);
    if (!admin.ok) throw new Error(`update 실패: ${admin.error}`);
  }
}

async function main() {
  if (flag('list-approved')) return listApproved();

  const expId = parseInt(arg('experiment-id'), 10);
  if (!expId) { console.error('--experiment-id <ID> 필수'); process.exit(1); }

  const exp = await loadExperiment(expId);
  if (!['drafted', 'approved_to_create'].includes(exp.state)) {
    console.error(`실험 ${expId} 상태 ${exp.state} — 처리 불가`);
    process.exit(1);
  }

  const orig = await loadOriginalGigData(exp.variant_a_product_id);
  if (!orig) {
    const msg = `원본 상품 ${exp.variant_a_product_id} gig-data 없음 — 수동 등록 가이드로 전환`;
    console.warn('[경고]', msg);
    notifyTyped('report', `⚠️ 실험 ${expId} 자동 등록 불가: ${msg}\n\n수동 등록용 B 카피는 텔레그램 propose 메시지 참조.`);
    await updateExperiment(expId, { state: 'approved_to_create', user_approval: 'manual_required' });
    return;
  }

  console.log(`[합성] 원본: ${orig.source} / product=${exp.variant_a_product_id}`);
  const bProduct = synthesizeVariantB(orig.product, exp);
  const gigDataPath = await writeTmpGigData(bProduct, expId);
  console.log(`[임시 데이터] ${gigDataPath}`);

  notifyTyped('report', `🔨 실험 ${expId} 등록 시작 — Playwright draft 모드 (임시저장)\n약 2~5분 소요, 완료 후 텔레그램 알림`);

  try {
    const { stdout, stderr } = await runCreateGig(gigDataPath, 'save');
    const gigId = extractGigIdFromOutput(stdout + '\n' + stderr);
    await updateExperiment(expId, {
      state: 'created',
      created_at_gig: new Date().toISOString(),
      variant_b_kmong_gig_id: gigId,
      variant_b_changes: { ...(exp.variant_b_changes || {}), gig_data_path: gigDataPath, draft_gig_id: gigId },
    });
    notifyTyped('report', `✅ 실험 ${expId} draft 등록 완료\n  크몽 gig_id: ${gigId || '(추출 실패, 수동 확인)'}\n  state=created\n\n사용자가 크몽 UI에서 최종 제출하세요. 제출 후 '실험 ${expId} live' 보내면 measuring 시작.`);
  } catch (e) {
    console.error('[등록 실패]', e.message);
    notifyTyped('error', `실험 ${expId} draft 등록 실패: ${e.message.slice(0, 200)}`);
    await updateExperiment(expId, { state: 'drafted', user_approval: `failed: ${e.message.slice(0, 100)}` });
    process.exit(1);
  }
}

main().catch(e => { console.error(e); notifyTyped('error', `create-gig 크래시: ${e.message}`); process.exit(1); });
