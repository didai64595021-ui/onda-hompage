-- 2026-04-21: kmong_cpc_daily에 crawled_at 추가 (UTC 버그 오염 감사 추적)
-- 적용: Supabase SQL Editor에 붙여넣고 실행
ALTER TABLE kmong_cpc_daily
  ADD COLUMN IF NOT EXISTS crawled_at TIMESTAMPTZ DEFAULT NOW();

-- 기존 행은 NULL이면 기본 NOW()로 채움 (정확도보다 감사 용도)
UPDATE kmong_cpc_daily SET crawled_at = NOW() WHERE crawled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kmong_cpc_daily_crawled_at
  ON kmong_cpc_daily (crawled_at DESC);

-- 참고: crawl-cpc.js의 upsert에서 { crawled_at: new Date().toISOString() } 명시하면
--       매 upsert마다 최신 갱신 시각이 덮임 → 언제 마지막 캡처됐는지 추적 가능
COMMENT ON COLUMN kmong_cpc_daily.crawled_at IS '마지막 크롤 시각 (UTC). 데이터 신선도 + upsert 오염 감사용';
