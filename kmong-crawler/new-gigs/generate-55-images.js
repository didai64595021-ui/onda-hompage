/**
 * 크몽 신규 55개 상품 썸네일 생성 (OpenAI gpt-image-1)
 *
 * - 입력: new-gigs/03-images/55-products.json (엑셀 추출)
 * - 출력: new-gigs/03-images/55-{NN}.png (NN=01~55)
 * - 로그: new-gigs/03-images/55-generation-log.json
 * - 동시성 3, 실패 시 1회 재시도
 *
 * 사용법:
 *   node new-gigs/generate-55-images.js              # 전체
 *   node new-gigs/generate-55-images.js 5            # 01~05번만
 *   node new-gigs/generate-55-images.js 10 20        # 10~20번만
 */
require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });
require('dotenv').config({ path: '/home/onda/projects/onda-youtube-investment/.env' });

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '03-images');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('✗ OPENAI_API_KEY 없음 — .env 확인');
  process.exit(1);
}

const PRODUCTS_JSON = path.join(OUT_DIR, '55-products.json');
const LOG_PATH = path.join(OUT_DIR, '55-generation-log.json');
const CONCURRENCY = 3;

// ─── 카테고리별 아이콘/비주얼 힌트 ───
const CATEGORY_VISUALS = {
  '코딩': {
    icon: 'code window with colorful syntax highlighted Korean-friendly code, monitor mockup, brackets, gear',
    palette: 'deep blue #1E3A8A to purple #6D28D9 gradient background, bright yellow #FBBF24 accent',
    mood: 'developer workspace, clean modern tech',
  },
  'DB수집': {
    icon: 'spreadsheet rows overflowing, data list icons, magnifier finding a product card, arrows pointing to CSV file',
    palette: 'teal #0D9488 to navy #0F172A gradient, lime #A3E635 accent for arrows',
    mood: 'data harvesting, clean data flow, growth arrows',
  },
  'AI활용': {
    icon: 'glowing AI brain or neural network node, chatbot bubble, sparkle stars, prompt input box mockup',
    palette: 'magenta #DB2777 to indigo #4338CA gradient background, cyan #22D3EE glow accent',
    mood: 'futuristic AI, soft glow, intelligent automation',
  },
  '디자인': {
    icon: 'paint palette, design brush, typography samples, layered layout mockup cards, color swatch grid',
    palette: 'warm cream #FEF3C7 to pink #FB7185 gradient, purple #7C3AED accent',
    mood: 'creative design studio, artistic, premium flat illustration',
  },
  '고객관리': {
    icon: 'dashboard with KPI cards, customer avatars row, LTV trend line chart, bell notification icon',
    palette: 'emerald #059669 to sky #0284C7 gradient, amber #F59E0B accent',
    mood: 'professional CRM dashboard, trustworthy B2B',
  },
};

const DEFAULT_VISUAL = {
  icon: 'modern service icon, clean illustration',
  palette: 'deep blue to purple gradient, yellow accent',
  mood: 'professional Korean commercial thumbnail',
};

// ─── 상품명 → 30자 이내 한국어 헤드라인 추출 ───
function extractHeadline(name, fallback = '') {
  // 파이프(|) 앞쪽이 보통 메인 카피
  const base = String(name || fallback).split('|')[0].trim();
  // 30자 이내로 자르기
  if (base.length <= 30) return base;
  return base.slice(0, 28) + '…';
}

// ─── 핵심 셀링포인트 → 한 줄 혜택 카피 (25자 내외) ───
function extractBenefit(selling) {
  const s = String(selling || '').trim();
  if (!s) return '';
  // 첫 번째 ',' 또는 '+' 기준으로 앞쪽만
  const first = s.split(/[,+·]/)[0].trim();
  if (first.length <= 25) return first;
  return first.slice(0, 23) + '…';
}

// ─── 최소 가격 추출 (예: "300,000~800,000" → "30만원") ───
function extractMinPrice(price) {
  const s = String(price || '').trim();
  const m = s.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
  if (!m) return '';
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  if (!n) return '';
  if (n >= 10000) return `${Math.floor(n / 10000)}만원부터`;
  return `${n.toLocaleString()}원부터`;
}

