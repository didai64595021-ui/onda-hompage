#!/usr/bin/env node
/**
 * fix_entities.js
 * HTML 엔티티가 포함된 업체명 디코딩
 * - &amp; &lt; &gt; &quot; &#39; &#숫자; 패턴 처리
 * - 원본은 name_raw에 보존
 * - 디코딩된 이름으로 history.json 업데이트
 */
const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, '..', 'output', 'history.json');

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const ENTITY_PATTERN = /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&#\d+;|&#x[0-9a-fA-F]+;/;

function hasEntity(str) {
  return str && ENTITY_PATTERN.test(str);
}

async function main() {
  console.log('[STEP-DONE] fix_entities 시작');
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  const entries = Object.entries(history.crawled);

  let fixed = 0;
  const examples = [];

  for (const [key, biz] of entries) {
    let changed = false;

    // 이름 디코딩
    if (hasEntity(biz.name)) {
      biz.name_raw = biz.name;
      biz.name = decodeHtmlEntities(biz.name);
      changed = true;
    }

    // 주소 디코딩
    if (hasEntity(biz.address)) {
      biz.address = decodeHtmlEntities(biz.address);
      changed = true;
    }

    // 도로명주소 디코딩
    if (hasEntity(biz.roadAddress)) {
      biz.roadAddress = decodeHtmlEntities(biz.roadAddress);
      changed = true;
    }

    if (changed) {
      fixed++;
      if (examples.length < 5) {
        examples.push(`  ${biz.name_raw || '(주소만)'} → ${biz.name}`);
      }
    }
  }

  // 키(name|address)에도 엔티티가 있을 수 있음 → 키 재생성
  let keyFixed = 0;
  const newCrawled = {};
  for (const [key, biz] of Object.entries(history.crawled)) {
    const newKey = `${biz.name}|${biz.address}`;
    if (newKey !== key && !newCrawled[newKey]) {
      keyFixed++;
      newCrawled[newKey] = biz;
    } else {
      newCrawled[key] = biz;
    }
  }
  history.crawled = newCrawled;

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  console.log(`\n${'═'.repeat(50)}`);
  console.log('✅ fix_entities 완료!');
  console.log(`📊 엔티티 수정: ${fixed}건 | 키 재생성: ${keyFixed}건`);
  if (examples.length > 0) {
    console.log('\n📝 예시:');
    examples.forEach(e => console.log(e));
  }
  console.log('[STEP-DONE] fix_entities 완료');
}

main().catch(console.error);
