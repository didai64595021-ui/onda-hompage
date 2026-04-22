-- 2026-04-22: auto-reply race condition 방지
-- crawl-inbox detect-spawn + PM2 15분 cron 이 동시에 같은 pending row 잡아 중복 답변.
-- atomic claim: pending → processing 전환 시 claimed_at 기록. stale 감지(15분+) 시 재확보.

ALTER TABLE kmong_inquiries
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_kmong_inquiries_status_pending
  ON kmong_inquiries (auto_reply_status, claimed_at)
  WHERE auto_reply_status IN ('pending', 'processing');

COMMENT ON COLUMN kmong_inquiries.claimed_at IS
  'auto-reply 처리 claim 시각. processing 상태로 전환된 순간 setNow. stale 감지용';
