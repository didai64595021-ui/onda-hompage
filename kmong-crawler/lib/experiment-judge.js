/**
 * A/B 실험 — Opus 4.7로 가설 + variant B 카피/컨셉 제안
 * - 저성과 서비스 1개 선정
 * - 기존 제목/부제/CTR/CVR을 근거로 "왜 실패하는지" 가설
 * - 개선 변형: 새 제목 / 부제 / 상세 축약 / 썸네일 컨셉
 * - 카피 + 시장조사 (Opus가 알고 있는 크몽 업계 관점) 반영
 */

const { spawn } = require('child_process');

const SYSTEM = `당신은 크몽 신상품 기획 + 카피라이팅 전문가입니다.
셀러의 저성과 서비스 데이터를 보고, **같은 서비스 내용으로 새 variant 상품을 등록할 때의 가설과 카피**를 제안합니다.

## 목표
원본(A)은 그대로 두고, 변형(B)을 신규 상품으로 올려 30일 후 성과를 비교.
A/B 차이가 확실히 보이도록 — 단순 문구 교체가 아니라 **후킹 구조/타겟 포지셔닝/차별점** 중 최소 1개 차별화.

## 제안 형식 (JSON 한 덩어리, 다른 텍스트 금지)
{
  "variant_a_product_id": "선정 서비스 product_id",
  "hypothesis": "왜 A가 성과 낮고 B가 더 나을 것인지 1~2문장",
  "differentiation_axis": "hook|target|guarantee|price_anchor|speed|proof 중 1~2개",
  "variant_b_title": "새 제목 50자 이내",
  "variant_b_subtitle": "새 부제 80자 이내",
  "variant_b_description_summary": "상세페이지 후킹 방향 3문장",
  "variant_b_thumbnail_concept": "썸네일 한 줄 컨셉 + 주요 문구 2개",
  "expected_lift": "예상 개선폭 (예: 'CTR +40%, 문의율 +20%')",
  "priority": 1-100
}

- 선정 기준: CTR < 2% 또는 (CTR 양호 + 문의율 < 5%) + 노출 100+ (표본 충분)
- 이미 live/measuring 상태인 서비스는 제외
- 후보 없으면 {"skip": true, "reason": "..."}`;

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

async function proposeExperiment(metrics, activeExperiments) {
  const candidates = metrics.filter(m =>
    !activeExperiments.some(e => e.variant_a_product_id === m.product_id && ['live','measuring','approved_to_create','created'].includes(e.state))
  );
  if (!candidates.length) return { ok: true, proposal: { skip: true, reason: '모든 서비스 이미 실험 중' } };

  const userMsg = `## 서비스별 30일 성과
${JSON.stringify(candidates, null, 2)}

## 이미 진행 중 실험
${JSON.stringify(activeExperiments.map(e => ({ a: e.variant_a_product_id, state: e.state })), null, 2)}

위를 바탕으로 1개 서비스 선정 + variant B 제안을 JSON 한 덩어리로 리턴.`;

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

module.exports = { proposeExperiment };
