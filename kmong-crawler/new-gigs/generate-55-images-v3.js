#!/usr/bin/env node
/**
 * 크몽 55 썸네일 v3 — 상품별 특화 아이콘 매핑 추가
 *  - 이전 hires(v2)는 카테고리 공통 아이콘만 사용 → 상품별 구별력 부족
 *  - v3는 55건 각각 PRODUCT_VISUALS 매핑으로 고유 비주얼 생성
 *  - 실패/limit 시 --missing으로 재실행 가능 (1024x976 미달 파일만 재생성)
 *
 * 파이프라인: gpt-image-1 1536x1024 high → Sharp Lanczos3 4:3 crop → 1304x976
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
const LOG_PATH = path.join(OUT_DIR, '55-v3-log.json');
const CONCURRENCY = 3;

// 카테고리 기본 팔레트
const CATEGORY_PALETTES = {
  '코딩': 'deep blue #1E3A8A to purple #6D28D9 gradient, bright yellow #FBBF24 accent',
  'DB수집': 'teal #0D9488 to navy #0F172A gradient, lime #A3E635 accent',
  'AI활용': 'magenta #DB2777 to indigo #4338CA gradient, cyan #22D3EE glow',
  '디자인': 'warm cream #FEF3C7 to pink #FB7185 gradient, purple #7C3AED accent',
  '고객관리': 'emerald #059669 to sky #0284C7 gradient, amber #F59E0B accent',
};

// 상품별 특화 비주얼 (55건 전수)
// 각 상품의 핵심 주제를 시각적으로 표현. 카테고리 공통 아이콘 X.
const PRODUCT_VISUALS = {
  1:  'responsive one-page website mockup on smartphone + desktop browser window',
  2:  'high-conversion landing page mockup with hero, CTA button, signup form',
  3:  'WordPress dashboard + plugin icons + maintenance wrench gear',
  4:  'smartphone mockup showing mobile-optimized layout + desktop-to-mobile transformation arrow',
  5:  'Core Web Vitals speedometer gauge + lightning bolt + before/after load time numbers',
  6:  'booking calendar mockup + notification bell + contact form icon',
  7:  'KakaoTalk bubble chat + chatbot robot icon + auto-response waves',
  8:  'GPT integrated chatbot dialog bubbles + robot head + customer service headset',
  9:  'Telegram paper plane + Slack hashtag + notification badge + workflow arrows',
  10: 'spreadsheet rows + web spider crawling + price tag data extraction',
  11: 'API endpoint connection lines + payment card + delivery truck + CRM database',
  12: 'real estate apartment mockup + property listing cards + map pin marker',
  13: 'portfolio gallery grid + designer laptop + project thumbnail cards',
  14: 'lead funnel diagram: form → database → notification bell pipeline',
  15: 'church steeple + community group photo placeholder + simple website frame',

  16: 'Naver Place map pin + storefront icons + CSV data rows overflow',
  17: 'Naver blog post + cafe forum icon + keyword tag cloud + data extraction',
  18: 'apartment building icons + real estate listing cards + price tags stacked',
  19: 'job seeker resume + briefcase icon + job board listings rows',
  20: 'target crosshair + business lead contact cards + industry category filters',
  21: 'Naver shopping bag + search volume bar chart + competition meter',
  22: 'food delivery bike + restaurant menu + review star rating grid',
  23: 'YouTube play button + subscriber count + video analytics chart',
  24: 'Naver Place review stars (few) + magnifier + target list with check marks',
  25: 'price tag comparison chart + competitor shopping bag + real-time monitoring',

  26: 'AI brain neural network + blog post writing + automation gears',
  27: 'AI sparkle + marketing copy text bubbles + product detail page mockup',
  28: 'customer review speech bubbles + sentiment analysis emoji scale + AI chart',
  29: 'product photo + AI composite + background scene + detail page layout',
  30: 'ChatGPT logo-inspired sparkle + teacher at whiteboard + 1:1 lesson icon',
  31: 'AI prompt template cards + engineering gear + workflow automation diagram',
  32: 'SNS post tiles (Instagram square + Facebook + text+image combo) + AI sparkle',
  33: 'email envelope + auto-reply loop arrow + AI classification tags + response bubble',
  34: 'ad creative set (banner + copy + image variants) + bulk production conveyor',
  35: 'AI voice waveform + multilingual flags + video film strip + dubbing microphone',
  36: 'business plan document + AI sparkle + charts and projections',
  37: 'market research report chart + data visualization pie/bar + AI insight bulb',
  38: 'chatbot dialog + KakaoTalk bubble + web chat widget + AI routing',
  39: 'logo design variants grid + brand identity wordmark + color palette specs',
  40: 'YouTube video frame + subtitle CC button + translation arrow + language flags',
  41: 'resume document mockup + red pen correction marks + AI sparkle improvement',
  42: 'inventory boxes stack + demand forecast graph trending up + AI neural icon',

  43: 'e-commerce product detail page long mockup + conversion arrow up + buy button',
  44: 'Instagram square carousel cards (multi-page swipe indicator) + save bookmark',
  45: 'YouTube thumbnail 16:9 frame + red play button + click counter +2x arrow',
  46: 'web banner rectangle ad + Naver/Google ad icon + cursor click hover',
  47: 'business card stack + flyer/leaflet printed + QR code',
  48: 'restaurant menu board + food plate icon + cafe tablet kiosk',
  49: 'email newsletter mockup on desktop + HTML angle brackets code + envelope open',
  50: 'Instagram profile grid 9-photo layout + highlight cover circles + feed aesthetic',
  51: 'presentation slide deck 3D stacked + pitch bar chart + investor pointing',
  52: 'discount coupon ticket + event banner + online/offline store signs',
  53: 'brand guideline book + logo + color palette chips + typography specimen',
  54: 'bulk banner grid 50+ thumbnails layout + AI generation mass production',
  55: 'outdoor storefront signboard + LED sign glowing + street shop facade',
};

const DEFAULT_VISUAL = 'modern service icon, clean illustration';

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

function buildPrompt(p, productNo) {
  const palette = CATEGORY_PALETTES[p.category] || CATEGORY_PALETTES['코딩'];
  const productIcon = PRODUCT_VISUALS[productNo] || DEFAULT_VISUAL;
  const headline = extractHeadline(p.name);
  const benefit = extractBenefit(p.selling_point);
  const minPrice = extractMinPrice(p.price);
  const target = String(p.target || '').split(',')[0].trim().slice(0, 12);

  return [
    `Ultra high-quality Korean Kmong commercial service thumbnail, 1536x1024 landscape 3:2, will be cropped 4:3 → 1304x976.`,
    `Background: ${palette}. Professional ecommerce thumbnail with subtle gradient, NOT generic design tool artwork.`,
    `BIG bold Korean headline TOP-CENTER: "${headline}" — sharp sans-serif Noto Sans KR extra bold, high contrast white with yellow #FBBF24 outline, extremely readable on 4-inch mobile.`,
    benefit ? `Subtitle below headline: "${benefit}" — clean white, smaller.` : '',
    `CENTRAL HERO VISUAL (must be product-specific, NOT generic paintbrush/palette unless relevant):`,
    `  ${productIcon}.`,
    `  Modern flat illustration with 3D depth, soft glow, crisp detail. Service-specific imagery only.`,
    target ? `Small Korean target badge top-right: "${target}".` : '',
    minPrice ? `Yellow #FBBF24 rounded price badge bottom-right: "${minPrice}".` : '',
    `Trust icons bottom-left: shield + checkmark + lock trio, small.`,
    `CROP SAFETY: important text/visual in central 1366x1024 area (85px left padding).`,
    `STRICTLY NO generic paintbrush+palette combos unless the product is actually about painting, NO watermarks, NO human faces, NO company logos, NO competitor brand marks, NO English paragraphs (numbers and short ASCII OK), NO lorem ipsum.`,
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
    const err = new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
    err.status = res.status;
    err.isRateLimit = res.status === 429 || /rate.?limit|quota|too many/i.test(txt);
    throw err;
  }
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('no b64_json');
  return b64;
}

async function postprocess(buf1536, outPath) {
  const cropLeft = Math.round((1536 - 1366) / 2);
  await sharp(buf1536)
    .extract({ left: cropLeft, top: 0, width: 1366, height: 1024 })
    .resize(1304, 976, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png({ compressionLevel: 6, quality: 95 })
    .toFile(outPath);
}

async function genOne(product, idx) {
  const nn = String(idx + 1).padStart(2, '0');
  const productNo = idx + 1;
  const outPath = path.join(OUT_DIR, `55-${nn}.png`);
  const origPath = path.join(ORIG_DIR, `55-${nn}-v3-1536.png`);
  const prompt = buildPrompt(product, productNo);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const b64 = await callOpenAI(prompt);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(origPath, buf);
      await postprocess(buf, outPath);
      const meta = await sharp(outPath).metadata();
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`  ✓ 55-${nn} [${product.category}] ${product.name.slice(0, 32)}... → ${meta.width}x${meta.height} ${sizeKB}KB`);
      return { id: nn, productNo, ok: true, path: outPath, sizeKB: Number(sizeKB) };
    } catch (e) {
      console.warn(`  ⚠ 55-${nn} attempt ${attempt}: ${e.message.slice(0, 150)} ${e.isRateLimit ? '[RATE-LIMIT]' : ''}`);
      if (attempt === 2) return { id: nn, productNo, ok: false, error: e.message, rateLimit: e.isRateLimit };
      await new Promise(r => setTimeout(r, e.isRateLimit ? 30000 : 2000));
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
    // v3 로그에 없거나 실패한 것만
    targetIdx = [];
    const prevLog = fs.existsSync(LOG_PATH) ? JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')) : { results: [] };
    const doneSet = new Set((prevLog.results || []).filter(r => r?.ok).map(r => r.productNo));
    for (let i = 0; i < products.length; i++) {
      if (!doneSet.has(i + 1)) targetIdx.push(i);
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

  console.log(`\n==== 크몽 55 썸네일 v3 (상품별 특화 아이콘) ====`);
  console.log(`대상: ${targets.length}건 | 파이프라인: gpt-image-1 1536x1024 high → Sharp 4:3 → 1304x976`);

  const t0 = Date.now();
  const results = await runPool(
    targets,
    (p, localIdx) => genOne(p, targetIdx[localIdx]),
    CONCURRENCY
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const ok = results.filter(r => r?.ok).length;
  const fail = results.filter(r => !r?.ok).length;
  const rateLimited = results.filter(r => r?.rateLimit).length;

  // 기존 로그와 병합
  let prevResults = [];
  if (fs.existsSync(LOG_PATH)) {
    try { prevResults = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')).results || []; } catch {}
  }
  const merged = [...prevResults.filter(r => !results.find(nr => nr?.productNo === r?.productNo)), ...results];

  fs.writeFileSync(LOG_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_in_this_run: results.length,
    ok, fail, rate_limited: rateLimited, elapsed_sec: Number(elapsed),
    results: merged,
  }, null, 2));

  console.log(`\n==== 완료 ==== OK:${ok} Fail:${fail} (rate-limit:${rateLimited}) ${elapsed}s`);
  if (rateLimited > 0) console.log(`⚠️ rate limit 감지 — 재개는 --missing 옵션으로 이어서 실행`);
  process.exit(rateLimited > 0 ? 42 : (fail > 0 ? 2 : 0));
})();
