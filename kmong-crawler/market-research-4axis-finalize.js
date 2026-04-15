#!/usr/bin/env node
/**
 * 1차+2차 4축 조사 통합 + 최종 텔레그램 종합보고 (4000자 이하)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TG_CHANNEL = '-1003738825402';
const TG_SCRIPT = '/home/onda/scripts/telegram-sender.js';

const F1 = '/home/onda/projects/onda-hompage/kmong-crawler/market-research-4axis-1776244782610.json';
const F2 = '/home/onda/projects/onda-hompage/kmong-crawler/market-research-4axis-1776245090644.json';

const d1 = JSON.parse(fs.readFileSync(F1, 'utf-8'));
const d2 = JSON.parse(fs.readFileSync(F2, 'utf-8'));

const all = { ...d1.keywords, ...d2.keywords };
const rows = Object.values(all).filter(r => !r.error && r.evaluation);
const total = rows.length;

const passed = rows.filter(r => r.evaluation.passed);

// 3축 통과 (자동화 미달은 제외 — 풀 수 없음. 다른 1축이면 노력으로 가능)
const threeAxis = rows.filter(r => {
  const p = r.evaluation.passes;
  const c = [p.demand, p.compete, p.price, p.auto].filter(Boolean).length;
  return c === 3 && !r.evaluation.passed;
}).map(r => {
  const med = r.priceStats?.median ? Math.round(r.priceStats.median/10000) : 0;
  const top3 = r.top3ShareOfReviews ? (r.top3ShareOfReviews*100).toFixed(0) : '-';
  const fails = [];
  if (!r.evaluation.passes.demand) fails.push('수요');
  if (!r.evaluation.passes.compete) fails.push('경쟁');
  if (!r.evaluation.passes.price) fails.push('단가');
  if (!r.evaluation.passes.auto) fails.push('자동화');
  return { ...r, _fail: fails[0], _med: med, _top3: top3 };
});

// 결정적 분류
const failByDemand = threeAxis.filter(r => r._fail === '수요').sort((a,b) => b.totalReviews - a.totalReviews);
const failByCompete = threeAxis.filter(r => r._fail === '경쟁').sort((a,b) => a.top3ShareOfReviews - b.top3ShareOfReviews);
const failByPrice = threeAxis.filter(r => r._fail === '단가').sort((a,b) => b.priceStats.median - a.priceStats.median);
const failByAuto = threeAxis.filter(r => r._fail === '자동화');

// 가장 유망: "수요만 미달" 그룹 — 단가/경쟁/자동화 다 OK이면 신규 셀러로 진입해도 매출 가능
// 추가로 "경쟁만 미달"도 양호 (니치로 파고들면 가능)

let msg = `[크몽 4축 시장조사 — 최종 종합 1/2]\n`;
msg += `조사 총 ${total}개 키워드 / 4축 모두 통과 ${passed.length}개\n`;
msg += `기준: 수요 5000리뷰 이상, 상위3 독식 60% 미만, 중앙단가 10만원 이상, 자동화 70점 이상\n\n`;

if (passed.length === 0) {
  msg += `[결과] 4축 동시 통과 0건\n`;
  msg += `→ 검색 1페이지 상위 20개 한정 한계: "수요≥5000"이 매우 빡셈\n`;
  msg += `→ 카테고리 전체 모집단 vs 검색 슬라이스 차이 큼\n\n`;
}

msg += `[3축 통과 — 1축만 보강하면 후보] 총 ${threeAxis.length}개\n\n`;

msg += `★ 단가만 미달 (수요+경쟁+자동화 OK = 양산 시 박리다매 가능)\n`;
if (failByPrice.length === 0) msg += `해당 없음\n`;
else failByPrice.slice(0, 5).forEach((r, i) => {
  msg += `${i+1}. ${r.cat} — 리뷰${r.totalReviews}/중앙${r._med}만/독식${r._top3}%/자동${r.autoScore}\n`;
});

msg += `\n★ 수요만 미달 (단가+경쟁+자동화 OK = 신규 셀러도 점유 쉬움, 단 거래량 적음)\n`;
if (failByDemand.length === 0) msg += `해당 없음\n`;
else failByDemand.slice(0, 8).forEach((r, i) => {
  msg += `${i+1}. ${r.cat} — 리뷰${r.totalReviews}/중앙${r._med}만/독식${r._top3}%/자동${r.autoScore}\n`;
});

msg += `\n★ 경쟁만 미달 (수요+단가+자동화 OK = 상위3 독식이지만 큰 시장)\n`;
if (failByCompete.length === 0) msg += `해당 없음\n`;
else failByCompete.slice(0, 5).forEach((r, i) => {
  msg += `${i+1}. ${r.cat} — 리뷰${r.totalReviews}/중앙${r._med}만/독식${r._top3}%/자동${r.autoScore}\n`;
});

msg += `\n자동화 미달은 제외 (개선 불가 영역)`;

const trimmed = msg.length > 3900 ? msg.slice(0, 3850) + '\n... (truncated)' : msg;
console.log(trimmed);
console.log(`\n길이: ${trimmed.length}자`);

execSync(`node ${TG_SCRIPT} send ${JSON.stringify(trimmed)} ${TG_CHANNEL}`, { stdio: 'inherit', timeout: 15000 });

// 메시지 2: 운영 권고
let msg2 = `[크몽 4축 시장조사 — 최종 종합 2/2]\n`;
msg2 += `운영 권고 (4축 통과 0건 결과 해석)\n\n`;
msg2 += `1. 검색결과 1페이지 슬라이스의 한계\n`;
msg2 += `   - 캘리그라피(29348), 매뉴얼(18644), 영상더빙(13278), 유튜브SEO(13919), 예약앱(11982), PPT(10205) 등 거래량 매우 큰 카테고리도 단가/자동화 미달로 탈락\n\n`;
msg2 += `2. 4축 동시 통과 = 매우 희소\n`;
msg2 += `   - 기존 통과 검증된 것: 패키지 디자인, 홈페이지 (사용자 운영 검증)\n`;
msg2 += `   - 추가 후보 발굴 시 기준 미세 조정 권장 (예: 수요 ≥3000 또는 단가 ≥7만)\n\n`;
msg2 += `3. 즉시 진입 가능 — 우선순위 추천\n`;
msg2 += `   ① 쇼핑몰 제작 (중앙 110만, 독식 45%, 자동화 85) — 단 1축 미달 = 수요 3014\n`;
msg2 += `      └ 정밀 분석: 검색 1p 외 더 큰 모집단 가능성 큼 (cafe24/imweb 등 조합 시)\n`;
msg2 += `   ② 와디즈 (중앙 24만, 독식 54%, 자동화 75) — 수요 3298\n`;
msg2 += `      └ 펀딩 페이지 + 콘텐츠 LLM 자동화로 진입 가능\n`;
msg2 += `   ③ 모션인포그래픽 (중앙 20만, 독식 57%, 자동화 75) — 수요 2032\n`;
msg2 += `      └ 영상+그래픽 자동화 도구 활용\n\n`;
msg2 += `4. 4축 동시 추가 발굴 위해 추가 조사 권장\n`;
msg2 += `   - 키워드 길게 (e.g. "쇼핑몰 카페24 반응형", "AI 챗봇 카카오톡")\n`;
msg2 += `   - 카테고리 URL 직접 (검색 슬라이스 → 전체 카테고리 모집단)\n`;
msg2 += `   - reference_kmong_category_urls.md 활용\n\n`;
msg2 += `데이터: market-research-4axis-1776244782610.json (1차 44)\n`;
msg2 += `        market-research-4axis-1776245090644.json (2차 30)`;

const t2 = msg2.length > 3900 ? msg2.slice(0, 3850) + '\n... (truncated)' : msg2;
console.log('\n\n' + t2);
console.log(`\n길이: ${t2.length}자`);

execSync(`node ${TG_SCRIPT} send ${JSON.stringify(t2)} ${TG_CHANNEL}`, { stdio: 'inherit', timeout: 15000 });
