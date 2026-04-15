#!/usr/bin/env node
/**
 * 공수 vs 시장단가 mismatch 판정
 *  - 입력: competitor-prices-report.json + /tmp/prices-55.json
 *  - 분석:
 *    1. 카테고리별 절대강자 비율 (★4.9 + 리뷰 100+)
 *    2. 양산 미끼 비율 (시작가 1만 이하)
 *    3. 신규(평점 없음) 비율
 *    4. Top 셀러 리뷰수
 *    5. 공수 정성 평가 (카테고리별 룰)
 *  - 출력: 회피권장/유지/확대 카테고리 분류 + 우리 55상품 중 회피 권장 리스트
 */
const fs = require('fs');
const path = require('path');

const ours = require('/tmp/prices-55.json');
const comp = require('./competitor-prices-report.json').categories;

const CAT_MAP = {
  '홈페이지 신규 제작':       '601',
  '업무 자동화':              '663',
  '맞춤형 챗봇·GPT':          '667',
  '상세페이지·이미지편집':    '113',
  '로고 디자인':              '101',
  '명함':                     '107',
  '메뉴판':                   '134',
};

// 공수 정성 평가 (Claude Code 풀자동 + 사람 검수만 정책 기준)
//   1=매우 낮음 (텍스트 양산), 5=매우 높음 (코드+디자인+수정 무한루프)
const KONGSU = {
  '601': { score: 4, reason: '홈페이지 코드+디자인+퍼블리싱+검수 큼. 자동화 + 사람 검수 시간 多' },
  '663': { score: 2, reason: '자동화 스크립트 Claude Code 빠름. 단, 클라 환경 적응 필요' },
  '667': { score: 2, reason: 'Claude RAG 빠름. 챗봇 셋업 + 데이터 정제 검수' },
  '113': { score: 2, reason: 'AI 이미지/카드뉴스 양산 가능. GPT-image 비용 + 검수만' },
  '101': { score: 4, reason: '로고는 무한 수정 요청 + 노포 강자 + AI 로고는 신뢰 낮음' },
  '107': { score: 3, reason: '명함 + 인쇄/배송 변수. 검수 시간' },
  '134': { score: 3, reason: '메뉴판 업종마다 다른 디자인 + 검수 + 수정' },
  '617': { score: 1, reason: '단순 알림봇 자동화 OK (참조)' },
  '645': { score: 2, reason: '크롤링 Claude Code 빠름 (참조)' },
};

const fmt = (n) => n == null ? '-' : (n >= 10000 ? Math.round(n/10000) + '만' : (n/10000).toFixed(1) + '만');

// 카테고리별 분석
const catAnalysis = {};
for (const [name, catId] of Object.entries(CAT_MAP)) {
  const c = comp[catId];
  if (!c?.cards) continue;
  const cards = c.cards;
  const top = cards.slice().sort((a,b) => (b.reviews||0) - (a.reviews||0))[0];
  const premiumPlayers = cards.filter(x => x.rating >= 4.9 && (x.reviews||0) >= 100).length;
  const cheapBait = cards.filter(x => x.price && x.price <= 10000).length;
  const newComers = cards.filter(x => !x.rating).length;
  const k = KONGSU[catId];
  // 마진 점수 = 시장 평균 / 공수 점수 (높을수록 좋음)
  const margin = c.stats.avg / 10000 / k.score;  // 만원/공수점수
  catAnalysis[catId] = {
    name, catId, total: cards.length,
    market: c.stats,
    topSeller: top ? `${top.title.slice(0,40)} ★${top.rating || '?'}(${top.reviews || '?'})` : null,
    premiumRatio: (premiumPlayers / cards.length * 100).toFixed(0) + '%',
    premiumPlayers,
    cheapBaitRatio: (cheapBait / cards.length * 100).toFixed(0) + '%',
    cheapBait,
    newComerRatio: (newComers / cards.length * 100).toFixed(0) + '%',
    newComers,
    kongsuScore: k.score,
    kongsuReason: k.reason,
    marginScore: margin.toFixed(1),
    verdict: '',
  };
}

// 판정 룰
function judgeCategory(a) {
  const score = parseFloat(a.marginScore);
  const premium = parseFloat(a.premiumRatio);
  const newcomer = parseFloat(a.newComerRatio);
  if (score < 3 && premium > 30) return '⛔ 회피권장 (공수대비 단가 낮음 + 노포 절대강자 다수)';
  if (score < 3) return '⚠️ 회피권장 (공수대비 단가 낮음)';
  if (score < 5 && premium > 50) return '⚠️ 신중 (강자 다수, 차별화 필요)';
  if (newcomer > 30) return '✅ 확대권장 (신규 카테고리, 진입 기회)';
  return '○ 유지 (경쟁 정상)';
}
for (const a of Object.values(catAnalysis)) a.verdict = judgeCategory(a);

