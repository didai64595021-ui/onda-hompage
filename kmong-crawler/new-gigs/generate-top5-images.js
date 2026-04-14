/**
 * Top5 기반 신규 2상품 썸네일 생성
 *  T09 — Apps Script 구글시트 자동화 (업무자동화 663, 기존 #3/#4와 포지션 차별화)
 *  T10 — 크롤링 프로그램 완성본/GUI 납품 (크롤링 645, 기존 #7/#8과 차별화)
 *
 * 실패 시 fallback: Playwright 로 HTML/CSS 렌더 → PNG 저장 (CLAUDE 지시)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, '03-images');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const PRODUCTS = [
  {
    id: 'T09',
    name: 'Apps Script 구글시트 자동화',
    prompt: `Korean kmong gig thumbnail, square 1:1, 1024x1024. Soft off-white background #F8FAFC. Top bold Korean text "매일 아침 9시," in dark slate #0F172A, second line "시트가 정리돼 있어요" same style. Subtitle "구글 Apps Script 업무자동화" in Google Sheets green #10B981. Left half: messy spreadsheet with red scattered cells and overlapping rows (Before). Center: right-pointing green arrow. Right half: clean organized Google Sheets UI with pivot chart, filter chips, green checkmark badge (After). Top-right small circular badge "사무직 필수" in navy. Bottom-right green price badge "5만원부터" large. Modern flat business illustration, Korean kmong commercial style, NO other English text.`,
  },
  {
    id: 'T10',
    name: '크롤링 프로그램 완성본 (exe/GUI)',
    prompt: `Korean kmong gig thumbnail, square 1:1, 1024x1024. Dark navy background #0F172A with subtle cyan grid lines. Top bold Korean text "내가 직접 돌리는" in white, second line "크롤러 프로그램" in cyan #06B6D4. Subtitle "exe/설치형 완성본 납품" white small. Center: realistic desktop application window mockup with title bar, progress bar at 62% highlighted, 3 log lines, prominent 'CSV 저장' button in cyan. Left corner: small laptop silhouette. Right corner: Excel file icon with a download arrow. Bottom-left cyan badge "GUI 포함", bottom-right large cyan price badge "20만원부터". Premium tech illustration, Korean kmong commercial style, NO English text except numbers and the percentage.`,
  },
];

async function genOpenAI(p) {
  const out = path.join(OUT_DIR, `${p.id}-openai.png`);
  if (fs.existsSync(out)) { console.log(`✓ ${p.id} 이미 존재 (skip)`); return { ok: true, path: out, skipped: true }; }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: 'OPENAI_API_KEY 없음' };
  console.log(`→ OpenAI ${p.id} 생성 중...`);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: p.prompt, n: 1, size: '1024x1024' }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error('no b64_json');
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    const sizeKB = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`✓ ${p.id} 생성 완료 (${sizeKB}KB) → ${out}`);
    return { ok: true, path: out };
  } catch (err) {
    console.error(`✗ ${p.id} OpenAI 실패: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

(async () => {
  const results = [];
  for (const p of PRODUCTS) {
    const r = await genOpenAI(p);
    results.push({ id: p.id, ...r });
  }
  fs.writeFileSync(path.join(OUT_DIR, '_top5-generation-log.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log('\n=== 요약 ===');
  results.forEach(r => console.log(`  ${r.id}: ${r.ok ? 'OK' : 'FAIL - ' + r.error}`));
  const failedCount = results.filter(r => !r.ok).length;
  if (failedCount > 0) {
    console.log(`\n⚠ ${failedCount}개 실패 — HTML/CSS fallback 필요 (generate-top5-fallback.js 실행)`);
    process.exit(2);
  }
  process.exit(0);
})();
