#!/usr/bin/env node
/**
 * 복구+신규 9개 gig 본문 생성 (Opus 4.7)
 *  - recovery-gigs-meta.js 의 9개 메타 + 실적 후킹 공식 → Opus 4.7 로 본문 작성
 *  - #747186 (onepage) 은 debug-4gigs-detail.json 에서 기존 본문 복구
 *  - 결과: recovery-gigs-full.json 저장 → create-gig.js 가 이걸 먹음
 *
 *  실적 후킹 공식 (system prompt 에 주입):
 *   - CTR 1위: 타겟 호명 + pain point + 시간 보증
 *   - CVR 1위: 범위 명시 + 원스톱 + 전문성
 *   - ROI 1위: 고단가 B2B + 가치 묶음
 */
const fs = require('fs');
const path = require('path');
const { askClaude } = require('../lib/claude-max');
const { GIGS } = require('./recovery-gigs-meta');

const OUT_PATH = path.join(__dirname, 'recovery-gigs-full.json');
const DEBUG_PATH = path.join(__dirname, '..', 'debug-4gigs-detail.json');

const SYSTEM = `당신은 ONDA 마케팅 크몽 판매 페이지 카피라이터입니다. 주어진 gig 메타(제목·카테고리·패키지·후킹각도)를 바탕으로 크몽 상품 본문(description/progress/preparation)을 작성하세요.

★ 실측 후킹 공식 (반드시 반영) ★
- CTR 1위 공식: 타겟 호명 + pain point 직격 + 시간 보증
  → 도입부 한두 줄에 적용. 예: "사장님 전용" "○○ 깨짐" "24시간/당일/3일"
- CVR 1위 공식: 범위 명시 + 원스톱 + 전문성
  → 중반부에 "이 서비스로 받으실 수 있는 것" 섹션으로 구조화
- 결제 CVR 공식: 구체 견적 숫자 + 포트폴리오 언급 + 수정 무제한 보장
  → 하단 CTA 바로 위에 배치

★ 구조 (반드시 이 순서) ★
1. 후킹 한 줄 (타겟+pain+시간)
2. "이런 분께 추천" 3~4개 이모지 리스트
3. "Before vs After" 3~4줄 수치 대비
4. "패키지 구성" (STANDARD/DELUXE/PREMIUM 각각 한 줄 요약 + 누구에게 적합)
5. "차별화" 3~4개 체크 리스트
6. "작업 프로세스" (상담→계약→시안→납품 단계)
7. CTA ("지금 문의 → 24시간 내 견적 회신")

★ 포맷 규칙 ★
- 꺾쇠 <>  절대 금지 (크몽 에디터 에러 유발)
- 본문 최소 100자, 최대 20000자
- 이모지는 🎯✅📌💡🔑 정도만
- 과장 금지 (구체 수치는 실제 가능한 범위만)
- 경쟁 플랫폼 (카페24/아임웹/워드프레스) 은 "대신 해드립니다 + 월 호스팅비 0원" 으로 받아치기
- AI 모델은 "Claude Opus 4.7, Claude Sonnet 4.6, Claude Haiku 4.5" 를 넘지 말 것 (1달 내 최신)

★ 출력 (JSON only) ★
{
  "description": "본문 전체 (1~7 구조 전부 포함)",
  "progress": "작업 프로세스 부분만 (50자 이상) — description 과 다른 톤으로 단계별 상세",
  "preparation": "고객이 준비해야 할 자료 리스트 (50자 이상)"
}

마크다운 코드블록 없이 JSON 한 객체만 출력.`;

function safeJsonParse(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch { return null; }
}

async function generateBody(gig, debugDetail) {
  // debug 복구가 가능한 항목은 그대로 사용
  if (gig.use_debug_recovery && debugDetail?.onepage) {
    const op = debugDetail.onepage;
    const descs = op.descriptions || [];
    const desc = descs.map(d => `${d.title ? `[${d.title}]\n` : ''}${d.description || ''}`).join('\n\n');
    // progress/preparation 이 없을 수 있으니 분리
    const progress = descs.find(d => /절차|프로세스|과정|진행/i.test(d.title || ''))?.description || '';
    const preparation = descs.find(d => /준비|자료|요청/i.test(d.title || ''))?.description || '';
    return { description: desc, progress: progress || '1. 문의 및 상담 → 2. 견적/결제 → 3. 초안 전달(2일) → 4. 피드백 반영 → 5. 최종본 납품', preparation: preparation || '업종/용도, 참고 사이트 3개, 원하는 색상/스타일, 포함 페이지 수', _source: 'debug_recovery' };
  }

  const userMsg = `[gig 메타]
제목: ${gig.title}
카테고리: ${gig.cat1} > ${gig.cat2}
후킹 각도: ${gig.hook_angle}

[패키지]
${gig.packages.map(p => `- ${p.name} ${p.price.toLocaleString()}원 / ${p.days}일 / 수정 ${p.revisions === 999 ? '무제한' : p.revisions + '회'} / ${p.description}`).join('\n')}

위 메타로 크몽 상품 본문(description/progress/preparation) JSON 생성.`;

  const r = await askClaude({
    system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
    model: 'opus',
    max_tokens: 3500,
    temperature: 0.4,
  });
  if (!r.ok) return { _error: r.error };
  const parsed = safeJsonParse(r.text);
  if (!parsed) return { _error: `JSON 파싱 실패: ${r.text?.slice(0, 160)}` };
  return {
    description: String(parsed.description || '').slice(0, 19000),
    progress: String(parsed.progress || '').slice(0, 2000),
    preparation: String(parsed.preparation || '').slice(0, 2000),
    _model: r.model,
  };
}

async function main() {
  console.log('=== 9개 gig 본문 생성 (Opus 4.7) ===');
  let debugDetail = null;
  try { debugDetail = JSON.parse(fs.readFileSync(DEBUG_PATH, 'utf-8')).details; } catch {}
  console.log(`debug 복구 소스: ${debugDetail ? 'OK' : '없음'}`);

  const results = [];
  for (let i = 0; i < GIGS.length; i++) {
    const g = GIGS[i];
    console.log(`\n[${i + 1}/${GIGS.length}] ${g.title}`);
    const start = Date.now();
    const body = await generateBody(g, debugDetail);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (body._error) {
      console.log(`  ❌ 실패: ${body._error}`);
      results.push({ ...g, ...body });
      continue;
    }
    console.log(`  ✓ 생성 완료 (${elapsed}s, ${body._model || body._source}, desc=${body.description.length}자)`);
    results.push({ ...g, ...body });
  }

  const out = { generated_at: new Date().toISOString(), count: results.length, gigs: results };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n저장: ${OUT_PATH}`);
  console.log(`성공: ${results.filter(r => !r._error).length}/${results.length}`);
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
