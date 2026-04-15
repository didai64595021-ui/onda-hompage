#!/usr/bin/env node
/**
 * 55개 상품 가격 추출 — JSON 출력
 *  - id, title, cat1, cat2, cat3, std, dlx, prm, daysStd, daysPrm
 */
const PRODUCTS = require('./gig-data-55').PRODUCTS || require('./gig-data-55');
const out = [];
for (const p of PRODUCTS) {
  if (!p || !p.packages) continue;
  const std = p.packages.find(x => x.name === 'STANDARD') || p.packages[0];
  const dlx = p.packages.find(x => x.name === 'DELUXE')   || p.packages[1];
  const prm = p.packages.find(x => x.name === 'PREMIUM')  || p.packages[2];
  out.push({
    id: p.id,
    title: p.title || p.name,
    cat1: p.cat1 || p.category1 || p.rootCategoryId,
    cat2: p.cat2 || p.category2 || p.subCategoryId,
    cat3: p.cat3 || p.category3 || p.thirdCategoryId,
    std: std?.price ?? null,
    dlx: dlx?.price ?? null,
    prm: prm?.price ?? null,
    daysStd: std?.days ?? null,
    daysPrm: prm?.days ?? null,
    avg: ((std?.price || 0) + (dlx?.price || 0) + (prm?.price || 0)) / 3,
  });
}
console.log(JSON.stringify(out, null, 2));
