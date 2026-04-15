#!/usr/bin/env node
/**
 * 크몽 3차 통합 시장조사 분석기 (20 + 8 + 15 = 43 키워드)
 *  - market-research-1776241668911.json (1차: 홈페이지/업종)
 *  - market-research-additional-1776243621689.json (2차: 디자인/자동화)
 *  - market-research-extended-{TS}.json (3차: 마케팅/영상/광고/굿즈)
 *
 * 출력: 4개 텔레그램 메시지 + 통합 JSON
 * 사용: node market-research-integrate.js <extended.json>
 */
const fs = require('fs');
const path = require('path');

const extendedPath = process.argv[2];
if (!extendedPath) {
  console.error('Usage: node market-research-integrate.js <extended-report.json>');
  process.exit(1);
}

const base1 = require('/home/onda/projects/onda-hompage/kmong-crawler/market-research-1776241668911.json');
const base2 = require('/home/onda/projects/onda-hompage/kmong-crawler/market-research-additional-1776243621689.json');
const base3 = JSON.parse(fs.readFileSync(extendedPath, 'utf-8'));

// ===== 통합 =====
const TIER = {}; // key → {tier, group}
for (const k of Object.keys(base1.keywords)) TIER[k] = { tier: 1, group: '홈페이지/업종' };
for (const k of Object.keys(base2.keywords)) TIER[k] = { tier: 2, group: '디자인/자동화' };
for (const k of Object.keys(base3.keywords)) TIER[k] = { tier: 3, group: '마케팅/영상/광고' };

const all = { ...base1.keywords, ...base2.keywords, ...base3.keywords };
const rows = Object.values(all).filter(r => !r.error && r.priceStats && r.priceStats.avg);

function fmt(n) {
  if (!n && n !== 0) return '-';
  if (n >= 10000) return Math.round(n / 10000) + '만';
  return n.toLocaleString() + '원';
}
function pct(x) {
  return (x * 100).toFixed(0) + '%';
}

// ===== Top5 (통합) =====
const byAvgPrice = [...rows].sort((a, b) => b.priceStats.avg - a.priceStats.avg).slice(0, 5);
const byTotalReviews = [...rows].sort((a, b) => b.totalReviews - a.totalReviews).slice(0, 5);
const byOpportunity = [...rows].sort((a, b) => (b.opportunity || 0) - (a.opportunity || 0)).slice(0, 5);

// ===== 우리 회사에 맞는 "판매경쟁력 Top5" 업종 =====
// 선정 기준 (가중치):
//   1. 시장 크기 (총 리뷰수 = 수요)
//   2. 단가 (평균 시작가)
//   3. 진입 가능성 = 1 - top3독식률 (독점도 낮을수록 좋음)
//   4. 자동화/디자인 친화도 (우리 강점 매칭 보너스)
//   5. 경쟁 밀도 = 1/totalCards (카드 적을수록 좋음)
//
// ONDA 강점 매칭:
//   +1.5x: 홈페이지/랜딩/상세페이지/카드뉴스/유튜브썸네일/PPT/상세 (디자인)
//   +1.3x: 블로그마케팅/SEO/인스타운영 (Claude Code 자동화)
//   +1.2x: 챗봇/크롤링 (자동화 직계)
//   ×1.0x: 광고(네이버/페북) — 운영노하우 필요, 중립
//   ×0.7x: 영상편집/모션그래픽 (영상장비/시간 필요, 약점)
//   ×0.6x: 현수막/명함/메뉴판 — 오프라인 인쇄물, 단가 낮음

