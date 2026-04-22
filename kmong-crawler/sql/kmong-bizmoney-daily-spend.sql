-- 2026-04-22: 비즈머니 일별 실지출 테이블
-- 배경: kmong_cpc_daily (click-up 크롤 기반) 는 product-map 중복 키워드 + UTC 버그 등으로
--       집계값이 오염되기 쉬움. /seller/bizmoney 페이지의 "비즈머니 일별 내역" 테이블은
--       크몽이 자체 집계하는 단일 truth. 이 값을 week_cost 계산의 ground-truth로 사용.
--
-- 컬럼 매핑 (크몽 UI → DB):
--   날짜 → date (PK)
--   충전 → recharge       (양수, 예: 200000)
--   적립 → accrued
--   환급 → refunded
--   사용 → spent          (양수로 저장. UI는 음수 "-1,610" 로 표시)
--   환불 → refund_canceled
--   만료 → expired
--   상환 → repaid
--
-- spent 컬럼이 광고비 실지출. 나머지는 리포트/감사용.

CREATE TABLE IF NOT EXISTS kmong_bizmoney_daily_spend (
  date              DATE PRIMARY KEY,
  spent             INTEGER NOT NULL DEFAULT 0,
  recharge          INTEGER NOT NULL DEFAULT 0,
  accrued           INTEGER NOT NULL DEFAULT 0,
  refunded          INTEGER NOT NULL DEFAULT 0,
  refund_canceled   INTEGER NOT NULL DEFAULT 0,
  expired           INTEGER NOT NULL DEFAULT 0,
  repaid            INTEGER NOT NULL DEFAULT 0,
  raw_row           TEXT,
  crawled_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kmong_bizmoney_daily_spend_date
  ON kmong_bizmoney_daily_spend (date DESC);

COMMENT ON TABLE kmong_bizmoney_daily_spend IS
  '크몽 /seller/bizmoney 페이지 "비즈머니 일별 내역" 테이블의 일별 스냅샷. 주간/일일 예산 판단의 ground-truth';
COMMENT ON COLUMN kmong_bizmoney_daily_spend.spent IS
  '일일 광고 실지출 원 (양수). UI는 음수 "-1,610"이지만 저장은 양수 1610';
COMMENT ON COLUMN kmong_bizmoney_daily_spend.raw_row IS
  '원본 테이블 행 텍스트 (디버그/감사용)';
