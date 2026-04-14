/**
 * Top5 상품 썸네일 베리에이션 (각 상품 +2장)
 *  T09 → T09-v2, T09-v3  (구글시트 자동화 — 다른 컨셉/컬러)
 *  T10 → T10-v2, T10-v3  (크롤링 GUI — 다른 컨셉/컬러)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, '03-images');

const VARIANTS = [
  {
    id: 'T09-v2',
    prompt: `Korean kmong gig thumbnail, 1:1 square 1024x1024. Soft sky-blue background #EFF6FF. Top center: large minimalist analog clock showing exactly 9:00, clock face white with navy numbers, surrounded by soft glow. Floating notification toast cards below clock: "보고서 생성 완료", "시트 통합 완료", "슬랙 전송 완료" — 3 cards stacked diagonally with green check marks. Bold Korean headline TOP "정시 출근보다 빨라요" in dark navy #0F172A. Subtitle "구글 Apps Script 자동화" in green #059669. Bottom-right large green price badge "5만원부터". Modern minimal illustration, premium professional feel, Korean kmong style, NO other English text.`,
  },
  {
    id: 'T09-v3',
    prompt: `Korean kmong gig thumbnail, 1:1 square 1024x1024. Warm cream background #FEF3C7 with sunrise gradient on top edge. Center: hand holding smartphone displaying a notification panel with Korean text "오늘 보고서 준비됨" — phone has vivid readable UI. Left: coffee cup with steam. Right: laptop half-open showing Google Sheets silhouette. Bold Korean headline TOP "커피 내리기 전에 시트 정리 끝" in dark brown #78350F. Subtitle "매일 아침 9시 자동 실행" in warm orange #EA580C. Bottom-right orange price badge "5만원부터". Cozy morning workflow illustration, warm friendly tone, Korean kmong style, NO other English text.`,
  },
  {
    id: 'T10-v2',
    prompt: `Korean kmong gig thumbnail, 1:1 square 1024x1024. Deep forest green background #064E3B with subtle grid. Center: growing stack of Excel file icons (green X logo) 5 files cascading upward diagonally, each with small checkmark. Left edge: cursor arrow pointing at top file. Falling data particles (numeric symbols) from top. Bold Korean headline TOP "버튼 한 번에 쌓이는 엑셀" in white. Subtitle "설치형 크롤러, exe 완성본" in mint #6EE7B7. Bottom-left badge "GUI 포함". Bottom-right mint price badge "20만원부터". Premium tech illustration, Korean kmong style, NO other English text.`,
  },
  {
    id: 'T10-v3',
    prompt: `Korean kmong gig thumbnail, 1:1 square 1024x1024. Dark purple background #1E1B4B with circuit-board pattern faint. Center: oversized round glowing "수집 시작" button with radial light glow (cyan). Small desktop window beside button showing log lines and progress. Right edge: Excel download arrow. Left edge: small laptop silhouette. Bold Korean headline TOP "클릭 한 번 = 크롤링 완료" in white. Subtitle "개발자 없이 내가 직접" in cyan #22D3EE. Bottom-right cyan price badge "20만원부터". Futuristic premium tech illustration, Korean kmong style, NO other English text.`,
  },
];

async function genOpenAI(p) {
  const out = path.join(OUT_DIR, `${p.id}-openai.png`);
  if (fs.existsSync(out)) { console.log(`✓ ${p.id} 이미 존재`); return { ok: true, path: out, skipped: true }; }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: 'no key' };
  console.log(`→ ${p.id} 생성 중...`);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: p.prompt, n: 1, size: '1024x1024' }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error('no b64');
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    const sizeKB = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`✓ ${p.id} ${sizeKB}KB`);
    return { ok: true, path: out };
  } catch (err) {
    console.error(`✗ ${p.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

(async () => {
  const results = [];
  for (const p of VARIANTS) {
    results.push({ id: p.id, ...(await genOpenAI(p)) });
  }
  fs.writeFileSync(path.join(OUT_DIR, '_top5-variants-log.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n=== 완료: ${results.length - failed}/${results.length} ===`);
  process.exit(failed > 0 ? 2 : 0);
})();
