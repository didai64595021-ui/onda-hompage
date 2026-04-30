-- 외부(크몽 외) 결제 매출 기록 — ROI/객단가 분석에 합산
--
-- 출처: 사용자 직접 결제, 다른 플랫폼, 화상 상담 후 송금 등
-- crawl-orders가 아닌 수동 입력 위주
--
-- 사용:
--   INSERT INTO external_revenue (date, amount, product_id, channel, note, ...)

CREATE TABLE IF NOT EXISTS external_revenue (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  amount          INTEGER NOT NULL,
  product_id      TEXT,
  channel         TEXT NOT NULL DEFAULT 'direct',  -- direct / referral / repeat / etc
  customer_name   TEXT,
  note            TEXT,
  invoiced        BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_revenue_date ON external_revenue(date);
CREATE INDEX IF NOT EXISTS idx_external_revenue_product_id ON external_revenue(product_id);

COMMENT ON TABLE external_revenue IS '크몽 외부 결제 매출 — ROI/객단가 분석에 합산';
COMMENT ON COLUMN external_revenue.channel IS 'direct: 직접 결제 / referral: 추천 / repeat: 재구매 / etc';
COMMENT ON COLUMN external_revenue.product_id IS 'product-map.js의 id (no-homepage, corp-seo, kakao-excel 등). NULL 가능.';
