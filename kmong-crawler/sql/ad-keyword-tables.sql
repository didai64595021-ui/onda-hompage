-- Supabase Dashboard SQL Editor 에서 1회 실행
-- 크몽 클릭업 광고 확장 — 키워드별 성과, 추천 입찰가, 광고 설정, 봇 판단 로그
-- 작성: 2026-04-19 (onda-hompage/kmong-crawler)

-- 1) 키워드별 일일 성과 (상세 보기 모달)
CREATE TABLE IF NOT EXISTS kmong_ad_keyword_daily (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  date DATE NOT NULL,
  keyword TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  avg_cpc NUMERIC(10,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, date, keyword)
);
CREATE INDEX IF NOT EXISTS idx_kmong_ad_kw_product_date ON kmong_ad_keyword_daily(product_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_kmong_ad_kw_keyword ON kmong_ad_keyword_daily(keyword);

-- 2) 추천 입찰가 스냅샷 (변경 모달에서 상세 모달 열 때마다 저장)
CREATE TABLE IF NOT EXISTS kmong_ad_bid_suggestion (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  category TEXT,
  suggested_cpc NUMERIC(10,2) NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kmong_bid_product_captured ON kmong_ad_bid_suggestion(product_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_kmong_bid_keyword ON kmong_ad_bid_suggestion(keyword);

-- 3) 광고 설정 일일 스냅샷 (희망 CPC, 일 예산, 종료일, ON/OFF)
CREATE TABLE IF NOT EXISTS kmong_ad_config_daily (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  date DATE NOT NULL,
  desired_cpc NUMERIC(10,2),
  daily_budget NUMERIC(12,2),
  end_date DATE,
  ad_enabled BOOLEAN DEFAULT TRUE,
  ad_status TEXT,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, date)
);
CREATE INDEX IF NOT EXISTS idx_kmong_config_product_date ON kmong_ad_config_daily(product_id, date DESC);

-- 4) 광고 봇 판단/액션 로그 (Sprint 4)
--    Opus 4.7 판단 근거, 제안 입찰가, 실제 적용 여부, 결과 성과 추적
CREATE TABLE IF NOT EXISTS kmong_ad_bot_actions (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_date DATE NOT NULL,
  before_state JSONB,
  after_state JSONB,
  suggested_by TEXT DEFAULT 'claude-opus-4-7',
  reasoning TEXT,
  metrics_snapshot JSONB,
  budget_input NUMERIC(12,2),
  applied BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  result_evaluated_at TIMESTAMPTZ,
  result_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kmong_bot_product_date ON kmong_ad_bot_actions(product_id, action_date DESC);
CREATE INDEX IF NOT EXISTS idx_kmong_bot_applied ON kmong_ad_bot_actions(applied, created_at DESC);

-- 5) 광고 봇 예산 설정 (사용자 입력)
CREATE TABLE IF NOT EXISTS kmong_ad_budget (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT,
  budget_type TEXT NOT NULL DEFAULT 'daily',
  budget_amount NUMERIC(12,2) NOT NULL,
  priority TEXT DEFAULT 'roi',
  active BOOLEAN DEFAULT TRUE,
  min_cpc NUMERIC(10,2),
  max_cpc NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kmong_budget_active ON kmong_ad_budget(active, product_id);

COMMENT ON TABLE kmong_ad_keyword_daily IS '클릭업 상세 모달의 검색어별 일일 성과';
COMMENT ON TABLE kmong_ad_bid_suggestion IS '크몽이 제시하는 키워드별 추천 입찰가 스냅샷';
COMMENT ON TABLE kmong_ad_config_daily IS '일자별 희망 CPC/일예산/ON-OFF 스냅샷';
COMMENT ON TABLE kmong_ad_bot_actions IS 'Claude Opus 4.7 광고 최적화 봇 판단/적용/결과 로그';
COMMENT ON TABLE kmong_ad_budget IS '사용자 입력 광고 예산 (일/주/월, 서비스별 또는 전체)';
