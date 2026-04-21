#!/usr/bin/env node
/**
 * 일회성 CPC 복원 — 2026-04-21 08:00 봇이 주예산 오인식(2k)으로 -12~17% 억제한 걸 되돌림
 * 대상 (봇 before_state.desired_cpc 기준):
 *   no-homepage 750 → 900, mobile-fix 1000 → 1200, responsive 1050 → 1200, pc-mobile 1000 → 1200
 *   corp-seo 1200 (변경 없음 — 생략)
 * 실행:
 *   node restore-cpc-oneshot.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { applyServiceAction } = require('./lib/ad-bot-apply');
const { matchProductId } = require('./lib/product-map');
const { login } = require('./lib/login');

const RESTORE = [
  { product_id: 'no-homepage', cpc: 900 },
  { product_id: 'mobile-fix',  cpc: 1200 },
  { product_id: 'responsive',  cpc: 1200 },
  { product_id: 'pc-mobile',   cpc: 1200 },
];

(async () => {
  const actionDate = new Date().toISOString().slice(0, 10);
  const { browser, page } = await login({ slowMo: 150 });
  await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  try { const b = page.locator('button:has-text("확인")').first(); if (await b.isVisible({ timeout: 1500 }).catch(()=>false)) await b.click(); } catch {}
  await page.waitForTimeout(800);

  const liveList = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    return Array.from(rows).map((r, i) => ({ rowIndex: i, serviceName: r.querySelector('img')?.getAttribute('alt') || '' }));
  });
  const pidToServiceName = {};
  for (const r of liveList) {
    if (!r.serviceName) continue;
    const pid = matchProductId(r.serviceName);
    if (pid && !pidToServiceName[pid]) pidToServiceName[pid] = r.serviceName;
  }
  console.log(`[라이브 매핑] ${Object.keys(pidToServiceName).length}개 product_id → serviceName`);

  const results = [];
  for (const t of RESTORE) {
    const serviceName = pidToServiceName[t.product_id];
    if (!serviceName) { console.log(`[스킵] ${t.product_id} 라이브 리스트에 없음`); results.push({ ...t, ok: false, reason: 'not in live list' }); continue; }
    const res = await applyServiceAction(page, serviceName, { suggested_desired_cpc: t.cpc });
    console.log(`  [${t.product_id}] → ${t.cpc}원: ${res.ok ? 'OK' : 'FAIL'} ${res.error || ''} (before=${res.beforeCpc})`);
    results.push({ ...t, ok: res.ok, before: res.beforeCpc, after: res.afterCpc, submitted: res.submitted, error: res.error });
    // DB 로그 (audit trail)
    await supabase.from('kmong_ad_bot_actions').insert([{
      product_id: t.product_id,
      action_type: 'adjust_cpc_and_keywords',
      action_date: actionDate,
      before_state: { desired_cpc_ui: res.beforeCpc },
      after_state: { ok: res.ok, afterCpc: t.cpc, beforeCpc: res.beforeCpc, submitted: res.submitted, error: res.error },
      reasoning: '주예산 오인식(2k→100k) 복구 — 08:00 봇이 -12~17% 억제한 CPC 원상복원',
      applied: res.ok,
      suggested_by: 'manual-restore-oneshot',
    }]);
    await page.waitForTimeout(1500);
  }
  await browser.close();
  console.log('\n=== 요약 ===');
  for (const r of results) console.log(JSON.stringify(r));
})().catch(e => { console.error(e); process.exit(1); });
