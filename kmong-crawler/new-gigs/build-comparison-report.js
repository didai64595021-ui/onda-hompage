#!/usr/bin/env node
/**
 * 우리 55상품 가격 vs 카테고리 1페이지 실측 시장가 비교 보고서 생성
 *  - 입력: /tmp/prices-55.json (우리 가격) + competitor-prices-report.json (실측)
 *  - 출력: kmong-price-comparison-report.txt
 */
const fs = require('fs');
const path = require('path');

const ours = require('/tmp/prices-55.json');
const comp = require('./competitor-prices-report.json').categories;

// 우리 cat2 → 실측 카테고리 ID 매핑
const CAT_MAP = {
  '홈페이지 신규 제작':       '601',
  '업무 자동화':              '663',
  '맞춤형 챗봇·GPT':          '667',
  '상세페이지·이미지편집':    '113',
  '로고 디자인':              '101',
  '명함':                     '107',
  '메뉴판':                   '134',
};

const fmt = (n) => n == null ? '-' : (n >= 10000 ? Math.round(n/10000) + '만' : n);
const fmtPct = (a, b) => b ? `${a > b ? '+' : ''}${Math.round((a - b) / b * 100)}%` : '-';

const lines = [];
const push = (s) => lines.push(s);

push('='.repeat(80));
push('크몽 55상품 가격 vs 1페이지 실 경쟁자 시장가 비교 보고서');
push(`생성: ${new Date().toISOString()} | 작성: Claude Code`);
push('='.repeat(80));
push('');
push('## 0. 자료 출처');
push('- 우리 가격: /home/onda/projects/onda-hompage/kmong-crawler/new-gigs/gig-data-55.js');
push('- 시장 실측: scrape-competitor-prices.js 스크립트로 카테고리 1페이지 상위 상품 직접 수집');
push('- 시장가 정의: 각 카드의 "시작가" (예: "1,320,000원~" → 1,320,000 = STD 가격)');
push('- 따라서 우리 STD ↔ 시장 시작가 직접 비교 가능');
push('');
push('## 1. 카테고리별 시장 통계 (1페이지 실측, 각 36~40개 상품)');
push('');
push('| 카테고리 | 우리상품수 | 시장N | 평균 | 중앙 | 최저 | 최고 | P25 | P75 |');
push('|---|---|---|---|---|---|---|---|---|');
for (const [name, catId] of Object.entries(CAT_MAP)) {
  const c = comp[catId]; if (!c?.stats) continue;
  const ourCount = ours.filter(o => o.cat2 === name).length;
  push(`| ${name.slice(0,20)} | ${ourCount} | ${c.stats.count} | ${fmt(c.stats.avg)} | ${fmt(c.stats.median)} | ${fmt(c.stats.min)} | ${fmt(c.stats.max)} | ${fmt(c.stats.p25)} | ${fmt(c.stats.p75)} |`);
}
push('');
push('참조 카테고리 (우리 미진입):');
for (const refId of ['617', '645']) {
  const c = comp[refId]; if (!c?.stats) continue;
  push(`  - [${refId}] ${c.name}: 평균 ${fmt(c.stats.avg)} / 중앙 ${fmt(c.stats.median)} / 범위 ${fmt(c.stats.min)}~${fmt(c.stats.max)}`);
}
push('');
push('## 2. 우리 가격 책정 근거 (1/6~6/6 보고서 통합)');
push('');
push('### 가격 책정 원칙 (시장조사+메모리 기반)');
push('1. STD = 시장 평균의 70~80% (진입 미끼)');
push('2. DLX = 시장 평균 1.0배 (메인 매출)');
push('3. PRM = 평균 2~3배 (B2B/풀스택, 단가 폭발)');
push('4. 표준 비율 1:2.3:4~5 (자동화/챗봇 권장 비율)');
push('5. "홈페이지 없는 사업자" 실측 PMF 니치 → 저가 진입 강화');
push('');
push('### 책정 근거 (카테고리별)');
push('- IT 자동화 (663): 메모리 macro 자료 — 평균 20만, 5천~330만, 권장 비율 1:2.3:4~5');
push('- IT 챗봇 (667): 메모리 aibot 자료 — 5.5만~165만, 저가 5.9/9.9/14.9 → 중가 29/49/79 → 프리미엄 99/149/199');
push('- IT 홈페이지 (601): 시장조사 자료 없음, 일반 통념 사용 (당시)');
push('- 디자인 113/101/107/134: 시장조사 자료 없음, 일반 통념 사용 (당시)');
push('');
push('## 3. 카테고리별 우리 가격 vs 실측 시장가 (핵심 비교)');
push('');
const catSummary = {};
for (const o of ours) {
  const catId = CAT_MAP[o.cat2];
  if (!catId) continue;
  catSummary[o.cat2] ||= { catId, products: [], stdSum: 0, dlxSum: 0, prmSum: 0 };
  catSummary[o.cat2].products.push(o);
  catSummary[o.cat2].stdSum += o.std || 0;
  catSummary[o.cat2].dlxSum += o.dlx || 0;
  catSummary[o.cat2].prmSum += o.prm || 0;
}

