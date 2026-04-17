#!/usr/bin/env node
/**
 * 개선 기획 기반 썸네일 생성 (Phase 8D-2)
 *  - improve-drafts-plan.json 의 thumbnail_prompt_en 로 gpt-image-1 호출
 *  - Sharp 후처리: 1536x1024 → 4:3 크롭(1366x1024) → 1304x976 (652x488 Retina 2x)
 *  - 출력: new-gigs/03-images-improved/{slug}.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 다중 .env 로드 — OPENAI_API_KEY 는 /home/onda/.env 또는 onda-youtube-investment/.env 에 있음
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}
try { require('dotenv').config({ path: '/home/onda/.env' }); } catch {}
try { require('dotenv').config({ path: '/home/onda/projects/onda-youtube-investment/.env' }); } catch {}

const OUT_DIR = path.join(__dirname, '03-images-discovery');
const ORIG_DIR = path.join(__dirname, '03-images-discovery-1536');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(ORIG_DIR)) fs.mkdirSync(ORIG_DIR, { recursive: true });

const PLAN_PATH = path.join(__dirname, 'discovery-10-full.json');
// env 지연 로드 — require 시점에 평가 (외부 wrapper의 env 주입 순서 이슈 회피)
function getOpenAIKey() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error('OPENAI_API_KEY 없음');
  return k;
}

async function callOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getOpenAIKey()}`, 'Content-Type': 'application/json' },
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
  const cropLeft = Math.round((1536 - 1366) / 2); // 85
  await sharp(buf1536)
    .extract({ left: cropLeft, top: 0, width: 1366, height: 1024 })
    .resize(1304, 976, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png({ compressionLevel: 6, quality: 95 })
    .toFile(outPath);
}

// 카테고리별 비주얼 테마 (generate-55-images-hires.js 참고)
const THEMES = {
  'IT·프로그래밍': { palette: 'deep blue #1E3A8A to purple #6D28D9 gradient, bright yellow #FBBF24 accent', icon: 'code editor window with colorful syntax highlighted code, brackets, gears' },
  '마케팅': { palette: 'magenta #DB2777 to indigo #4338CA gradient, cyan #22D3EE glow accent', icon: 'megaphone, growth chart, target, sparkle stars' },
  '디자인': { palette: 'warm cream #FEF3C7 to pink #FB7185 gradient, purple #7C3AED accent', icon: 'paint palette, design brush, typography samples, layered layout' },
  '영상·사진·음향': { palette: 'teal #0D9488 to navy #0F172A gradient, lime #A3E635 accent', icon: 'play button, film reel, camera, waveform' },
};

function buildPrompt(gig) {
  const t = THEMES[gig.cat1] || THEMES['IT·프로그래밍'];
  // title에서 헤드라인 + 서브라인 추출
  const titleShort = gig.title.length <= 18 ? gig.title : gig.title.slice(0, 16) + '…';
  // hook_angle에서 보조 메시지
  const subLine = (gig.cat2 || '').slice(0, 14);
  const pricePart = gig.packages?.[0]?.price ? `${Math.floor(gig.packages[0].price / 10000)}만원부터` : '';

  return [
    `Ultra high-quality Korean commercial service thumbnail for Kmong marketplace, 1536x1024 landscape 3:2, intended for 4:3 crop 1304x976.`,
    `Background: ${t.palette}. Mood: professional, modern, clean.`,
    `BIG bold Korean headline TOP-CENTER: "${titleShort}" — Noto Sans KR ExtraBold, white with yellow #FBBF24 outline, extremely readable on 4-inch mobile screen.`,
    `Subtitle below headline: "${subLine}" — clean white smaller font.`,
    `Central hero visual: ${t.icon}. Modern flat illustration with 3D depth, soft glow, crisp detail at full resolution.`,
    pricePart ? `Yellow #FBBF24 rounded price badge bottom-right: "${pricePart}" with soft shadow — prominent.` : '',
    `Trust icons bottom-left: shield + checkmark + lock trio.`,
    `Generous padding for 4:3 crop safety — important text must sit within central 1366x1024 area.`,
    `STRICTLY NO human faces, NO logos, NO English paragraphs, NO watermarks, NO lorem ipsum, NO competitor brand marks.`,
    `Professional Korean ecommerce thumbnail, pixel-perfect text clarity.`,
  ].filter(Boolean).join(' ');
}

async function genOne(gig) {
  const outPath = path.join(OUT_DIR, `${gig.slug}.png`);
  const origPath = path.join(ORIG_DIR, `${gig.slug}-1536.png`);
  const enhanced = buildPrompt(gig);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const b64 = await callOpenAI(enhanced);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(origPath, buf);
      await postprocess(buf, outPath);
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`  ✓ ${gig.slug} → ${outPath} (${sizeKB}KB)`);
      return { slug: gig.slug, ok: true, path: outPath, sizeKB: Number(sizeKB) };
    } catch (e) {
      console.warn(`  ⚠ ${gig.slug} attempt ${attempt}: ${e.message.slice(0, 150)}`);
      if (attempt === 2) return { slug: gig.slug, ok: false, error: e.message };
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function main() {
  const { gigs } = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf-8'));
  console.log(`▶ ${gigs.length}개 썸네일 생성 (gpt-image-1)`);
  const results = [];
  const pool = 2;
  let cursor = 0;
  async function spawn() {
    while (cursor < gigs.length) {
      const p = gigs[cursor++];
      const r = await genOne(p);
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: pool }, spawn));

  const ok = results.filter(r => r.ok).length;
  console.log(`\n완료: ${ok}/${results.length}`);
  fs.writeFileSync(path.join(OUT_DIR, 'gen-log.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
