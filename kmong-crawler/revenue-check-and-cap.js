#!/usr/bin/env node
/**
 * 매 4시간 — 매출 발생 시 한도 자동 해제 / 미발생 시 한도 적용
 *
 * 사용자 의도 (2026-05-04):
 *   "하루 문의 > 주문되면 CPC 키되, 아니면 이전 cap으로"
 *
 * 동작:
 *   1) 오늘(KST) 거래완료(kmong_orders) + 외부매출(external_revenue) 합산
 *   2) ≥ 1건 또는 ₩1 이상 → auto_stop_on_budget = false (한도 해제, ROI 흐름 살림)
 *   3) 0건 → auto_stop_on_budget = true (한도 적용, 광고비 통제)
 *   4) 상태 변경 시만 텔레그램 알림 (스팸 방지)
 *
 * Cron: 09:30 / 13:30 / 17:30 / 21:30 KST (4시간)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { supabase } = require('./lib/supabase');
const { notifyTyped } = require('./lib/notify-filter');

const STATE_FILE = path.join(__dirname, 'cookies', 'auto-stop-state.json');
const COMPLETED_STATUSES = ['completed', '완료', '거래완료'];

async function main() {
  const fmt = n => (n || 0).toLocaleString('ko-KR');
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  console.log(`=== 매출 체크 + 한도 자동 조정 (${today}) ===`);

  // 1) 오늘 매출 합산
  const { data: orders } = await supabase
    .from('kmong_orders')
    .select('amount, order_date, status')
    .gte('order_date', today)
    .lt('order_date', today + 'T23:59:59')
    .in('status', COMPLETED_STATUSES);
  const kmongRev = (orders || []).reduce((s, o) => s + (o.amount || 0), 0);
  const kmongCount = (orders || []).length;

  const { data: ext } = await supabase
    .from('external_revenue')
    .select('amount')
    .eq('date', today);
  const extRev = (ext || []).reduce((s, r) => s + (r.amount || 0), 0);
  const extCount = (ext || []).length;

  const totalRev = kmongRev + extRev;
  const totalCount = kmongCount + extCount;

  console.log(`  오늘 매출: 크몽 ${kmongCount}건 ₩${fmt(kmongRev)} + 외부 ${extCount}건 ₩${fmt(extRev)} = 합 ${totalCount}건 ₩${fmt(totalRev)}`);

  // 2) 결정
  const shouldRelease = totalCount > 0;  // 1건이라도 매출 발생 → 한도 해제
  const newAutoStop = shouldRelease ? 'false' : 'true';

  // 3) 현재 상태 + 변경 여부
  const { data: cur } = await supabase
    .from('kmong_settings')
    .select('value')
    .eq('key', 'auto_stop_on_budget')
    .single();
  const oldAutoStop = cur?.value || 'true';

  if (newAutoStop === oldAutoStop) {
    console.log(`  [변경 없음] auto_stop_on_budget = ${oldAutoStop} (매출 ${shouldRelease ? '있음' : '없음'})`);
    return;
  }

  // 4) 변경 적용
  await supabase
    .from('kmong_settings')
    .upsert({ key: 'auto_stop_on_budget', value: newAutoStop, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  console.log(`  ✓ auto_stop_on_budget: ${oldAutoStop} → ${newAutoStop}`);

  // 5) 상태 기록
  let stateLog = {};
  try { stateLog = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch {}
  stateLog[today] = { auto_stop: newAutoStop, total_revenue: totalRev, total_count: totalCount, changed_at: new Date().toISOString() };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(stateLog, null, 2)); } catch {}

  // 6) 텔레그램 알림
  const msg = shouldRelease
    ? `🟢 <b>한도 자동 해제</b>\n오늘 매출 ${totalCount}건 ₩${fmt(totalRev)} 발생\nauto_stop_on_budget: true → <b>false</b>\n광고 한도 도달해도 OFF 안 함 — ROI 흐름 살림`
    : `🟡 <b>한도 자동 적용</b>\n오늘 매출 0건\nauto_stop_on_budget: false → <b>true</b>\n일일 ₩100K / 주간 ₩300K 도달 시 자동 OFF`;
  try { notifyTyped('budget', msg); } catch {}
}

main().catch(e => { console.error('[에러]', e.message); process.exit(1); });
