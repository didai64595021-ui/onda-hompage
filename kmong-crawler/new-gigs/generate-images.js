/**
 * Step 3 — 크몽 신규 6개 상품 썸네일 생성
 * - OpenAI gpt-image-1 (영문 프롬프트, 1024×1024) → 03-images/0X-openai.png
 * - Gemini Imagen 3 (한국어 프롬프트, 1024×1024) → 03-images/0X-gemini.png
 *
 * 실패 시 fallback:
 *   OpenAI gpt-image-1 → dall-e-3
 *   Gemini imagen-3.0-generate-002 → imagen-3.0-fast-generate-001
 *
 * 사용법:
 *   node new-gigs/generate-images.js              # 12장 모두
 *   node new-gigs/generate-images.js 1            # 상품 1만
 *   node new-gigs/generate-images.js 1 openai     # 상품 1, OpenAI만
 */

require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });
require('dotenv').config({ path: '/home/onda/projects/onda-youtube-investment/.env' });

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '03-images');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!OPENAI_KEY) console.warn('⚠ OPENAI_API_KEY 없음 (OpenAI 생성 건너뜀)');
if (!GEMINI_KEY) console.warn('⚠ GEMINI_API_KEY 없음 (Gemini 생성 건너뜀)');

// 6개 상품 프롬프트 (Step 2 spec 동기화)
const PRODUCTS = [
  {
    id: '01',
    name: '텔레그램·카톡 알림봇',
    // 2026-04-29 정책 준수: 가격/누적건수 문구 모두 제거, 흰배경 회피
    openai: `Korean kmong gig thumbnail, square 1:1, dark navy #0A1929 background with subtle grid pattern. Bold Korean text "24시간 자동감시" top-center in yellow #FFD600 with 60px top padding. Subtitle "텔레그램·카톡 알림봇" white below. Center: three Telegram-style chat bubbles cascading vertically — first shows simple stock chart up arrow, second shows news icon, third shows bell icon. ABSOLUTELY NO price text (no 만원, no 부터, no 원 amounts), NO numbers with currency, NO badges with money, NO 1위/BEST/No.1/누적/최저가/100%, NO English text. Modern flat illustration, 50px+ padding all sides.`,
    gemini: `크몽 자동화 매크로 카테고리 정사각형 썸네일. 짙은 네이비(#0A1929) 배경+잔잔한 격자 무늬. 큰 한글 카피 "24시간 자동감시" 노란색(#FFD600) 상단(상단 60px 여백). 서브타이틀 "텔레그램·카톡 알림봇" 흰색. 중앙에 텔레그램 알림 말풍선 3개(시세 상승 화살표/뉴스 아이콘/키워드 종) 세로 캐스케이드. 가격 문구·금액·뱃지·1위·BEST·누적·100% 같은 검증 불가 문구 절대 금지. 모던 플랫 일러스트. 사방 50px 여백.`,
  },
  {
    id: '02',
    name: '셀러 가격·재고 모니터링',
    // 2026-04-29 정책 준수: 모든 가격/숫자+원 제거, 흰배경 회피
    openai: `Korean kmong gig thumbnail 1:1 square, soft mint-blue gradient background #E0F2FE to #DBEAFE (no pure white). Top text "가격이 바뀌면 5분 안에" big bold black, with green #03C75A underline accent. Subtitle "스마트스토어·쿠팡 자동 감시" smaller below. Left half: smartphone illustration with abstract notification UI (no specific numbers). Right half: laptop screen with abstract product card silhouettes and red/green trend arrows (no price values). ABSOLUTELY NO price text, NO 원/만원/부터 amounts, NO 1위/BEST/No.1/필수, NO English text. Modern clean ecommerce illustration, 50px+ padding.`,
    gemini: `크몽 자동화 카테고리 정사각형 썸네일. 민트-블루 그라데이션 배경(#E0F2FE→#DBEAFE), 순백색 절대 금지. 큰 검정 한글 "가격이 바뀌면 5분 안에" 상단, 스마트스토어 그린 밑줄. 서브 "스마트스토어·쿠팡 자동 감시". 좌측: 스마트폰 알림 UI(구체 숫자 X). 우측: 노트북+추상 상품 카드+빨간/초록 화살표(가격 값 없음). 가격·금액·1위·BEST·필수 절대 금지. 사방 50px 여백.`,
  },
  {
    id: '03',
    name: '사내문서 GPT 자동화',
    // 2026-04-29 정책 준수: "절약 금액"·"부터" 제거, 흰배경 회피
    openai: `Korean kmong gig thumbnail 1:1 square, soft lavender gradient background #EDE9FE to #DDD6FE (no pure white). Bold Korean text "AI 업무자동화" top-center in deep purple #5B21B6 with 60px top padding. Subtitle "엑셀·PDF·문서 → GPT가 3초에" black. Left side: stacked Excel, PDF, document icons (Before — disorganized). Center: purple pipeline arrows connecting flow nodes. Right side: organized report with charts and green checkmark (After). ABSOLUTELY NO price text, NO 절약/할인/부터/만원, NO 1위/BEST/No.1, NO badges with money, NO English text. Professional flat business illustration, 50px+ padding.`,
    gemini: `크몽 업무자동화 카테고리 정사각형 썸네일. 라벤더 그라데이션 배경(#EDE9FE→#DDD6FE), 순백색 금지. 큰 진보라(#5B21B6) 한글 "AI 업무자동화" 상단(상단 60px 여백). 서브 "엑셀·PDF·문서 → GPT가 3초에" 검정. 좌측: 엑셀·PDF·문서 아이콘 흐트러짐(Before). 중앙: 보라색 파이프라인 노드 연결. 우측: 깔끔 보고서+차트+초록 체크마크(After). 가격·절약 금액·만원·BEST 절대 금지. 사방 50px 여백.`,
  },
  {
    id: '04',
    name: 'PDF 챗봇',
    // 2026-04-29 정책 준수: "5.9만원부터" 가격 뱃지 제거
    openai: `Korean kmong gig thumbnail 1:1 square, mint-green gradient background #D1FAE5 to #A7F3D0 (no pure white). Top bold Korean text "AI 상담봇" in dark green #047857 with 60px top padding. Subtitle "PDF 1장으로 24시간 응답" black. Left: large PDF document icon with rightward arrow. Center: chatbot conversation UI with 3 speech bubbles — customer question (light blue), AI answer (white card), source label small. Right edge: clock icon. ABSOLUTELY NO price text, NO 만원/부터/원 amounts, NO 1위/BEST/100%, NO English text. Friendly approachable illustration, 50px+ padding.`,
    gemini: `크몽 AI챗봇 카테고리 정사각형 썸네일. 민트-그린 그라데이션 배경(#D1FAE5→#A7F3D0), 순백색 금지. 큰 진녹(#047857) 한글 "AI 상담봇" 상단(상단 60px 여백). 서브 "PDF 1장으로 24시간 응답" 검정. 좌측: 큰 PDF 아이콘+화살표. 중앙: 챗봇 대화 UI 말풍선 3개. 우측: 시계 아이콘. 가격·만원·부터·100% 절대 금지. 친근 소상공인 일러스트. 사방 50px 여백.`,
  },
  {
    id: '05',
    name: 'RAG 사내문서 챗봇',
    // 2026-04-29 정책 준수: "29만원부터" 가격 뱃지 제거 (사용자 알림 직접 트리거)
    openai: `Korean kmong gig thumbnail 1:1 square, dark navy #0F172A background with subtle grid pattern. Top bold Korean text "사내문서 AI 챗봇" in white with 60px top padding. Subtitle "노션·구글드라이브·PDF 통합 검색" in light blue #60A5FA. Center: enterprise dashboard UI mockup with chat conversation panel on left and document sidebar on right. Top: three abstract document/cloud icons connected by blue lines to dashboard. Bottom-left small blue badge with single short word "B2B" only. ABSOLUTELY NO price text, NO 만원/부터/원, NO ENTERPRISE/PRIME/PRO grade labels, NO 1위/BEST/No.1, NO English text other than B2B. Premium corporate illustration, 50px+ padding.`,
    gemini: `크몽 AI챗봇 카테고리 정사각형 썸네일. 다크네이비(#0F172A) 배경+잔잔한 격자 패턴. 큰 흰 한글 "사내문서 AI 챗봇" 상단(상단 60px 여백). 서브 "노션·구글드라이브·PDF 통합 검색" 라이트블루(#60A5FA). 중앙: 기업 대시보드 UI(대화창+문서 사이드바). 상단: 추상 문서/클라우드 아이콘 3개 파란 연결선. 좌하단 짧은 뱃지 "B2B"만. 가격·만원·부터·ENTERPRISE·PRIME·PRO·1위·BEST 절대 금지. 사방 50px 여백.`,
  },
  {
    id: '06',
    name: '풀스택 카카오 챗봇',
    // 2026-04-29 정책 준수: "99만원부터" + "ENTERPRISE" 등급표시 모두 제거
    openai: `Korean kmong gig thumbnail 1:1 square, dark gradient background #1E1B4B to #312E81. Top bold Korean text "AI 풀스택 구축" in white with 60px top padding. Subtitle "챗봇 + 카카오 + 자동화 올인원" in gold #F59E0B. Center: three connected hub icons in triangle — left: AI brain icon (blue glow), center: yellow speech bubble (KakaoTalk style), right: gear automation icon. Blue connecting lines. Bottom: abstract mini dashboard mockup. ABSOLUTELY NO price text, NO 만원/부터/원, NO ENTERPRISE/PRIME/PRO/PREMIUM grade labels, NO 1위/BEST/No.1/100%, NO badges with amounts, NO English text. Premium corporate illustration, dark luxury feel, 50px+ padding.`,
    gemini: `크몽 AI챗봇 카테고리 정사각형 썸네일. 진한 보라→남색 그라데이션(#1E1B4B→#312E81) 배경. 큰 흰 한글 "AI 풀스택 구축" 상단(상단 60px 여백). 서브 "챗봇 + 카카오 + 자동화 올인원" 골드(#F59E0B). 중앙: 3개 허브 아이콘 삼각형(좌: AI 뇌, 중: 카카오톡 노란 말풍선, 우: 톱니바퀴) 파란 연결선. 하단: 추상 대시보드 미니어처. 가격·만원·부터·ENTERPRISE·PRIME·PRO·1위·BEST 절대 금지. 프리미엄 다크 일러스트. 사방 50px 여백.`,
  },
];

