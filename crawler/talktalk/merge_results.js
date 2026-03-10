#!/usr/bin/env node
/**
 * 로컬 체커 결과(results.json)를 history.json에 병합
 * 사용법: node merge_results.js [results.json 경로]
 */
const fs = require('fs');
const path = require('path');

const resultsPath = process.argv[2] || path.join(__dirname, '..', 'output', 'results.json');
const historyPath = path.join(__dirname, '..', 'output', 'history.json');

if (!fs.existsSync(resultsPath)) {
  console.log('❌ results.json 없음:', resultsPath);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));

let updated = 0, notFound = 0;
for (const r of results) {
  const biz = history.crawled[r.key];
  if (!biz) { notFound++; continue; }
  
  if (r.talktalk === 'O' || r.talktalk === 'X') {
    biz.talktalkButton = r.talktalk;
    biz.talktalkVerified = 'local_check';
    if (r.place_id && !biz.placeUrl) {
      biz.placeUrl = `https://m.place.naver.com/place/${r.place_id}`;
    }
    updated++;
  }
}

fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

const all = Object.values(history.crawled);
const finalO = all.filter(b => b.talktalkButton === 'O').length;
const finalX = all.filter(b => b.talktalkButton === 'X').length;
const finalU = all.filter(b => b.talktalkButton === '미확인').length;

console.log(`✅ 병합 완료: ${updated}건 업데이트, ${notFound}건 미매칭`);
console.log(`📊 최종: O:${finalO} X:${finalX} 미확인:${finalU}`);