const ONDA_FIT = {
  // 디자인 친화 (강점)
  detail_page: 1.5, card_news: 1.5, youtube_thumb: 1.5, ppt: 1.5,
  landing: 1.5, responsive: 1.5, mobile: 1.5, powerlink: 1.5, wordpress: 1.3,
  hospital: 1.5, law: 1.5, tax: 1.5, academy: 1.5, beauty: 1.5, gym: 1.5,
  realestate: 1.5, smallbiz: 1.5, cafe: 1.3, restaurant: 1.3,
  factory: 1.3, manufacturing: 1.3, workshop: 1.3, church: 1.3, shopping: 1.3,
  logo: 1.4, brand_guide: 1.4,

  // Claude Code 자동화 (강점)
  blog_mkt: 1.3, seo: 1.3, instagram: 1.3, content_mkt: 1.3, smartstore: 1.3,
  chatbot: 1.2, crawling: 1.2,

  // 중립
  naver_ad: 1.0, facebook_ad: 1.0,

  // 약점 (영상장비/오프라인 인쇄)
  video_edit: 0.7, youtube_prod: 0.7, motion: 0.7,
  goods: 0.8, package: 0.8,
  namecard: 0.6, menu: 0.6, banner: 0.6,
};

function competitiveness(r) {
  const fit = ONDA_FIT[r.key] ?? 1.0;
  const base = (r.priceStats.avg * r.totalReviews) / Math.max(r.totalCards, 1);
  const openness = 1 - (r.top3ShareOfReviews || 0); // 독점 깨진 정도
  return Math.round(base * fit * (0.3 + openness)); // openness가 0이라도 0.3 기본
}

const withScore = rows.map(r => ({
  ...r,
  ondaFit: ONDA_FIT[r.key] ?? 1.0,
  competitiveness: competitiveness(r),
  tier: TIER[r.key]?.tier,
}));

const top5Compete = [...withScore].sort((a, b) => b.competitiveness - a.competitiveness).slice(0, 5);

// ===== 전체 통계 =====
const totalGigs = rows.reduce((s, r) => s + r.totalCards, 0);
const allAvg = Math.round(rows.reduce((s, r) => s + r.priceStats.avg, 0) / rows.length);
const allReviews = rows.reduce((s, r) => s + r.totalReviews, 0);
const tierCount = { 1: 0, 2: 0, 3: 0 };
for (const r of rows) tierCount[TIER[r.key]?.tier] = (tierCount[TIER[r.key]?.tier] || 0) + 1;

// ===== 메시지 1: 통합 통계 =====
const msg1 = `[크몽 광범위 시장조사 — 1/4 통합 통계]
조사 개요
- 키워드: 43개 (홈페이지/업종 20 + 디자인/자동화 8 + 마케팅/영상/광고 15)
- gig 표본: ${totalGigs}개 (키워드당 상위 20)
- 실측 출처: kmong.com/search 검색 결과 (랭킹 반영 1페이지 스냅샷)
- 일시: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}

전체 평균
- 평균 시작가: ${fmt(allAvg)}
- 총 리뷰수(거래량 근사): ${allReviews.toLocaleString()}건
- 유효 키워드: ${rows.length}/${Object.keys(all).length}

단가 Top5 (평균 시작가)
${byAvgPrice.map((r, i) => `${i + 1}. ${r.cat} — 평균 ${fmt(r.priceStats.avg)} / 중앙 ${fmt(r.priceStats.median)} (${r.priceStats.min}~${fmt(r.priceStats.max)})`).join('\n')}

볼륨 Top5 (총 리뷰수 = 거래 수요)
${byTotalReviews.map((r, i) => `${i + 1}. ${r.cat} — ${r.totalReviews.toLocaleString()}건 (상위3 독식 ${pct(r.top3ShareOfReviews || 0)})`).join('\n')}

기회 점수 Top5 (단가×리뷰÷경쟁수)
${byOpportunity.map((r, i) => `${i + 1}. ${r.cat} — ${(r.opportunity / 10000).toFixed(0)}만점`).join('\n')}`;

