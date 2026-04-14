#!/usr/bin/env node
/**
 * 크몽 55상품 썸네일 고화질 재생성 파이프라인
 *  - gpt-image-1 1536x1024 (landscape) quality=high 직접 생성
 *  - Sharp로 4:3 비율 가로 크롭 (1366x1024) → 1304x976 (2x Retina of 652x488)
 *  - 원본은 03-images-original-1536/ 에 저장, 크몽 업로드용은 03-images/ 에 덮어쓰기
 *
 * 사용:
 *   node generate-55-images-hires.js              # 전체 55건
 *   node generate-55-images-hires.js 29,43,44     # 지정 ID만
 *   node generate-55-images-hires.js --missing    # 기존 03-images/ 중 1024x768 가진 것만 (fallback 등)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });
require('dotenv').config({ path: '/home/onda/projects/onda-youtube-investment/.env' });

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '03-images');
const ORIG_DIR = path.join(__dirname, '03-images-original-1536');
if (!fs.existsSync(ORIG_DIR)) fs.mkdirSync(ORIG_DIR, { recursive: true });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('✗ OPENAI_API_KEY 없음'); process.exit(1); }

const PRODUCTS_JSON = path.join(OUT_DIR, '55-products.json');
const LOG_PATH = path.join(OUT_DIR, '55-hires-log.json');
const CONCURRENCY = 3;

const CATEGORY_VISUALS = {
  '코딩': { icon: 'code editor window with colorful syntax highlighted Korean-friendly code, monitor, brackets, gear', palette: 'deep blue #1E3A8A to purple #6D28D9 gradient, bright yellow #FBBF24 accent', mood: 'developer workspace, modern tech' },
  'DB수집': { icon: 'spreadsheet rows overflowing, data list icons, magnifier finding a product card, CSV file arrow', palette: 'teal #0D9488 to navy #0F172A gradient, lime #A3E635 accent', mood: 'data harvesting, clean data flow' },
  'AI활용': { icon: 'glowing AI brain or neural network, chatbot bubble, sparkle stars, prompt input box', palette: 'magenta #DB2777 to indigo #4338CA gradient, cyan #22D3EE glow accent', mood: 'futuristic AI, soft glow' },
  '디자인': { icon: 'paint palette, design brush, typography samples, layered layout cards, color swatch grid', palette: 'warm cream #FEF3C7 to pink #FB7185 gradient, purple #7C3AED accent', mood: 'creative design studio, premium flat illustration' },
  '고객관리': { icon: 'dashboard with KPI cards, customer avatar row, trend line chart, bell notification', palette: 'emerald #059669 to sky #0284C7 gradient, amber #F59E0B accent', mood: 'professional CRM dashboard, B2B trust' },
};
const DEFAULT_VISUAL = { icon: 'modern service icon, clean illustration', palette: 'deep blue to purple gradient, yellow accent', mood: 'professional Korean commercial thumbnail' };

function extractHeadline(name) {
  const base = String(name || '').split('|')[0].trim();
  return base.length <= 24 ? base : base.slice(0, 22) + '…';
}
function extractBenefit(selling) {
  const s = String(selling || '').trim();
  if (!s) return '';
  const first = s.split(/[,+·]/)[0].trim();
  return first.length <= 20 ? first : first.slice(0, 18) + '…';
}
function extractMinPrice(price) {
  const m = String(price || '').match(/(\d{1,3}(?:,\d{3})*|\d+)/);
  if (!m) return '';
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  if (!n) return '';
  return n >= 10000 ? `${Math.floor(n/10000)}만원부터` : `${n.toLocaleString()}원부터`;
}

function buildPrompt(p) {
  const v = CATEGORY_VISUALS[p.category] || DEFAULT_VISUAL;
  const headline = extractHeadline(p.name);
  const benefit = extractBenefit(p.selling_point);
  const minPrice = extractMinPrice(p.price);
  const target = String(p.target || '').split(',')[0].trim().slice(0, 12);

  return [
    `Ultra high-quality Korean commercial service thumbnail for Kmong marketplace, 1536x1024 landscape 3:2, intended for downsampling to 4:3 crop 1304x976.`,
    `Background: ${v.palette}. Mood: ${v.mood}.`,
    `BIG bold Korean headline TOP-CENTER: "${headline}" — sharp sans-serif Noto Sans KR extra bold, high contrast white with yellow #FBBF24 outline, extremely readable on 4-inch mobile, render at very large size.`,
    benefit ? `Subtitle immediately below headline: "${benefit}" — clean white, smaller but still highly legible.` : '',
    `Central hero visual: ${v.icon}. Modern flat illustration with 3D depth, soft glow, crisp detail at full 1536x1024 resolution.`,
    target ? `Small Korean target badge top-right: "${target}".` : '',
    minPrice ? `Yellow #FBBF24 rounded price badge bottom-right: "${minPrice}" with soft shadow — prominent.` : '',
    `Trust icons bottom-left: shield + checkmark + lock trio.`,
    `Generous padding for 4:3 crop safety — important text must sit within central 1366x1024 area.`,
    `Professional ecommerce thumbnail, pixel-perfect text clarity, no blurry edges.`,
    `STRICTLY NO watermarks, NO human faces, NO company logos, NO competitor brand marks, NO English paragraphs (numbers and short ASCII OK), NO lorem ipsum, NO jpeg compression artifacts.`,
  ].filter(Boolean).join(' ');
}

async function callOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1536x1024', n: 1, quality: 'high' }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('no b64_json');
  return b64;
}

/**
 * 후처리: 1536x1024 → 4:3 크롭(1366x1024, 가로 중앙) → 1304x976 Lanczos3 다운샘플
 */
