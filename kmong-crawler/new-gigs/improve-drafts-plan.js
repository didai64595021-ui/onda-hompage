#!/usr/bin/env node
/**
 * 성공 6개 draft 개선 기획 (Phase 8D-1)
 *  - 현재 제목/본문/카테고리/패키지 → Opus 4.7 일괄 호출
 *  - 출력: 새 제목 (CTR 공식) + 썸네일 프롬프트(gpt-image-1) + 본문 재작성 (전문적 톤 — ROI 연결)
 *
 *  실적 후킹 공식 (시스템 프롬프트에 주입):
 *   • CTR 1위 공식: 타겟 호명 + pain point + 시간 보증
 *   • CVR 1위 공식: 범위 명시 + 원스톱 + 전문성
 *   • ROI 최적화: 전문적 톤 + 구체 방법론 + 보장 포인트 + 구체 수치
 */
const fs = require('fs');
const path = require('path');
const { askClaude } = require('../lib/claude-max');

const IN_PATH = path.join(__dirname, 'recovery-gigs-full.json');
const LOG_PATH = path.join(__dirname, 'run-recovery-log.json');
const OUT_PATH = path.join(__dirname, 'improve-drafts-plan.json');

const SUCCESS_SLUGS = [
  'onepage-recovery', 'old-site-renew', 'cafe24-fix',
  'design-to-html', 'insta-account-active', 'speed-optimize',
];

const SYSTEM = `당신은 ONDA 크몽 고성과 상품 기획자입니다.
목표: CTR → CVR → ROI 전환 공식을 극대화하는 제목·썸네일·본문을 설계.

[CTR 공식 — 제목·썸네일]
- 타겟 호명 (사장님/기업/치과/미용실) + pain point 직격 + 시간 보증(24시간/3일/7일)
- ≤30자, 숫자 포함, 구체 결과 명시
- 직관적이어야 함 — 3초 안에 이득 파악 가능

[썸네일 프롬프트 (gpt-image-1)]
- 영문 프롬프트 (gpt-image-1은 한글보다 영문 지시어로 더 잘 렌더)
- 단, 한글 텍스트는 프롬프트 안에 Korean sans-serif 명시
- 1536x1024 landscape, 4:3 안전영역(1366x1024) 내 텍스트 배치
- 배경: 색상 대비 높음 (gradient 추천)
- 히어로 비주얼: 상품 핵심을 상징하는 아이콘/일러스트
- 큰 한글 헤드라인 (≤18자) + 작은 서브라인 (≤14자)
- 오른쪽 상단 타겟 배지, 오른쪽 하단 가격/보장 배지
- 금지: 인물 얼굴, 경쟁사 로고, 영어 문장, 워터마크

[본문 (전문적 톤 — ROI 연결)]
1. 후킹 1줄 (타겟+pain+시간)
2. "서비스 방법론" — 단계별 전문 설명 (3~5단계, 각 한 줄 근거 포함)
3. "품질 보증" — 구체 수치·지표·SLA
4. "이런 분께 추천" 3~4개
5. "Before vs After" 구체 수치
6. "패키지 구성" (STANDARD/DELUXE/PREMIUM 각 1~2줄, 누가 선택할지 명시)
7. "차별화 포인트" 3~4개
8. "작업 프로세스" (문의→계약→시안→최종)
9. "자주 묻는 질문(FAQ)" 2~3개
10. CTA (24시간 내 견적)

- 꺾쇠 <> 금지 (크몽 에디터)
- 최소 1200자, 이모지는 [TARGET][OK][PIN][IDEA][KEY] 제한
- 전문 용어는 괄호로 일반인 풀이
- AI 모델은 Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5 범위만

[출력 (JSON only)]
배열 형식 — 각 객체:
{
  "slug": "...",
  "new_title": "≤30자",
  "thumbnail_headline_kr": "≤18자 (썸네일 상단)",
  "thumbnail_subline_kr": "≤14자 (썸네일 중단)",
  "thumbnail_target_badge_kr": "≤8자 (우상단 배지)",
  "thumbnail_price_badge_kr": "≤12자 (우하단 배지)",
  "thumbnail_prompt_en": "gpt-image-1 영문 프롬프트 전문",
  "new_description": "본문 재작성 (1~10 구조 전부 포함, 최소 1200자)"
}

반드시 JSON 배열 한 개만 출력. 마크다운 없이.`;

function safeJsonParse(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('[');
  const last = s.lastIndexOf(']');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch { return null; }
}

// JSON 직렬화 안전하게 — isolated surrogate / 4-byte surrogate pair 중 unpaired 만 제거
function sanitizeForJson(str) {
  if (typeof str !== 'string') return str;
  // 짝 없는 high/low surrogate 제거
  return str
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')  // high surrogate 뒤에 low 없음
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') // low surrogate 앞에 high 없음
    // 제어문자 (tab/newline/carriage return 제외) 제거
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

async function main() {
  const recovery = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));

  // 성공 draft ID 매핑
  const draftById = {};
  for (const r of log.results) {
    if (r.ok && SUCCESS_SLUGS.includes(r.slug)) draftById[r.slug] = { draft_id: r.draft_id || null, edit_url: r.edit_url };
  }

  const targets = recovery.gigs.filter(g => SUCCESS_SLUGS.includes(g.slug));
  console.log(`▶ ${targets.length}개 개선 기획 Opus 호출`);

  // 현재 상태 요약 → user message (surrogate sanitize)
  const userMsgRaw = targets.map(g => (
    `---- slug: ${g.slug} ----
현재 제목: ${g.title}
카테고리: ${g.cat1} > ${g.cat2}
후킹 각도: ${g.hook_angle}
패키지: ${g.packages.map(p => `${p.name} ${p.price.toLocaleString()}원/${p.days}일/${p.description}`).join(' | ')}
현재 본문 첫 200자: ${(g.description || '').slice(0, 200)}
`
  )).join('\n');

  const userMsg = sanitizeForJson(userMsgRaw);

  const r = await askClaude({
    system: sanitizeForJson(SYSTEM),
    messages: [{ role: 'user', content: `아래 6개 draft의 제목/썸네일/본문을 CTR→ROI 공식으로 재설계해 JSON 배열로 출력.\n\n${userMsg}` }],
    model: 'opus',
    max_tokens: 20000,
    temperature: 0.5,
  });

  if (!r.ok) {
    console.error('Opus 실패:', r.error);
    process.exit(1);
  }

  const arr = safeJsonParse(r.text);
  if (!arr || !Array.isArray(arr)) {
    console.error('JSON 파싱 실패:', r.text?.slice(0, 400));
    fs.writeFileSync(OUT_PATH + '.raw.txt', r.text);
    process.exit(1);
  }

  // draft ID 붙이기
  for (const p of arr) {
    const meta = draftById[p.slug] || {};
    p.draft_id = meta.draft_id;
    p.edit_url = meta.edit_url;
  }

  const out = { generated_at: new Date().toISOString(), model: r.model, plans: arr };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n저장: ${OUT_PATH}`);
  console.log(`모델: ${r.model}, 기획 수: ${arr.length}`);
  for (const p of arr) {
    console.log(`  ▸ ${p.slug}: "${p.new_title}" (${(p.new_description || '').length}자)`);
  }
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