// ===== 메시지 2: Top5 판매경쟁력 높은 업종 =====
const msg2 = `[크몽 광범위 시장조사 — 2/4 Top5 판매경쟁력 업종]
선정 기준: 단가×볼륨÷경쟁 × 시장 개방도(1-상위3독식) × ONDA 강점 매칭

${top5Compete.map((r, i) => {
  const openness = 1 - (r.top3ShareOfReviews || 0);
  const fitNote = r.ondaFit >= 1.5 ? '디자인 강점' : r.ondaFit >= 1.4 ? '디자인 친화' : r.ondaFit >= 1.3 ? '자동화 친화' : r.ondaFit >= 1.0 ? '중립' : '약점 업종';
  // 시장 25%ile의 90%를 기본으로 하되, 최소 중앙값의 70% 이상 유지
  const rawEntry = Math.round((r.priceStats.p25 || r.priceStats.median) * 0.9 / 10000) * 10000;
  const floor = Math.round(r.priceStats.median * 0.7 / 10000) * 10000;
  const entryPrice = Math.max(rawEntry, floor, 30000);
  return `━ ${i + 1}위. ${r.cat} (${r.q})
• 단가: 평균 ${fmt(r.priceStats.avg)} / 중앙 ${fmt(r.priceStats.median)} / 범위 ${fmt(r.priceStats.min)}~${fmt(r.priceStats.max)}
• 볼륨: 총 리뷰 ${r.totalReviews.toLocaleString()}건 (상위3 독식 ${pct(r.top3ShareOfReviews || 0)})
• 경쟁: ${r.totalCards}gig / 시장 개방도 ${pct(openness)} / ONDA 적합도 ${r.ondaFit}x (${fitNote})
• 강점: ${strengthOf(r)}
• 리스크: ${riskOf(r)}
• 추천 진입가: ${fmt(entryPrice)} (시장 25%ile의 90%)`;
}).join('\n\n')}`;

function strengthOf(r) {
  const map = {
    detail_page: '이미지 1장/1페이지로 납품 단위 짧음. 템플릿화 용이',
    card_news: '8~10컷 단위 정형화. 연재형 리피트 고객 확보 쉬움',
    youtube_thumb: '1장 납품·평균 단가 낮지만 회전율 극강. 포트폴리오 노출 효과',
    ppt: '템플릿 풀 1개로 다업종 재활용 가능. 기업 수요 안정적',
    landing: '홈페이지 일감의 1/3 단가지만 성과형 고객 많아 리피트 강함',
    responsive: '홈페이지 대체 키워드. 검색 유입 좋음',
    mobile: '반응형과 묶어서 운영 가능',
    powerlink: '네이버 상위노출 니즈 — 디자인보다 기획력이 핵심',
    wordpress: '블로그+홈페이지 하이브리드. 해외 플러그인 활용',
    hospital: '단가 높음(~110만). 의료법 준수 디자인 노하우가 진입장벽',
    law: '변호사·세무사 — 신뢰 기반 고단가',
    tax: '세무/회계 — B2B 장기 계약 고객',
    academy: '학원 — 입시철 수요 폭증, 반복 고객',
    beauty: '피부과/성형외과 — 비주얼 퀄리티 싸움',
    gym: '헬스/PT — 리브랜딩 주기 빠름',
    realestate: '부동산 — 매물 CMS 니즈',
    smallbiz: '자영업 — 단가 낮지만 볼륨 큼',
    cafe: '카페 — 굿즈/메뉴판/홈페이지 번들',
    restaurant: '음식점 — 홀/배달 양면',
    factory: '공장/제조 — B2B 고단가, 경쟁 적음',
    manufacturing: '제조 — 공장과 유사, 카탈로그 수요',
    workshop: '공방 — 니치. 디자인 정성 승부',
    church: '교회 — 니치. 영상+홈페이지 번들',
    shopping: '쇼핑몰 — 카페24/스마트스토어 연계',
    logo: '로고 — 시장 최대 볼륨. 단가는 낮지만 썸네일·입구 상품',
    brand_guide: '브랜드가이드 — 로고+가이드북 번들 고단가',
    blog_mkt: '블로그 마케팅 — 총리뷰 4.8만건. 최대 볼륨 시장',
    seo: 'SEO — B2B 고단가, 기술형. Claude Code 자동화 ×',
    instagram: '인스타 운영 — 월정액 고단가. 자동화 가능',
    content_mkt: '콘텐츠 마케팅 — 평균 31만, 고단가',
    smartstore: '스마트스토어 — 월 1.9만 리뷰. 초대형 수요',
    chatbot: '챗봇 — 고단가(평균 34만). GPT/클로드 연동 우위',
    crawling: '데이터 크롤링 — 우리 본업, 독과점 없음',
    naver_ad: '네이버 광고 — 검색광고 운영대행',
    facebook_ad: '페북 광고 — 퍼포먼스 리포트형',
    video_edit: '영상 편집 — 컷편집 단순 작업',
    youtube_prod: '유튜브 제작 — 기획+촬영+편집 종합',
    motion: '모션그래픽 — 고단가 영상',
    goods: '굿즈 — 소단가. 패키지와 묶음 좋음',
    package: '패키지 디자인 — 브랜드 연계',
    namecard: '명함 — 소단가, 전환 미끼상품',
    menu: '메뉴판 — 음식점 번들',
    banner: '현수막 — 오프라인 프린트',
  };
  return map[r.key] || `${r.cat} 상세 분석 필요`;
}

