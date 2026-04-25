-- 2026-04-25
-- 1) kmong_gig_status: 단가 + 비승인 사유 컬럼 추가 (CPC 손익 가드 + 비승인 자동처리용)
-- 2) kmong_gig_rejection_log: 비승인 사유 / LLM 수정안 / 적용/재승인 추적

ALTER TABLE kmong_gig_status
  ADD COLUMN IF NOT EXISTS price_min     INTEGER,
  ADD COLUMN IF NOT EXISTS price_max     INTEGER,
  ADD COLUMN IF NOT EXISTS draft_id      TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS kmong_gig_rejection_log (
  id              BIGSERIAL PRIMARY KEY,
  product_id      TEXT NOT NULL,
  draft_id        TEXT,
  gig_title       TEXT,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          TEXT,                -- 'bell' | 'my-gigs'
  reason_raw      TEXT,                -- 추출한 사유 원문
  reason_summary  TEXT,                -- LLM 요약 (한 줄)
  fix_proposal    JSONB,               -- LLM이 제안한 수정안 {field, before, after, reason}
  applied         BOOLEAN DEFAULT FALSE,
  applied_at      TIMESTAMPTZ,
  apply_result    JSONB,               -- {ok, error, response_url}
  resubmitted     BOOLEAN DEFAULT FALSE,
  resubmitted_at  TIMESTAMPTZ,
  reapproval_status TEXT,              -- 'approved' | 'rejected_again' | 'pending' | null
  reapproval_checked_at TIMESTAMPTZ,
  cancel_requested BOOLEAN DEFAULT FALSE,  -- 60초 취소 가드: 사용자가 텔레그램/SQL로 마킹 시 자동 적용 skip
  cancel_requested_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kgrl_product_detected
  ON kmong_gig_rejection_log (product_id, detected_at DESC);
