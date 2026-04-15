-- Supabase Dashboard SQL Editor 에서 1회 실행
-- 대시보드 콘솔 404 (kmong_content_generated, kmong_ab_tests, kmong_patterns, kmong_inbox_classification) 해결용

CREATE TABLE IF NOT EXISTS kmong_patterns (
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
);

CREATE TABLE IF NOT EXISTS kmong_ab_tests (
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
);

CREATE TABLE IF NOT EXISTS kmong_content_generated (
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
);

CREATE TABLE IF NOT EXISTS kmong_inbox_classification (
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
);

-- (선택) RPC 함수 — 향후 setup-phase3-db.js 자동 적용 위함
CREATE OR REPLACE FUNCTION public.exec_sql(sql text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN EXECUTE sql; END; $$;
