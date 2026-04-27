#!/usr/bin/env node
/**
 * 매크로 신상품 (카톡봇+엑셀) 썸네일 4컷 생성
 *
 * 모델: gpt-image-1 (Gemini Nano Banana 폴백 — GEMINI_API_KEY 발급 시 재생성 권장)
 * 크기: 1304x976 (= 652x488 Retina 2x, 크몽 권장)
 * 파이프라인: gpt-image-1 1536x1024 → Sharp Lanczos3 가로 크롭 1366x1024 → 1304x976
 *
 * 출력: kmong-crawler/thumbnails/macro_kakao_excel/{thumb1..4}.png
 */

// /home/onda/.env (OPENAI_API_KEY) + 로컬 .env 둘 다 로드
require('dotenv').config({ path: '/home/onda/.env' });
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { generateMainImage } = require('./lib/openai-image-gen');

const OUT_DIR = path.join(__dirname, 'thumbnails', 'macro_kakao_excel');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 4컷 프롬프트 (텍스트/숫자/통화/할인 일체 금지 — 시각 메타포만)
const PROMPTS = [
  {
    key: 'thumb1_main',
    desc: '메인 — 사장님 페르소나 + 카톡 풍선 + 구글시트',
    prompt: `Korean small business owner sitting at a wooden desk with a laptop, gentle smile of relief.
On the laptop screen a clean spreadsheet grid with rows.
Three soft yellow KakaoTalk speech bubbles floating up from the laptop screen toward smartphone icons in the upper right.
A subtle arrow flows from spreadsheet row to KakaoTalk bubble to smartphone — left to right.
Modern flat illustration, navy and warm yellow palette (#1A2540 navy + #FEE500 KakaoTalk yellow accent), soft pastel background, professional and trustworthy mood, clean composition with breathing room.`,
  },
  {
    key: 'thumb2_subscription_gone',
    desc: '서브1 — Zapier/Make 구독료가 사라지는 비포애프터',
    prompt: `Two side-by-side panels in a single horizontal composition.
Left panel: a cluttered desk with multiple subscription billing icons floating above (generic recurring billing illustrations, calendar with monthly cycle marks, money flowing out arrows).
Right panel: the same desk completely clean, only a single solid foundation block with a permanent installed badge, no subscription icons, no money flowing out, peaceful empty space.
A bold horizontal arrow transitions from left chaos to right calm.
Modern flat illustration, before/after contrast, navy and warm yellow palette, no text or numbers anywhere.`,
  },
  {
    key: 'thumb3_three_channels',
    desc: '서브2 — 카카오 3채널 통합 다이어그램 (알림톡/친구톡/오픈채팅)',
    prompt: `Centered hub-and-spoke diagram. A single central node represents an automation engine (clean abstract gear icon).
Three distinct outgoing branches radiate symmetrically to three different KakaoTalk style speech bubbles, each visually distinct:
1) a formal business notification bubble with subtle envelope motif
2) a friendly marketing bubble with subtle heart motif
3) an open community group bubble with multiple small speech indicators
Connecting lines are smooth and flowing, suggesting unified routing.
Modern flat illustration, clean infographic style, navy and warm yellow palette, professional, no text or numbers.`,
  },
  {
    key: 'thumb4_three_packages',
    desc: '서브3 — 패키지 3종 비교 (시각 위계만)',
    prompt: `Three vertical column blocks of ascending height arranged side by side, like a podium ranking.
Each column represents a tier: short, medium, tall.
Each column is topped with a different geometric icon representing capability: small single bubble (basic), three connected bubbles (standard), grid of bubbles with workflow lines (premium).
Subtle ribbons of growing thickness wrap each column.
Modern flat illustration, clean comparison layout, navy and warm yellow palette, professional, no text or numbers or currency symbols.`,
  },
];

async function processCut(p) {
  console.log(`\n[${p.key}] ${p.desc}`);
  const gen = await generateMainImage({
    prompt: p.prompt,
    size: '1536x1024',
    outDir: OUT_DIR,
    filenamePrefix: `${p.key}-raw`,
  });
  if (!gen.ok) {
    console.error(`  ❌ 생성 실패: ${gen.error}`);
    return { ...p, ok: false, error: gen.error };
  }
  console.log(`  ✓ 원본 저장: ${path.basename(gen.file_path)}`);

  // 1536x1024 → 1366x1024 (4:3 가로 크롭, 좌우에서 균등 자름)
  const finalPath = path.join(OUT_DIR, `${p.key}.png`);
  const cropX = Math.round((1536 - 1366) / 2); // 85
  await sharp(gen.file_path)
    .extract({ left: cropX, top: 0, width: 1366, height: 1024 })
    .resize(1304, 976, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 95 })
    .toFile(finalPath);

  const stat = fs.statSync(finalPath);
  console.log(`  ✓ 1304x976 저장: ${path.basename(finalPath)} (${(stat.size / 1024).toFixed(0)}KB)`);
  return { ...p, ok: true, raw: gen.file_path, final: finalPath, size: stat.size };
}

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY 환경변수가 없음. /home/onda/.env 확인');
    process.exit(1);
  }
  console.log(`[썸네일] 4컷 생성 시작 — gpt-image-1 (Gemini fallback)`);
  console.log(`출력: ${OUT_DIR}`);

  const results = [];
  for (const p of PROMPTS) {
    try {
      const r = await processCut(p);
      results.push(r);
    } catch (e) {
      console.error(`[${p.key}] 예외:`, e.message);
      results.push({ ...p, ok: false, error: e.message });
    }
  }

  console.log('\n=== 결과 요약 ===');
  results.forEach((r) => {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.key} ${r.ok ? `(${(r.size / 1024).toFixed(0)}KB)` : `— ${r.error}`}`);
  });

  const summary = {
    generated_at: new Date().toISOString(),
    model: 'gpt-image-1',
    note: 'GEMINI_API_KEY 발급 후 한국인 페르소나 컷(thumb1)은 Gemini Nano Banana로 재생성 권장',
    target_size: '1304x976',
    results,
  };
  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n[썸네일] 완료. summary: ${path.join(OUT_DIR, '_summary.json')}`);
})();
