/**
 * 크몽 답변 봇 — 고객 첨부 이미지를 Opus 4.7 Vision 으로 심층 분석
 *  - 고객이 보내는 이미지 유형: 레퍼런스 시안/경쟁사 스크린샷/손그림 레이아웃/스펙 표
 *  - 기존: 이미지를 메인 답변 Claude에 직접 첨부해서 "관찰 + 답변 생성" 동시 수행 → 놓치는 디테일 발생
 *  - 개선: 사전 Vision 분석 단계 → 구조화 JSON → 메인 프롬프트 텍스트 블록으로 주입
 *    · 메인 Claude는 텍스트 요약 기반으로 답변 집중
 *    · 이미지 자체도 여전히 첨부되어 교차 참조 가능
 *
 *  heat ≥ 60 && 첨부 이미지 존재 조건에서만 발동 (Opus Vision 비용 관리)
 */
const { askClaude } = require('./claude-max');

const SYSTEM = `당신은 웹디자인/마케팅 시각자료 분석 전문가입니다. 고객이 참고/레퍼런스/스펙 용도로 보낸 이미지를 구조화 분석해서 JSON 출력.

필드 (모두 필수):
- reference_type: 'design_reference' | 'competitor_screenshot' | 'layout_sketch' | 'spec_table' | 'product_photo' | 'brand_asset' | 'other'
- content_summary: string — 이미지가 무엇을 보여주는지 한두 문장
- layout_structure: string[] — 섹션별 레이아웃 구성 (예: ["상단 히어로 배너", "3단 서비스 소개 카드", "고객 후기 슬라이더"])
- color_tone: string — 색상 톤 (예: "따뜻한 크림/브라운", "차가운 네이비/화이트")
- typography_cues: string — 폰트/타이포 특징 (산세리프 큰 제목, 명조체 본문 등)
- brand_cues: string[] — 브랜드에서 드러나는 가치/포지셔닝 단서
- editable_spots: string[] — 리뉴얼 시 편집해야 할 구체 포인트 (고객이 명시하지 않았어도 개선이 필요한 부분)
- quality_issues: string[] — 현재 디자인의 약점/개선점 (답변에서 "이 부분 개선 가능" 어필용)
- customer_intent: string — 이 이미지를 첨부한 고객의 의도 추정 (비슷하게 만들고 싶다 / 이걸 개선하고 싶다 / 이렇게 피하고 싶다)
- implementation_notes: string[] — 이 레퍼런스를 우리 제작에 적용할 때 주의사항 / 구현 팁

한국어 JSON 한 객체만, 마크다운/설명 없이.`;

/**
 * @param {object} opts
 * @param {Array<{type:'image', source:{type:'base64',media_type,data}, _meta?}>} opts.imageBlocks - 이미 base64 로드된 이미지들
 * @param {string} [opts.customerMessage] - 고객 메시지 (의도 추정 보조)
 * @returns {Promise<{ok, analyses?, model?, error?}>}
 */
async function analyzeAttachmentImages({ imageBlocks, customerMessage = '' }) {
  if (!Array.isArray(imageBlocks) || imageBlocks.length === 0) {
    return { ok: true, analyses: [] };
  }

  // 한번에 최대 3장만 분석 (토큰 관리)
  const toAnalyze = imageBlocks.slice(0, 3);

  const analyses = [];
  for (let i = 0; i < toAnalyze.length; i++) {
    const block = toAnalyze[i];
    const fname = block._meta?.file_name || `image_${i + 1}`;
    const content = [
      { type: 'image', source: block.source },
      {
        type: 'text',
        text: `[첨부 이미지 ${i + 1}/${toAnalyze.length}: ${fname}]
[고객 메시지 맥락]
${String(customerMessage || '').slice(0, 300) || '(메시지 없음)'}

위 이미지를 분석해 JSON 반환하세요.`,
      },
    ];

    try {
      const r = await askClaude({
        system: SYSTEM,
        messages: [{ role: 'user', content }],
        model: 'opus',
        max_tokens: 1000,
        temperature: 0.2,
      });
      if (!r.ok) {
        analyses.push({ ok: false, file_name: fname, error: r.error });
        continue;
      }
      const parsed = safeJsonParse(r.text);
      if (!parsed) {
        analyses.push({ ok: false, file_name: fname, error: `JSON 파싱 실패: ${r.text?.slice(0, 120)}` });
        continue;
      }
      analyses.push({ ok: true, file_name: fname, analysis: normalize(parsed), model: r.model });
    } catch (e) {
      analyses.push({ ok: false, file_name: fname, error: e.message });
    }
  }

  return { ok: true, analyses };
}

function normalize(j) {
  const str = (x, def = '') => typeof x === 'string' ? x.slice(0, 400) : def;
  const arr = (x) => Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, 8) : [];
  const typeAllowed = ['design_reference', 'competitor_screenshot', 'layout_sketch', 'spec_table', 'product_photo', 'brand_asset', 'other'];
  return {
    reference_type: typeAllowed.includes(j.reference_type) ? j.reference_type : 'other',
    content_summary: str(j.content_summary),
    layout_structure: arr(j.layout_structure),
    color_tone: str(j.color_tone),
    typography_cues: str(j.typography_cues),
    brand_cues: arr(j.brand_cues),
    editable_spots: arr(j.editable_spots),
    quality_issues: arr(j.quality_issues),
    customer_intent: str(j.customer_intent),
    implementation_notes: arr(j.implementation_notes),
  };
}

function safeJsonParse(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch { return null; }
}

/**
 * 메인 답변 프롬프트에 주입할 요약
 */
function formatVisionAnalysesForPrompt(analyses) {
  const ok = (analyses || []).filter(a => a.ok);
  if (ok.length === 0) return '';
  const lines = [`[고객 첨부 이미지 심층 분석 — 답변에 구체 디테일 반영]`];
  for (const item of ok) {
    const a = item.analysis;
    lines.push(`\n▼ ${item.file_name} (${a.reference_type})`);
    if (a.content_summary) lines.push(`• 내용: ${a.content_summary}`);
    if (a.customer_intent) lines.push(`• 🎯 첨부 의도 추정: ${a.customer_intent}`);
    if (a.layout_structure.length) lines.push(`• 레이아웃 구조: ${a.layout_structure.slice(0, 5).join(' / ')}`);
    if (a.color_tone) lines.push(`• 색상 톤: ${a.color_tone}`);
    if (a.brand_cues.length) lines.push(`• 브랜드 단서: ${a.brand_cues.slice(0, 3).join(', ')}`);
    if (a.editable_spots.length) lines.push(`• 🔧 편집 포인트: ${a.editable_spots.slice(0, 4).join(' / ')}`);
    if (a.quality_issues.length) lines.push(`• ⚠️ 약점 (개선 어필): ${a.quality_issues.slice(0, 3).join(' / ')}`);
    if (a.implementation_notes.length) lines.push(`• 구현 주의: ${a.implementation_notes.slice(0, 3).join(' / ')}`);
  }
  lines.push(`\n※ 위 분석은 Opus Vision 사전 판독 결과. 답변 작성 시 이 중 3~4개 디테일을 자연스럽게 인용하세요.`);
  return lines.join('\n');
}

module.exports = { analyzeAttachmentImages, formatVisionAnalysesForPrompt };
