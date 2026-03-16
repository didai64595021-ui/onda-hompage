const Database = require('better-sqlite3');
const path = require('path');

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
      search_keyword TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_grade ON businesses(grade);
    CREATE INDEX IF NOT EXISTS idx_region ON businesses(region);
    CREATE INDEX IF NOT EXISTS idx_category ON businesses(category);
    CREATE INDEX IF NOT EXISTS idx_talktalk ON businesses(talktalk_active);
  `);

  // 기존 테이블에 새 컬럼 추가 (마이그레이션)
  const cols = d.prepare("PRAGMA table_info(businesses)").all().map(c => c.name);
  const migrations = [
    ['place_url', 'TEXT'],
    ['talktalk_active', "TEXT DEFAULT 'X'"],
    ['homepage_exists', "TEXT DEFAULT 'X'"],
    ['responsive', "TEXT DEFAULT 'X'"],
    ['kakao_button', "TEXT DEFAULT 'X'"],
  ];
  for (const [col, type] of migrations) {
    if (!cols.includes(col)) {
      d.exec(`ALTER TABLE businesses ADD COLUMN ${col} ${type}`);
    }
  }
  // 불필요한 컬럼(rating, talktalk_id)은 SQLite에서 DROP 불가 → 무시
}

// 등급 분류 (스펙 기준)
// S급: 톡톡 O + 홈페이지 X + 방문자리뷰 <10 + 블로그리뷰 <5
// A급: 톡톡 O + 홈페이지 X
// B급: 톡톡 O + 홈페이지 O + 반응형 X
// C급: 톡톡 O + 홈페이지 O + 카톡버튼 X
// D급: 톡톡 O + 방문자리뷰 <30
function classifyGrade(biz) {
  const hasTalktalk = biz.talktalk_active === 'O';
  const hasHomepage = biz.homepage_exists === 'O';
  const isResponsive = biz.responsive === 'O';
  const hasKakao = biz.kakao_button === 'O';
  const visitorReviews = biz.visitor_review_count || 0;
  const blogReviews = biz.blog_review_count || 0;

  if (!hasTalktalk) return null; // 톡톡 없으면 대상 아님

  // S급: 톡톡 O + 홈페이지 X + 리뷰 매우 적음
  if (!hasHomepage && visitorReviews < 10 && blogReviews < 5) return 'S';

  // A급: 톡톡 O + 홈페이지 X
  if (!hasHomepage) return 'A';

  // B급: 톡톡 O + 홈페이지 O + 반응형 X
  if (hasHomepage && !isResponsive) return 'B';

  // C급: 톡톡 O + 홈페이지 O + 카톡버튼 X
  if (hasHomepage && !hasKakao) return 'C';

  // D급: 톡톡 O + 방문자리뷰 < 30
  if (visitorReviews < 30) return 'D';

  return null; // 해당 없음
}

// 업체 존재 여부
function exists(placeId) {
  const d = getDb();
  const row = d.prepare('SELECT 1 FROM businesses WHERE place_id = ?').get(placeId);
  return !!row;
}

// 업체 저장/업데이트 (톡톡 없는 업체도 저장하여 중복 크롤링 방지)
function upsert(biz) {
  const d = getDb();
  const grade = classifyGrade(biz);

  const stmt = d.prepare(`
    INSERT INTO businesses (
      place_id, name, place_url, talktalk_active, talktalk_url,
      category, category_group, region, address,
      homepage_url, homepage_exists, responsive, kakao_button,
      visitor_review_count, blog_review_count,
      phone, grade, search_keyword
    ) VALUES (
      @place_id, @name, @place_url, @talktalk_active, @talktalk_url,
      @category, @category_group, @region, @address,
      @homepage_url, @homepage_exists, @responsive, @kakao_button,
      @visitor_review_count, @blog_review_count,
      @phone, @grade, @search_keyword
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
      search_keyword = @search_keyword,
      updated_at = datetime('now', 'localtime')
  `);

  stmt.run({ ...biz, grade });
  return grade;
}

// 전체 조회 (등급이 있는 업체만, 등급순 정렬)
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

// 통계
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
  return { total, totalAll, byGrade, byRegion, byCategory };
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, exists, upsert, getAll, getStats, classifyGrade, close };
