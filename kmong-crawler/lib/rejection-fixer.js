/**
 * 크몽 비승인 사유 → 수정안 생성 (Claude Opus 4.7)
 * 입력: 비승인 사유 텍스트 + 현재 gig 데이터(title/description/packages)
 * 출력: { reason_summary, fix_type, fix_proposal[], confidence, requires_human, message }
 *
 * fix_type:
 *   - text:      제목/설명 텍스트 수정 (자동 가능)
 *   - keyword:   금지어/외부연락처 등 텍스트 류 (자동 가능)
 *   - price:     가격 정책 위반 (자동 가능, 단 사용자 매출 영향)
 *   - image:     이미지 부적합 (자동 불가, 사람 필요)
 *   - category:  카테고리 부적합 (자동 불가)
 *   - unknown:   분류 실패 (자동 불가)
 */

const { askClaude } = require('./claude-max');

const SYSTEM_PROMPT = `당신은 크몽(kmong) 비승인 사유 분석가 + 수정안 생성기입니다.

입력으로 다음을 받습니다:
- reason_text: 크몽이 보낸 비승인 사유 텍스트 (모호하거나 일부만 있을 수 있음)
- gig: 현재 서비스의 제목/설명/패키지 데이터

당신의 일:
1. 사유를 분석해 fix_type 분류
2. text/keyword/price 류면 구체적인 수정안 (현재값 → 새값) 제시
3. image/category/policy 모호 류는 requires_human=true 로 사람 검토 요청

## fix_type 분류 가이드
- text: 제목·설명에 오해 소지/과장/미준수 표현. (예: "1위", "최저가", "100% 보장" 등)
- keyword: 금지어/외부 연락처(카톡 ID, 전화번호, 이메일, 외부 사이트 URL).
- price: 가격이 카테고리 정책 미달/초과. (크몽 최소가 위반 등)
- image: 메인/패키지 이미지 부적합. **사람만 처리 가능 → requires_human=true**.
- category: 카테고리 분류가 잘못. **사람 검토 → requires_human=true**.
- unknown: 사유가 모호/불명. **requires_human=true**.

## 수정 원칙
- 매출에 영향 가는 핵심 가치 제안(USP)은 보존. 금지어만 안전한 표현으로 치환.
- 제목 수정은 검색 키워드 손실 최소화. 핵심 키워드 유지.
- 가격 변경은 매우 보수적 — 정책 최소가 + 1만원 권장.
- 확신 없으면 confidence: low + requires_human: true.

## 출력 JSON (이외 텍스트 금지)
{
  "reason_summary": "한 줄 (50자 이내)",
  "fix_type": "text|keyword|price|image|category|unknown",
  "confidence": "high|medium|low",
  "requires_human": boolean,
  "fix_proposal": [
    { "field": "title|description|package_name|package_description|price", "package_index": 0, "before": "현재값", "after": "새값", "reason": "왜 이렇게 바꾸는지" }
  ],
  "message": "사용자에게 보낼 한국어 안내 (200자 이내)"
}

requires_human=true 면 fix_proposal는 빈 배열 [] 가능.`;

function buildUserMessage({ reason_text, gig_title, gig_detail }) {
  return `## 비승인 사유 텍스트
${reason_text || '(원문 없음)'}

## 현재 서비스
제목: ${gig_title || '(없음)'}

${gig_detail ? `상세:\n${JSON.stringify(gig_detail, null, 2).slice(0, 4000)}` : '(상세 데이터 없음 — 제목과 사유로만 판단)'}

위를 분석해 JSON 한 덩어리로 답하세요.`;
}

async function proposeRejectionFix({ reason_text, gig_title, gig_detail }) {
  if (!reason_text && !gig_title) return { ok: false, error: '입력 부족' };

  const userMsg = buildUserMessage({ reason_text, gig_title, gig_detail });
  const r = await askClaude({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
    model: 'opus',
    max_tokens: 4096,
  });
  if (!r.ok) return { ok: false, error: r.error, status: r.status };

  let parsed;
  try {
    const m = r.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : r.text);
  } catch (e) {
    return { ok: false, error: `JSON 파싱 실패: ${e.message}`, raw: r.text.slice(0, 500) };
  }

  // 안전 디폴트 — image/category/unknown은 자동 적용 금지
  const NO_AUTO_TYPES = new Set(['image', 'category', 'unknown']);
  if (NO_AUTO_TYPES.has(parsed.fix_type)) parsed.requires_human = true;
  if (parsed.confidence === 'low') parsed.requires_human = true;
  if (!Array.isArray(parsed.fix_proposal)) parsed.fix_proposal = [];

  return { ok: true, proposal: parsed, usage: r.usage };
}

module.exports = { proposeRejectionFix, SYSTEM_PROMPT };