async function postprocess(buf1536, outPath) {
  const cropLeft = Math.round((1536 - 1366) / 2); // 85
  await sharp(buf1536)
    .extract({ left: cropLeft, top: 0, width: 1366, height: 1024 })
    .resize(1304, 976, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png({ compressionLevel: 6, quality: 95 })
    .toFile(outPath);
}

async function genOne(product, idx) {
  const nn = String(idx + 1).padStart(2, '0');
  const outPath = path.join(OUT_DIR, `55-${nn}.png`);
  const origPath = path.join(ORIG_DIR, `55-${nn}-1536.png`);
  const prompt = buildPrompt(product);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const b64 = await callOpenAI(prompt);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(origPath, buf);
      await postprocess(buf, outPath);
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
      const meta = await sharp(outPath).metadata();
      console.log(`  ✓ 55-${nn} (${product.category}) ${product.name.slice(0, 28)}... → ${meta.width}x${meta.height} ${sizeKB}KB`);
      return { id: nn, ok: true, path: outPath, origPath, sizeKB: Number(sizeKB), width: meta.width, height: meta.height };
    } catch (e) {
      console.warn(`  ⚠ 55-${nn} attempt ${attempt}: ${e.message.slice(0, 150)}`);
      if (attempt === 2) return { id: nn, ok: false, error: e.message };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0, finished = 0;
  async function spawn() {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = { ok: false, error: e.message, idx: i }; }
      finished++;
      if (finished % 5 === 0 || finished === items.length) {
        const ok = results.filter(r => r?.ok).length;
        console.log(`  [진행] ${finished}/${items.length}  성공 ${ok}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => spawn()));
  return results;
}

(async () => {
  const args = process.argv.slice(2);
  const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf-8'));
  let targets, targetIdx;

  if (args[0] === '--missing') {
    // 1024x768 또는 더 작은 현재 파일 탐지
    targetIdx = [];
    for (let i = 0; i < products.length; i++) {
      const nn = String(i + 1).padStart(2, '0');
      const p = path.join(OUT_DIR, `55-${nn}.png`);
      if (!fs.existsSync(p)) { targetIdx.push(i); continue; }
      try {
        const m = await sharp(p).metadata();
        if (m.width < 1300 || m.height < 970) targetIdx.push(i);
      } catch { targetIdx.push(i); }
    }
    targets = targetIdx.map(i => products[i]);
  } else if (args[0] && /^[\d,]+$/.test(args[0])) {
    const ids = args[0].split(',').map(s => parseInt(s, 10)).filter(n => n > 0);
    targetIdx = ids.map(id => id - 1);
    targets = ids.map(id => products[id - 1]).filter(Boolean);
  } else {
    targets = products;
    targetIdx = products.map((_, i) => i);
  }

  console.log(`\n==== 크몽 55 썸네일 고화질 재생성 ====`);
  console.log(`전체: ${products.length}, 대상: ${targets.length}`);
  console.log(`파이프라인: gpt-image-1 1536x1024 → Sharp 4:3 crop → 1304x976 Lanczos3`);
  console.log(`출력: ${OUT_DIR}/55-NN.png (교체)\n`);

  const t0 = Date.now();
  const results = await runPool(
    targets,
    (p, localIdx) => genOne(p, targetIdx[localIdx]),
    CONCURRENCY
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  fs.writeFileSync(LOG_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    total: results.length,
    success: results.filter(r => r?.ok).length,
    failed: results.filter(r => !r?.ok).length,
    elapsed_sec: Number(elapsed),
    results,
  }, null, 2), 'utf-8');

  const ok = results.filter(r => r?.ok).length;
  const fail = results.filter(r => !r?.ok).length;
  console.log(`\n==== 완료 ====`);
  console.log(`  성공: ${ok}`);
  console.log(`  실패: ${fail}`);
  console.log(`  소요: ${elapsed}s`);
  if (fail > 0) results.filter(r => !r?.ok).forEach(r => console.log(`  - ${r.id}: ${String(r.error).slice(0, 200)}`));
  process.exit(fail > 0 ? 2 : 0);
})();