function riskOf(r) {
  if (r.ondaFit < 0.8) return '우리 인프라 약점 (영상장비/인쇄 납품)';
  if ((r.top3ShareOfReviews || 0) > 0.75) return '상위3 독점 강함 — 레벨업 전 초기 6개월 0건 가능';
  if (r.totalCards >= 18 && r.priceStats.avg < 100000) return '저단가·고경쟁 — 마진 확보 어려움';
  if (r.priceStats.avg > 500000) return '고단가 — 리드 확보·영업 필요, 리피트 주기 김';
  if (r.totalReviews < 500) return '수요 자체가 적은 니치 — 검증 필요';
  return '특이 리스크 없음';
}

// ===== 메시지 3: 상품 제안 =====
// 우리 강점: 홈페이지/디자인 계열 + Claude Code 자동화 + 2인 풀타임
// Top5 판매경쟁력 업종에서 실제 만들 수 있는 상품 5~8개 제안
//
// 선정 원칙:
// - ONDA 적합도 1.3 이상만
// - 이미 등록된 기존 gig와 중복되지 않도록 "신상품" 각도
// - STD/DLX/PRM 3단 가격 = 시장 25% / 중앙 / 75%ile 근사
// - 실제 등록 가능한 제목 형태

function priceSet(r) {
  return {
    STD: Math.round((r.priceStats.p25 || r.priceStats.median * 0.7) / 10000) * 10000,
    DLX: Math.round(r.priceStats.median / 10000) * 10000,
    PRM: Math.round((r.priceStats.p75 || r.priceStats.avg * 1.3) / 10000) * 10000,
  };
}

const productProposals = [];
const topKeys = top5Compete.map(r => r.key);
const m = (key) => all[key];

