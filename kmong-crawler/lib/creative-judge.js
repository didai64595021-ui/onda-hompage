/**
 * 소재 개선 제안 — Claude Opus 4.7 CLI 기반
 * 입력: 서비스별 메트릭 + 현재 소재 스냅샷
 * 출력: 1개 서비스 × 1개 요소 (thumbnail/title/description) 개선안
 * 루프 원칙: 노출(CPC/키워드) → CTR(썸네일/제목) → CVR(상세/FAQ) → ROAS
 */

const { spawn } = require('child_process');

const SYSTEM = `당신은 크몽 광고 소재 최적화 컨설턴트입니다.
셀러의 30일 성과 데이터 + 현재 소재(제목/서브타이틀)를 보고
**가장 시급한 1개 서비스의 1개 요소**만 개선 제안합니다.

## 우선순위 루프
노출(완료: CPC+키워드 봇이 매일 처리) → CTR(썸네일/제목) → CVR(상세/FAQ) → ROI/ROAS(롱테일)

## 선정 기준 (1개만 고를 것)
1. CTR < 2% + 노출 100+ → 썸네일 또는 제목 (후킹 부족)
2. CTR 정상 2~5% but CVR(문의율) < 5% → 상세/서브타이틀 (전환 약함)
3. 매출 있지만 ROAS < 200% → FAQ/상세 리뷰 보강
4. 이미 상위 큐(measuring/submitted)에 있는 서비스는 후보에서 제외

## 제안 형식 (JSON 한 덩어리)
{
  "product_id": "...",
  "element_type": "title|thumbnail|description|subtitle|faq",
  "priority": 1-100,
  "reasoning": "선정 근거 1~2문장",
  "before_value": "현재 제목/상태 (타이틀이면 현재 제목 문자열, 썸네일/상세면 간단 설명)",
  "after_value": "신규 제안 (타이틀이면 새 제목 50자 이내, 썸네일이면 시안 프롬프트/컨셉, 상세면 핵심 개선 포인트 3개)",
  "expected_lift": "예상 개선폭 (예: 'CTR +30%')"
}

반드시 JSON 한 덩어리만. 설명 문장 금지.
후보 없으면 {"skip": true, "reason": "..."} 리턴.`;

function runClaude(prompt, systemPrompt, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.ANTHROPIC_API_KEY;
    const proc = spawn('claude', [
      '-p', '--model', 'opus', '--output-format', 'json',
      '--append-system-prompt', systemPrompt, '--no-session-persistence',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env: cleanEnv });
    let stdout = '', stderr = '';
    const t = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    proc.stdin.write(prompt); proc.stdin.end();
  });
}

async function proposeCreativeChange(metrics, existingQueue) {
  const userMsg = `## 서비스별 30일 성과
${JSON.stringify(metrics, null, 2)}

## 현재 큐 상태 (이 서비스는 제외)
${JSON.stringify(existingQueue.map(q => ({ product_id: q.product_id, element_type: q.element_type, state: q.state })), null, 2)}

위를 바탕으로 가장 시급한 1개 서비스 × 1개 요소 개선안을 JSON 한 덩어리로 리턴.`;

  const r = await runClaude(userMsg, SYSTEM);
  if (r.code !== 0) return { ok: false, error: `CLI exit ${r.code}: ${r.stderr.slice(0,200) || r.stdout.slice(0,200)}` };

  let envelope;
  try { envelope = JSON.parse(r.stdout); } catch (e) { return { ok: false, error: 'envelope 파싱: ' + e.message }; }
  if (envelope.is_error) return { ok: false, error: 'CLI 에러: ' + envelope.result };

  let parsed;
  try {
    const m = envelope.result.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : envelope.result);
  } catch (e) { return { ok: false, error: 'JSON 파싱: ' + e.message, raw: envelope.result.slice(0, 300) }; }

  return { ok: true, proposal: parsed, cost_usd: envelope.total_cost_usd };
}

module.exports = { proposeCreativeChange };
