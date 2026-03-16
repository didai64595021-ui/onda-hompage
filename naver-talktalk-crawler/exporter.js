const { stringify } = require('csv-stringify/sync');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const OUTPUT_DIR = path.join(__dirname, 'output');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function getFilename(format) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `talktalk_targets_${date}.${format}`;
}

function exportCsv(options = {}) {
  ensureOutputDir();
  const rows = db.getAll(options);

  if (rows.length === 0) {
    console.log('내보낼 데이터가 없습니다.');
    return null;
  }

  // 8필드 기준 CSV 컬럼
  const columns = [
    { key: 'grade', header: '등급' },
    { key: 'name', header: '업체명' },
    { key: 'place_url', header: '플레이스링크' },
    { key: 'talktalk_active', header: '톡톡활성여부' },
    { key: 'visitor_review_count', header: '방문자리뷰수' },
    { key: 'blog_review_count', header: '블로그리뷰수' },
    { key: 'homepage_exists', header: '홈페이지유무' },
    { key: 'homepage_url', header: '홈페이지URL' },
    { key: 'responsive', header: '반응형여부' },
    { key: 'kakao_button', header: '카톡버튼유무' },
    { key: 'category', header: '업종' },
    { key: 'category_group', header: '업종그룹' },
    { key: 'region', header: '지역' },
    { key: 'address', header: '주소' },
    { key: 'phone', header: '전화번호' },
    { key: 'talktalk_url', header: '톡톡링크' },
  ];

  const csvData = stringify(rows, {
    header: true,
    columns,
    bom: true,
  });

  const filename = getFilename('csv');
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, csvData, 'utf-8');
  console.log(`CSV 내보내기 완료: ${filepath} (${rows.length}건)`);
  return filepath;
}

function exportJson(options = {}) {
  ensureOutputDir();
  const rows = db.getAll(options);

  if (rows.length === 0) {
    console.log('내보낼 데이터가 없습니다.');
    return null;
  }

  const filename = getFilename('json');
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`JSON 내보내기 완료: ${filepath} (${rows.length}건)`);
  return filepath;
}

module.exports = { exportCsv, exportJson };