// 우리 상품별 회피권장 식별
const avoidProducts = [];
for (const o of ours) {
  const catId = CAT_MAP[o.cat2];
  const a = catAnalysis[catId];
  if (!a) continue;
  if (a.verdict.startsWith('⛔')) {
    avoidProducts.push({ ...o, verdict: a.verdict, catScore: a.marginScore });
  }
}

// 출력
const lines = [];
lines.push('='.repeat(90));
lines.push('공수 vs 시장단가 mismatch 판정 — Claude Code 풀자동+사람 검수만 정책 기준');
lines.push(`생성: ${new Date().toISOString()}`);
lines.push('='.repeat(90));
lines.push('');
lines.push('## 정책 가정');
lines.push('- 개발/생성: Claude Code 풀자동 (이미지/텍스트/코드 모두)');
lines.push('- 사람 시간: 검수 + 발행 + 클라 응대 + 수정 (한정 자원)');
lines.push('- 마진 = 시장평균(만원) / 공수점수 (1=낮음~5=높음)');
lines.push('- 마진 < 3 + 절대강자 30%+ → 회피권장');
lines.push('');
lines.push('## 카테고리별 분석');
lines.push('');
lines.push('| 카테고리 | 시장평균 | 시장중앙 | 절대강자% | 1만이하% | 신규% | 공수 | 마진점수 | 판정 |');
lines.push('|---|---|---|---|---|---|---|---|---|');
for (const a of Object.values(catAnalysis)) {
  lines.push(`| ${a.name.slice(0,16)} | ${fmt(a.market.avg)} | ${fmt(a.market.median)} | ${a.premiumRatio} | ${a.cheapBaitRatio} | ${a.newComerRatio} | ${a.kongsuScore}/5 | ${a.marginScore} | ${a.verdict} |`);
}
lines.push('');
lines.push('## 카테고리별 디테일 (top 셀러 + 공수 사유)');
for (const a of Object.values(catAnalysis)) {
  lines.push(`\n### [${a.catId}] ${a.name}`);
  lines.push(`  Top 셀러: ${a.topSeller}`);
  lines.push(`  절대강자(★4.9+리뷰100+): ${a.premiumPlayers}/${a.total} (${a.premiumRatio})`);
  lines.push(`  양산 미끼(1만 이하): ${a.cheapBait}/${a.total} (${a.cheapBaitRatio})`);
  lines.push(`  신규 진입자: ${a.newComers}/${a.total} (${a.newComerRatio})`);
  lines.push(`  공수: ${a.kongsuScore}/5 — ${a.kongsuReason}`);
  lines.push(`  마진점수: ${a.marginScore} (시장평균 ${fmt(a.market.avg)} ÷ 공수 ${a.kongsuScore})`);
  lines.push(`  판정: ${a.verdict}`);
}
lines.push('');
lines.push(`## 우리 55상품 중 회피권장 (${avoidProducts.length}건)`);
lines.push('');
if (avoidProducts.length === 0) {
  lines.push('  (없음 — 모든 카테고리 마진 점수 기준선 충족)');
} else {
  lines.push('| ID | 제목 | 카테 | 기존가격 | 카테 마진점수 | 권장 액션 |');
  lines.push('|----|------|------|----------|-------------|----------|');
  for (const p of avoidProducts) {
    lines.push(`| ${p.id} | ${(p.title||'').slice(0,30)} | ${p.cat2} | ${fmt(p.std)}/${fmt(p.dlx)}/${fmt(p.prm)} | ${p.catScore} | ${p.verdict} |`);
  }
}
lines.push('');
lines.push('## 권장 전략 (회피권장 카테고리 처리)');
lines.push('');
lines.push('옵션 A: 등록 취소 (draft 삭제)');
lines.push('  - 자원 100% 다른 카테고리 집중');
lines.push('  - 단점: 새 카테고리 진입 기회 손실');
lines.push('');
lines.push('옵션 B: "전략적 미끼"로 활용 (가격 1만 + 메인 상품 크로스셀)');
lines.push('  - 클릭 유도 → 다른 메인 상품으로 안내 (홈페이지/챗봇)');
lines.push('  - 단점: 클라 응대 시간 소비');
lines.push('');
lines.push('옵션 C: 등록 유지 + 자원 투입 최소화 (자동 견적만, 수동 응대 X)');
lines.push('  - 0번 노출+0번 클릭 시 운영 부담 0');
lines.push('  - 단점: 가끔 들어오는 문의에 대응 못 하면 평점 하락');
lines.push('');
lines.push('옵션 D: 차별화 시도 (1번만 — 안 통하면 옵션 A)');
lines.push('  - 예: 명함 → "B2B 50명 단체 명함 1주일" 차별화');
lines.push('  - 예: 로고 → "AI 50개 시안 즉시 + 1개 선택" 양산 차별화');

const TXT = path.join(__dirname, 'kongsu-mismatch-judgment.txt');
fs.writeFileSync(TXT, lines.join('\n'));
console.log(`✅ ${TXT}`);
console.log(`회피권장 우리 상품: ${avoidProducts.length}건`);
