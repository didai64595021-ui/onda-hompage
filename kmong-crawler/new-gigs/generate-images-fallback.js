/**
 * Step 3 fallback — Gemini Imagen이 차단된 환경 보정
 * - 03-images/0X-gemini.png 가 없는 상품 → OpenAI dall-e-3로 0X-dalle.png 생성
 * - dall-e-3는 gpt-image-1과 다른 스타일이라 비교 모형으로 충분
 *
 * 사용법:
 *   node new-gigs/generate-images-fallback.js
 */

require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '03-images');
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1); }

// generate-images.js의 상품 정의를 다시 가져오기 위해 require
// (그 파일은 IIFE만 실행하므로 직접 require 불가 → 프롬프트 inline)
const PRODUCTS = [
  { id: '01', prompt: `Korean kmong gig thumbnail, square 1:1. Bold Korean text "24시간 자동감시" top-center in yellow #FFD600 highlighted on dark navy background #0A1929. Subtitle "텔레그램·카톡 알림봇" white. Three Telegram chat notification bubbles cascading in the center showing stock price up arrow, news icon, keyword bell. Bottom-right yellow price badge "5만원부터". Bottom-left small badge "5,000건 작업". Modern flat illustration, high contrast, Korean kmong style commercial thumbnail, NO English text except numbers.` },
  { id: '02', prompt: `Korean kmong gig thumbnail 1:1 square. Top text "가격이 바뀌면 5분 안에" big bold black on white background, with green #03C75A underline. Subtitle "스마트스토어·쿠팡 자동 감시" smaller. Left half: smartphone showing red downward arrow notification "경쟁사 가격 ▼1,200원". Right half: laptop screen with product cards list and price tags, some red and some green arrows. Bottom-right green badge "1인 셀러 필수 15만원부터". Modern clean ecommerce illustration, NO English text.` },
  { id: '03', prompt: `Korean kmong gig thumbnail 1:1 square. Bold Korean text "AI 업무자동화" top-center in purple #7C3AED on white background. Subtitle "엑셀·PDF·문서 → GPT가 3초에" black. Left side: messy stack of Excel, PDF, document icons (gray, disorganized). Center: purple pipeline/conveyor arrows connecting nodes (automation flow). Right side: clean organized report with charts and green checkmark. Bottom-left green #10B981 badge "월 150만원 절약". Bottom-right purple badge "20만원부터". Modern flat business illustration, professional tone, NO English text.` },
  { id: '04', prompt: `Korean kmong gig thumbnail 1:1 square. Bright mint-white #F0FDF4 background. Top bold Korean text "AI 상담봇" in dark green #059669. Subtitle "PDF 1개로 3일 완성" black. Left: large PDF document icon with arrow pointing right. Center: chatbot conversation UI with 3 speech bubbles — customer question (light blue), AI answer (green), small source citation. Right edge: clock icon with "24h". Bottom-right green badge "5.9만원부터". Bright friendly illustration, approachable small-business style, NO English text.` },
  { id: '05', prompt: `Korean kmong gig thumbnail 1:1 square. Dark navy #0F172A background. Top bold Korean text "사내문서 AI 챗봇" in white. Subtitle "노션·구글드라이브·PDF 통합 검색" in blue #3B82F6. Center: enterprise dashboard UI mockup showing chat conversation with source citations panel on left and document list sidebar on right. Top: three icons (Notion logo silhouette, Google Drive folder, PDF icon) connected by blue lines to the dashboard. Bottom-left blue gradient badge "B2B 전용". Bottom-right blue badge "29만원부터". Premium corporate illustration, high-end B2B feel, NO English text.` },
  { id: '06', prompt: `Korean kmong gig thumbnail 1:1 square. Dark gradient background #1E1B4B to #312E81. Top bold Korean text "AI 풀스택 구축" in white. Subtitle "챗봇 + 카카오 + 자동화 올인원" in gold #F59E0B. Center: three connected hub icons in triangle formation — left: AI brain icon (blue glow), center: KakaoTalk yellow speech bubble, right: gear/cog automation icon. Blue connecting lines between them. Bottom: mini dashboard screen mockup. Bottom-right gold premium badge "99만원부터". Top-right small text "ENTERPRISE". Premium corporate illustration, high-end dark luxury feel, NO other English text.` },
];

async function genDalle(p) {
  const outPath = path.join(OUT_DIR, `${p.id}-dalle.png`);
  if (fs.existsSync(outPath)) {
    console.log(`✓ ${p.id}-dalle 이미 존재 (skip)`);
    return { ok: true, skipped: true };
  }
  console.log(`→ DALL·E 3 ${p.id} 생성 중...`);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: p.prompt,
        size: '1024x1024',
        n: 1,
        quality: 'hd',
        response_format: 'b64_json',
      }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const b64 = j.data[0].b64_json;
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`  ✓ ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
    return { ok: true };
  } catch (e) {
    console.error(`  ✗ ${p.id} 실패: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

(async () => {
  const args = process.argv.slice(2);
  const targetId = args[0];
  const targets = PRODUCTS.filter(p => !targetId || p.id === String(targetId).padStart(2, '0'));

  // Gemini 파일 부재 → dall-e fallback 필요
  const need = targets.filter(p => !fs.existsSync(path.join(OUT_DIR, `${p.id}-gemini.png`)));
  console.log(`총 ${targets.length}개 중 ${need.length}개 fallback 필요`);

  const results = [];
  for (const p of need) {
    results.push({ id: p.id, ...(await genDalle(p)) });
  }

  console.log('\n=== fallback 결과 ===');
  for (const r of results) console.log(`  ${r.id}: ${r.ok ? (r.skipped ? '⊝ skip' : '✓') : '✗ ' + r.error}`);
  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`성공 ${ok}, 실패 ${fail}`);
  process.exit(fail > 0 ? 2 : 0);
})();
