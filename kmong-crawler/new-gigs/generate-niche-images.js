#!/usr/bin/env node
/**
 * 니치 10상품 썸네일 — gpt-image-1 1536x1024 high → Sharp 4:3 crop 1304x976
 * 기존 generate-55-images-hires.js 구조 재사용
 */
require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '03-images');
const ORIG_DIR = path.join(__dirname, '03-images-original-1536');
if (!fs.existsSync(ORIG_DIR)) fs.mkdirSync(ORIG_DIR, { recursive: true });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('✗ OPENAI_API_KEY 없음'); process.exit(1); }

const CONCURRENCY = 3;

// 니치 10상품 비주얼 정의
const NICHE_VISUALS = [
  {
    id: 'N01', name: '아임웹 월구독료 탈출', headline: '아임웹 구독 이사', benefit: '연 40만 절감',
    target: '1인 사업자', price: '25만원~',
    palette: 'emerald #059669 to teal #14B8A6 gradient, amber #F59E0B accent',
    icon: 'web builder platform screen on the left with subscription billing cycle icon and outgoing arrow, modern self-hosted homepage mockup on the right with cloud/CDN symbol, moving boxes with data flow, cost savings chart arrow down',
    mood: 'clean Korean tech migration illustration, trust and savings',
  },
  {
    id: 'N02', name: '식스샵 포트폴리오 이사', headline: '식스샵 구독 탈출', benefit: '포트폴리오 통째 이사',
    target: '크리에이터', price: '25만원~',
    palette: 'charcoal #111827 to warm cream #FEF3C7 gradient, rose gold #F59E0B accent',
    icon: 'creative portfolio gallery grid with image frames and cameras, elegant transition arrow to a custom photographer portfolio site, lightroom/studio aesthetic',
    mood: 'minimal creative studio, photographer-friendly',
  },
  {
    id: 'N03', name: '카페24 가비아 이사', headline: '호스팅비 탈출', benefit: '연 50만 절감',
    target: '소상공인', price: '25만원~',
    palette: 'deep blue #1E3A8A to indigo #4338CA gradient, yellow #FBBF24 accent',
    icon: 'legacy shared-hosting server with dollar signs flowing out, arrow to Cloudflare edge network lightning bolts with zero cost tag, DNS migration checklist',
    mood: 'infrastructure upgrade, lower bill',
  },
  {
    id: 'N04', name: '노션 → 진짜 홈페이지', headline: '노션 + 진짜 SEO', benefit: '검색 노출 시작',
    target: '스타트업', price: '25만원~',
    palette: 'dark slate #0F172A to warm white gradient, lime #84CC16 accent',
    icon: 'Notion-style clean document blocks on the left with crossed-out magnifier (no SEO), arrow to a branded homepage with Google/Naver search engine result page showing top ranking, custom domain badge',
    mood: 'startup aesthetic, SEO unlock',
  },
  {
    id: 'N05', name: 'Wix Squarespace 이전', headline: '해외 웹빌더 탈출', benefit: '한국 SEO 최적화',
    target: '수출 사업자', price: '30만원~',
    palette: 'magenta #DB2777 to purple #7C3AED gradient, cyan #22D3EE accent',
    icon: 'international web builder dashboard with dollar $ subscription, arrow to Korean-localized site with ₩ won currency and Korean search engine optimization hreflang tags, globe with KR flag pin',
    mood: 'global to local migration',
  },
  {
    id: 'N06', name: '문의폼 이메일 무료 알림', headline: '월 0원 문의폼', benefit: '이메일 + 푸시 알림',
    target: '1인 사업자', price: '10만원~',
    palette: 'red #EF4444 to orange #F97316 gradient, white accent',
    icon: 'contact form UI on a homepage, arrow flow to email inbox with @ symbol and mobile phone push notification bell, no messenger logos, reCAPTCHA shield',
    mood: 'simple lead capture, free forever',
  },
  {
    id: 'N07', name: 'SSL 무료 전환', headline: '자물쇠 아이콘 달기', benefit: '연 33만 절감',
    target: '모든 사이트', price: '10만원~',
    palette: 'emerald #10B981 to teal #0D9488 gradient, white accent',
    icon: 'browser address bar transforming from red "Not Secure" warning triangle into green padlock HTTPS, SSL certificate shield with infinity auto-renewal symbol, zero cost badge',
    mood: 'security upgrade, trust restored',
  },
  {
    id: 'N08', name: 'B2B 온라인 예약', headline: '자체 예약 시스템', benefit: '수수료 0%',
    target: 'B2B 컨설팅', price: '30만원~',
    palette: 'navy #1E40AF to slate #334155 gradient, gold #FBBF24 accent',
    icon: 'B2B consulting appointment calendar grid with time slots, video meeting icon, Google Calendar sync arrows, client avatars in suits, no retail storefront',
    mood: 'premium B2B scheduler',
  },
  {
    id: 'N09', name: '다국어 이미지 번역', headline: '관광객 다국어 홈피', benefit: '이미지까지 번역',
    target: 'K뷰티 K푸드', price: '50만원~',
    palette: 'sunset orange #F97316 to pink #EC4899 gradient, cream accent',
    icon: 'product detail page image showing Korean text on the left, OCR scanning magnifier in the middle, same image with English and Japanese and Chinese text on the right preserving original design, multilingual flag badges',
    mood: 'global reach, image translation magic',
  },
  {
    id: 'N10', name: 'SEO 301 이전', headline: '검색 순위 유지', benefit: '리뉴얼 후 복구',
    target: '리뉴얼 사이트', price: '20만원~',
    palette: 'deep blue #1E3A8A to cyan #06B6D4 gradient, yellow #FBBF24 accent',
    icon: 'old URL page on the left, 301 redirect arrow connecting to new URL on the right, Google and Naver search bot icons following the redirect, ranking recovery bar chart with upward arrow',
    mood: 'seamless migration, SEO preserved',
  },
];

