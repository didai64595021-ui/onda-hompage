/**
 * 크몽 답변 봇 — 고객이 보낸 URL을 Opus 4.7로 심층 분석
 *  - url-summarizer 가 수집한 body/title을 Opus 4.7에 넘겨 구조화 분석
 *  - 업종/브랜드 톤/강점/약점/개선 힌트/경쟁 맥락 추출
 *  - heat ≥ 60 & URL 있는 경우 발동 (저가치 리드에는 Haiku 요약만으로 충분)
 *  - Opus rate-limit 시 Sonnet → Haiku로 자연스럽게 폴백 (claude-max 체인)
 */
const { askClaude } = require('./claude-max');

const SYSTEM = `당신은 웹사이트 분석 전문가입니다. 고객이 참고자료로 보낸 URL의 내용을 구조화 분석해서 JSON 출력.

목적: 판매자(우리)가 고객 사이트 현황을 정확히 파악해 답변에 반영하는 것.

필드 (모두 필수):
- industry: string — 업종 한 줄 요약 (예: "B2B 산업 소재 제조", "1인 법무법인")
- brand_tone: string — 브랜드 톤 (예: "신뢰 중심 전문 / 테크", "따뜻한 로컬 감성")
- target_audience: string — 타겟 고객층 추정
- current_strengths: string[] — 현재 사이트의 강점 (잘 되어있는 점)
- current_weaknesses: string[] — 개선 필요 약점 (답변 어필 포인트)
- structural_info: {pages_visible: number, main_ctas: string[], has_mobile: boolean, has_blog: boolean, platform_signal: string}
- improvement_opportunities: string[] — 리뉴얼 시 특히 제안할 수 있는 구체 개선사항
- competitor_signals: string[] — 사이트에서 드러나는 경쟁 상황 언급 (경쟁사/벤치마크)
- key_content_hints: string[] — 답변에 자연스럽게 언급할 고객사 키 정보 (대표 제품/주력 서비스/연혁 등)

한국어 JSON, 마크다운/설명 없이 오직 JSON 한 객체.`;

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.title
 * @param {string} opts.body - 이미 추출된 본문 (url-summarizer 결과)
 * @param {number} [opts.maxBody=6000]
 * @returns {Promise<{ok, analysis?, model?, error?}>}
 */
async function deepAnalyzeUrl({ url, title = '', body = '', maxBody = 6000 }) {
  if (!url || !body || body.length < 100) {
    return { ok: false, error: 'body 부족 (100자 미만)' };
  }

  const userMsg = `[분석 대상 URL]
${url}

[페이지 타이틀]
${title}

[본문 텍스트 (추출분, 최대 ${maxBody}자)]
${String(body).slice(0, maxBody)}

위 사이트를 구조화 분석해 JSON으로 출력하세요.`;

  try {
    // Opus 우선 — 폴백 체인(sonnet/haiku)이 claude-max에 내장
    const r = await askClaude({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      model: 'opus',
      max_tokens: 1200,
      temperature: 0.2,
    });
    if (!r.ok) return { ok: false, error: r.error };
    const parsed = safeJsonParse(r.text);
    if (!parsed) return { ok: false, error: `JSON 파싱 실패: ${r.text?.slice(0, 160)}` };
    return { ok: true, analysis: normalize(parsed), model: r.model };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function normalize(j) {
  const str = (x, def = '') => typeof x === 'string' ? x.slice(0, 400) : def;
  const arr = (x) => Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, 8) : [];
  const s = j.structural_info && typeof j.structural_info === 'object' ? j.structural_info : {};
  return {
    industry: str(j.industry),
    brand_tone: str(j.brand_tone),
    target_audience: str(j.target_audience),
    current_strengths: arr(j.current_strengths),
    current_weaknesses: arr(j.current_weaknesses),
    structural_info: {
      pages_visible: typeof s.pages_visible === 'number' ? s.pages_visible : 0,
      main_ctas: arr(s.main_ctas),
      has_mobile: Boolean(s.has_mobile),
      has_blog: Boolean(s.has_blog),
      platform_signal: str(s.platform_signal),
    },
    improvement_opportunities: arr(j.improvement_opportunities),
    competitor_signals: arr(j.competitor_signals),
    key_content_hints: arr(j.key_content_hints),
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
 * 메인 Claude 프롬프트에 주입할 요약
 */
function formatDeepAnalysisForPrompt(url, analysis) {
  if (!analysis) return '';
  const lines = [];
  lines.push(`[고객이 공유한 참고사이트 심층 분석: ${url} — 고객 제공 자료. 우리 작업물 아님. "저희가 작업한 곳" 주장 금지]`);
  if (analysis.industry) lines.push(`• 업종: ${analysis.industry}`);
  if (analysis.brand_tone) lines.push(`• 브랜드 톤: ${analysis.brand_tone}`);
  if (analysis.target_audience) lines.push(`• 타겟: ${analysis.target_audience}`);
  if (analysis.current_strengths.length) lines.push(`• 현재 강점: ${analysis.current_strengths.slice(0, 3).join(' / ')}`);
  if (analysis.current_weaknesses.length) {
    lines.push(`• 🎯 현재 약점 (답변에 개선 포인트로 어필):`);
    analysis.current_weaknesses.slice(0, 4).forEach(w => lines.push(`    - ${w}`));
  }
  if (analysis.improvement_opportunities.length) {
    lines.push(`• 💡 리뉴얼 시 제안할 개선사항:`);
    analysis.improvement_opportunities.slice(0, 4).forEach(o => lines.push(`    - ${o}`));
  }
  if (analysis.key_content_hints.length) {
    lines.push(`• 🔑 답변에 자연스럽게 언급할 고객사 정보:`);
    analysis.key_content_hints.slice(0, 4).forEach(k => lines.push(`    - ${k}`));
  }
  const s = analysis.structural_info;
  const structBits = [];
  if (s.pages_visible > 0) structBits.push(`페이지 ${s.pages_visible}개`);
  if (s.has_mobile) structBits.push('모바일 O'); else structBits.push('모바일 X/불확실');
  if (s.has_blog) structBits.push('블로그 있음');
  if (s.platform_signal) structBits.push(`플랫폼: ${s.platform_signal}`);
  if (structBits.length) lines.push(`• 구조: ${structBits.join(' · ')}`);
  return lines.join('\n');
}

module.exports = { deepAnalyzeUrl, formatDeepAnalysisForPrompt };
