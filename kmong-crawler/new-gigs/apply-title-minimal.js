#!/usr/bin/env node
/**
 * 최소 수정안 적용: gig-data-55.js의 title 20개에 "N만원부터" 추가
 *  - 규칙: 기존 title + ' ' + N만원부터
 *  - 매핑: verify-thumbnails-vision-report.json의 thumbnail_hook에서 가격 추출
 *  - 30자 초과 항목 없음 (사전 검증 완료)
 *  - OK 2건(#22, #29) 스킵
 */
const fs = require('fs');
const path = require('path');

const REPORT = path.join(__dirname, 'verify-thumbnails-vision-report.json');
const GIG_DATA = path.join(__dirname, 'gig-data-55.js');
const BACKUP = GIG_DATA + '.bak-minimal-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

const r = JSON.parse(fs.readFileSync(REPORT, 'utf-8'));

const priceMap = {};
for (const x of r.results) {
  if (x.verdict === 'OK') continue;
  const m = String(x.thumbnail_hook || '').match(/(\d+)\s*만원?부터/);
  if (m) priceMap[x.productId] = m[1] + '만원부터';
}

let src = fs.readFileSync(GIG_DATA, 'utf-8');
fs.writeFileSync(BACKUP, src);
console.log(`backup: ${BACKUP}`);

const { PRODUCTS } = require('./gig-data-55.js');
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

let applied = 0;
for (const [pid, priceHook] of Object.entries(priceMap)) {
  const p = byId[pid];
  if (!p) { console.log(`  [skip] #${pid} not found`); continue; }
  const oldTitle = p.title;
  const newTitle = `${oldTitle} ${priceHook}`;
  const len = [...newTitle].length;
  if (len > 30) { console.log(`  [skip] #${pid} ${len}자 초과: ${newTitle}`); continue; }

  // 정확 매칭을 위해 `title: '...'` 패턴 찾기 (id 근처에서만 1회)
  const idPattern = new RegExp(`id:\\s*['"]${pid}['"][\\s\\S]{0,600}?title:\\s*['"\`]` + oldTitle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + `['"\`]`);
  const match = src.match(idPattern);
  if (!match) { console.log(`  [skip] #${pid} title 패턴 매칭 실패: ${oldTitle}`); continue; }
  const replaced = match[0].replace(`title: '${oldTitle}'`, `title: '${newTitle}'`).replace(`title: "${oldTitle}"`, `title: "${newTitle}"`);
  if (replaced === match[0]) { console.log(`  [skip] #${pid} 교체 실패 (따옴표 종류 확인 필요)`); continue; }
  src = src.replace(match[0], replaced);
  applied++;
  console.log(`  [#${pid}] "${oldTitle}" → "${newTitle}" (${len}자)`);
}

fs.writeFileSync(GIG_DATA, src);
console.log(`\n적용: ${applied}/${Object.keys(priceMap).length}건`);