function buildPrompt(v) {
  return [
    `Ultra high-quality Korean commercial service thumbnail for Kmong marketplace, 1536x1024 landscape 3:2, intended for downsampling to 4:3 crop 1304x976.`,
    `Background: ${v.palette}. Mood: ${v.mood}.`,
    `BIG bold Korean headline TOP-CENTER: "${v.headline}" — sharp sans-serif Noto Sans KR extra bold, high contrast white with yellow #FBBF24 outline, extremely readable on 4-inch mobile, render at very large size.`,
    v.benefit ? `Subtitle immediately below headline: "${v.benefit}" — clean white, smaller but still highly legible.` : '',
    `Central hero visual: ${v.icon}. Modern flat illustration with 3D depth, soft glow, crisp detail at full 1536x1024 resolution.`,
    v.target ? `Small Korean target badge top-right: "${v.target}".` : '',
    v.price ? `Yellow #FBBF24 rounded price badge bottom-right: "${v.price}" with soft shadow — prominent.` : '',
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

async function postprocess(buf1536, outPath) {
  const cropLeft = Math.round((1536 - 1366) / 2);
  await sharp(buf1536)
    .extract({ left: cropLeft, top: 0, width: 1366, height: 1024 })
    .resize(1304, 976, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png({ compressionLevel: 6, quality: 95 })
    .toFile(outPath);
}

async function genOne(v) {
  const outPath = path.join(OUT_DIR, `niche-${v.id}.png`);
  const origPath = path.join(ORIG_DIR, `niche-${v.id}-1536.png`);
  const prompt = buildPrompt(v);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const b64 = await callOpenAI(prompt);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(origPath, buf);
      await postprocess(buf, outPath);
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
      const meta = await sharp(outPath).metadata();
      console.log(`  ✓ ${v.id} ${v.name} → ${meta.width}x${meta.height} ${sizeKB}KB`);
      return { id: v.id, ok: true, path: outPath, sizeKB: Number(sizeKB) };
    } catch (e) {
      console.warn(`  ⚠ ${v.id} attempt ${attempt}: ${e.message.slice(0, 150)}`);
      if (attempt === 2) return { id: v.id, ok: false, error: e.message };
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
      if (finished % 3 === 0 || finished === items.length) {
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
  let targets = NICHE_VISUALS;
  if (args.length && !args[0].startsWith('-')) {
    const ids = new Set(args[0].split(',').map(s => s.trim()));
    targets = NICHE_VISUALS.filter(v => ids.has(v.id));
  }
  console.log(`▶ 니치 썸네일 생성 ${targets.length}건 (gpt-image-1 1536x1024 high)`);
  const t0 = Date.now();
  const results = await runPool(targets, genOne, CONCURRENCY);
  const okCnt = results.filter(r => r?.ok).length;
  const failCnt = targets.length - okCnt;
  console.log(`\n완료: ${okCnt}/${targets.length} 성공, ${failCnt}건 실패, ${(Date.now()-t0)/1000|0}초`);
  fs.writeFileSync(path.join(OUT_DIR, 'niche-images-log.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exit(failCnt > 0 ? 2 : 0);
})();
