const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
let errors = 0;
htmlFiles.forEach(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  // 기본 검증: DOCTYPE, <html>, <head>, <body>
  if (!content.includes('<!DOCTYPE') && !content.includes('<!doctype')) {
    console.log(`⚠️ ${f}: DOCTYPE 없음`); errors++;
  }
  // 닫히지 않은 태그 간단 체크
  const opens = (content.match(/<(div|section|main|header|footer|nav|article|aside)[^>]*>/gi) || []).length;
  const closes = (content.match(/<\/(div|section|main|header|footer|nav|article|aside)>/gi) || []).length;
  if (opens !== closes) {
    console.log(`⚠️ ${f}: 열린 태그(${opens}) != 닫힌 태그(${closes})`); errors++;
  }
});
if (errors === 0) console.log(`✅ ${htmlFiles.length}개 HTML 파일 검증 통과`);
else { console.log(`❌ ${errors}건 오류`); process.exit(1); }
