/**
 * Supabase 테이블 생성 스크립트
 * Supabase Management API를 사용하여 SQL 실행
 *
 * 사용법: node scripts/setup-db.js
 *
 * 참고: 이 스크립트가 실패하면 Supabase Dashboard > SQL Editor에서
 * scripts/init-db.sql 파일의 내용을 직접 실행하세요.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5YWlwZm13aWN1a3l6cnVxdHNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDk1NzcyOCwiZXhwIjoyMDg2NTMzNzI4fQ.f9tfmHILnyx6ijQjmlS_tDuSBsy9EhN-4ea6h4Xpo8Y';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkTable(name) {
  const { data, error } = await sb.from(name).select('id').limit(1);
  if (error && error.code === 'PGRST205') return false; // table not found
  return true;
}

async function insertProducts() {
  const products = [
    { product_id: '751791', product_name: '홈페이지 없는 사장님 전용', category: '신규제작', price_standard: 120000, price_deluxe: 200000, price_premium: 350000 },
    { product_id: '747186', product_name: '소상공인 원페이지 랜딩', category: '신규제작', price_standard: 150000 },
    { product_id: '752477', product_name: '기업 리뉴얼 7일', category: '리뉴얼', price_standard: 450000 },
    { product_id: '747195', product_name: '기업 리뉴얼 원스톱', category: '리뉴얼', price_standard: 550000 },
    { product_id: '747156', product_name: '모바일 깨짐 24시간 해결', category: '반응형', price_standard: 50000 },
    { product_id: '752469', product_name: 'PC→모바일 반응형 48시간', category: '반응형', price_standard: 70000 },
    { product_id: '747181', product_name: '반응형 전환', category: '반응형', price_standard: 100000 },
    { product_id: '752450', product_name: 'HTML 이전', category: '플랫폼이전', price_standard: 150000 },
    { product_id: '747202', product_name: '아임웹 HTML 이전', category: '플랫폼이전', price_standard: 200000 },
    { product_id: '752484', product_name: '카페24 수정 당일완료', category: '카페24', price_standard: 50000 },
    { product_id: '752497', product_name: '월 유지보수', category: '유지보수', price_standard: 50000 },
    { product_id: '741342', product_name: '트래픽', category: '마케팅', price_standard: 11000 },
    { product_id: '518770', product_name: '인스타 A to Z', category: '마케팅', price_standard: 5000 },
    { product_id: '662105', product_name: '인스타 핵심', category: '마케팅', price_standard: 5000 },
  ];

  const { data, error } = await sb.from('kmong_products').upsert(products, { onConflict: 'product_id' });
  if (error) {
    console.error('상품 데이터 INSERT 실패:', error.message);
    return false;
  }
  console.log('✅ 상품 데이터 14건 INSERT 완료');
  return true;
}

async function main() {
  console.log('=== 크몽 대시보드 DB 설정 ===\n');

  const tables = ['kmong_products', 'kmong_cpc_daily', 'kmong_creative_changes', 'kmong_inquiries', 'kmong_orders'];

  for (const table of tables) {
    const exists = await checkTable(table);
    console.log(`${exists ? '✅' : '❌'} ${table}: ${exists ? '존재함' : '없음'}`);
  }

  const productsExist = await checkTable('kmong_products');
  if (!productsExist) {
    console.log('\n⚠️  테이블이 없습니다. Supabase Dashboard > SQL Editor에서');
    console.log('   scripts/init-db.sql 파일의 내용을 실행해주세요.\n');
    return;
  }

  console.log('\n상품 데이터 삽입 중...');
  await insertProducts();

  // 확인
  const { data: check } = await sb.from('kmong_products').select('product_id, product_name').order('product_id');
  console.log(`\n등록된 상품: ${(check || []).length}건`);
  (check || []).forEach(p => console.log(`  - [${p.product_id}] ${p.product_name}`));
}

main().catch(console.error);
