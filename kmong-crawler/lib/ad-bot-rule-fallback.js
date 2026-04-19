/**
 * Opus 호출 불가 시 룰베이스 광고 조정
 * - 점진 +10% CPC
 * - 주 예산 × 0.8 / 7일 / 서비스수 = 일 예산
 * - 키워드 off: 서비스 제목과 무관한 일반 IT 키워드
 * - 키워드 on: 서비스 제목 핵심어 포함한 추천가 상위 2개
 */

const OFF_KEYWORDS = [
  '프로그래밍', 'it', 'IT', '개발', '프로그램', '프로그램제작',
  '소프트웨어', '시스템개발', '앱개발', '앱 제작', '어플 제작',
];

function extractCoreTerms(title) {
  if (!title) return [];
  const core = [];
  const map = {
    '홈페이지': ['홈페이지', '웹사이트', '사이트'],
    '반응형': ['반응형', '모바일 최적화', '모바일대응'],
    '모바일': ['모바일', '반응형'],
    'SEO': ['seo', 'SEO', '검색등록', '검색최적화', '네이버등록'],
    '수정': ['수정', '유지보수', '관리'],
    '깨짐': ['수정', '오류', '복구'],
  };
  for (const [key, terms] of Object.entries(map)) {
    if (title.includes(key)) core.push(...terms);
  }
  return Array.from(new Set(core));
}

function keywordMatchesCore(keyword, coreTerms) {
  const lower = keyword.toLowerCase();
  return coreTerms.some(t => lower.includes(t.toLowerCase()));
}

function ruleBasedJudge(metrics, budget) {
  const cpcMultiplier = 1.1;
  const weeklyBudget = budget.budget_type === 'weekly' ? budget.budget_amount : budget.budget_amount * 7;
  const dailyBudgetPerSvc = Math.round((weeklyBudget * 0.8 / 7) / Math.max(1, metrics.length) / 100) * 100;

  const actions = metrics.map(m => {
    const cur = m.desired_cpc || 1000;
    let suggested = Math.round(cur * cpcMultiplier / 10) * 10;
    if (budget.min_cpc != null) suggested = Math.max(suggested, budget.min_cpc);
    if (budget.max_cpc != null) suggested = Math.min(suggested, budget.max_cpc);

    const coreTerms = extractCoreTerms(m.gig_title);
    const disable = [];
    const enable = [];

    for (const kw of (m.suggested_keywords || [])) {
      const nameLower = kw.keyword.toLowerCase();
      if (OFF_KEYWORDS.some(o => nameLower === o.toLowerCase() || nameLower.includes(o.toLowerCase()))) {
        if (disable.length < 3) disable.push(kw.keyword);
      } else if (keywordMatchesCore(kw.keyword, coreTerms) && kw.suggested_cpc <= suggested * 2) {
        if (enable.length < 3) enable.push(kw.keyword);
      }
    }

    const change_pct = cur > 0 ? +(((suggested - cur) / cur) * 100).toFixed(1) : 0;
    return {
      product_id: m.product_id,
      gig_title: m.gig_title,
      current_desired_cpc: cur,
      suggested_desired_cpc: suggested,
      change_pct,
      suggested_daily_budget: dailyBudgetPerSvc,
      week_cost: m.week_cost || 0,
      keywords_to_enable: enable,
      keywords_to_disable: disable,
      priority: 3,
      confidence: 'rule-based',
      reasoning: `룰베이스: CPC +10% 점진, 일예산 ${dailyBudgetPerSvc}원 (주 ${weeklyBudget}×0.8/7/${metrics.length}), 타겟 외 ${disable.length}개 off, 타겟 ${enable.length}개 on`,
    };
  });

  return {
    actions,
    overall_note: `룰베이스 조정 (Opus 한도 우회): 일 ${dailyBudgetPerSvc}원/서비스 · 주 ${weeklyBudget}원 예산, +10% 점진 클릭 확보`,
  };
}

module.exports = { ruleBasedJudge };
