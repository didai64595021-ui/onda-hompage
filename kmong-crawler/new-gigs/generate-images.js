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
    openai: `Korean kmong gig thumbnail, square 1:1. Bold Korean text "24시간 자동감시" top-center in yellow #FFD600 highlighted on dark navy background #0A1929. Subtitle "텔레그램·카톡 알림봇" white. Three Telegram chat notification bubbles cascading in the center showing stock price up arrow, news icon, keyword bell. Bottom-right yellow price badge "5만원부터". Bottom-left small badge "5,000건 작업". Modern flat illustration, high contrast, Korean kmong style commercial thumbnail, NO English text except numbers.`,
    gemini: `크몽 자동화 매크로 카테고리 정사각형 썸네일. 짙은 네이비(#0A1929) 배경에 큰 한글 카피 "24시간 자동감시" 노란색(#FFD600) 강조. 서브타이틀 "텔레그램·카톡 알림봇" 흰색. 중앙에 텔레그램 알림 말풍선 3개 (시세 상승, 뉴스 아이콘, 키워드 종) 겹쳐 떠오르는 모습. 우측 하단 노란 가격 뱃지 "5만원부터". 좌측 하단 작은 뱃지 "5,000건 작업". 모던 플랫 일러스트, 신뢰감, 야간 자동화 분위기.`,
  },
  {
    id: '02',
    name: '셀러 가격·재고 모니터링',
    openai: `Korean kmong gig thumbnail 1:1 square. Top text "가격이 바뀌면 5분 안에" big bold black on white background, with green #03C75A underline. Subtitle "스마트스토어·쿠팡 자동 감시" smaller. Left half: smartphone showing red downward arrow notification "경쟁사 가격 ▼1,200원". Right half: laptop screen with product cards list and price tags, some red and some green arrows. Bottom-right green badge "1인 셀러 필수 15만원부터". Modern clean ecommerce illustration, NO English text.`,
    gemini: `크몽 자동화 카테고리 정사각형 썸네일. 흰 배경 + 큰 검정 한글 "가격이 바뀌면 5분 안에" 상단, 스마트스토어 그린 밑줄. 서브 "스마트스토어·쿠팡 자동 감시". 좌측 절반: 스마트폰 알림 화면 "경쟁사 가격 ▼1,200원" 빨간 하락. 우측 절반: 노트북에 상품 카드 리스트, 가격 태그, 빨간/초록 화살표. 우하단 그린 뱃지 "1인 셀러 필수 15만원부터". 모던 깔끔 이커머스 일러스트.`,
  },
  {
    id: '03',
    name: '사내문서 GPT 자동화',
    openai: `Korean kmong gig thumbnail 1:1 square. Bold Korean text "AI 업무자동화" top-center in purple #7C3AED on white background. Subtitle "엑셀·PDF·문서 → GPT가 3초에" black. Left side: messy stack of Excel, PDF, document icons (gray, disorganized). Center: purple pipeline/conveyor arrows connecting nodes (automation flow). Right side: clean organized report with charts and green checkmark. Bottom-left green #10B981 badge "월 150만원 절약". Bottom-right purple badge "20만원부터". Modern flat business illustration, professional tone, NO English text.`,
    gemini: `크몽 업무자동화 카테고리 정사각형 썸네일. 화이트 배경 + 상단 보라색(#7C3AED) 그라데이션 띠에 큰 한글 "AI 업무자동화". 서브타이틀 "엑셀·PDF·문서 → GPT가 3초에" 검정. 좌측: 엑셀·PDF·문서 아이콘 지저분하게 쌓임 (Before). 중앙: 보라색 파이프라인 노드 연결선 (Make/n8n 자동화 흐름). 우측: 깔끔한 보고서+차트+초록 체크마크 (After). 좌하단 초록(#10B981) 뱃지 "월 150만원 절약". 우하단 보라 뱃지 "20만원부터". 프로페셔널 비즈니스 플랫 일러스트.`,
  },
  {
    id: '04',
    name: 'PDF 챗봇',
    openai: `Korean kmong gig thumbnail 1:1 square. Bright mint-white #F0FDF4 background. Top bold Korean text "AI 상담봇" in dark green #059669. Subtitle "PDF 1개로 3일 완성" black. Left: large PDF document icon with arrow pointing right. Center: chatbot conversation UI with 3 speech bubbles — customer question (light blue), AI answer (green), small source citation. Right edge: clock icon with "24h". Bottom-right green badge "5.9만원부터". Bright friendly illustration, approachable small-business style, NO English text.`,
    gemini: `크몽 AI챗봇 카테고리 정사각형 썸네일. 밝은 민트(#F0FDF4) 배경 + 큰 진한 초록(#059669) 한글 "AI 상담봇" 상단. 서브 "PDF 1개로 3일 완성" 검정. 좌측: 큰 PDF 문서 아이콘에서 화살표. 중앙: 챗봇 대화 UI 말풍선 3개 (고객 질문 하늘색, AI 답변 초록, 출처 표시 작게). 우측: 시계 아이콘 "24h". 우하단 초록 뱃지 "5.9만원부터". 밝고 친근한 소상공인 친화 플랫 일러스트.`,
  },
  {
    id: '05',
    name: 'RAG 사내문서 챗봇',
    openai: `Korean kmong gig thumbnail 1:1 square. Dark navy #0F172A background. Top bold Korean text "사내문서 AI 챗봇" in white. Subtitle "노션·구글드라이브·PDF 통합 검색" in blue #3B82F6. Center: enterprise dashboard UI mockup showing chat conversation with source citations panel on left and document list sidebar on right. Top: three icons (Notion logo silhouette, Google Drive folder, PDF icon) connected by blue lines to the dashboard. Bottom-left blue gradient badge "B2B 전용". Bottom-right blue badge "29만원부터". Premium corporate illustration, high-end B2B feel, NO English text.`,
    gemini: `크몽 AI챗봇 카테고리 정사각형 썸네일. 다크네이비(#0F172A) 배경 + 큰 흰 한글 "사내문서 AI 챗봇" 상단. 서브 "노션·구글드라이브·PDF 통합 검색" 파란색(#3B82F6). 중앙: 기업 대시보드 UI (대화창 + 출처 인용 패널 + 문서 사이드바). 상단: 노션·구글드라이브·PDF 아이콘이 파란 연결선으로 대시보드와 연결. 좌하단 파란 뱃지 "B2B 전용". 우하단 뱃지 "29만원부터". 프리미엄 기업 일러스트, 고급 B2B 분위기.`,
  },
  {
    id: '06',
    name: '풀스택 카카오 챗봇',
    openai: `Korean kmong gig thumbnail 1:1 square. Dark gradient background #1E1B4B to #312E81. Top bold Korean text "AI 풀스택 구축" in white. Subtitle "챗봇 + 카카오 + 자동화 올인원" in gold #F59E0B. Center: three connected hub icons in triangle formation — left: AI brain icon (blue glow), center: KakaoTalk yellow speech bubble, right: gear/cog automation icon. Blue connecting lines between them. Bottom: mini dashboard screen mockup. Bottom-right gold premium badge "99만원부터". Top-right small text "ENTERPRISE". Premium corporate illustration, high-end dark luxury feel, NO other English text.`,
    gemini: `크몽 AI챗봇 카테고리 정사각형 썸네일. 진한 보라→남색 그라데이션(#1E1B4B→#312E81) 배경. 큰 흰 한글 "AI 풀스택 구축" 상단. 서브 "챗봇 + 카카오 + 자동화 올인원" 골드(#F59E0B). 중앙: 3개 허브 아이콘 삼각형 배치 (좌: AI 뇌, 중: 카카오톡 노란 말풍선, 우: 톱니바퀴) 파란 연결선. 하단: 대시보드 스크린 미니어처. 우하단 골드 뱃지 "99만원부터". 우상단 작은 "ENTERPRISE". 프리미엄 엔터프라이즈 일러스트, 고급 다크 분위기.`,
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
