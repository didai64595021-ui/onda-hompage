#!/usr/bin/env node
/**
 * market-research-{ts}.json을 읽어서 업종별 분석 + 텔레그램 보고서 생성
 * 사용: node market-research-analyze.js <report-file.json>
 */
const fs = require('fs');
const path = require('path');

const reportFile = process.argv[2];
if (!reportFile) {
  console.error('Usage: node market-research-analyze.js <report.json>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(reportFile, 'utf-8'));
const kws = data.keywords;

const rows = Object.values(kws).filter(r => !r.error && r.priceStats);

// 평균가 Top5
const byAvgPrice = [...rows].sort((a, b) => b.priceStats.avg - a.priceStats.avg).slice(0, 5);
// 리뷰 합계 Top5 (거래량 근사)
const byTotalReviews = [...rows].sort((a, b) => b.totalReviews - a.totalReviews).slice(0, 5);
// 기회 점수 Top5
const byOpportunity = [...rows].sort((a, b) => (b.opportunity || 0) - (a.opportunity || 0)).slice(0, 5);
// 경쟁 낮음(카드 적음) + 단가 높음 — 니치 기회
const byNiche = [...rows]
  .filter(r => r.totalCards <= 15 && r.priceStats.avg >= 300000)
  .sort((a, b) => b.priceStats.avg - a.priceStats.avg);

// 전체 통계
const allAvg = Math.round(rows.reduce((s, r) => s + r.priceStats.avg, 0) / rows.length);
const allReviews = rows.reduce((s, r) => s + r.totalReviews, 0);
const totalGigs = rows.reduce((s, r) => s + r.totalCards, 0);
const dataMissing = Object.values(kws).filter(r => r.error || !r.priceStats);

function fmt(n) {
  if (!n) return '-';
  if (n >= 10000) return Math.round(n / 10000) + '만';
  return n + '원';
}

// ============ 메시지 1: 조사 방법 + 전체 요약 ============
const msg1 = `[크몽 홈페이지 시장조사 — 보고 1/4]
조사 방법

대상: 20개 키워드 (업종 15 + 기능 5)
방법: kmong.com/search?keyword=... 검색 결과 상위 20개 gig 실측 파싱
데이터: 제목/시작가/총 리뷰수/평점/셀러
일시: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}

전체 통계
- 수집 gig 수: ${totalGigs}개 (20키워드 × 평균 ${(totalGigs/rows.length).toFixed(1)})
- 전체 평균 시작가: ${fmt(allAvg)}
- 업종별 총 리뷰수 합계: ${allReviews.toLocaleString()}건
- 데이터 누락 업종: ${dataMissing.length}개 ${dataMissing.length ? '('+dataMissing.map(d=>d.key).join(',')+')' : ''}

관찰 요약
- 단가 편차 큼: 19만~110만 (5.8배)
- 리뷰 집중도 상위3 = ${Math.min(...rows.map(r=>r.top3ShareOfReviews*100)).toFixed(0)}~${Math.max(...rows.map(r=>r.top3ShareOfReviews*100)).toFixed(0)}% (대부분 독점 구조)
- 경쟁 강도: 파워링크/모바일/반응형 20건 정체 → 공방/공장 10~13건 (니치 여지)`;

// ============ 메시지 2: Top5 3종 ============
function top5Block(title, rows, valueFn, valueLabel) {
  return [title].concat(rows.map((r, i) =>
    `${i+1}. ${r.cat} (${r.q}) — ${valueLabel}: ${valueFn(r)}`
  )).join('\n');
}

const msg2 = `[크몽 홈페이지 시장조사 — 보고 2/4]
업종별 Top5

단가 Top5 (평균 시작가)
${byAvgPrice.map((r,i)=>`${i+1}. ${r.cat} — ${fmt(r.priceStats.avg)} (중앙${fmt(r.priceStats.median)}, 범위 ${fmt(r.priceStats.min)}~${fmt(r.priceStats.max)})`).join('\n')}

볼륨 Top5 (총 리뷰수 = 거래량 근사치)
${byTotalReviews.map((r,i)=>`${i+1}. ${r.cat} — ${r.totalReviews.toLocaleString()}건 (상위3 독식 ${(r.top3ShareOfReviews*100).toFixed(0)}%)`).join('\n')}

기회 Top5 (평균단가 × 총리뷰수 / 경쟁gig수)
${byOpportunity.map((r,i)=>`${i+1}. ${r.cat} — ${(r.opportunity/10000).toFixed(0)}만 (${fmt(r.priceStats.avg)} × ${r.totalReviews}리뷰 / ${r.totalCards}gig)`).join('\n')}

저경쟁 + 고단가 니치 (gig ≤15 & 평균 ≥30만)
${byNiche.length ? byNiche.map((r,i)=>`${i+1}. ${r.cat} — ${fmt(r.priceStats.avg)} / ${r.totalCards}gig / ${r.totalReviews}리뷰`).join('\n') : '해당 없음'}`;

// ============ 메시지 3: 양산 전략 제안 ============
// 현실적 계산: 신규 진입 gig가 상위3을 뚫지 못하면, 나머지 리뷰 (총-상위3)를 경쟁gig로 나눠먹는 구조
const realistic = byOpportunity.map(r => {
  const remainingReviews = r.totalReviews - r.top3Reviews;
  const remainingGigs = Math.max(r.totalCards - 3, 1);
  const perGigReviews = remainingReviews / remainingGigs;
  // 리뷰 1건 ≈ 거래 1건 (리뷰율은 리뷰 / 거래 ≈ 30~50%로 통상), 역산 시 ×2~3 보수적 ×2.5
  const estDealsPerGig = Math.round(perGigReviews * 2.5);
  const estRevenuePerGig = Math.round(estDealsPerGig * r.priceStats.median); // 중앙값 기준
  return {
    cat: r.cat,
    q: r.q,
    estDealsPerGig,
    estRevenuePerGig,
    medianPrice: r.priceStats.median,
    remainingGigs,
    remainingReviews,
  };
});

const totalEstMonthly = realistic.reduce((s, r) => s + r.estRevenuePerGig, 0);
// 주의: 위는 "누적 총" (그 gig의 전 기간 리뷰 기반). 월매출 환산은 추가 가정 필요.
// 크몽 평균 gig 운영기간 가정 12~24개월 → ÷18 보수적
const monthlyPerGig = realistic.map(r => ({
  ...r,
  estMonthlyRevenue: Math.round(r.estRevenuePerGig / 18),
}));
const monthlyTotal = monthlyPerGig.reduce((s, r) => s + r.estMonthlyRevenue, 0);

const msg3 = `[크몽 홈페이지 시장조사 — 보고 3/4]
업종 양산 시 현실적 수치 (실측 기반)

핵심 가정
- 신규 gig는 상위3 독점 구조를 단기 돌파 불가
- "나머지 리뷰"를 중하위 경쟁 gig로 나눠먹는 구조로 환산
- 리뷰 1건 ≈ 거래 2.5건 (리뷰 작성률 30~50% 역산, 보수적)
- gig 평균 누적 운영 18개월 가정 → 월매출 환산

기회 Top5 업종 — 신규 gig 1개 기준 예상 월매출

${monthlyPerGig.map((r,i)=>`${i+1}. ${r.cat} (${r.q})\n   - 중앙 단가 ${fmt(r.medianPrice)}, 중하위 ${r.remainingGigs}개가 ${r.remainingReviews}리뷰 공유\n   - 예상 월매출: ${(r.estMonthlyRevenue/10000).toFixed(0)}만원/월 (누적 ${(r.estRevenuePerGig/10000).toFixed(0)}만)`).join('\n')}

5개 업종 합계: 월 ${(monthlyTotal/10000).toFixed(0)}만원 (누적 ${(totalEstMonthly/10000).toFixed(0)}만)

현재 셀러 4 gig 월 270만 / ROAS 600% 대비
- 단일 메인 gig 평균 ~67만/월 달성 중
- 기회 Top5 업종 추가 진입 시, 업종당 ${Math.round(monthlyTotal/5/10000)}만/월 평균 기대
- **결론**: 4 gig → 9 gig 확장 시 이론치 월 ${Math.round(270 + monthlyTotal/10000)}만 (현 270 + 신규 ${Math.round(monthlyTotal/10000)})`;

// ============ 메시지 4: 데이터 한계·주의 ============
const msg4 = `[크몽 홈페이지 시장조사 — 보고 4/4]
데이터 한계·주의사항

1. 검색 결과 상위 20개 기반
   - 전체 업종 모집단이 아닌 "검색 노출 1페이지" 스냅샷
   - 크몽 랭킹 알고리즘 반영된 정렬 = 실제 시장 전체와 다를 수 있음

2. 리뷰 ≠ 거래
   - 리뷰 작성률 30~50% 추정, 환산 ×2.5는 보수적 가정
   - 고객 만족도 낮은 업종일수록 리뷰 작성률 낮음 (거래량 과소평가 가능)

3. 누적 ≠ 월매출
   - 리뷰수는 gig 전 기간 누적, 월환산은 ÷18 가정
   - 신규 등록 gig는 노출까지 3~6개월 필요, 즉시 매출 발생 X

4. 가격 데이터
   - "시작가" 기준 (STANDARD 패키지 최저가)
   - 실제 성사가는 옵션/커스텀으로 1.5~3배 가능 → 평균단가 과소평가

5. 업종 키워드 한계
   - "교회 홈페이지" 같은 특수 니치는 검색량 자체가 적어 데이터 신뢰도 낮음
   - "자영업" / "반응형" 같은 광의어는 여러 업종 혼재

6. 권장 후속 조사
   - 기회 Top5 업종 → 상위 gig 3개 상세 페이지 진입 → 옵션 단가/월 의뢰 추세 실측
   - 셀러 레벨 (프라임/레벨2 등) 필터링해 "신규 셀러 평균 매출" 재계산
   - 계절성: 4월 스냅샷 한정, 연말/연초 재수집 권장

원본 데이터
- JSON: ${path.basename(reportFile)}
- 각 업종별 상세: market-research-detail-${data.timestamp}/`;

// 메시지 길이 체크
for (const [i, m] of [msg1, msg2, msg3, msg4].entries()) {
  console.log(`\n=== 메시지 ${i+1} (${m.length}자) ===`);
  console.log(m);
  if (m.length > 4000) console.log(`⚠ 4000자 초과`);
}

// 저장
fs.writeFileSync(path.join(path.dirname(reportFile), `report-messages-${data.timestamp}.json`), JSON.stringify({
  msg1, msg2, msg3, msg4,
  byAvgPrice: byAvgPrice.map(r => ({ key: r.key, cat: r.cat, avg: r.priceStats.avg })),
  byTotalReviews: byTotalReviews.map(r => ({ key: r.key, cat: r.cat, total: r.totalReviews })),
  byOpportunity: byOpportunity.map(r => ({ key: r.key, cat: r.cat, op: r.opportunity })),
}, null, 2));
console.log('\n\n메시지 저장: report-messages-'+data.timestamp+'.json');
