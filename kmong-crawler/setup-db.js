#!/usr/bin/env node
/**
 * 크몽 Phase 2 — Supabase 스키마 마이그레이션
 * - kmong_inquiries 컬럼 추가
 * - kmong_daily_analysis 테이블 생성
 * - kmong_optimization_log 테이블 생성
 * - kmong_reply_templates 테이블 생성 + 시드 데이터
 * - kmong_reply_history 테이블 생성
 */

const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');

const MIGRATIONS = [
  // 1. kmong_inquiries 컬럼 추가
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS auto_reply_text TEXT`,
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS auto_reply_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS conversation_url TEXT`,
  `ALTER TABLE kmong_inquiries ADD COLUMN IF NOT EXISTS message_content TEXT`,

  // 2. kmong_daily_analysis 테이블
  `CREATE TABLE IF NOT EXISTS kmong_daily_analysis (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total_impressions INTEGER DEFAULT 0,
    total_clicks INTEGER DEFAULT 0,
    total_inquiries INTEGER DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    total_revenue INTEGER DEFAULT 0,
    total_ad_cost INTEGER DEFAULT 0,
    roi NUMERIC(10,2),
    bizmoney_balance INTEGER,
    bizmoney_days_left INTEGER,
    bottlenecks JSONB,
    recommendations JSONB,
    report_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 3. kmong_optimization_log 테이블
  `CREATE TABLE IF NOT EXISTS kmong_optimization_log (
    id SERIAL PRIMARY KEY,
    product_id TEXT,
    action_type TEXT,
    action_detail TEXT,
    before_metrics JSONB,
    after_metrics JSONB,
    effect_score NUMERIC(10,2),
    learned_pattern TEXT,
    status TEXT DEFAULT 'proposed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    measured_at TIMESTAMPTZ
  )`,

  // 4. kmong_reply_templates 테이블
  `CREATE TABLE IF NOT EXISTS kmong_reply_templates (
    id SERIAL PRIMARY KEY,
    template_name TEXT NOT NULL,
    template_type TEXT NOT NULL,
    service_category TEXT,
    template_text TEXT NOT NULL,
    variables JSONB,
    total_sent INTEGER DEFAULT 0,
    total_replied INTEGER DEFAULT 0,
    total_quoted INTEGER DEFAULT 0,
    total_paid INTEGER DEFAULT 0,
    reply_rate NUMERIC(5,2) DEFAULT 0,
    quote_rate NUMERIC(5,2) DEFAULT 0,
    conversion_rate NUMERIC(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 5. kmong_reply_history 테이블
  `CREATE TABLE IF NOT EXISTS kmong_reply_history (
    id SERIAL PRIMARY KEY,
    inquiry_id INTEGER,
    template_id INTEGER,
    reply_text TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    customer_replied BOOLEAN DEFAULT FALSE,
    customer_replied_at TIMESTAMPTZ,
    resulted_in_quote BOOLEAN DEFAULT FALSE,
    resulted_in_payment BOOLEAN DEFAULT FALSE,
    payment_amount INTEGER,
    effectiveness_score NUMERIC(5,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

// 초기 답변 템플릿 시드 데이터
const SEED_TEMPLATES = [
  {
    template_name: '문의답변 우선형',
    template_type: 'first_contact',
    service_category: '신규제작',
    template_text: `안녕하세요! {inquiry_topic}에 대해 답변드리겠습니다.

{answer_to_question}

딱 맞는 상품으로 안내드리려고 하는데요, 몇 가지만 여쭤볼게요.

1. 한 페이지에 다 담을까요, 메뉴별로 나눌까요?
2. 납품 후 사진이나 문구를 직접 바꿀 일이 있으실까요?
3. 아래 추가 기능 중 필요한 게 있으시면 골라주세요
   - 카카오채널 연동
   - 네이버예약 연동
   - 인스타그램 피드 연동
   - SEO 심화 최적화

말씀해주세요!`,
    variables: ['{inquiry_topic}', '{answer_to_question}'],
  },
  {
    template_name: '포트폴리오 선제시형',
    template_type: 'first_contact',
    service_category: '신규제작',
    template_text: `안녕하세요! {inquiry_topic} 문의 감사합니다.

{answer_to_question}

저희가 최근 제작한 홍보 페이지 몇 개 보여드릴게요:
• [A업체] https://example1.com
• [B업체] https://example2.com
• [C업체] https://example3.com

이런 스타일로 제작됩니다. 원하시는 방향 말씀해주시면 딱 맞는 견적 안내드릴게요!

1. 한 페이지 vs 메뉴별 분리?
2. 납품 후 직접 수정 필요하신가요?
3. 추가 기능 필요한 거 있으신가요?

말씀해주세요!`,
    variables: ['{inquiry_topic}', '{answer_to_question}'],
  },
  {
    template_name: '가격 선안내형',
    template_type: 'first_contact',
    service_category: '신규제작',
    template_text: `안녕하세요! {inquiry_topic} 문의 감사합니다.

{answer_to_question}

참고로 저희 패키지 가격대입니다:
• 원페이지: 12만원부터 (CMS 포함, 3일 완성)
• 메인+서브 2P: 20만원부터 (CMS 포함, 5일)
• 메인+서브 5P: 35만원부터 (CMS+유지보수 1개월, 7일)
전 패키지 수정 무제한입니다.

딱 맞는 상품 추천드리려고 하는데요:
1. 한 페이지 vs 메뉴별?
2. 납품 후 직접 수정 필요?
3. 추가 기능 필요한 거?

말씀해주세요!`,
    variables: ['{inquiry_topic}', '{answer_to_question}'],
  },
];

async function runMigrations() {
  console.log('=== 크몽 Phase 2 DB 마이그레이션 시작 ===\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i];
    const label = sql.trim().substring(0, 60).replace(/\n/g, ' ');
    try {
      const { error } = await supabase.rpc('exec_sql', { sql });
      if (error) {
        // rpc 없으면 REST로 직접 실행 시도
        throw error;
      }
      console.log(`[${i + 1}/${MIGRATIONS.length}] OK: ${label}...`);
      successCount++;
    } catch (rpcErr) {
      // Supabase JS에서 직접 SQL 실행이 안 되면 REST API 사용
      try {
        const response = await fetch(
          'https://byaipfmwicukyzruqtsj.supabase.co/rest/v1/rpc/exec_sql',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5YWlwZm13aWN1a3l6cnVxdHNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDk1NzcyOCwiZXhwIjoyMDg2NTMzNzI4fQ.VLNxNpCbRJB9R1S0t7GM_UBVnXKDNWkL-4FmPNmrqN4',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5YWlwZm13aWN1a3l6cnVxdHNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDk1NzcyOCwiZXhwIjoyMDg2NTMzNzI4fQ.VLNxNpCbRJB9R1S0t7GM_UBVnXKDNWkL-4FmPNmrqN4',
            },
            body: JSON.stringify({ sql }),
          }
        );
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText);
        }
        console.log(`[${i + 1}/${MIGRATIONS.length}] OK (REST): ${label}...`);
        successCount++;
      } catch (restErr) {
        console.error(`[${i + 1}/${MIGRATIONS.length}] FAIL: ${label}...`);
        console.error(`  → ${restErr.message || rpcErr.message}`);
        failCount++;
      }
    }
  }

  console.log(`\n--- 마이그레이션: ${successCount} 성공 / ${failCount} 실패 ---\n`);

  // 시드 데이터 삽입
  console.log('=== 시드 데이터 삽입 ===');
  for (const tpl of SEED_TEMPLATES) {
    // 중복 체크
    const { data: existing } = await supabase
      .from('kmong_reply_templates')
      .select('id')
      .eq('template_name', tpl.template_name)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[스킵] 이미 존재: ${tpl.template_name}`);
      continue;
    }

    const { error } = await supabase
      .from('kmong_reply_templates')
      .insert(tpl);

    if (error) {
      console.error(`[시드 실패] ${tpl.template_name}: ${error.message}`);
    } else {
      console.log(`[시드 OK] ${tpl.template_name}`);
    }
  }

  const msg = `크몽 Phase 2 DB 마이그레이션 완료 (${successCount}/${MIGRATIONS.length} 성공, 시드 ${SEED_TEMPLATES.length}건)`;
  console.log(`\n=== ${msg} ===`);
  notify(msg);
}

runMigrations().catch((err) => {
  console.error(`[치명적 에러] ${err.message}`);
  process.exit(1);
});
