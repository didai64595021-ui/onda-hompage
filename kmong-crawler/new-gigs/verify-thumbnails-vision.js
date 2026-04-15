#!/usr/bin/env node
/**
 * 크몽 썸네일 Vision 검증 — 썸네일에 맞춰 내용 정합성 체크 + rewrite 제안
 *
 *  - 입력: drafts-22-to-upload.json (productId ↔ draftId ↔ image 매핑)
 *  - 이미지: 03-images/55-{id}.png (로컬 원본)
 *  - 현재 내용: gig-data-55.js의 PRODUCTS[id].title / description
 *  - Vision: OpenAI gpt-4o (OCR + 컨셉 추출) → 매칭 점수 + rewrite 제안
 *  - 출력: verify-thumbnails-vision-report.json
 *
 *  정책: 썸네일이 "진실" — 본문을 썸네일에 맞춤 (반대 방향 아님)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY 누락'); process.exit(1); }

const DRAFTS = require('./drafts-22-to-upload.json');
const { PRODUCTS } = require('./gig-data-55.js');
const IMG_DIR = path.join(__dirname, '03-images');
const REPORT = path.join(__dirname, 'verify-thumbnails-vision-report.json');

const PROMPT = (label, currentTitle, currentDescSnippet) => `당신은 크몽 상품 썸네일과 본문을 매칭 검증하는 QA 전문가입니다.

아래 썸네일 이미지를 분석하고 결과를 JSON으로만 응답하세요(마크다운 금지):

{
  "thumbnail_main_text": "썸네일에 가장 크게 보이는 헤드라인/핵심 문구 (OCR, 정확히 그대로)",
  "thumbnail_subtext": "보조 문구/부제 (있으면)",
  "thumbnail_hook": "썸네일이 전달하는 핵심 약속 — 숫자/기간/결과가 있으면 반드시 포함 (예: '7일 완성', '전환율 2배', 'CVR 3.5%')",
  "thumbnail_concept": "썸네일 컨셉을 1줄로 요약 — 어떤 서비스를 어떤 고객에게 팔려는 페이지인지",
  "thumbnail_keywords": ["썸네일에서 뽑은 키워드 최대 6개"],
  "match_score": 0~100 사이 정수,
  "mismatches": ["썸네일 쪽에만 있고 현재 제목/본문에 빠진 요소들"],
  "extra_in_body": ["본문에만 있고 썸네일에는 없는 중요 요소들"],
  "verdict": "OK | NEEDS_REWRITE | THUMBNAIL_MISSING_HOOK",
  "rewrite_title": "썸네일에 맞춘 새 제목, 30자 이내 (썸네일 main_text/hook을 최우선 반영)",
  "rewrite_opening_line": "본문 첫 줄(질문형 후크), 썸네일 hook을 그대로 반영",
  "reason": "match_score 판단 근거 2~3문장"
}

판정 기준:
- match_score ≥85 → OK (경미 차이)
- 60~84 → NEEDS_REWRITE (hook 또는 숫자가 불일치)
- <60 → NEEDS_REWRITE (컨셉 자체가 다름)
- 썸네일에 hook/숫자가 전혀 없으면 THUMBNAIL_MISSING_HOOK

참고 컨텍스트:
- 라벨(상품 별칭): ${label}
- 현재 제목: ${currentTitle}
- 현재 본문 앞부분: ${currentDescSnippet.slice(0, 400)}
`;

async function analyzeThumbnail({ imagePath, label, currentTitle, currentDesc }) {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const body = {
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 1400,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT(label, currentTitle, currentDesc) },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' } },
      ],
    }],
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 200)}`);
  }
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function run() {
  const productsById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const results = [];
  const concurrency = 4;
  let idx = 0;

  async function worker() {
    while (idx < DRAFTS.length) {
      const my = idx++;
      const d = DRAFTS[my];
      const p = productsById[d.productId];
      if (!p) { results.push({ ...d, error: 'product not found in gig-data-55.js' }); continue; }
      const imagePath = path.join(IMG_DIR, d.image);
      if (!fs.existsSync(imagePath)) { results.push({ ...d, error: `image not found: ${d.image}` }); continue; }
      const t0 = Date.now();
      try {
        const analysis = await analyzeThumbnail({
          imagePath,
          label: d.label,
          currentTitle: p.title,
          currentDesc: p.description,
        });
        const row = {
          productId: d.productId,
          draftId: d.draftId,
          label: d.label,
          image: d.image,
          currentTitle: p.title,
          ms: Date.now() - t0,
          ...analysis,
        };
        results.push(row);
        console.log(`[${my + 1}/${DRAFTS.length}] #${d.productId} ${d.label} → ${analysis.verdict} (score=${analysis.match_score}) ${row.ms}ms`);
      } catch (e) {
        results.push({ ...d, error: String(e.message || e) });
        console.log(`[${my + 1}/${DRAFTS.length}] #${d.productId} ERR: ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const summary = {
    generated_at: new Date().toISOString(),
    total: results.length,
    ok: results.filter((r) => r.verdict === 'OK').length,
    needs_rewrite: results.filter((r) => r.verdict === 'NEEDS_REWRITE').length,
    missing_hook: results.filter((r) => r.verdict === 'THUMBNAIL_MISSING_HOOK').length,
    errors: results.filter((r) => r.error).length,
    avg_score: Math.round(results.filter((r) => typeof r.match_score === 'number').reduce((a, b) => a + b.match_score, 0) / Math.max(1, results.filter((r) => typeof r.match_score === 'number').length)),
    results,
  };
  fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));
  console.log('\n=== 요약 ===');
  console.log(`  총 ${summary.total}개 / OK ${summary.ok} / REWRITE ${summary.needs_rewrite} / HOOK부재 ${summary.missing_hook} / ERR ${summary.errors}`);
  console.log(`  평균 score: ${summary.avg_score}`);
  console.log(`  보고서: ${REPORT}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