for (const [name, s] of Object.entries(catSummary)) {
  const c = comp[s.catId]; if (!c?.stats) continue;
  const n = s.products.length;
  const ourStdAvg = Math.round(s.stdSum / n);
  const ourDlxAvg = Math.round(s.dlxSum / n);
  const ourPrmAvg = Math.round(s.prmSum / n);
  push(`### [${s.catId}] ${name} (우리 ${n}건)`);
  push(`  시장 시작가 평균: ${fmt(c.stats.avg)} | 중앙: ${fmt(c.stats.median)} | P25~P75: ${fmt(c.stats.p25)}~${fmt(c.stats.p75)}`);
  push(`  우리 STD 평균: ${fmt(ourStdAvg)}  (vs 시장평균 ${fmtPct(ourStdAvg, c.stats.avg)} | vs 중앙 ${fmtPct(ourStdAvg, c.stats.median)})`);
  push(`  우리 DLX 평균: ${fmt(ourDlxAvg)}`);
  push(`  우리 PRM 평균: ${fmt(ourPrmAvg)}  (시장 최고 ${fmt(c.stats.max)})`);
  push('');
}
push('');
push('## 4. 상품별 매핑 (55건 전수)');
push('');
push('| ID | 제목(20자) | STD/DLX/PRM | 시장평균 | 시장중앙 | STD vs 평균 | STD vs 중앙 | 포지션 |');
push('|----|-----------|-------------|----------|----------|-------------|-------------|--------|');
for (const o of ours) {
  const catId = CAT_MAP[o.cat2];
  const c = comp[catId];
  const stats = c?.stats;
  const stdVsAvg = stats ? fmtPct(o.std, stats.avg) : '-';
  const stdVsMed = stats ? fmtPct(o.std, stats.median) : '-';
  let pos = '?';
  if (stats) {
    if (o.std <= stats.p25) pos = '저가존';
    else if (o.std <= stats.median) pos = '중하';
    else if (o.std <= stats.p75) pos = '중상';
    else pos = '프리미엄존';
  }
  push(`| ${o.id} | ${(o.title||'').slice(0,18).padEnd(18)} | ${fmt(o.std)}/${fmt(o.dlx)}/${fmt(o.prm)} | ${fmt(stats?.avg)} | ${fmt(stats?.median)} | ${stdVsAvg.padStart(7)} | ${stdVsMed.padStart(7)} | ${pos} |`);
}
push('');
push('## 5. 핵심 인사이트 (실측 기반 보정 권장)');
push('');

// 자동 인사이트 생성
const insights = [];
for (const [name, s] of Object.entries(catSummary)) {
  const c = comp[s.catId]; if (!c?.stats) continue;
  const ourStdAvg = Math.round(s.stdSum / s.products.length);
  const diff = (ourStdAvg - c.stats.avg) / c.stats.avg;
  if (diff > 0.3) insights.push(`⚠️  ${name}: 우리 STD 평균 ${fmt(ourStdAvg)} 이 시장평균 ${fmt(c.stats.avg)} 대비 ${fmtPct(ourStdAvg, c.stats.avg)} 비쌈 → 진입 STD 인하 검토`);
  else if (diff < -0.3) insights.push(`✓ ${name}: 우리 STD ${fmt(ourStdAvg)} 이 시장평균 ${fmt(c.stats.avg)} 대비 ${fmtPct(ourStdAvg, c.stats.avg)} 보수적 → DLX/PRM 상향 여지`);
  else insights.push(`= ${name}: 우리 STD ${fmt(ourStdAvg)} ≈ 시장평균 ${fmt(c.stats.avg)} (${fmtPct(ourStdAvg, c.stats.avg)})`);
}
insights.forEach(i => push(`- ${i}`));
push('');
push('## 6. 시장 1페이지 상위 상품 샘플 (참고용 — 각 카테고리 상위 5건)');
push('');
for (const [name, catId] of Object.entries(CAT_MAP)) {
  const c = comp[catId]; if (!c?.cards) continue;
  push(`### [${catId}] ${name}`);
  for (const card of c.cards.slice(0, 5)) {
    const r = card.rating ? `★${card.rating}` : '신규';
    const rv = card.reviews ? `(${card.reviews})` : '';
    push(`  - ${fmt(card.price).padStart(4)} | ${r}${rv} | ${card.title.slice(0, 50)}`);
  }
  push('');
}
push('');
push('## 7. 결론 및 사용자 의사결정 자료');
push('');
push('### 데이터 한계');
push('- 각 카테고리 1페이지 36-40건 = 베스트셀러 위주 (중하위 가격대 미반영 가능)');
push('- 시작가 = STD 가격이지만 PRM 까지의 범위는 별도 페이지 진입해야 정확');
push('- 1회성 스냅샷 (시간 변동 미반영)');
push('');
push('### 다음 가능 액션 (수정은 사용자 결정)');
push('- 옵션 A: 보고서만 참조하고 가격 유지 (운영 1-2개월 후 데이터 보고 재조정)');
push('- 옵션 B: 위 ⚠️ 표시 카테고리 STD 인하 (예: 자동화 22건 STD -20~30%)');
push('- 옵션 C: ✓ 표시 카테고리 PRM 상향 (홈페이지 PRM +20%)');
push('- 옵션 D: 미끼 상품 추가 신규 등록 (각 카테고리 1만~3만 양산형 1-2개)');
push('');
push('--- 보고서 끝 ---');

const TXT = path.join(__dirname, 'kmong-price-comparison-report.txt');
fs.writeFileSync(TXT, lines.join('\n'));
console.log(`✅ ${TXT}`);
console.log(`총 ${lines.length}줄`);
