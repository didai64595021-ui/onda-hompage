#!/usr/bin/env node
/**
 * 약어 풀이 검증
 *  - gig-data-55.js 의 각 product description 본문에서
 *    지정 약어가 처음 등장할 때 (한글풀이) 가 즉시 따라오는지 확인
 *  - 패키지 desc/title 필드는 짧아서 검증 제외 (본문만 대상)
 *  - 출력: 누락된 product/약어 리스트
 */
const path = require('path');
const data = require('./gig-data-55');
const PRODUCTS = data.PRODUCTS || data;

// CLAUDE.md "전문용어 일반인 해석 필수" 규칙 약어 (핵심 + 추가)
const TERMS = {
  LTV:  '고객생애가치',
  CRM:  '고객관리',
  ROI:  '투자수익률',
  ROAS: '광고수익률',
  KPI:  '성과지표',
  CTA:  '행동유도',
  SaaS: '구독형',
  B2B:  '기업간',
  B2C:  '기업소비자',
  SEO:  '검색최적화',
  CTR:  '클릭률',
  IR:   '투자',          // 문맥상 "투자유치/투자자료"
  CMS:  '콘텐츠관리',
  API:  '연동',          // 통상 그대로 쓰지만 옵션
  CPC:  '클릭당과금',
  CPM:  '노출당과금',
  CPA:  '액션당과금',
  RFP:  '제안요청서',
  MVP:  '최소기능제품',
  ICP:  '이상고객',
  OKR:  '목표지표',
};

const out = { totalProducts: 0, perTerm: {}, productMisses: [] };

for (const p of PRODUCTS) {
  if (!p || typeof p.description !== 'string') continue;
  out.totalProducts++;
  const desc = p.description;
  const misses = [];

  for (const [term, hint] of Object.entries(TERMS)) {
    // 단어경계 매칭 (영문/숫자 인접 X)
    const wordRe = new RegExp(`\\b${term}\\b`, 'g');
    const matches = [...desc.matchAll(wordRe)];
    if (matches.length === 0) continue;

    // 첫 발생 인덱스
    const firstIdx = matches[0].index;
    // 다음 ~12자 내에 (한글) 패턴 또는 같은 줄에 (...) 풀이가 있는지
    const window = desc.slice(firstIdx, firstIdx + term.length + 25);
    const hasGloss = /\([^)]*[가-힣][^)]*\)/.test(window);
    // 또는 직전에 한글 풀이가 먼저 나오는 경우 (예: "고객관리(CRM)")
    const before = desc.slice(Math.max(0, firstIdx - 25), firstIdx);
    const hasReverseGloss = new RegExp(`[가-힣][^()]{0,15}\\(${term}\\)`).test(before + desc.slice(firstIdx, firstIdx + term.length + 1));

    if (!hasGloss && !hasReverseGloss) {
      misses.push({ term, count: matches.length, sample: desc.slice(Math.max(0, firstIdx - 30), firstIdx + term.length + 30).replace(/\n/g, ' ') });
    }
    out.perTerm[term] = out.perTerm[term] || { totalProducts: 0, missingProducts: 0 };
    out.perTerm[term].totalProducts++;
    if (!hasGloss && !hasReverseGloss) out.perTerm[term].missingProducts++;
  }

  if (misses.length) out.productMisses.push({ id: p.id, title: p.title, misses });
}

console.log(`\n=== 약어 풀이 검증 (${out.totalProducts}개 description) ===\n`);
console.log('약어별 누락:');
for (const [term, s] of Object.entries(out.perTerm)) {
  if (s.missingProducts > 0) {
    console.log(`  ${term}: ${s.missingProducts}/${s.totalProducts} 상품 누락`);
  }
}
console.log(`\n상품별 누락 (${out.productMisses.length}개 상품):`);
for (const pm of out.productMisses) {
  console.log(`\n  [${pm.id}] ${pm.title}`);
  for (const m of pm.misses) {
    console.log(`    - ${m.term} (${m.count}회): ...${m.sample}...`);
  }
}

const reportPath = path.join(__dirname, 'verify-acronym-report.json');
require('fs').writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log(`\n📄 ${reportPath}`);
