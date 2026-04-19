-- 크몽 A/B 실험 — 기존 상품(A) vs 복제 변형 신규 상품(B) 30일 비교
-- 예산: A 10만/주 + B 10만/주 (사용자 지시 2026-04-19)

CREATE TABLE IF NOT EXISTS kmong_ab_experiments (
  id BIGSERIAL PRIMARY KEY,
  hypothesis TEXT,                           -- Opus의 가설 (왜 B가 더 나을까)

  variant_a_product_id TEXT NOT NULL,        -- 원본 (기존)
  variant_b_product_id TEXT,                 -- 신규 (등록 후 채움)
  variant_b_kmong_gig_id TEXT,               -- 크몽 내부 gig id (등록 완료 시)

  variant_b_title TEXT,                      -- 새 제목
  variant_b_subtitle TEXT,                   -- 새 부제
  variant_b_description TEXT,                -- 새 상세 요약
  variant_b_thumbnail_concept TEXT,          -- 썸네일 프롬프트/컨셉
  variant_b_changes JSONB,                   -- 변경 요약

  -- 상태
  state TEXT NOT NULL DEFAULT 'drafted'
    CHECK (state IN ('drafted','approved_to_create','created','live','measuring','concluded','cancelled')),
  user_approval TEXT,                        -- 'yes'/'no'/null (등록 전 사용자 OK 받기)

  -- 예산
  budget_a_weekly NUMERIC(10,0) DEFAULT 100000,
  budget_b_weekly NUMERIC(10,0) DEFAULT 100000,

  -- 타임라인
  drafted_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  created_at_gig TIMESTAMPTZ,
  live_at TIMESTAMPTZ,
  measurement_start_at TIMESTAMPTZ,
  measurement_end_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  measurement_days INTEGER DEFAULT 30,

  -- 결과
  metrics_a JSONB,
  metrics_b JSONB,
  winner TEXT CHECK (winner IN ('a','b','tie','inconclusive')),
  verdict_reasoning TEXT,
  action_taken TEXT,                         -- 'kept_a'/'switched_to_b'/'both_live'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_exp_state ON kmong_ab_experiments(state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ab_exp_a ON kmong_ab_experiments(variant_a_product_id);

-- 서비스당 live/measuring 동시 1개만 (동시 실험 중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ab_product_live
  ON kmong_ab_experiments(variant_a_product_id)
  WHERE state IN ('live','measuring');

-- 전체 동시 live/measuring 최대 3개 제한은 app 레벨에서 체크

COMMENT ON TABLE kmong_ab_experiments IS 'A/B 실험 — 원본 vs 복제 신규 상품 30일 비교';
COMMENT ON COLUMN kmong_ab_experiments.state IS 'drafted(Opus초안)→approved_to_create(사용자OK)→created(등록)→live(광고ON)→measuring(30일)→concluded(판정)';
COMMENT ON COLUMN kmong_ab_experiments.action_taken IS 'kept_a: A 유지 / switched_to_b: B 본상품 전환 / both_live: 둘 다 운영';
