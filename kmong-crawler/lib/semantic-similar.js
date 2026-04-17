/**
 * 크몽 답변 봇 — Haiku 기반 시맨틱 유사 답변 검색
 *  - 기존 getSimilarApprovedReplies(키워드 overlap) 을 의미 기반으로 업그레이드
 *  - 스키마 변경 없음 (임베딩 컬럼 불필요)
 *  - 후보 풀: 같은 product_id 우선 → 전체 sent 답변 (최근 N개)
 *  - 선택: Haiku에 "현재 문의와 가장 유사한 답변 top K ID 반환" 요청
 *
 *  실패 시 호출자가 기존 키워드 매칭으로 폴백 가능
 */
const { supabase } = require('./supabase');
const { askClaude } = require('./claude-max');

const SYSTEM = `당신은 답변 검색 랭커입니다. 현재 고객 메시지와 가장 의미상 유사한 과거 답변을 선택합니다.

기준:
- 의도가 같거나 유사한가 (가격/기간/기능/포트폴리오/플랫폼 등)
- 상황·맥락이 비슷한가 (업종, 규모, 기존 플랫폼 유무)
- 고객 뉘앙스가 비슷한가 (긴급/신중/가격민감)

단순 단어 겹침은 무시하고 의도·상황 일치도로 판단. 결과가 없으면 빈 배열.

오직 JSON 한 객체만 출력:
{"top_ids": [id1, id2, id3], "reasoning": "한 줄 근거"}`;

/**
 * @param {object} opts
 * @param {string} opts.currentMessage - 현재 고객 메시지
 * @param {string} [opts.productId]
 * @param {number} [opts.topK=3]
 * @param {number} [opts.poolSize=30]
 * @param {Array} [opts.customPool] - 외부에서 전달한 후보 풀 (예: 전환 완료 고객 답변)
 * @returns {Promise<{ok, examples?, error?}>}
 */
async function findSemanticSimilar({ currentMessage, productId, topK = 3, poolSize = 30, customPool = null }) {
  if (!currentMessage || currentMessage.length < 8) {
    return { ok: true, examples: [] };
  }

  // 커스텀 풀이 있으면 그걸 사용 (전환 답변 전용 우선 탐색)
  if (Array.isArray(customPool) && customPool.length > 0) {
    return await rankPool(currentMessage, customPool, topK);
  }

  // 후보 풀 구성: 같은 product 우선 + 전체 sent 보충
  let pool = [];
  if (productId) {
    const { data: same } = await supabase
      .from('kmong_inquiries')
      .select('id, product_id, customer_name, message_content, auto_reply_text, inquiry_date')
      .eq('product_id', productId)
      .eq('auto_reply_status', 'sent')
      .not('auto_reply_text', 'is', null)
      .order('inquiry_date', { ascending: false })
      .limit(Math.ceil(poolSize / 2));
    pool = same || [];
  }
  if (pool.length < poolSize) {
    const remain = poolSize - pool.length;
    const seen = new Set(pool.map(p => p.id));
    const { data: any } = await supabase
      .from('kmong_inquiries')
      .select('id, product_id, customer_name, message_content, auto_reply_text, inquiry_date')
      .eq('auto_reply_status', 'sent')
      .not('auto_reply_text', 'is', null)
      .order('inquiry_date', { ascending: false })
      .limit(remain * 2);
    for (const r of (any || [])) {
      if (seen.has(r.id)) continue;
      pool.push(r);
      if (pool.length >= poolSize) break;
    }
  }

  return await rankPool(currentMessage, pool, topK);
}

// Haiku 랭킹 공통 로직 (일반 pool + customPool 둘 다 사용)
async function rankPool(currentMessage, pool, topK) {
  if (!pool || pool.length === 0) return { ok: true, examples: [] };
  if (pool.length <= topK) return { ok: true, examples: pool.map(p => ({ ...p, score: 1, reason: '후보 부족' })) };

  const catalog = pool.map((p, i) => (
    `[${p.id}] (${i + 1}/${pool.length}) 고객 메시지: ${String(p.message_content || '').slice(0, 140)}`
  )).join('\n');

  const userMsg = `[현재 고객 메시지]
${String(currentMessage).slice(0, 500)}

[과거 답변 후보 (id 목록)]
${catalog}

위 현재 메시지와 의미상 가장 유사한 과거 답변의 id ${topK}개를 선택하세요. JSON만 출력.`;

  try {
    const r = await askClaude({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      model: 'haiku',
      max_tokens: 300,
      temperature: 0.1,
    });
    if (!r.ok) return { ok: false, error: r.error };

    const parsed = safeJsonParse(r.text);
    if (!parsed || !Array.isArray(parsed.top_ids)) {
      return { ok: false, error: `JSON 파싱 실패: ${r.text?.slice(0, 120)}` };
    }

    const byId = new Map(pool.map(p => [p.id, p]));
    const examples = parsed.top_ids
      .map((id, i) => {
        const p = byId.get(id);
        return p ? { ...p, score: topK - i, reason: parsed.reasoning || '' } : null;
      })
      .filter(Boolean)
      .slice(0, topK);

    return { ok: true, examples, model: r.model, reasoning: parsed.reasoning || '' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function safeJsonParse(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch { return null; }
}

module.exports = { findSemanticSimilar };
