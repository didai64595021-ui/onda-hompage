-- 크몽 소재 A/B 수정 큐 (썸네일/제목/상세페이지 — 승인 3~5일)
-- Supabase Dashboard SQL Editor에서 1회 실행

CREATE TABLE IF NOT EXISTS kmong_creative_queue (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  element_type TEXT NOT NULL CHECK (element_type IN ('thumbnail', 'title', 'description', 'subtitle', 'faq')),

  -- 큐/상태
  priority INTEGER DEFAULT 50,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','submitted','approved','rejected','measuring','done','cancelled')),

  -- 제안 (Opus가 생성)
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  proposed_by TEXT DEFAULT 'claude-opus-4-7',
  reasoning TEXT,
  before_value TEXT,
  after_value TEXT,
  metrics_before JSONB,

  -- 제출 (Playwright)
  submitted_at TIMESTAMPTZ,
  submission_result JSONB,

  -- 승인/측정
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  measuring_started_at TIMESTAMPTZ,
  measuring_days INTEGER DEFAULT 7,
  metrics_after JSONB,
  lift_ctr NUMERIC(5,2),
  lift_cvr NUMERIC(5,2),
  lift_roas NUMERIC(5,2),
  verdict TEXT CHECK (verdict IN ('win','lose','inconclusive')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_queue_state ON kmong_creative_queue(state, priority DESC);
CREATE INDEX IF NOT EXISTS idx_creative_queue_product_state ON kmong_creative_queue(product_id, state);

-- 서비스당 동시 submitted 1개 제한 (승인 중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_creative_product_submitted
  ON kmong_creative_queue(product_id)
  WHERE state IN ('submitted','measuring');

COMMENT ON TABLE kmong_creative_queue IS '크몽 소재 수정 순차 큐 — 심사 3~5일 감안, 서비스당 동시 1개 submitted';
COMMENT ON COLUMN kmong_creative_queue.state IS 'pending(제안만)→submitted(크몽제출)→approved/rejected→measuring(7일측정)→done/cancelled';
COMMENT ON COLUMN kmong_creative_queue.element_type IS 'thumbnail/title/description/subtitle/faq';
