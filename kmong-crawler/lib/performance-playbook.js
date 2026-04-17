/**
 * 크몽 답변 봇 — 실적 기반 전환 후킹 playbook
 *  - funnel-insights.json (analyze-conversion-funnel.js 가 생성) 을 읽어
 *    각 전환 단계(CTR → CVR → 결제 CVR → ROI/ROAS) 상위 서비스의 후킹 공식을 프롬프트에 주입
 *  - "이 의도/업종엔 이 후킹이 실제 데이터로 통했다"는 근거 가이드 제공
 *
 *  공통 후킹 공식 (실측 기반):
 *   - CTR 극대화 (노출→클릭): 타겟 호명 + Pain point 직격 + 시간 보증
 *   - CVR 극대화 (클릭→문의): 범위 명시 + 원스톱 + 전문성
 *   - 결제 CVR: 구체 견적 + 포트폴리오 + 보장
 *   - ROI 극대화: 고단가 B2B or 회전율 극대화 저단가
 */
const fs = require('fs');
const path = require('path');

const INSIGHTS_PATH = path.join(__dirname, '..', 'funnel-insights.json');
const CACHE_TTL = 10 * 60 * 1000;  // 10분
let cache = { at: 0, data: null };

function loadInsights() {
  if (cache.data && (Date.now() - cache.at) < CACHE_TTL) return cache.data;
  try {
    const data = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf-8'));
    cache = { at: Date.now(), data };
    return data;
  } catch { return null; }
}

/**
 * 현재 intent/서비스에 맞는 funnel 성공 패턴 가이드 생성
 *  - 전체 상위 서비스 나열 대신, "이 의도/가격대에 유효한" 패턴만 선별
 */
function getPlaybookForContext({ intent, serviceTitle = '', productId = '' }) {
  const insights = loadInsights();
  if (!insights) return null;

  const primary = intent?.primary_intent || '';
  const urgency = intent?.urgency || 'low';
  const facts = (intent?.customer_facts || []).join(' ');
  const fullContext = `${serviceTitle} ${facts}`.toLowerCase();

  // 1) 후킹 공식 (CTR) — 노출→클릭 전환 잘 된 케이스 참고
  const ctrLeaders = (insights.leaders?.ctr || []).slice(0, 3);
  // 2) 문의 전환 (CVR) — 클릭→문의 잘 된 케이스
  const cvrLeaders = (insights.leaders?.cvr_click_to_inq || []).slice(0, 3);
  // 3) 결제 전환 — 문의→주문 잘 된 케이스 (답변 멘트 근거)
  const orderLeaders = (insights.leaders?.cvr_inq_to_order || []).slice(0, 3);
  // 4) ROI/매출 — 가격 근거, 이 가격대가 실제 수익으로 이어짐
  const roiLeaders = (insights.leaders?.roi || []).slice(0, 3);
  const revenueLeaders = (insights.leaders?.revenue || []).slice(0, 3);

  // 같은 product_id 가 상위권이면 우선 강조 (본인 상품 성과)
  const isSelfInTop = [ctrLeaders, cvrLeaders, roiLeaders].flat().some(l => l.product_id === productId);

  // [Phase 8A] 신규 지표 — 추세·소재변경·패키지·시간대
  const selfRow = productId ? insights.rows?.find(r => r.product_id === productId) : null;
  const selfTrend = selfRow?.trend;
  const pkgPref = selfRow?.package_preference;
  const creativeWins = (insights.creative_impact?.wins || []).slice(0, 3);
  const topRising = (insights.trends?.rising || []).slice(0, 2);
  const hoursTop = (insights.hour_performance || []).slice(0, 3);

  return {
    ctrLeaders, cvrLeaders, orderLeaders, roiLeaders, revenueLeaders,
    isSelfInTop,
    selfTrend, pkgPref, creativeWins, topRising, hoursTop,
    generated_at: insights.generated_at,
  };
}

/**
 * Claude 프롬프트에 주입할 블록
 *  - 답변 작성 시 이 데이터를 근거로 "실제 통한 후킹 문구" 차용 가능
 */