// ─── OpenAI gpt-image-1 ───
async function genOpenAI(product) {
  const outPath = path.join(OUT_DIR, `${product.id}-openai.png`);
  if (fs.existsSync(outPath)) {
    console.log(`✓ ${product.id}-openai 이미 존재 (skip)`);
    return { ok: true, path: outPath, skipped: true };
  }
  console.log(`→ OpenAI ${product.id} ${product.name} 생성 중...`);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: product.openai,
        size: '1024x1024',
        n: 1,
        quality: 'high',
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      // gpt-image-1 verified org 미통과 시 dall-e-3로 fallback
      if (res.status === 403 || errText.includes('verified') || errText.includes('not allowed')) {
        console.log(`  ↪ gpt-image-1 차단, dall-e-3 fallback`);
        const r2 = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: product.openai,
            size: '1024x1024',
            n: 1,
            quality: 'hd',
            response_format: 'b64_json',
          }),
        });
        if (!r2.ok) throw new Error(`dall-e-3 ${r2.status}: ${await r2.text()}`);
        const j2 = await r2.json();
        const b64 = j2.data[0].b64_json;
        fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
        return { ok: true, path: outPath, model: 'dall-e-3' };
      }
      throw new Error(`${res.status}: ${errText}`);
    }
    const j = await res.json();
    // gpt-image-1: data[0].b64_json
    const b64 = j.data[0].b64_json;
    if (!b64) throw new Error('no b64_json in response');
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`  ✓ 저장: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
    return { ok: true, path: outPath, model: 'gpt-image-1' };
  } catch (e) {
    console.error(`  ✗ OpenAI ${product.id} 실패:`, e.message);
    return { ok: false, error: e.message };
  }
}

// ─── Gemini Imagen 3 ───
async function genGemini(product) {
  const outPath = path.join(OUT_DIR, `${product.id}-gemini.png`);
  if (fs.existsSync(outPath)) {
    console.log(`✓ ${product.id}-gemini 이미 존재 (skip)`);
    return { ok: true, path: outPath, skipped: true };
  }
  console.log(`→ Gemini ${product.id} ${product.name} 생성 중...`);
  // 시도 모델 순서: imagen-3.0-generate-002 → imagen-3.0-fast-generate-001
  const models = ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: product.gemini }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
            personGeneration: 'allow_adult',
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.log(`  ↪ ${model} ${res.status}: ${errText.slice(0, 200)}`);
        continue;
      }
      const j = await res.json();
      const pred = j.predictions && j.predictions[0];
      const b64 = pred && (pred.bytesBase64Encoded || pred.image && pred.image.imageBytes);
      if (!b64) {
        console.log(`  ↪ ${model} 응답에 이미지 없음:`, JSON.stringify(j).slice(0, 200));
        continue;
      }
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      console.log(`  ✓ 저장: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB) [${model}]`);
      return { ok: true, path: outPath, model };
    } catch (e) {
      console.log(`  ↪ ${model} 예외:`, e.message);
    }
  }
  console.error(`  ✗ Gemini ${product.id} 모든 모델 실패`);
  return { ok: false, error: 'all gemini models failed' };
}

// ─── 메인 ───
(async () => {
  const args = process.argv.slice(2);
  const targetId = args[0]; // "1" ~ "6" or undefined
  const targetEngine = args[1]; // "openai" / "gemini" / undefined

  const targets = PRODUCTS.filter(p => !targetId || p.id === String(targetId).padStart(2, '0'));

  const results = [];
  for (const p of targets) {
    if (OPENAI_KEY && (!targetEngine || targetEngine === 'openai')) {
      results.push({ product: p.id, engine: 'openai', ...(await genOpenAI(p)) });
    }
    if (GEMINI_KEY && (!targetEngine || targetEngine === 'gemini')) {
      results.push({ product: p.id, engine: 'gemini', ...(await genGemini(p)) });
    }
  }

  console.log('\n=== 결과 요약 ===');
  for (const r of results) {
    const status = r.ok ? (r.skipped ? '⊝ skip' : `✓ ${r.model || ''}`) : `✗ ${r.error}`;
    console.log(`  ${r.product}-${r.engine}: ${status}`);
  }
  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n총 ${results.length}회: 성공 ${ok}, 실패 ${fail}`);
  fs.writeFileSync(
    path.join(OUT_DIR, '_generation-log.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2)
  );
  process.exit(fail > 0 ? 2 : 0);
})();