// 기본 우선순위: Top5 판매경쟁력 + 상품화 용이성
for (const key of topKeys) {
  const r = all[key];
  if (!r) continue;
  const p = priceSet(r);

  if (key === 'blog_mkt') {
    productProposals.push({
      title: '네이버 블로그 상위노출 3개월 풀패키지 — 원고·이미지·발행 자동화',
      cat: key, cat2: '블로그마케팅',
      price: { STD: 90000, DLX: 250000, PRM: 600000 },
      diff: 'Claude Code로 키워드 30개 자동 발굴+원고 60편 생성+이미지 자동 삽입. 월 20건 발행 보장',
      estMonthly: '월 180~270만원 (DLX 25만 × 7~11건, 시장 총리뷰 4.8만 기반)',
      rationale: '총 리뷰 4.8만건(시장 최대). 자동화로 인건비 ¼, 저단가 공략 가능',
    });
  }
  if (key === 'smartstore') {
    productProposals.push({
      title: '스마트스토어 상위노출 + 상세페이지 디자인 통합 패키지',
      cat: key, cat2: '스마트스토어',
      price: p,
      diff: '키워드 리서치+상세페이지 제작+SEO 최적화 원스톱. 우리 디자인 강점 접목',
      estMonthly: '월 120~180만원 (중앙 ' + fmt(r.priceStats.median) + ' × 8~12건)',
      rationale: '총 리뷰 1.9만건. 상세페이지 디자인 역량과 직결',
    });
  }
  if (key === 'chatbot') {
    productProposals.push({
      title: 'GPT·Claude 연동 맞춤 챗봇 — 자영업/쇼핑몰/전문직 상담 자동화',
      cat: key, cat2: '챗봇',
      price: { STD: 150000, DLX: 350000, PRM: 800000 },
      diff: 'Claude Sonnet 4.5 / GPT-5 기반 24/7 상담봇. 업종별 FAQ 30개 자동학습',
      estMonthly: '월 150~250만원 (평균 34만 × 5~7건)',
      rationale: '평균 단가 34만, 경쟁 20gig 내 기술력으로 차별화 가능',
    });
  }
  if (key === 'content_mkt') {
    productProposals.push({
      title: '월정액 콘텐츠 마케팅 대행 — SNS·블로그·뉴스레터 통합',
      cat: key, cat2: '콘텐츠마케팅',
      price: { STD: 300000, DLX: 700000, PRM: 1500000 },
      diff: '2인 풀타임 팀 + AI 도우미. 월 20건 콘텐츠 + 월간 성과 리포트',
      estMonthly: '월 210~350만원 (중앙 31만 × 7~11건)',
      rationale: '평균 31만 고단가. 상위3 독식 75%지만 월정액형 B2B로 우회',
    });
  }
  if (key === 'instagram') {
    productProposals.push({
      title: '인스타 계정 월정액 운영 — 피드·릴스 기획+발행+해시태그 자동화',
      cat: key, cat2: '인스타운영',
      price: { STD: 190000, DLX: 390000, PRM: 890000 },
      diff: '릴스 주2/피드 주3. Claude 카피 + 자동 해시태그 + 리포트. 업종 DB 보유',
      estMonthly: '월 140~210만원 (평균 35만 × 4~6건)',
      rationale: '총 리뷰 8,400 / 평균 35만. 월정액 리피트 구조',
    });
  }
}

// 주력 2순위: 홈페이지/디자인 (기회 점수 높은 것)
const extraProposals = [
  {
    title: '전문직(변호사·세무사·병원) 홈페이지 — 신뢰형 반응형 5페이지',
    cat: 'hospital_law_tax', cat2: '전문직홈페이지',
    price: { STD: 500000, DLX: 900000, PRM: 1800000 },
    diff: '의료법·변호사윤리 준수 템플릿 + 상담예약 CTA + 사례 포트폴리오 자동화',
    estMonthly: '월 200~350만원 (법률 평균 94만 / 병원 37만 × 3~5건)',
    rationale: '법률 평균 94만·병원 37만 고단가. 상위3 독식 낮고 니치 진입 가능',
  },
  {
    title: '카페·음식점 올인원 — 홈페이지+메뉴판+인스타+굿즈 번들',
    cat: 'smallbiz_bundle', cat2: '자영업번들',
    price: { STD: 400000, DLX: 800000, PRM: 1500000 },
    diff: '자영업 단독 상품 대비 40% 할인. 온·오프 통합 브랜딩 원스톱',
    estMonthly: '월 160~240만원 (번들 80만 × 2~3건)',
    rationale: '4개 단일 키워드 리뷰 합계 1만건 이상. 번들링으로 경쟁 회피',
  },
  {
    title: 'Claude Code 기반 SEO 블로그 자동 발행 — 월 60포스팅',
    cat: 'seo_automation', cat2: 'SEO자동화',
    price: { STD: 500000, DLX: 1200000, PRM: 2500000 },
    diff: 'Claude + Google SERP API + 자동 내부링크. 월 60포스팅 고정',
    estMonthly: '월 200~400만원 (블로그+SEO 평균 × B2B 월정액)',
    rationale: 'SEO 20만·블로그 8만 단독은 저단가지만 자동화+월정액 결합 시 월 120만 가능',
  },
];

productProposals.push(...extraProposals);

