#!/usr/bin/env node
/**
 * 2026-04-21: 주예산 100k 대비 이번 주 3.3% 소진 — 볼륨 확보용 CPC 상향
 * 기준: 어제 봇이 1440 찍었던 수준 + 추가 상향
 *   mobile-fix / responsive / pc-mobile / corp-seo: 1200 → 1800 (+50%)
 *   no-homepage: 900 → 1400 (키워드 매칭 오류 미해소 상태라 상승 신중)
 * 추천가 중앙 5,000~5,700원대 대비 여전히 35% 수준으로 안전구간
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { applyServiceAction } = require('./lib/ad-bot-apply');
const { matchProductId } = require('./lib/product-map');
const { login } = require('./lib/login');

const RAISE = [
  { product_id: 'no-homepage', cpc: 1400 },
  { product_id: 'mobile-fix',  cpc: 1800 },
  { product_id: 'responsive',  cpc: 1800 },
  { product_id: 'pc-mobile',   cpc: 1800 },
  { product_id: 'corp-seo',    cpc: 1800 },
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
  for (const t of RAISE) {
    const serviceName = pidToServiceName[t.product_id];
    if (!serviceName) { console.log(`[스킵] ${t.product_id} 라이브 리스트에 없음`); results.push({ ...t, ok: false, reason: 'not in live list' }); continue; }
    const res = await applyServiceAction(page, serviceName, { suggested_desired_cpc: t.cpc });
    console.log(`  [${t.product_id}] → ${t.cpc}원: ${res.ok ? 'OK' : 'FAIL'} ${res.error || ''} (before=${res.beforeCpc})`);
    results.push({ ...t, ok: res.ok, before: res.beforeCpc, after: res.afterCpc, submitted: res.submitted, error: res.error });
    await supabase.from('kmong_ad_bot_actions').insert([{
      product_id: t.product_id,
      action_type: 'adjust_cpc_and_keywords',
      action_date: actionDate,
      before_state: { desired_cpc_ui: res.beforeCpc },
      after_state: { ok: res.ok, afterCpc: t.cpc, beforeCpc: res.beforeCpc, submitted: res.submitted, error: res.error },
      reasoning: '주예산 100k 복구 후 볼륨 확보용 CPC 상향 — 어제 1440 기준 +25~50%',
      applied: res.ok,
      suggested_by: 'manual-raise-volume',
    }]);
    await page.waitForTimeout(1500);
  }
  await browser.close();
  console.log('\n=== 요약 ===');
  for (const r of results) console.log(JSON.stringify(r));
})().catch(e => { console.error(e); process.exit(1); });
