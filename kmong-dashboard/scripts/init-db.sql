-- 크몽 CPC 대시보드 DB 초기화 스크립트
-- Supabase Dashboard > SQL Editor 에서 실행

-- 1. 상품 마스터
CREATE TABLE IF NOT EXISTS kmong_products (
  id SERIAL PRIMARY KEY,
  product_id TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT,
  price_standard INTEGER,
  price_deluxe INTEGER,
  price_premium INTEGER,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CPC 광고 일별 데이터
CREATE TABLE IF NOT EXISTS kmong_cpc_daily (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cpc_cost INTEGER DEFAULT 0,
  ctr NUMERIC(5,2) DEFAULT 0,
  title_text TEXT,
  thumbnail_hash TEXT,
  UNIQUE(product_id, date)
);

-- 3. 소재 변경 이력
CREATE TABLE IF NOT EXISTS kmong_creative_changes (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  change_date DATE NOT NULL,
  change_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 문의 데이터
CREATE TABLE IF NOT EXISTS kmong_inquiries (
  id SERIAL PRIMARY KEY,
  product_id TEXT,
  inquiry_date TIMESTAMPTZ NOT NULL,
  customer_name TEXT,
  inquiry_type TEXT,
  status TEXT DEFAULT 'pending',
  quoted_amount INTEGER,
  paid_amount INTEGER,
  converted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 주문 데이터
CREATE TABLE IF NOT EXISTS kmong_orders (
  id SERIAL PRIMARY KEY,
  order_id TEXT UNIQUE,
  product_id TEXT NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  package_type TEXT,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'in_progress',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE kmong_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmong_cpc_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmong_creative_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmong_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmong_orders ENABLE ROW LEVEL SECURITY;

-- anon 접근 허용 (내부 도구)
CREATE POLICY "allow_all_kmong_products" ON kmong_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_kmong_cpc_daily" ON kmong_cpc_daily FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_kmong_creative_changes" ON kmong_creative_changes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_kmong_inquiries" ON kmong_inquiries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_kmong_orders" ON kmong_orders FOR ALL USING (true) WITH CHECK (true);

-- 초기 상품 데이터
INSERT INTO kmong_products (product_id, product_name, category, price_standard, price_deluxe, price_premium) VALUES
('751791', '홈페이지 없는 사장님 전용', '신규제작', 120000, 200000, 350000),
('747186', '소상공인 원페이지 랜딩', '신규제작', 150000, NULL, NULL),
('752477', '기업 리뉴얼 7일', '리뉴얼', 450000, NULL, NULL),
('747195', '기업 리뉴얼 원스톱', '리뉴얼', 550000, NULL, NULL),
('747156', '모바일 깨짐 24시간 해결', '반응형', 50000, NULL, NULL),
('752469', 'PC→모바일 반응형 48시간', '반응형', 70000, NULL, NULL),
('747181', '반응형 전환', '반응형', 100000, NULL, NULL),
('752450', 'HTML 이전', '플랫폼이전', 150000, NULL, NULL),
('747202', '아임웹 HTML 이전', '플랫폼이전', 200000, NULL, NULL),
('752484', '카페24 수정 당일완료', '카페24', 50000, NULL, NULL),
('752497', '월 유지보수', '유지보수', 50000, NULL, NULL),
('741342', '트래픽', '마케팅', 11000, NULL, NULL),
('518770', '인스타 A to Z', '마케팅', 5000, NULL, NULL),
('662105', '인스타 핵심', '마케팅', 5000, NULL, NULL)
ON CONFLICT (product_id) DO NOTHING;
