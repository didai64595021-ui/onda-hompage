#!/usr/bin/env node
/**
 * Python 프로그램 + 앱 출시 신상품 썸네일 4컷 × 2 = 8컷 생성
 *
 * 모델: gpt-image-1 (GEMINI_API_KEY 발급 시 한국 페르소나 컷 재생성 권장)
 * 크기: 1304x976 (= 652x488 Retina 2x)
 * 파이프라인: gpt-image-1 1536x1024 → Sharp 4:3 크롭 → 1304x976
 *
 * 출력:
 *  - thumbnails/python_program/{thumb1..4}.png
 *  - thumbnails/app_release/{thumb1..4}.png
 */

require('dotenv').config({ path: '/home/onda/.env' });
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { generateMainImage } = require('./lib/openai-image-gen');

const PRODUCTS = [
  {
    folder: 'python_program',
    cuts: [
      {
        key: 'thumb1_main',
        desc: 'Python 메인 — 사장님 페르소나 + 자동화 흐름',
        prompt: `Korean small business owner sitting at a desk with a laptop, expression of relief and focus on something else (drinking coffee, talking on phone). On the laptop screen a clean simplified Python-like dashboard with green checkmarks running automatically. Behind the laptop a translucent stream of data icons (spreadsheet rows, bar charts, document files) flowing from a cluttered left side into an organized result on the right. Modern flat illustration, navy and warm yellow palette (#1A2540 navy + #FFD700 yellow accent), soft pastel background, professional and trustworthy mood, no text or numbers anywhere.`,
      },
      {
        key: 'thumb2_time_saved',
        desc: 'Python 서브1 — 시간 절약 비포애프터',
        prompt: `Two-panel horizontal split. Left panel: a person hunched over a laptop with a large analog clock showing many hours, surrounded by stacks of paperwork and exhausted posture. Right panel: the same person relaxed and confident, the same clock showing only seconds, the paperwork is gone, replaced by a single small notification icon. A bold horizontal arrow transitions from chaos to calm. Modern flat illustration, navy and warm yellow palette, no text or numbers anywhere.`,
      },
      {
        key: 'thumb3_data_flow',
        desc: 'Python 서브2 — 데이터 소스 통합',
        prompt: `Centered hub-and-spoke diagram. A single central node represents an automation engine (clean abstract gear or filter funnel icon). Five distinct outgoing branches radiate symmetrically to five different output destinations represented by abstract icons: spreadsheet grid, speech bubble, envelope, bar chart, document. Connecting lines flow smoothly. Below the hub three input sources flow up: another spreadsheet, a globe (web), a database cylinder. Modern flat illustration, infographic style, navy and warm yellow palette, no text or numbers anywhere.`,
      },
      {
        key: 'thumb4_three_packages',
        desc: 'Python 서브3 — 패키지 3종 위계',
        prompt: `Three vertical column blocks of ascending height arranged side by side, like a podium. Each column topped with a different geometric Python-related abstract icon: a single spreadsheet cell (basic), three connected gears (standard), a layered dashboard with multiple flowing arrows (premium). Each column wrapped with a ribbon of growing thickness. Modern flat illustration, clean comparison layout, navy and warm yellow palette, no text or numbers or currency symbols.`,
      },
    ],
  },
  {
    folder: 'app_release',
    cuts: [
      {
        key: 'thumb1_main',
        desc: '앱 메인 — Flutter 1코드 + 2스토어',
        prompt: `Centered composition: a single Flutter-style codebase represented as a glowing blue rectangle in the center. From it, two streams of light flow outward to the left and right, each ending in a smartphone. The left smartphone shows an Android-style green icon (abstract robot silhouette), the right shows an iOS-style white minimalist icon. Both phone screens display a clean unified app interface (cards, navigation bar, action button). Modern flat illustration, navy and tech-blue palette with warm yellow accents, professional, no text or numbers, no brand logos.`,
      },
      {
        key: 'thumb2_cost_half',
        desc: '앱 서브1 — 비용 절반 비교',
        prompt: `Two side-by-side panels. Left panel: two separate large stacks of money icons growing very tall, labeled abstractly with two different platform-symbol shapes (one greenish, one whitish). Right panel: a single short stack of money icons with the same two platform symbols stacked neatly on top of one shared codebase block. A horizontal arrow shows transition. Modern flat illustration, before/after contrast, navy and warm yellow palette, no text or currency symbols.`,
      },
      {
        key: 'thumb3_modules',
        desc: '앱 서브2 — 풀세트 모듈',
        prompt: `Centered grid of six abstract module icons arranged in a 3x2 layout, each in a distinct rounded rectangle: 1) login (key + person), 2) payment (credit card abstract), 3) push notification (bell with motion lines), 4) chat (two speech bubbles), 5) admin panel (dashboard with bars), 6) social login (overlapping circles). Connecting lines hint at integration. Modern flat illustration, clean infographic style, navy and warm yellow palette, professional, no text or numbers.`,
      },
      {
        key: 'thumb4_three_packages',
        desc: '앱 서브3 — 패키지 3종 위계',
        prompt: `Three vertical column blocks of ascending height arranged side by side, like a podium. Each column topped with abstract app-related icons: a single phone outline (MVP basic), a phone with multiple module badges floating around (standard operations), a phone connected via lines to multiple servers/cloud icons (premium full-stack). Ribbons of growing thickness wrap each column. Modern flat illustration, clean comparison layout, navy and warm yellow palette, no text or numbers or currency symbols.`,
      },
    ],
  },
];

async function processCut(folder, cut) {
  const outDir = path.join(__dirname, 'thumbnails', folder);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n[${folder}/${cut.key}] ${cut.desc}`);
  const gen = await generateMainImage({
    prompt: cut.prompt,
    size: '1536x1024',
    outDir,
    filenamePrefix: `${cut.key}-raw`,
  });
  if (!gen.ok) {
    console.error(`  ❌ ${gen.error}`);
    return { folder, ...cut, ok: false, error: gen.error };
  }

  const finalPath = path.join(outDir, `${cut.key}.png`);
  const cropX = Math.round((1536 - 1366) / 2);
  await sharp(gen.file_path)
    .extract({ left: cropX, top: 0, width: 1366, height: 1024 })
    .resize(1304, 976, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 95 })
    .toFile(finalPath);

  const stat = fs.statSync(finalPath);
  console.log(`  ✓ 1304x976 ${(stat.size / 1024).toFixed(0)}KB`);
  return { folder, ...cut, ok: true, raw: gen.file_path, final: finalPath, size: stat.size };
}

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY 미발견');
    process.exit(1);
  }
  console.log('[썸네일] Python + 앱 신상품 8컷 시작 — gpt-image-1');

  const results = [];
  for (const product of PRODUCTS) {
    for (const cut of product.cuts) {
      try {
        results.push(await processCut(product.folder, cut));
      } catch (e) {
        console.error(`[${product.folder}/${cut.key}] 예외:`, e.message);
        results.push({ folder: product.folder, ...cut, ok: false, error: e.message });
      }
    }
  }

  console.log('\n=== 요약 ===');
  results.forEach((r) => {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.folder}/${r.key} ${r.ok ? `(${(r.size/1024).toFixed(0)}KB)` : `— ${r.error}`}`);
  });

  const summary = {
    generated_at: new Date().toISOString(),
    model: 'gpt-image-1',
    note: 'GEMINI_API_KEY 발급 후 한국 페르소나 컷(thumb1)은 Gemini Nano Banana로 재생성 권장',
    results,
  };
  fs.writeFileSync(path.join(__dirname, 'thumbnails', 'python-app-summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n[썸네일] 완료');
})();
