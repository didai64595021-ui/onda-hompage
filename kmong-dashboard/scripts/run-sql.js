const { Client } = require('pg');
const fs = require('fs');

async function run() {
  // Transaction mode pooler
  const client = new Client({
    host: 'db.byaipfmwicukyzruqtsj.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'yGXeDPmBRCQOIAVG',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    // Force IPv4
    family: 4
  });
  
  try {
    await client.connect();
    console.log('✅ DB 연결 성공');
    
    const sql = fs.readFileSync('/home/onda/projects/onda-hompage/kmong-dashboard/scripts/init-db.sql', 'utf8');
    
    // SQL을 세미콜론으로 분할하여 개별 실행
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      try {
        await client.query(stmt);
        console.log(`  [${i+1}/${statements.length}] ✅ OK`);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`  [${i+1}/${statements.length}] ⚠️ 이미 존재: ${e.message.substring(0, 80)}`);
        } else {
          console.log(`  [${i+1}/${statements.length}] ❌ 에러: ${e.message.substring(0, 100)}`);
        }
      }
    }
    
    // 확인
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'kmong_%'");
    console.log('\n📋 생성된 테이블:', res.rows.map(r => r.table_name));
    
    const products = await client.query("SELECT product_id, product_name, category FROM kmong_products ORDER BY product_id");
    console.log(`\n📦 상품 데이터: ${products.rows.length}건`);
    if (products.rows.length > 0) {
      console.log(products.rows.slice(0, 3));
    }
    
    await client.end();
  } catch (e) {
    console.error('❌ 연결 실패:', e.message);
    
    // IPv4 주소 직접 조회 시도
    const dns = require('dns');
    dns.resolve4('db.byaipfmwicukyzruqtsj.supabase.co', (err, addresses) => {
      if (err) console.log('DNS IPv4 조회 실패:', err.message);
      else console.log('IPv4 주소:', addresses);
    });
  }
}

run();
