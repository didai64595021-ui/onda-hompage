/**
 * 크몽 고객 프로필 빌더
 *  - 같은 customer_name의 과거 inquiry + order 집계 → Haiku로 행동 패턴 추출
 *  - 프롬프트에 주입하면 "이 고객은 가격 민감/빠른 결정/꼼꼼 검토" 등 답변 개인화 가능
 *  - 2회 이상 문의한 고객에만 적용 (신규는 의미 없음)
 */
const { supabase } = require('./supabase');
const { askClaude } = require('./claude-max');

const SYSTEM = `당신은 크몽 셀러의 고객 관계 분석가입니다. 같은 고객의 과거 문의/주문 이력을 보고 행동 패턴을 JSON으로 추출하세요.

필드 (누락 금지):
- total_inquiries: number — 총 문의 횟수
- past_topics: string[] — 과거 주로 물어본 주제 (가격, 포트폴리오, 기능 등)
- price_sensitivity: 'high' | 'medium' | 'low' — "저렴하게/예산 타이트" 언급 빈도 기반
- decision_speed: 'fast' | 'moderate' | 'deliberate' — 첫 문의부터 결제까지 속도 또는 답장 빠르기
- detail_orientation: 'high' | 'medium' | 'low' — 질문 깊이/명세 요구 정도
- industry_context: string — 업종/규모/지역 등 일관되게 언급된 배경
- past_commitments_honored: 'yes' | 'no' | 'unknown' — 실제 결제로 이어졌는지
- relationship_tone: 'warm' | 'business' | 'distant' | 'frustrated' — 전반적 어조
- recommended_approach: string — 이 고객 대상 권장 전략 한 줄 (예: "가격 투명화 + 포트폴리오 중심 어필")

JSON 한 객체만 출력. 마크다운/설명 없이.`;

const PROFILE_CACHE = new Map();  // customer_name → { profile, ts } — 10분 TTL
const CACHE_TTL = 10 * 60 * 1000;

/**
 * 고객 프로필 조회 (2+ 문의 이력 필요)
 * @param {string} customerName
 * @param {object} [opts]
 * @param {number} [opts.minPrior=1] - 최소 이전 문의 수 (기본 1: 현재 문의 제외 과거 1개 이상)
 * @returns {Promise<{ok, profile?, reason?, error?}>}
 */
async function getCustomerProfile(customerName, { minPrior = 1 } = {}) {
  if (!customerName) return { ok: false, error: 'customerName 누락' };

  // 캐시 확인
  const cached = PROFILE_CACHE.get(customerName);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return { ok: true, profile: cached.profile, cached: true };
  }

  // 과거 문의 조회
  const { data: inquiries, error } = await supabase
    .from('kmong_inquiries')
    .select('id, inquiry_date, message_content, auto_reply_text, auto_reply_status, product_id')
    .eq('customer_name', customerName)
    .order('inquiry_date', { ascending: true })
    .limit(20);
  if (error) return { ok: false, error: error.message };

  if (!inquiries || inquiries.length < minPrior + 1) {
    return { ok: false, reason: `과거 문의 부족 (${inquiries?.length || 0} < ${minPrior + 1})` };
  }

  // 관련 주문 조회 (결제 이력)
  let orders = [];
  try {
    const { data: o } = await supabase
      .from('kmong_orders')
      .select('id, order_date, amount, status')
      .eq('customer_name', customerName)
      .order('order_date', { ascending: false })
      .limit(10);
    orders = o || [];
  } catch {}

  // Haiku 프롬프트용 요약 데이터
  const inquiryDigest = inquiries.slice(-8).map((q, i) => {
    const date = new Date(q.inquiry_date).toLocaleDateString('ko-KR');
    return `${i + 1}. [${date}] 고객: ${String(q.message_content || '').slice(0, 150)}${q.auto_reply_status === 'sent' ? ` / 우리답: ${String(q.auto_reply_text || '').slice(0, 120)}` : ''}`;
  }).join('\n');

  const orderDigest = orders.length > 0
    ? '\n[주문 이력]\n' + orders.map(o => `- ${new Date(o.order_date).toLocaleDateString('ko-KR')}: ${o.amount?.toLocaleString() || '?'}원 (${o.status})`).join('\n')
    : '\n[주문 이력] 없음';

  const userMsg = `고객명: ${customerName}
총 문의: ${inquiries.length}건, 주문: ${orders.length}건

[최근 문의 이력 (최신 8개)]
${inquiryDigest}
${orderDigest}

위 데이터로 고객 행동 프로필을 JSON 추출하세요.`;

  try {
    const r = await askClaude({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      model: 'haiku',
      max_tokens: 700,
      temperature: 0.2,
    });
    if (!r.ok) return { ok: false, error: r.error };
    const parsed = safeJsonParse(r.text);
    if (!parsed) return { ok: false, error: `JSON 파싱 실패: ${r.text?.slice(0, 160)}` };
    const profile = normalizeProfile(parsed, inquiries.length, orders.length);
    PROFILE_CACHE.set(customerName, { profile, ts: Date.now() });
    return { ok: true, profile, model: r.model, inquiryCount: inquiries.length, orderCount: orders.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function normalizeProfile(j, inquiryCount, orderCount) {
  const arr = (x) => Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : [];
  const oneOf = (x, allowed, def) => allowed.includes(x) ? x : def;
  return {
    total_inquiries: typeof j.total_inquiries === 'number' ? j.total_inquiries : inquiryCount,
    total_orders: orderCount,
    past_topics: arr(j.past_topics),
    price_sensitivity: oneOf(j.price_sensitivity, ['high', 'medium', 'low'], 'medium'),
    decision_speed: oneOf(j.decision_speed, ['fast', 'moderate', 'deliberate'], 'moderate'),
    detail_orientation: oneOf(j.detail_orientation, ['high', 'medium', 'low'], 'medium'),
    industry_context: typeof j.industry_context === 'string' ? j.industry_context.slice(0, 200) : '',
    past_commitments_honored: oneOf(j.past_commitments_honored, ['yes', 'no', 'unknown'], 'unknown'),
    relationship_tone: oneOf(j.relationship_tone, ['warm', 'business', 'distant', 'frustrated'], 'business'),
    recommended_approach: typeof j.recommended_approach === 'string' ? j.recommended_approach.slice(0, 300) : '',
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

function formatProfileForPrompt(profile) {
  if (!profile) return '';
  const lines = [];
  lines.push(`[고객 프로필 — ${profile.total_inquiries}회 문의 / ${profile.total_orders}회 주문 기반 패턴]`);
  if (profile.industry_context) lines.push(`• 배경: ${profile.industry_context}`);
  lines.push(`• 가격 민감도: ${profile.price_sensitivity} / 결정 속도: ${profile.decision_speed} / 디테일 집착도: ${profile.detail_orientation}`);
  lines.push(`• 관계 톤: ${profile.relationship_tone} / 과거 결제 이행: ${profile.past_commitments_honored}`);
  if (profile.past_topics.length) lines.push(`• 과거 주 관심: ${profile.past_topics.join(', ')}`);
  if (profile.recommended_approach) lines.push(`• 📌 권장 접근: ${profile.recommended_approach}`);
  return lines.join('\n');
}

module.exports = { getCustomerProfile, formatProfileForPrompt };
