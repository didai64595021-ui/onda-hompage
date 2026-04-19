#!/usr/bin/env node
/**
 * 크몽 광고 봇 예산 설정 CLI
 *
 * 사용법:
 *   node set-ad-budget.js --amount 10000                        # 전체 일예산 10000원
 *   node set-ad-budget.js --amount 5000 --product abc           # 특정 서비스 예산
 *   node set-ad-budget.js --amount 30000 --type weekly          # 주 예산
 *   node set-ad-budget.js --amount 5000 --min 500 --max 3000    # CPC 가드레일
 *   node set-ad-budget.js --list                                # 현재 활성 예산 목록
 *   node set-ad-budget.js --disable ID                          # 특정 예산 비활성화
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.includes(`--${name}`); }

async function list() {
  const { data } = await supabase.from('kmong_ad_budget').select('*').order('updated_at', { ascending: false });
  if (!data?.length) { console.log('(활성 예산 없음)'); return; }
  console.log('ID | 타입 | 금액 | 서비스 | 우선순위 | min/max CPC | 활성 | 갱신');
  console.log('-'.repeat(80));
  for (const r of data) {
    console.log(`${r.id} | ${r.budget_type} | ${r.budget_amount}원 | ${r.product_id || '전체'} | ${r.priority} | ${r.min_cpc || '-'}/${r.max_cpc || '-'} | ${r.active ? 'Y' : 'N'} | ${r.updated_at?.slice(0,16)}`);
  }
}

async function disable(id) {
  const { error } = await supabase.from('kmong_ad_budget').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('실패:', error.message); process.exit(1); }
  console.log(`예산 ID ${id} 비활성화 완료`);
}

async function upsertBudget() {
  const amount = parseInt(arg('amount'), 10);
  if (!amount || amount <= 0) { console.error('--amount <원> 필수 (양수)'); process.exit(1); }
  const productId = arg('product');
  const type = arg('type', 'daily');
  const priority = arg('priority', 'roi');
  const minCpc = arg('min') ? parseInt(arg('min'), 10) : null;
  const maxCpc = arg('max') ? parseInt(arg('max'), 10) : null;

  const row = {
    product_id: productId,
    budget_type: type,
    budget_amount: amount,
    priority,
    min_cpc: minCpc,
    max_cpc: maxCpc,
    active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('kmong_ad_budget').insert([row]).select('id').single();
  if (error) { console.error('실패:', error.message); process.exit(1); }
  console.log(`예산 설정 완료 (ID ${data.id}): ${JSON.stringify(row, null, 2)}`);
}

(async () => {
  if (flag('list')) return list();
  const disableId = arg('disable');
  if (disableId) return disable(disableId);
  return upsertBudget();
})();
