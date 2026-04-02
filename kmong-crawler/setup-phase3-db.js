#!/usr/bin/env node
/**
 * 크몽 Phase 3-4 — Supabase 스키마 마이그레이션
 * - kmong_patterns: 성공/실패 패턴 DB
 * - kmong_ab_tests: A/B 테스트 관리
 * - kmong_content_generated: AI 생성 콘텐츠 관리
 * - kmong_optimization_log 컬럼 추가
 * - kmong_inbox_classification: 인박스 메시지 분류
 */

const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');

const MIGRATIONS = [
  // 1. kmong_patterns — 성공/실패 패턴 DB
  `CREATE TABLE IF NOT EXISTS kmong_patterns (
    id SERIAL PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    category TEXT,
    product_id TEXT,
    pattern_key TEXT NOT NULL,
    pattern_value JSONB NOT NULL,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    confidence_score NUMERIC(5,2) DEFAULT 0,
    last_validated_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 2. kmong_ab_tests — A/B 테스트 관리
  `CREATE TABLE IF NOT EXISTS kmong_ab_tests (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    test_name TEXT NOT NULL,
    test_type TEXT NOT NULL,
    variant_a JSONB NOT NULL,
    variant_b JSONB NOT NULL,
    variant_a_metrics JSONB DEFAULT '{"impressions":0,"clicks":0,"inquiries":0,"orders":0,"revenue":0}'::jsonb,
    variant_b_metrics JSONB DEFAULT '{"impressions":0,"clicks":0,"inquiries":0,"orders":0,"revenue":0}'::jsonb,
    winner TEXT,
    status TEXT DEFAULT 'running',
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    min_sample_size INTEGER DEFAULT 100,
    confidence_level NUMERIC(5,2) DEFAULT 95.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 3. kmong_content_generated — AI 생성 콘텐츠
  `CREATE TABLE IF NOT EXISTS kmong_content_generated (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    original_content TEXT,
    generated_content TEXT NOT NULL,
    generation_reason TEXT,
    pattern_ids JSONB,
    quality_score NUMERIC(5,2),
    status TEXT DEFAULT 'pending',
    applied_at TIMESTAMPTZ,
    effect_measured BOOLEAN DEFAULT FALSE,
    effect_metrics JSONB,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 4. kmong_optimization_log 컬럼 추가
  `ALTER TABLE kmong_optimization_log ADD COLUMN IF NOT EXISTS ab_test_id INTEGER`,
  `ALTER TABLE kmong_optimization_log ADD COLUMN IF NOT EXISTS content_id INTEGER`,
  `ALTER TABLE kmong_optimization_log ADD COLUMN IF NOT EXISTS pattern_ids JSONB`,
  `ALTER TABLE kmong_optimization_log ADD COLUMN IF NOT EXISTS auto_applied BOOLEAN DEFAULT FALSE`,

  // 5. kmong_inbox_classification — 인박스 메시지 분류/우선순위
  `CREATE TABLE IF NOT EXISTS kmong_inbox_classification (
    id SERIAL PRIMARY KEY,
    inquiry_id INTEGER,
    priority TEXT DEFAULT 'normal',
    category TEXT,
    sentiment TEXT,
    intent TEXT,
    urgency_score NUMERIC(5,2) DEFAULT 50,
    suggested_reply TEXT,
    suggested_template_id INTEGER,
    reply_confidence NUMERIC(5,2),
    auto_replied BOOLEAN DEFAULT FALSE,
    admin_override TEXT,
    classified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 6. kmong_inquiries에 분류 관련 컬럼 추가
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'`,
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS sentiment TEXT`,
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT`,
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS reply_confidence NUMERIC(5,2)`,
];

// 초기 패턴 시드 데이터
const SEED_PATTERNS = [
  {
    pattern_type: 'title',
    category: '홈페이지',
    pattern_key: 'urgency_keyword',
    pattern_value: { keywords: ['3일', '24시간', '48시간', '즉시'], effect: 'ctr_boost', avg_lift: 15 },
    success_count: 3,
    confidence_score: 72,
  },
  {
    pattern_type: 'title',
    category: '홈페이지',
    pattern_key: 'price_anchor',
    pattern_value: { keywords: ['12만원', '만원부터', '저렴'], effect: 'inquiry_boost', avg_lift: 10 },
    success_count: 2,
    confidence_score: 60,
  },
  {
    pattern_type: 'title',
    category: '홈페이지',
    pattern_key: 'problem_solution',
    pattern_value: { keywords: ['깨짐', '해결', '고민'], effect: 'ctr_boost', avg_lift: 12 },
    success_count: 2,
    confidence_score: 65,
  },
  {
    pattern_type: 'description',
    category: '홈페이지',
    pattern_key: 'social_proof',
    pattern_value: { elements: ['리뷰 수', '만족도', '완료 건수'], effect: 'conversion_boost', avg_lift: 20 },
    success_count: 4,
    confidence_score: 80,
  },
  {
    pattern_type: 'reply',
    category: '전체',
    pattern_key: 'portfolio_first',
    pattern_value: { strategy: '포트폴리오 선제시', timing: 'first_contact', effect: 'reply_rate_boost', avg_lift: 25 },
    success_count: 3,
    confidence_score: 70,
  },
  {
    pattern_type: 'reply',
    category: '전체',
    pattern_key: 'price_transparency',
    pattern_value: { strategy: '가격 선안내', timing: 'first_contact', effect: 'conversion_boost', avg_lift: 18 },
    success_count: 2,
    confidence_score: 62,
  },
];

async function runMigrations() {
  console.log('=== 크몽 Phase 3-4 DB 마이그레이션 시작 ===\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i];
    const label = sql.trim().substring(0, 60).replace(/\n/g, ' ');
    try {
      const response = await fetch(
        `${process.env.SUPABASE_URL || 'https://byaipfmwicukyzruqtsj.supabase.co'}/rest/v1/rpc/exec_sql`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ sql }),
        }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
      }
      console.log(`[${i + 1}/${MIGRATIONS.length}] OK: ${label}...`);
      successCount++;
    } catch (err) {
      console.error(`[${i + 1}/${MIGRATIONS.length}] FAIL: ${label}...`);
      console.error(`  → ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n--- 마이그레이션: ${successCount} 성공 / ${failCount} 실패 ---\n`);

  // 시드 데이터 삽입
  console.log('=== 패턴 시드 데이터 삽입 ===');
  for (const pattern of SEED_PATTERNS) {
    const { data: existing } = await supabase
      .from('kmong_patterns')
      .select('id')
      .eq('pattern_key', pattern.pattern_key)
      .eq('pattern_type', pattern.pattern_type)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[스킵] 이미 존재: ${pattern.pattern_key}`);
      continue;
    }

    const { error } = await supabase
      .from('kmong_patterns')
      .insert(pattern);

    if (error) {
      console.error(`[시드 실패] ${pattern.pattern_key}: ${error.message}`);
    } else {
      console.log(`[시드 OK] ${pattern.pattern_key}`);
    }
  }

  const msg = `크몽 Phase 3-4 DB 마이그레이션 완료 (${successCount}/${MIGRATIONS.length} 성공, 패턴 시드 ${SEED_PATTERNS.length}건)`;
  console.log(`\n=== ${msg} ===`);
  notify(msg);
}

runMigrations().catch((err) => {
  console.error(`[치명적 에러] ${err.message}`);
  process.exit(1);
});
