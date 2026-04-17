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

const OUT_DIR = path.join(__dirname, '03-images-improved');
const ORIG_DIR = path.join(__dirname, '03-images-improved-1536');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(ORIG_DIR)) fs.mkdirSync(ORIG_DIR, { recursive: true });

const PLAN_PATH = path.join(__dirname, 'improve-drafts-plan.json');
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

async function genOne(plan) {
  const outPath = path.join(OUT_DIR, `${plan.slug}.png`);
  const origPath = path.join(ORIG_DIR, `${plan.slug}-1536.png`);

  // 프롬프트가 영문만이면 한글 텍스트 요소 없어 gpt-image-1 렌더 잘 안됨
  // 한글 텍스트 요소를 강제 명시 (gpt-image-1 은 한글도 일부 렌더 가능)
  const enhanced = [
    plan.thumbnail_prompt_en || '',
    plan.thumbnail_headline_kr ? `BIG bold Korean headline TOP-CENTER: "${plan.thumbnail_headline_kr}" — Noto Sans KR ExtraBold, white with yellow #FBBF24 outline, extremely readable on 4-inch mobile screen.` : '',
    plan.thumbnail_subline_kr ? `Subtitle below headline: "${plan.thumbnail_subline_kr}" — white clean.` : '',
    plan.thumbnail_target_badge_kr ? `Top-right small Korean target badge: "${plan.thumbnail_target_badge_kr}".` : '',
    plan.thumbnail_price_badge_kr ? `Bottom-right yellow rounded badge: "${plan.thumbnail_price_badge_kr}" prominent with shadow.` : '',
    'STRICTLY NO human faces, NO logos, NO English paragraphs, NO watermarks, NO lorem ipsum.',
    'Professional Korean Kmong marketplace thumbnail, pixel-perfect text clarity.',
  ].filter(Boolean).join(' ');

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const b64 = await callOpenAI(enhanced);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(origPath, buf);
      await postprocess(buf, outPath);
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`  ✓ ${plan.slug} → ${outPath} (${sizeKB}KB)`);
      return { slug: plan.slug, ok: true, path: outPath, sizeKB: Number(sizeKB) };
    } catch (e) {
      console.warn(`  ⚠ ${plan.slug} attempt ${attempt}: ${e.message.slice(0, 150)}`);
      if (attempt === 2) return { slug: plan.slug, ok: false, error: e.message };
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function main() {
  const { plans } = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf-8'));
  console.log(`▶ ${plans.length}개 개선 썸네일 생성 (gpt-image-1)`);
  const results = [];
  // 병렬 2 (rate limit 보수적)
  const pool = 2;
  let cursor = 0;
  async function spawn() {
    while (cursor < plans.length) {
      const p = plans[cursor++];
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