function formatPlaybookForPrompt(pb) {
  if (!pb) return '';
  const lines = [];
  lines.push('[실적 기반 전환 후킹 playbook — 우리 서비스 실측 데이터]');

  // CTR 후킹 공식 (노출→클릭)
  if (pb.ctrLeaders.length) {
    lines.push(`\n• 후킹(CTR) 상위 서비스 — 어떤 제목이 클릭됐나:`);
    pb.ctrLeaders.forEach(r => lines.push(`    - "${r.title}" → CTR ${r.ctr}%`));
    lines.push(`    → 공식: 타겟 호명 + pain point 직격 + 시간 보증 (예 "24시간", "당일", "3일")`);
  }

  // 클릭→문의 CVR (답변에서 참고할 멘트 구조)
  if (pb.cvrLeaders.length) {
    lines.push(`\n• 클릭→문의 CVR 상위 — 어떤 제목이 문의로 전환됐나:`);
    pb.cvrLeaders.forEach(r => lines.push(`    - "${r.title}" → ${r.cvr_click_to_inq}%`));
    lines.push(`    → 공식: 범위 명시("디자인부터 SEO까지") + 원스톱 + 전문성 어필`);
  }

  // 문의→결제 CVR
  if (pb.orderLeaders.length) {
    lines.push(`\n• 문의→결제 CVR 상위 — 결제까지 이어진 서비스:`);
    pb.orderLeaders.forEach(r => lines.push(`    - "${r.title}" → 결제율 ${r.cvr_inq_to_order}%`));
    lines.push(`    → 답변에 녹일 요소: 구체 견적 숫자 + 포트폴리오 언급 + 수정 무제한 보장`);
  }

  // ROI — 가격대별 수익성
  if (pb.roiLeaders.length) {
    lines.push(`\n• ROI 상위 — 수익 가장 잘 낸 서비스:`);
    pb.roiLeaders.forEach(r => lines.push(`    - "${r.title}" → ROI ${r.roi}% / 매출 ${(r.revenue / 10000).toFixed(0)}만원`));
  }
  // 매출 상위 (가격대 근거)
  if (pb.revenueLeaders.length) {
    lines.push(`\n• 매출 상위 — 가격대 제시할 때 근거:`);
    pb.revenueLeaders.forEach(r => lines.push(`    - "${r.title}" → 누적 매출 ${(r.revenue / 10000).toFixed(0)}만원`));
  }

  if (pb.isSelfInTop) {
    lines.push(`\n✨ 현재 문의 서비스가 상위권에 있음 — "이미 결제 실적 있는 상품"이라는 신뢰 포인트 자연스럽게 노출 (단, 구체 숫자 과장 금지)`);
  }

  // [Phase 8A] 추세·소재·패키지·시간대 인사이트
  if (pb.selfTrend && pb.selfTrend.ctr_change_pct != null) {
    const dir = pb.selfTrend.ctr_change_pct >= 0 ? '🔺 상승' : '🔻 하락';
    lines.push(`\n• 본 서비스 14일 추세: ${dir} ${pb.selfTrend.ctr_change_pct}% (${pb.selfTrend.prev_ctr}% → ${pb.selfTrend.recent_ctr}%)`);
    if (pb.selfTrend.ctr_change_pct < -10) lines.push(`    → 최근 유입 둔화 감지 — 답변에서 답변 속도/전문성 더 강조 필요`);
  }
  if (pb.pkgPref && Object.keys(pb.pkgPref).length) {
    const sorted = Object.entries(pb.pkgPref).sort((a, b) => b[1] - a[1]);
    const topPkg = sorted[0];
    lines.push(`\n• 본 서비스 결제 패키지 선호: ${sorted.map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' / ')}`);
    lines.push(`    → 견적 안내 시 ${topPkg[0]} 패키지를 "가장 많이 선택하세요" 문구로 자연 유도`);
  }
  if (pb.creativeWins.length) {
    lines.push(`\n• 최근 소재 변경 성공 사례 — 어떤 변경이 CTR을 올렸나:`);
    pb.creativeWins.forEach(c => lines.push(`    - "${(c.title || '').slice(0, 35)}" ${c.type} 변경 → CTR ${c.before_ctr}% → ${c.after_ctr}% (+${c.impact_pct}%)`));
  }
  if (pb.topRising.length) {
    lines.push(`\n• 최근 상승세 서비스:`);
    pb.topRising.forEach(r => lines.push(`    - "${(r.title || '').slice(0, 35)}" +${r.trend.ctr_change_pct}%`));
  }
  if (pb.hoursTop.length) {
    const top = pb.hoursTop.map(h => `${h.hour}시(${h.inquiries})`).join(' · ');
    lines.push(`\n• 문의 집중 시간대: ${top}`);
    lines.push(`    → 답변은 해당 시간대에 맞춰 즉각 반응이 가장 효율적`);
  }

  lines.push(`\n⚠️ 답변 작성 지침:
  - 위 패턴 문구(예: "24시간 안에", "원스톱", "3일 완성")을 **고객 맥락에 맞게** 1~2개 자연스럽게 사용
  - 패턴을 그대로 붙여쓰면 안 됨 — 고객 사실(facts)과 섞어 개인화
  - 구체 매출/ROI 숫자를 답변에 직접 인용하지 말 것 (내부 데이터)`);

  return lines.join('\n');
}

module.exports = { getPlaybookForContext, formatPlaybookForPrompt, loadInsights };
