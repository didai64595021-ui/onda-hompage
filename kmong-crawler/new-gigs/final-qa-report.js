#!/usr/bin/env node
/**
 * 크몽 55상품 최종 QA 리포트
 *  - update-body-report / fill-pricing-report / verify-fields-report / verify-thumbnails-v2-report / cleanup-duplicates-report 종합
 *  - 금지어 스캔 (gig-data-55.js 재검증)
 *  - draft URL 55건 + per-건 체크리스트 → Markdown 출력 (stdout)
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const runLog = JSON.parse(fs.readFileSync(path.join(DIR, '55-run-log.json'), 'utf-8'));
const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');

function safe(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf-8')); } catch { return null; }
}

const updBody = safe('update-body-report.json');
const pricing = safe('fill-pricing-report.json');
const verFields = safe('verify-fields-report.json');
const verThumb2 = safe('verify-thumbnails-v2-report.json');
const verThumb1 = safe('verify-thumbnails-report.json');
const cleanup = safe('cleanup-duplicates-report.json');

// 55 상품 latest draft 수집
const byId = {};
for (const r of runLog.runs || []) {
  const m = (r.savedUrl || '').match(/\/edit\/(\d+)/);
  if (!m) continue;
  if (!byId[r.id] || r.at > byId[r.id].at) byId[r.id] = { draftId: m[1], productId: r.id, at: r.at, url: r.savedUrl };
}
const drafts = Object.values(byId).sort((a, b) => a.productId.localeCompare(b.productId));
const productMap = {};
PRODUCTS.forEach((p) => { productMap[p.id] = p; });

// 금지어 스캔
const BANNED = ['네이버', '보장', '상위', '상단', '진입', '자연스러운'];
const gigSrc = fs.readFileSync(path.join(DIR, 'gig-data-55.js'), 'utf-8');
const bannedHits = [];
for (const kw of BANNED) {
  const re = new RegExp(kw, 'g');
  const ms = gigSrc.match(re) || [];
  if (ms.length > 0) bannedHits.push({ kw, count: ms.length });
}

// per-draft 상태
function bodyStatus(draftId) {
  if (!updBody) return '-';
  const r = (updBody.results || []).find((x) => x.draftId === draftId);
  if (!r) return '미실행';
  return r.ok ? `✓ desc=${r.desc?.len ?? '-'}` : `✗ ${r.reason || ''}`;
}
function pricingStatus(draftId) {
  if (!pricing) return '-';
  const r = (pricing.results || []).find((x) => x.draftId === draftId);
  if (!r) return '미실행';
  return r.ok ? '✓' : `✗ ${r.reason || ''}`;
}
function thumbStatus(draftId) {
  const src = verThumb2 || verThumb1;
  if (!src) return '-';
  const list = src.results || src.all || [];
  const r = list.find((x) => x.draftId === draftId);
  if (!r) return '미실행';
  if (r.ok) return `✓ ${r.main ? r.main.naturalW + 'x' + r.main.naturalH : ''}`;
  return `✗ ${r.reason || 'size'}`;
}
function fieldsStatus(draftId) {
  if (!verFields) return '-';
  const list = verFields.results || verFields.failed || [];
  const r = list.find((x) => x.draftId === draftId);
  if (!r) return '미실행';
  const failed = [];
  if (r.priceInputs && !r.priceInputs.ok) failed.push('price');
  if (r.workPeriod && !r.workPeriod.ok) failed.push('period');
  if (r.revise && !r.revise.ok) failed.push('revise');
  if (r.packageTextareas && !r.packageTextareas.ok) failed.push('pkg');
  return failed.length ? `✗ ${failed.join(',')}` : '✓';
}

// 출력
const lines = [];
lines.push(`# 크몽 55상품 최종 QA 리포트 (${new Date().toISOString()})`);
lines.push('');
lines.push(`## 요약`);
lines.push(`- 대상 draft: ${drafts.length}`);
lines.push(`- update-body: ${updBody ? `OK ${updBody.ok}/${updBody.total} (NG ${updBody.ng})` : '미실행'}`);
lines.push(`- fill-pricing: ${pricing ? `OK ${pricing.ok}/${pricing.total} (NG ${pricing.ng})` : '미실행'}`);
lines.push(`- verify-fields: ${verFields ? `OK ${verFields.ok}/${verFields.total} (NG ${verFields.ng})` : '미실행'}`);
lines.push(`- verify-thumbnails-v2: ${verThumb2 ? `OK ${verThumb2.ok}/${verThumb2.total} (NG ${verThumb2.ng})` : '미실행'}`);
lines.push(`- cleanup-duplicates: ${cleanup ? `삭제 ${cleanup.deleted?.length || 0}, 잔여 noise ${cleanup.remainingNonKeep?.length || 0}` : '미실행'}`);
lines.push(`- 금지어 스캔: ${bannedHits.length === 0 ? '✓ 0건' : bannedHits.map((h) => `${h.kw}:${h.count}`).join(', ')}`);
lines.push('');
lines.push(`## 55상품 draft URL 목록 + 체크리스트`);
lines.push('');
lines.push(`| # | Product | DraftId | 본문 | 가격/기간 | 필드 | 썸네일 | URL |`);
lines.push(`|---|---------|---------|------|-----------|------|--------|-----|`);
for (const d of drafts) {
  const p = productMap[d.productId];
  const title = (p?.title || '').slice(0, 28);
  lines.push(`| ${d.productId} | ${title} | \`${d.draftId}\` | ${bodyStatus(d.draftId)} | ${pricingStatus(d.draftId)} | ${fieldsStatus(d.draftId)} | ${thumbStatus(d.draftId)} | [edit](${d.url}) |`);
}
lines.push('');
lines.push(`## 발행 가이드 (사용자 수동)`);
lines.push(`- 위 목록의 "edit" 링크 클릭 → 크몽 셀러 페이지 진입 → 하단 "제출하기" 버튼 클릭`);
lines.push(`- submit은 어떤 스크립트에도 박혀있지 않음 — 실 발행은 승현 직접`);
lines.push('');

console.log(lines.join('\n'));