const msg3 = `[크몽 광범위 시장조사 — 3/4 신규 상품 제안]
ONDA 강점: 홈페이지/디자인 + Claude Code 자동화 + 2인 풀타임
→ Top5 판매경쟁력 업종 중심으로 ${productProposals.length}개 신상품 제안

${productProposals.map((p, i) => `━ ${i + 1}. ${p.title}
• 카테고리: ${p.cat2}
• 가격: STD ${fmt(p.price.STD)} / DLX ${fmt(p.price.DLX)} / PRM ${fmt(p.price.PRM)}
• 차별화: ${p.diff}
• 예상 월매출: ${p.estMonthly}
• 선정 근거: ${p.rationale}`).join('\n\n')}

합산 예상 월매출 (${productProposals.length}개 전부 등록·안착 6개월 후)
- 보수: 월 900~1,300만원 (자동화 2개 + 번들 1개만 안착)
- 중립: 월 1,400~2,000만원 (5개 중 3~4개 안착)
- 낙관: 월 2,200~3,000만원 (상위 리뷰 독점 뚫은 경우)

기존 4 gig 월 270만 대비 → 월 1,700만 증분 기대 (중립 기준)`;

// ===== 메시지 4: 한계 + 다음 액션 =====
const msg4 = `[크몽 광범위 시장조사 — 4/4 데이터 한계 + 다음 액션]
데이터 한계
1. 검색 1페이지 상위 20개 스냅샷 (전체 모집단 X)
2. 리뷰 ≠ 거래 — 리뷰 작성률 30~50% 추정
3. 시작가 기준 — 옵션/커스텀 성사가는 ×1.5~3배 가능 (단가 과소평가)
4. 상위3 독식률 65~75% — 신규 gig 초기 6개월 노출 0건 가능
5. 계절성: 4월 스냅샷 한정
6. ONDA 적합도 가중치는 정성 판단 — 실전 검증 필요

다음 액션 (우선순위)
① Top5 판매경쟁력 업종 상세 조사
   - 상위 3 gig 상세페이지 진입 → 옵션 단가·월 문의 추세 실측
   - 셀러 레벨(프라임·레벨2) 필터 재집계
② 제안 상품 5개 중 3~4개 1차 등록
   - 자동화 친화 2개 (블로그/인스타 자동화)
   - 디자인 번들 2개 (전문직·자영업)
③ 30일 추적
   - 노출수·문의수·CTR 실측
   - 데이터 반영하여 단가·썸네일 AB 테스트
④ 2차 확장
   - 성공 카테고리 1개당 STD/DLX/PRM 변형 gig 2~3개 추가 등록
   - 실측 매출 기반 월 예측 재계산

원본 데이터
- 1차: market-research-1776241668911.json (20 키워드)
- 2차: market-research-additional-1776243621689.json (8 키워드)
- 3차: ${path.basename(extendedPath)} (15 키워드)
- 통합 분석: market-research-integrated-${Date.now()}.json`;

// 파일 저장
const outPath = path.join(path.dirname(extendedPath), `market-research-integrated-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  tierCount,
  totalKeywords: Object.keys(all).length,
  totalGigs,
  byAvgPrice: byAvgPrice.map(r => ({ key: r.key, cat: r.cat, avg: r.priceStats.avg })),
  byTotalReviews: byTotalReviews.map(r => ({ key: r.key, cat: r.cat, total: r.totalReviews })),
  byOpportunity: byOpportunity.map(r => ({ key: r.key, cat: r.cat, op: r.opportunity })),
  top5Compete: top5Compete.map(r => ({
    key: r.key, cat: r.cat, q: r.q,
    avg: r.priceStats.avg, median: r.priceStats.median,
    totalReviews: r.totalReviews, top3Share: r.top3ShareOfReviews,
    totalCards: r.totalCards, ondaFit: r.ondaFit,
    competitiveness: r.competitiveness,
  })),
  productProposals,
  messages: { msg1, msg2, msg3, msg4 },
}, null, 2));

// 출력 + 길이 체크
for (const [i, mm] of [msg1, msg2, msg3, msg4].entries()) {
  console.log(`\n=== 메시지 ${i + 1} (${mm.length}자) ===`);
  console.log(mm);
  if (mm.length > 4000) console.log(`⚠ 4000자 초과! 분할 필요`);
}
console.log(`\n통합 JSON 저장: ${outPath}`);
