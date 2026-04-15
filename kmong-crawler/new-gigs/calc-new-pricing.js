#!/usr/bin/env node
/**
 * 신규 가격 책정 — 시장 1페이지 P25 기준 (리뷰 없는 신규 진입 정책)
 *  - STD = max(시장 P25, 시장 P25*0.8)  (P25 이하로 진입, 단 최소 1만원)
 *  - DLX = 시장 중앙값 부근 (1.0 ~ 1.3배)
 *  - PRM = 시장 P75 부근 (조심, B2B 미끼)
 *  - 단, 우리 기존 SELLING 홈페이지 시작가 평균 17만 ≒ 시장평균의 30% 와 정합
 *
 * 카테고리별 표준 매트릭스 적용 + 상품별 미세 조정
 *
 * 입력: /tmp/prices-55.json (현재) + competitor-prices-report.json (시장)
 * 출력: new-pricing-proposal.json + new-pricing-comparison.txt
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

// 카테고리별 정책 (P25/평균/P75 기반 + 보수적 조정)
// std = round( P25 의 90% ), dlx = 평균 또는 1.2배, prm = P75 ~ 평균*2.5 사이
const POLICY = {
  '601': { stdMul: 0.7, dlxBase: 'avg', dlxMul: 0.6, prmMul: 1.0, prmBase: 'p75' },  // 홈페이지: 시장 평균 너무 높음 (대형SI 포함), STD P25*0.7=14만, DLX 평균*0.6=33만, PRM P75*1.0=66만
  '663': { stdMul: 0.6, dlxBase: 'avg', dlxMul: 1.0, prmMul: 1.5, prmBase: 'p75' },  // 자동화: STD 5만*0.6=3만, DLX 13만, PRM 22만*1.5=33만
  '667': { stdMul: 0.7, dlxBase: 'median', dlxMul: 1.5, prmMul: 1.0, prmBase: 'p75' }, // 챗봇: STD 10만*0.7=7만, DLX 12만*1.5=18만, PRM 50만
  '113': { stdMul: 1.0, dlxBase: 'avg', dlxMul: 0.7, prmMul: 1.2, prmBase: 'p75' },  // 상세페이지: STD P25(1만), DLX 평균*0.7=7만, PRM P75*1.2=18만
  '101': { stdMul: 0.7, dlxBase: 'avg', dlxMul: 1.0, prmMul: 1.5, prmBase: 'p75' },  // 로고: STD 3만*0.7=2만, DLX 6만, PRM 7만*1.5=10만 (시장상한 30만 못넘음)
  '107': { stdMul: 0.5, dlxBase: 'median', dlxMul: 1.0, prmMul: 2.0, prmBase: 'p75' }, // 명함: STD 2만*0.5=1만, DLX 2만, PRM 3만*2=6만
  '134': { stdMul: 0.5, dlxBase: 'median', dlxMul: 1.0, prmMul: 2.0, prmBase: 'p75' }, // 메뉴판: STD 2만*0.5=1만, DLX 3만, PRM 4만*2=8만
};

function roundToWon(n, unit = 10000) {
  // 만원 단위 반올림, 단 1만원 이하 5천 단위
  if (n < 10000) return Math.max(5000, Math.round(n / 5000) * 5000);
  return Math.max(10000, Math.round(n / 10000) * 10000);
}

const result = [];
for (const o of ours) {
  const catId = CAT_MAP[o.cat2];
  const c = comp[catId]?.stats;
  const pol = POLICY[catId];
  if (!c || !pol) { result.push({ ...o, newStd: null, newDlx: null, newPrm: null, reason: 'no market data' }); continue; }

  const newStd = roundToWon(c.p25 * pol.stdMul);
  const dlxBaseVal = pol.dlxBase === 'avg' ? c.avg : pol.dlxBase === 'median' ? c.median : c.p75;
  const newDlx = roundToWon(dlxBaseVal * pol.dlxMul);
  const prmBaseVal = pol.prmBase === 'p75' ? c.p75 : pol.prmBase === 'avg' ? c.avg : c.max;
  let newPrm = roundToWon(prmBaseVal * pol.prmMul);
  // PRM 시장 최고 못 넘게 (보수)
  newPrm = Math.min(newPrm, c.max);
  // PRM > DLX 보장
  if (newPrm <= newDlx) newPrm = roundToWon(newDlx * 1.5);

  result.push({
    id: o.id,
    title: o.title,
    cat2: o.cat2,
    catId,
    cur: { std: o.std, dlx: o.dlx, prm: o.prm },
    market: { p25: c.p25, median: c.median, avg: c.avg, p75: c.p75, max: c.max },
    new: { std: newStd, dlx: newDlx, prm: newPrm },
    delta: {
      std: Math.round((newStd - o.std) / o.std * 100),
      dlx: Math.round((newDlx - o.dlx) / o.dlx * 100),
      prm: Math.round((newPrm - o.prm) / o.prm * 100),
    },
  });
}

// 출력
const fmt = (n) => n == null ? '-' : (n >= 10000 ? Math.round(n/10000) + '만' : (n/10000).toFixed(1) + '만');
const lines = [];
lines.push('='.repeat(90));
lines.push('신규 가격 책정안 — 시장 P25 + 우리 기존 SELLING 홈페이지 평균 수준 정책');
lines.push(`생성: ${new Date().toISOString()}`);
lines.push('='.repeat(90));
lines.push('');
lines.push('## 정책 요약');
lines.push('- STD = 시장 P25 × 0.5~1.0 (카테고리별 보수 차등) — 리뷰 없는 진입 미끼');
lines.push('- DLX = 시장 평균 또는 중앙값 (정상 가격대)');
lines.push('- PRM = 시장 P75 × 1.0~2.0 (단, 시장 최고가 못 넘음)');
lines.push('- 가격 단위: 만원 (1만 미만은 5천 단위)');
lines.push('- 우리 기존 SELLING 홈페이지 시작가 평균 17만 = 시장평균(56만)의 30% 와 정합');
lines.push('');
lines.push('## 카테고리별 정책 (시장 통계 → 새 가격)');
lines.push('');
const catGroup = {};
for (const r of result) { (catGroup[r.cat2] ||= []).push(r); }
for (const [name, rows] of Object.entries(catGroup)) {
  const r0 = rows[0];
  if (!r0.market) continue;
  lines.push(`### [${r0.catId}] ${name}`);
  lines.push(`  시장 P25/중앙/평균/P75/최고 = ${fmt(r0.market.p25)}/${fmt(r0.market.median)}/${fmt(r0.market.avg)}/${fmt(r0.market.p75)}/${fmt(r0.market.max)}`);
  lines.push(`  새 STD ${fmt(rows[0].new.std)} / DLX ${fmt(rows[0].new.dlx)} / PRM ${fmt(rows[0].new.prm)} (균일 적용)`);
  lines.push('');
}
lines.push('');
lines.push('## 55상품 전수 (기존 → 새 가격)');
lines.push('');
lines.push('| ID | 제목(20자) | 기존 STD/DLX/PRM | 새 STD/DLX/PRM | Δ STD% | Δ DLX% | Δ PRM% |');
lines.push('|----|-----------|------------------|----------------|--------|--------|--------|');
for (const r of result) {
  const cur = r.cur;
  const nw = r.new;
  const d = r.delta;
  lines.push(`| ${r.id} | ${(r.title||'').slice(0,18).padEnd(18)} | ${fmt(cur.std)}/${fmt(cur.dlx)}/${fmt(cur.prm)} | ${fmt(nw.std)}/${fmt(nw.dlx)}/${fmt(nw.prm)} | ${(d.std>0?'+':'')}${d.std}% | ${(d.dlx>0?'+':'')}${d.dlx}% | ${(d.prm>0?'+':'')}${d.prm}% |`);
}
lines.push('');
lines.push('## 변화 통계');
const totalDelta = { std: 0, dlx: 0, prm: 0 };
for (const r of result) { totalDelta.std += r.delta.std; totalDelta.dlx += r.delta.dlx; totalDelta.prm += r.delta.prm; }
lines.push(`- 평균 STD 변화: ${(totalDelta.std/result.length).toFixed(0)}%`);
lines.push(`- 평균 DLX 변화: ${(totalDelta.dlx/result.length).toFixed(0)}%`);
lines.push(`- 평균 PRM 변화: ${(totalDelta.prm/result.length).toFixed(0)}%`);
lines.push('');
lines.push('## 다음 단계');
lines.push('- 사용자 OK 시 gig-data-55.js 가격 일괄 수정 + fill-pricing-v2.js 재실행 → 크몽 draft 반영');
lines.push('- 약어 풀이 7건 (별도 보고) 동시 진행 가능');

const TXT = path.join(__dirname, 'new-pricing-proposal.txt');
const JSON_OUT = path.join(__dirname, 'new-pricing-proposal.json');
fs.writeFileSync(TXT, lines.join('\n'));
fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
console.log(`✅ ${TXT}`);
console.log(`✅ ${JSON_OUT}`);
console.log(`총 ${result.length} 상품 처리`);
