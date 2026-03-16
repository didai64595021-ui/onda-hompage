const { stringify } = require('csv-stringify/sync');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const OUTPUT_DIR = path.join(__dirname, 'output');
const BATCH_SIZE = 100;

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// CSV 컬럼 정의 (스펙 순서)
const CSV_COLUMNS = [
  { key: 'name', header: '업체명' },
  { key: 'place_url', header: '플레이스링크' },
  { key: 'talktalk_active', header: '톡톡' },
  { key: 'visitor_review_count', header: '방문자리뷰' },
  { key: 'blog_review_count', header: '블로그리뷰' },
  { key: 'homepage_url', header: '홈페이지URL' },
  { key: 'responsive', header: '반응형' },
  { key: 'kakao_button', header: '카톡버튼' },
  { key: 'target_menu', header: '타겟메뉴' },
  { key: 'grade', header: '전환등급' },
  { key: 'category', header: '업종' },
  { key: 'region', header: '지역' },
  { key: 'address', header: '주소' },
  { key: 'phone', header: '전화번호' },
  { key: 'talktalk_url', header: '톡톡링크' },
];

// 100개 배치 CSV 생성 (키워드별)
function exportBatch(rows, batchNum, keyword) {
  ensureOutputDir();
  if (rows.length === 0) return null;

  const padded = String(batchNum).padStart(3, '0');
  const safeName = keyword.replace(/\s+/g, '_');
  const filename = `batch_${padded}_${safeName}.csv`;
  const filepath = path.join(OUTPUT_DIR, filename);

  const csvData = stringify(rows, { header: true, columns: CSV_COLUMNS, bom: true });
  fs.writeFileSync(filepath, csvData, 'utf-8');

  // 등급별 통계
  const gradeCount = {};
  for (const r of rows) {
    gradeCount[r.grade] = (gradeCount[r.grade] || 0) + 1;
  }
  const stats = Object.entries(gradeCount)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, c]) => `${g}급 ${c}개`)
    .join(', ');

  console.log(`[BATCH] ${filename} 생성: ${stats}`);
  return filepath;
}

// 전체 CSV 내보내기
function exportCsv(options = {}) {
  ensureOutputDir();
  const rows = db.getAll(options);

  if (rows.length === 0) {
    console.log('내보낼 데이터가 없습니다.');
    return null;
  }

  const csvData = stringify(rows, { header: true, columns: CSV_COLUMNS, bom: true });

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `talktalk_targets_${date}.csv`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, csvData, 'utf-8');
  console.log(`CSV 내보내기 완료: ${filepath} (${rows.length}건)`);
  return filepath;
}

// 전체 JSON 내보내기
function exportJson(options = {}) {
  ensureOutputDir();
  const rows = db.getAll(options);

  if (rows.length === 0) {
    console.log('내보낼 데이터가 없습니다.');
    return null;
  }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `talktalk_targets_${date}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`JSON 내보내기 완료: ${filepath} (${rows.length}건)`);
  return filepath;
}

module.exports = { exportBatch, exportCsv, exportJson, BATCH_SIZE };