// ─── 프롬프트 빌더 ───
function buildPrompt(p) {
  const visual = CATEGORY_VISUALS[p.category] || DEFAULT_VISUAL;
  const headline = extractHeadline(p.name);
  const benefit = extractBenefit(p.selling_point);
  const minPrice = extractMinPrice(p.price);
  const target = String(p.target || '').split(',')[0].trim().slice(0, 15);

  return [
    `Korean Kmong commercial gig thumbnail, square 1:1 aspect ratio, 1024x1024.`,
    `Background: ${visual.palette}. Mood: ${visual.mood}.`,
    `BIG bold Korean headline text TOP-CENTER: "${headline}" — high contrast white with yellow #FBBF24 highlight stroke, sans-serif Noto Sans KR bold, very readable on mobile.`,
    benefit ? `Subtitle in smaller Korean below headline: "${benefit}" — clean white.` : '',
    `Central visual: ${visual.icon}. Modern flat illustration with 3D depth and soft glow effects.`,
    target ? `Small Korean target badge top-right: "${target}".` : '',
    minPrice ? `Korean price badge bottom-right: "${minPrice}" — yellow #FBBF24 rounded badge with shadow, very prominent.` : '',
    `Trust icons bottom-left: shield/checkmark/lock icon trio.`,
    `Generous margins for mobile legibility. Professional commercial ecommerce thumbnail style.`,
    `STRICTLY NO watermarks, NO human faces, NO company logos, NO competitor brand marks, NO English paragraphs (numbers and short ASCII OK), NO lorem ipsum.`,
  ].filter(Boolean).join(' ');
}

// ─── OpenAI 호출 (재시도 1회) ───
async function callOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
      n: 1,
      quality: 'high',
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
    err.status = res.status;
    err.body = txt;
    throw err;
  }
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('no b64_json in response');
  return b64;
}

async function genOne(product, idx) {
  const nn = String(idx + 1).padStart(2, '0');
  const outPath = path.join(OUT_DIR, `55-${nn}.png`);
  const prompt = buildPrompt(product);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 10000) {
    return { id: nn, ok: true, skipped: true, path: outPath, prompt, product };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const b64 = await callOpenAI(prompt);
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`  ✓ 55-${nn} (${product.category}) ${product.name.slice(0, 30)}... → ${sizeKB}KB`);
      return { id: nn, ok: true, path: outPath, prompt, product, attempt, sizeKB: Number(sizeKB) };
    } catch (e) {
      console.warn(`  ⚠ 55-${nn} attempt ${attempt} 실패: ${e.message.slice(0, 150)}`);
      if (attempt === 2) {
        return { id: nn, ok: false, error: e.message, prompt, product };
      }
      // 재시도 전 짧게 대기
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// ─── 동시성 제어 풀 (concurrency 3) ───
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  let finished = 0;
  const total = items.length;

  async function spawn() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { ok: false, error: e.message, idx: i };
      }
      finished++;
      if (finished % 10 === 0 || finished === total) {
        const ok = results.filter(r => r && r.ok).length;
        const fail = results.filter(r => r && !r.ok).length;
        console.log(`  [진행] ${finished}/${total}  (성공 ${ok} / 실패 ${fail})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => spawn()));
  return results;
}

// ─── 메인 ───
(async () => {
  const args = process.argv.slice(2);
  const start = args[0] ? Math.max(1, parseInt(args[0], 10)) : 1;
  const end = args[1] ? parseInt(args[1], 10) : null;

  if (!fs.existsSync(PRODUCTS_JSON)) {
    console.error(`✗ ${PRODUCTS_JSON} 없음 — 엑셀 추출 먼저 실행`);
    process.exit(1);
  }
  const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf-8'));
  const endIdx = end || products.length;
  const targets = products.slice(start - 1, endIdx);

  console.log(`\n==== 크몽 신규 55 썸네일 생성 ====`);
  console.log(`전체: ${products.length}, 대상: ${targets.length} (index ${start}~${endIdx})`);
  console.log(`출력 디렉토리: ${OUT_DIR}`);
  console.log(`동시성: ${CONCURRENCY}\n`);

  const t0 = Date.now();
  const results = await runPool(
    targets,
    (p, localIdx) => genOne(p, (start - 1) + localIdx),
    CONCURRENCY
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // 로그 저장
  const logEntries = results.map(r => ({
    id: r.id,
    ok: r.ok,
    skipped: r.skipped || false,
    error: r.error || null,
    sizeKB: r.sizeKB || null,
    prompt: r.prompt,
    product: {
      no: r.product?.no,
      category: r.product?.category,
      name: r.product?.name,
      price: r.product?.price,
      selling_point: r.product?.selling_point,
      target: r.product?.target,
    },
  }));

  fs.writeFileSync(LOG_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    total: results.length,
    success: results.filter(r => r.ok).length,
    skipped: results.filter(r => r.skipped).length,
    failed: results.filter(r => !r.ok).length,
    elapsed_sec: Number(elapsed),
    entries: logEntries,
  }, null, 2), 'utf-8');

  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  const skip = results.filter(r => r.skipped).length;

  console.log(`\n==== 완료 ====`);
  console.log(`  성공: ${ok} (신규 ${ok - skip}, 스킵 ${skip})`);
  console.log(`  실패: ${fail}`);
  console.log(`  소요: ${elapsed}s`);
  console.log(`  로그: ${LOG_PATH}`);

  if (fail > 0) {
    console.log(`\n실패 목록:`);
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  - 55-${r.id} (${r.product?.category}/${r.product?.name?.slice(0,30)}): ${String(r.error).slice(0, 200)}`);
    });
  }
  process.exit(fail > 0 ? 2 : 0);
})();
