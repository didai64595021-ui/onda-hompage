// cms-data.json → Supabase threeway_cms 동기화
// 정적 cms-data.json을 source of truth로 보고 supabase 행 덮어쓰기.
//
// 사용:
//   node sync-cms-to-supabase.mjs           # 동기화
//   node sync-cms-to-supabase.mjs --diff    # 차이만 출력 (apply 안 함)
//
// env: SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_URL)

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
const TABLE = 'threeway_cms';
const ROW_ID = 'main';

// Service role key — env에서 우선, 없으면 logic-monitor의 .env.local에서 읽기
function getServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  // logic-monitor 프로젝트에서 가져오기 (같은 supabase 프로젝트) — .env.local / .env / .env.prod 순서
  for (const fname of ['.env.local', '.env', '.env.prod']) {
    try {
      const envPath = `/home/onda/projects/onda-logic-monitor/${fname}`;
      const env = readFileSync(envPath, 'utf-8');
      const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch {}
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in any env file');
}

const SERVICE_KEY = getServiceKey();
const dataFile = resolve(__dirname, 'cms-data.json');
const localData = JSON.parse(readFileSync(dataFile, 'utf-8'));
console.log(`📄 Local cms-data.json: ${Object.keys(localData).length} keys`);

// 1. 현재 supabase 행 조회
console.log(`\n📥 GET ${TABLE}/${ROW_ID}`);
const getRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=data`, {
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
});
if (!getRes.ok) {
  console.error(`❌ GET 실패: ${getRes.status} ${await getRes.text()}`);
  process.exit(1);
}
const rows = await getRes.json();
const remoteData = rows[0]?.data || {};
console.log(`📦 Remote data: ${Object.keys(remoteData).length} keys`);

// 안전 정책: supabase에 더 많은 키가 있으면 admin.html로 사용자가 추가한 것일 수 있음 → 보존.
// 우리가 명시적으로 변경한 키만 patch (--keys 인자로 지정 또는 ENV CHANGED_KEYS)
//
// 사용:
//   node sync-cms-to-supabase.mjs --keys rooms-subtitle,facilities-subtitle,badge-mbc
//   node sync-cms-to-supabase.mjs --all     # 전체 덮어쓰기 (위험, 명시 시만)
//   node sync-cms-to-supabase.mjs --diff    # diff만 출력

const argKeys = process.argv.find((a) => a.startsWith('--keys='));
const explicitKeys = argKeys ? argKeys.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
const fullOverwrite = process.argv.includes('--all');
// --restore-empty: supabase에 빈값/missing인 키 중 cms-data.json에 값 있는 것을 복구
const restoreEmpty = process.argv.includes('--restore-empty');

// 2. diff
const diffs = [];
const allKeys = new Set([...Object.keys(localData), ...Object.keys(remoteData)]);
for (const k of allKeys) {
  const lv = JSON.stringify(localData[k]);
  const rv = JSON.stringify(remoteData[k]);
  if (lv !== rv) {
    diffs.push({ key: k, local: localData[k], remote: remoteData[k] });
  }
}
console.log(`\n🔍 Diff: ${diffs.length} keys`);
diffs.slice(0, 30).forEach((d) => {
  const ls = d.local === undefined ? '<MISSING>' : (typeof d.local === 'string' ? d.local.slice(0, 80) : JSON.stringify(d.local).slice(0, 80));
  const rs = d.remote === undefined ? '<MISSING>' : (typeof d.remote === 'string' ? d.remote.slice(0, 80) : JSON.stringify(d.remote).slice(0, 80));
  console.log(`  - ${d.key}`);
  console.log(`      local : ${ls}`);
  console.log(`      remote: ${rs}`);
});
if (diffs.length > 30) console.log(`  ... + ${diffs.length - 30} more`);

if (process.argv.includes('--diff')) {
  console.log('\n[--diff mode] 동기화 안 함');
  process.exit(0);
}

if (diffs.length === 0) {
  console.log('\n✅ 이미 일치 — 동기화 불필요');
  process.exit(0);
}

// 3. 머지 데이터 결정
let merged;
if (restoreEmpty) {
  console.log('\n🔧 --restore-empty 모드: supabase 빈값/누락 키를 cms-data.json에서 복구');
  merged = { ...remoteData };
  const restored = [];
  for (const k of Object.keys(localData)) {
    const remoteVal = remoteData[k];
    const isEmpty =
      remoteVal === undefined ||
      remoteVal === null ||
      (typeof remoteVal === 'string' && remoteVal.trim() === '') ||
      (Array.isArray(remoteVal) && remoteVal.length === 0);
    if (isEmpty) {
      const localVal = localData[k];
      const localValid =
        localVal !== undefined && localVal !== null && !(typeof localVal === 'string' && localVal.trim() === '');
      if (localValid) {
        merged[k] = localVal;
        restored.push(k);
      }
    }
  }
  console.log(`  ✓ ${restored.length} keys 복구 예정`);
  if (restored.length > 0) {
    console.log('  목록 (앞 50개):', restored.slice(0, 50).join(', '));
  }
  if (restored.length === 0) {
    console.log('  복구할 빈 값 없음 — 종료');
    process.exit(0);
  }
} else if (fullOverwrite) {
  console.log('\n⚠️  --all: cms-data.json 전체로 덮어쓰기 (supabase 추가 데이터 손실 가능)');
  merged = localData;
} else if (explicitKeys && explicitKeys.length > 0) {
  console.log(`\n📌 선택적 머지: remote 보존 + local의 [${explicitKeys.join(', ')}] 만 덮어쓰기`);
  merged = { ...remoteData };
  for (const k of explicitKeys) {
    if (localData[k] === undefined) {
      console.warn(`  ⚠️ ${k}: cms-data.json에 없음 — 스킵`);
      continue;
    }
    merged[k] = localData[k];
    console.log(`  ✓ ${k}`);
  }
} else {
  console.log('\n❌ 키를 지정하지 않음. --keys=k1,k2,... 또는 --all 필수.');
  console.log('   추천: --keys=rooms-subtitle,facilities-subtitle');
  process.exit(1);
}

console.log(`\n📤 PATCH ${TABLE}/${ROW_ID} (총 ${Object.keys(merged).length} keys)`);
const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}`, {
  method: 'PATCH',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({ data: merged, updated_at: new Date().toISOString() }),
});
if (!patchRes.ok) {
  console.error(`❌ PATCH 실패: ${patchRes.status} ${await patchRes.text()}`);
  process.exit(1);
}
console.log('✅ 동기화 완료');

// 4. 검증 — 다시 조회해서 변경 확인
const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=data`, {
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
});
const verifyData = (await verifyRes.json())[0]?.data || {};
const verifyKeys = explicitKeys || Object.keys(localData);
const stillDiff = [];
for (const k of verifyKeys) {
  if (JSON.stringify(localData[k]) !== JSON.stringify(verifyData[k])) stillDiff.push(k);
}
if (stillDiff.length === 0) {
  console.log(`✅ 검증: ${verifyKeys.length} target keys 일치 (전체 ${Object.keys(verifyData).length} keys)`);
} else {
  console.error(`❌ 검증 실패: ${stillDiff.length} keys 여전히 불일치 — ${stillDiff.slice(0, 5).join(', ')}`);
  process.exit(1);
}
