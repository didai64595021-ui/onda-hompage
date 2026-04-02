/**
 * 크몽 Phase 2 — 분석 로직 모듈
 * 퍼널 분석, 병목 진단, ROI 계산, 이상치 감지, 비즈머니 예측, AI 추천
 */

const { supabase } = require('./supabase');

/**
 * 날짜 범위 헬퍼 (오늘 기준 N일 전 ~ 어제)
 */
function getDateRange(days) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/**
 * 퍼널 분석 (CTR → 문의율 → 결제율)
 * @param {string|null} productId - null이면 전체
 * @param {number} days - 분석 기간 (일)
 */
async function analyzeFunnel(productId, days = 1) {
  const { start, end } = getDateRange(days);

  // CPC 데이터
  let cpcQuery = supabase
    .from('kmong_cpc_daily')
    .select('*')
    .gte('date', start)
    .lte('date', end);
  if (productId) cpcQuery = cpcQuery.eq('product_id', productId);
  const { data: cpcData } = await cpcQuery;

  // 문의 데이터
  let inqQuery = supabase
    .from('kmong_inquiries')
    .select('*')
    .gte('inquiry_date', start + 'T00:00:00')
    .lte('inquiry_date', end + 'T23:59:59');
  if (productId) inqQuery = inqQuery.eq('product_id', productId);
  const { data: inqData } = await inqQuery;

  // 주문 데이터
  let ordQuery = supabase
    .from('kmong_orders')
    .select('*')
    .gte('order_date', start)
    .lte('order_date', end)
    .neq('status', '취소');
  if (productId) ordQuery = ordQuery.eq('product_id', productId);
  const { data: ordData } = await ordQuery;

  const impressions = (cpcData || []).reduce((s, r) => s + (r.impressions || 0), 0);
  const clicks = (cpcData || []).reduce((s, r) => s + (r.clicks || 0), 0);
  const adCost = (cpcData || []).reduce((s, r) => s + (r.cpc_cost || 0), 0);
  const inquiries = (inqData || []).length;
  const orders = (ordData || []).filter(o => o.status === '거래완료' || o.status === '진행중').length;
  const revenue = (ordData || []).reduce((s, r) => s + (r.amount || 0), 0);

  const ctr = impressions > 0 ? (clicks / impressions * 100) : 0;
  const inquiryRate = clicks > 0 ? (inquiries / clicks * 100) : 0;
  const payRate = inquiries > 0 ? (orders / inquiries * 100) : 0;

  return {
    productId,
    period: { start, end, days },
    impressions,
    clicks,
    ctr: parseFloat(ctr.toFixed(2)),
    adCost,
    inquiries,
    inquiryRate: parseFloat(inquiryRate.toFixed(2)),
    orders,
    payRate: parseFloat(payRate.toFixed(2)),
    revenue,
  };
}

/**
 * 병목 위치 판단
 */
function detectBottleneck(funnelData) {
  const { ctr, inquiryRate, payRate } = funnelData;

  if (ctr < 1) {
    return {
      level: 'critical',
      emoji: '🔴',
      stage: '클릭 전',
      message: '썸네일/타이틀 변경 필요',
      detail: `CTR ${ctr}% (기준 1% 미만)`,
    };
  }

  if (inquiryRate < 5) {
    return {
      level: 'warning',
      emoji: '🟡',
      stage: '상세페이지',
      message: '상세페이지 개선 필요',
      detail: `문의율 ${inquiryRate}% (기준 5% 미만)`,
    };
  }

  if (payRate < 20) {
    return {
      level: 'warning',
      emoji: '🟡',
      stage: '결제',
      message: '가격/신뢰 문제',
      detail: `결제율 ${payRate}% (기준 20% 미만)`,
    };
  }

  return {
    level: 'ok',
    emoji: '🟢',
    stage: '정상',
    message: '정상',
    detail: `CTR ${ctr}% → 문의 ${inquiryRate}% → 결제 ${payRate}%`,
  };
}

/**
 * ROI 계산
 */
