/**
 * Supabase Management API 직접 SQL (PostgREST schema cache 우회용)
 * - 새 테이블 생성 직후 PostgREST cache 반영 지연 (수~분) 시 fallback
 * - 일반 use는 lib/supabase.js의 supabase-js 클라이언트 사용 권장
 */

const PROJECT_REF = 'byaipfmwicukyzruqtsj';

function needToken() {
  const t = process.env.SUPABASE_ACCESS_TOKEN;
  if (!t) throw new Error('SUPABASE_ACCESS_TOKEN env 필요 (Management API)');
  return t;
}

function escapeValue(v) {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'::timestamptz`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function rawQuery(query) {
  const token = needToken();
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (r.status >= 400) return { ok: false, status: r.status, error: text.slice(0, 400) };
  try { return { ok: true, data: JSON.parse(text) }; }
  catch { return { ok: true, data: text }; }
}

async function insertRow(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map(c => escapeValue(row[c]));
  const query = `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(',')}) VALUES (${vals.join(',')}) RETURNING *;`;
  const r = await rawQuery(query);
  if (!r.ok) return r;
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, row: rows[0] || null };
}

async function updateById(table, id, patch) {
  const sets = Object.entries(patch).map(([k, v]) => `"${k}" = ${escapeValue(v)}`).join(', ');
  const query = `UPDATE ${table} SET ${sets} WHERE id = ${escapeValue(id)} RETURNING *;`;
  return rawQuery(query);
}

async function selectWhere(table, whereClause, limit = 100) {
  const query = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT ${limit};`;
  return rawQuery(query);
}

module.exports = { rawQuery, insertRow, updateById, selectWhere };
