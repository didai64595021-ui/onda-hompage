#!/usr/bin/env node
/**
 * sql/kmong-bizmoney-daily-spend.sql 을 Supabase Management API로 적용.
 * 1회성 마이그레이션 러너.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { rawQuery } = require('../lib/supabase-admin');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'kmong-bizmoney-daily-spend.sql'), 'utf-8');
  const r = await rawQuery(sql);
  if (!r.ok) {
    console.error('[FAIL]', r.status, r.error);
    process.exit(1);
  }
  console.log('[OK] kmong_bizmoney_daily_spend 테이블/인덱스/코멘트 적용 완료');
})();