async function calculateROI(productId, days = 1) {
  const funnel = await analyzeFunnel(productId, days);
  const { revenue, adCost } = funnel;
  const roi = adCost > 0 ? ((revenue - adCost) / adCost * 100) : 0;
  const cpa = funnel.orders > 0 ? Math.round(adCost / funnel.orders) : 0;

  return {
    ...funnel,
    roi: parseFloat(roi.toFixed(2)),
    cpa,
  };
}

/**
 * 이상치 감지 (전일 대비 50%+ 변동)
 */
async function detectAnomalies() {
  const yesterday = getDateRange(1);
  const dayBefore = getDateRange(2);

  const { data: ydData } = await supabase
    .from('kmong_cpc_daily')
    .select('*')
    .eq('date', yesterday.end);

  const { data: dbData } = await supabase
    .from('kmong_cpc_daily')
    .select('*')
    .eq('date', dayBefore.start);

  const anomalies = [];
  const ydMap = {};
  (ydData || []).forEach(r => { ydMap[r.product_id] = r; });

  for (const prev of (dbData || [])) {
    const curr = ydMap[prev.product_id];
    if (!curr) continue;

    // CTR 급변
    if (prev.ctr > 0) {
      const ctrChange = ((curr.ctr - prev.ctr) / prev.ctr * 100);
      if (Math.abs(ctrChange) >= 50) {
        anomalies.push({
          productId: prev.product_id,
          metric: 'CTR',
          prev: prev.ctr,
          curr: curr.ctr,
          changePercent: parseFloat(ctrChange.toFixed(1)),
          direction: ctrChange > 0 ? '급등' : '급락',
        });
      }
    }

    // 비용 급변
    if (prev.cpc_cost > 0) {
      const costChange = ((curr.cpc_cost - prev.cpc_cost) / prev.cpc_cost * 100);
      if (Math.abs(costChange) >= 50) {
        anomalies.push({
          productId: prev.product_id,
          metric: '광고비',
          prev: prev.cpc_cost,
          curr: curr.cpc_cost,
          changePercent: parseFloat(costChange.toFixed(1)),
          direction: costChange > 0 ? '급증' : '급감',
        });
      }
    }
  }

  return anomalies;
}

/**
 * 비즈머니 고갈일 예측
 * @param {number} balance - 현재 잔액
 * @param {number} dailyAvgSpend - 일평균 소진량
 */
function predictBizMoney(balance, dailyAvgSpend) {
  if (dailyAvgSpend <= 0) return { daysLeft: 999, depleteDate: null };
  const daysLeft = Math.floor(balance / dailyAvgSpend);
  const depleteDate = new Date();
  depleteDate.setDate(depleteDate.getDate() + daysLeft);
  return {
    daysLeft,
    depleteDate: depleteDate.toISOString().split('T')[0],
  };
}

/**
 * AI 추천 액션 생성
 */
function generateRecommendations(serviceAnalyses) {
  const recs = [];

  for (const sa of serviceAnalyses) {
    const bottleneck = detectBottleneck(sa);
    if (bottleneck.level === 'ok') continue;

    if (bottleneck.stage === '클릭 전') {
      recs.push(`"${sa.productId}" 썸네일 변경 제안 (현재 CTR ${sa.ctr}%)`);
    } else if (bottleneck.stage === '상세페이지') {
      recs.push(`"${sa.productId}" 상세페이지 가격표 추가 제안 (문의율 ${sa.inquiryRate}%)`);
    } else if (bottleneck.stage === '결제') {
      recs.push(`"${sa.productId}" 리뷰/포트폴리오 강화 제안 (결제율 ${sa.payRate}%)`);
    }
  }

  return recs;
}

/**
 * 전체 서비스별 분석 실행
 */
async function analyzeAllServices(days = 1) {
  const { PRODUCT_MAP } = require('./product-map');
  const results = [];

  for (const product of PRODUCT_MAP) {
    const funnel = await calculateROI(product.id, days);
    if (funnel.impressions > 0 || funnel.inquiries > 0 || funnel.orders > 0) {
      results.push(funnel);
    }
  }

  return results;
}

module.exports = {
  analyzeFunnel,
  detectBottleneck,
  calculateROI,
  detectAnomalies,
  predictBizMoney,
  generateRecommendations,
  analyzeAllServices,
  getDateRange,
};
