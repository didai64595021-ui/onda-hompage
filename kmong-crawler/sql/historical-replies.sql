-- 기존 크몽 inbox 과거 셀러 답변 축적 (말투 학습 재료)

CREATE TABLE IF NOT EXISTS kmong_historical_replies (
  id BIGSERIAL PRIMARY KEY,
  inbox_group_id TEXT NOT NULL,
  message_id TEXT,                     -- 크몽 내부 message id (dedup)
  customer_message TEXT,               -- 직전 고객 메시지 (context)
  seller_reply TEXT NOT NULL,          -- 내가 보낸 답변
  gig_id TEXT,
  product_id TEXT,                     -- matchProductId로 매핑
  sent_at TIMESTAMPTZ,
  word_count INTEGER,
  source TEXT DEFAULT 'historical',    -- historical | ai_generated | admin_edited
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inbox_group_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_hist_replies_product ON kmong_historical_replies(product_id);
CREATE INDEX IF NOT EXISTS idx_hist_replies_sent ON kmong_historical_replies(sent_at DESC);

-- 말투 프로필 (Opus가 종합 분석한 셀러 스타일 요약)
CREATE TABLE IF NOT EXISTS kmong_style_profile (
  id BIGSERIAL PRIMARY KEY,
  profile_name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,           -- 말투 특징 요약 (5~10문장)
  characteristics JSONB,               -- {greeting:..., closing:..., tone:..., sentence_length:..., emoji_usage:...}
  sample_count INTEGER,                -- 분석에 사용된 답변 수
  generated_by TEXT DEFAULT 'claude-opus-4-7',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE kmong_historical_replies IS '기존 크몽 inbox 셀러 답변 archive — 말투 학습 재료';
COMMENT ON TABLE kmong_style_profile IS 'Opus가 누적 답변 분석해 만든 셀러 말투 프로필';
