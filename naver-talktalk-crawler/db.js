const Database = require('better-sqlite3');
const path = require('path');
const { classify } = require('./classifier');

const DB_PATH = path.join(__dirname, 'targets.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      place_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      place_url TEXT,
      talktalk_active TEXT DEFAULT 'X',
      talktalk_url TEXT,
      category TEXT,
      category_group TEXT,
      region TEXT,
      address TEXT,
      homepage_url TEXT,
      homepage_exists TEXT DEFAULT 'X',
      responsive TEXT DEFAULT 'X',
      kakao_button TEXT DEFAULT 'X',
      visitor_review_count INTEGER DEFAULT 0,
      blog_review_count INTEGER DEFAULT 0,
      phone TEXT,
      grade TEXT,
      target_menu TEXT DEFAULT '해당없음',
      search_keyword TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

  `);

  // 마이그레이션 (인덱스 전에 실행)
  const cols = d.prepare("PRAGMA table_info(businesses)").all().map(c => c.name);
  const migrations = [
    ['place_url', 'TEXT'],
    ['talktalk_active', "TEXT DEFAULT 'X'"],
    ['homepage_exists', "TEXT DEFAULT 'X'"],
    ['responsive', "TEXT DEFAULT 'X'"],
    ['kakao_button', "TEXT DEFAULT 'X'"],
    ['target_menu', "TEXT DEFAULT '해당없음'"],
  ];
  for (const [col, type] of migrations) {
    if (!cols.includes(col)) {
      d.exec(`ALTER TABLE businesses ADD COLUMN ${col} ${type}`);
    }
  }

  // 인덱스 생성 (마이그레이션 후)
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_grade ON businesses(grade);
    CREATE INDEX IF NOT EXISTS idx_region ON businesses(region);
    CREATE INDEX IF NOT EXISTS idx_category ON businesses(category);
    CREATE INDEX IF NOT EXISTS idx_talktalk ON businesses(talktalk_active);
    CREATE INDEX IF NOT EXISTS idx_target_menu ON businesses(target_menu);
  `);
}

function exists(placeId) {
  const d = getDb();
  const row = d.prepare('SELECT 1 FROM businesses WHERE place_id = ?').get(placeId);
  return !!row;
}

function upsert(biz) {
  const d = getDb();
  const { grade, target_menu } = classify(biz);

  const stmt = d.prepare(`
    INSERT INTO businesses (
      place_id, name, place_url, talktalk_active, talktalk_url,
      category, category_group, region, address,
      homepage_url, homepage_exists, responsive, kakao_button,
      visitor_review_count, blog_review_count,
      phone, grade, target_menu, search_keyword
    ) VALUES (
      @place_id, @name, @place_url, @talktalk_active, @talktalk_url,
      @category, @category_group, @region, @address,
      @homepage_url, @homepage_exists, @responsive, @kakao_button,
      @visitor_review_count, @blog_review_count,
      @phone, @grade, @target_menu, @search_keyword
    )
    ON CONFLICT(place_id) DO UPDATE SET
      name = @name,
      place_url = @place_url,
      talktalk_active = @talktalk_active,
      talktalk_url = @talktalk_url,
      category = @category,
      category_group = @category_group,
      region = @region,
      address = @address,
      homepage_url = @homepage_url,
      homepage_exists = @homepage_exists,
      responsive = @responsive,
      kakao_button = @kakao_button,
      visitor_review_count = @visitor_review_count,
      blog_review_count = @blog_review_count,
      phone = @phone,
      grade = @grade,
      target_menu = @target_menu,
      search_keyword = @search_keyword,
      updated_at = datetime('now', 'localtime')
  `);

  stmt.run({ ...biz, grade, target_menu });
  return grade;
}

function getAll(options = {}) {
  const d = getDb();
  let where = ['grade IS NOT NULL'];
  let params = {};

  if (options.grade) {
    where.push('grade = @grade');
    params.grade = options.grade;
  }
  if (options.region) {
    where.push('region LIKE @region');
    params.region = `%${options.region}%`;
  }
  if (options.category) {
    where.push('category LIKE @category');
    params.category = `%${options.category}%`;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const gradeOrder = "CASE grade WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 WHEN 'D' THEN 5 END";

  return d.prepare(`
    SELECT * FROM businesses ${whereClause}
    ORDER BY ${gradeOrder}, visitor_review_count DESC
  `).all(params);
}

// 배치 출력용: 아직 내보내지 않은 레코드 수
function getUnexportedCount() {
  const d = getDb();
  return d.prepare("SELECT COUNT(*) as cnt FROM businesses WHERE grade IS NOT NULL").get().cnt;
}

function getStats() {
  const d = getDb();
  const totalAll = d.prepare('SELECT COUNT(*) as cnt FROM businesses').get().cnt;
  const total = d.prepare("SELECT COUNT(*) as cnt FROM businesses WHERE grade IS NOT NULL").get().cnt;
  const byGrade = d.prepare(`
    SELECT grade, COUNT(*) as cnt FROM businesses WHERE grade IS NOT NULL GROUP BY grade
    ORDER BY CASE grade WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 WHEN 'D' THEN 5 END
  `).all();
  const byRegion = d.prepare(`
    SELECT region, COUNT(*) as cnt FROM businesses WHERE grade IS NOT NULL GROUP BY region ORDER BY cnt DESC LIMIT 10
  `).all();
  const byCategory = d.prepare(`
    SELECT category_group, COUNT(*) as cnt FROM businesses WHERE grade IS NOT NULL GROUP BY category_group ORDER BY cnt DESC LIMIT 10
  `).all();
  const byMenu = d.prepare(`
    SELECT target_menu, COUNT(*) as cnt FROM businesses WHERE grade IS NOT NULL GROUP BY target_menu ORDER BY cnt DESC
  `).all();
  return { total, totalAll, byGrade, byRegion, byCategory, byMenu };
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, exists, upsert, getAll, getUnexportedCount, getStats, close };
