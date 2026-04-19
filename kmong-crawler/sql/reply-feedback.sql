-- 관리자 답변 피드백 로그 — Claude가 편집 패턴 학습하는 재료
-- Supabase SQL Editor 1회 실행

CREATE TABLE IF NOT EXISTS kmong_reply_feedback (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id BIGINT,
  action TEXT NOT NULL CHECK (action IN ('send', 'edit', 'skip', 'regen', 'approve')),
  original_reply TEXT,          -- Opus 생성 원본
  edited_reply TEXT,            -- 관리자 수정본 (edit일 때만)
  skip_reason TEXT,             -- skip 이유 (선택)
  regen_reason TEXT,            -- regen 시 수정 요청 사항
  admin_id TEXT,                -- 텔레그램 admin user_id
  inquiry_snapshot JSONB,       -- 당시 문의 원문 + intent + leadHeat
  -- 학습에 쓸 다이제스트
  diff_summary TEXT,            -- edit 시 Claude가 뽑은 변경 요약 (선택, 추후 run-learning-loop가 채움)
  applied_to_learning BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reply_feedback_inquiry ON kmong_reply_feedback(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_reply_feedback_action ON kmong_reply_feedback(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reply_feedback_unprocessed ON kmong_reply_feedback(applied_to_learning, created_at) WHERE applied_to_learning = FALSE;

COMMENT ON TABLE kmong_reply_feedback IS '관리자 send/edit/skip/regen 행동 로그 — few-shot 재료';
