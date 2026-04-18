/**
 * 크몽 서비스명 한글 매핑 모듈
 * slug(product_id) ↔ 한글 상품명 양방향 매핑.
 *
 * 우선순위:
 *   1) kmong_gig_status.gig_title (크몽 어드민에서 실크롤된 최신 타이틀)
 *   2) PRODUCT_MAP의 category (product-map.js 하드코딩 fallback)
 *   3) slug 원본 (영어 — 누락 경고)
 *
 * 모든 알림/리포트에서 이 모듈을 거쳐 표시한다.
 */

const { supabase } = require('./supabase');
const { PRODUCT_MAP } = require('./product-map');

const CACHE_TTL_MS = 10 * 60 * 1000; // 10분
let _cache = { map: null, fetchedAt: 0 };
const _missingSlugs = new Set();

function _fallbackName(slug) {
  const p = PRODUCT_MAP.find((x) => x.id === slug);
  return p?.category || null;
}

/**
 * DB에서 slug → gig_title 매핑 로드 (캐시)
 * kmong_gig_status 테이블의 가장 최근 스냅샷 기준.
 */
async function loadNameMap(force = false) {
  const now = Date.now();
  if (!force && _cache.map && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.map;
  }

  const { data, error } = await supabase
    .from('kmong_gig_status')
    .select('product_id, gig_title, crawled_at')
    .neq('product_id', 'unknown')
    .order('crawled_at', { ascending: false });

  const map = new Map();

  if (error) {
    console.error(`[gig-name] DB 조회 실패: ${error.message} — fallback 사용`);
  } else {
    // product_id 중복 시 가장 최근(첫 번째)만 유지
    for (const row of data || []) {
      if (!row.product_id) continue;
      if (!map.has(row.product_id) && row.gig_title) {
        map.set(row.product_id, row.gig_title);
      }
    }
  }

  // DB에 없는 slug는 PRODUCT_MAP category로 보강
  for (const p of PRODUCT_MAP) {
    if (!map.has(p.id) && p.category) {
      map.set(p.id, p.category);
    }
  }

  _cache = { map, fetchedAt: now };
  return map;
}

/**
 * slug → 한글 상품명
 * DB 조회 실패 시 PRODUCT_MAP fallback, 그것도 없으면 slug 원본 반환(경고 로그).
 * @param {string} slug
 * @returns {Promise<string>}
 */
async function getGigKoreanName(slug) {
  if (!slug) return '(미지정)';
  const map = await loadNameMap();
  const name = map.get(slug);
  if (name) return name;

  const fb = _fallbackName(slug);
  if (fb) return fb;

  if (!_missingSlugs.has(slug)) {
    _missingSlugs.add(slug);
    console.warn(`[gig-name] 매핑 누락: ${slug} (fallback 없음, 영어 원본 반환)`);
  }
  return slug;
}

/**
 * 동기 버전 — DB 캐시 없이 PRODUCT_MAP만 사용.
 * DB 조회가 불가능한 sync 컨텍스트(로그 포매터 등)에서 사용.
 */
function getGigKoreanNameSync(slug) {
  if (!slug) return '(미지정)';
  if (_cache.map?.has(slug)) return _cache.map.get(slug);
  return _fallbackName(slug) || slug;
}

/**
 * slug 리스트를 한글명 리스트로 일괄 변환.
 * @param {string[]} slugs
 * @returns {Promise<Array<{slug: string, name: string}>>}
 */
async function mapSlugs(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  await loadNameMap();
  return slugs.map((slug) => ({ slug, name: getGigKoreanNameSync(slug) }));
}

/**
 * "한글명 (slug)" 형식 포맷 — 리포트/알림 표시용.
 * @param {string} slug
 * @returns {Promise<string>}
 */
async function formatGigLabel(slug) {
  const name = await getGigKoreanName(slug);
  if (name === slug) return slug; // 누락 시 slug만
  return `${name} (${slug})`;
}

/**
 * 매핑 누락 slug 리스트 조회 (모니터링용).
 */
function getMissingSlugs() {
  return Array.from(_missingSlugs);
}

/**
 * 전체 매핑 반환 — 리포트 전체 서비스 나열 시 사용.
 */
async function getAllNames() {
  const map = await loadNameMap();
  const result = {};
  for (const [k, v] of map.entries()) result[k] = v;
  return result;
}

module.exports = {
  loadNameMap,
  getGigKoreanName,
  getGigKoreanNameSync,
  mapSlugs,
  formatGigLabel,
  getMissingSlugs,
  getAllNames,
};
