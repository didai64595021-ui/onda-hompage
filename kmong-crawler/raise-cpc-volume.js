#!/usr/bin/env node
/**
 * 볼륨 확보 단계(Phase1) 수동 CPC 상향 스크립트
 *
 * 사용법:
 *   node raise-cpc-volume.js              # 기본 프리셋 적용 (DEFAULT_TARGETS)
 *   node raise-cpc-volume.js --pct 40     # 현재 CPC 기준 일괄 +40% (Phase1 가드 상한)
 *   node raise-cpc-volume.js --set no-homepage=1960,mobile-fix=2520,responsive=2520,pc-mobile=2520,corp-seo=2520
 *
 * 히스토리:
 *  2026-04-21: 900→1400, 1200→1800 (주 3.3% 소진 대응)
 *  2026-04-22: 1400→1960, 1800→2520 (+40% Phase1 가드 꽉 채움, 주 7% 소진)
 *              이후 볼륨확보 정책 고정 (priority='volume'), ad-bot 자동 단계 관리
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
const { applyServiceAction } = require('./lib/ad-bot-apply');
const { matchProductId } = require('./lib/product-map');
const { login } = require('./lib/login');

// 기본 프리셋 — 현 시점 Phase1 상한 기준
const DEFAULT_TARGETS = [
  { product_id: 'no-homepage', cpc: 1960 },
  { product_id: 'mobile-fix',  cpc: 2520 },
  { product_id: 'responsive',  cpc: 2520 },
  { product_id: 'pc-mobile',   cpc: 2520 },
  { product_id: 'corp-seo',    cpc: 2520 },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const pctIdx = args.indexOf('--pct');
  const setIdx = args.indexOf('--set');
  return {
    pct: pctIdx >= 0 ? parseFloat(args[pctIdx + 1]) : null,
    setStr: setIdx >= 0 ? args[setIdx + 1] : null,
  };
}

function parseSetStr(s) {
  // "no-homepage=1960,mobile-fix=2520"
  return s.split(',').map(kv => {
    const [pid, v] = kv.split('=');
    return { product_id: pid.trim(), cpc: parseInt(v, 10) };
  }).filter(t => t.product_id && Number.isFinite(t.cpc));
}

const { pct, setStr } = parseArgs();
let RAISE;
if (setStr) {
  RAISE = parseSetStr(setStr);
} else if (pct != null) {
  // 현재 CPC는 DB(kmong_ad_config_daily 최신)에서 읽지 않고, 라이브 모달에서 읽어 직접 %적용
  // 런타임에 채워 넣음
  RAISE = 'PCT_RUNTIME';
} else {
  RAISE = DEFAULT_TARGETS;
}

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

  // --pct 모드: 모달 열기 전에 리스트 행의 희망 CPC (td[3]) 값 읽어 +N% 적용
  if (RAISE === 'PCT_RUNTIME') {
    RAISE = [];
    for (const [pid, serviceName] of Object.entries(pidToServiceName)) {
      const rowIdx = liveList.findIndex(r => r.serviceName === serviceName);
      if (rowIdx < 0) continue;
      const cur = await page.evaluate((idx) => {
        const rows = document.querySelectorAll('table tbody tr');
        const tds = rows[idx]?.querySelectorAll('td');
        if (!tds || tds.length < 4) return 0;
        return parseInt((tds[3].innerText || '').replace(/[^0-9]/g, ''), 10) || 0;
      }, rowIdx);
      if (!cur) { console.log(`[스킵 pct] ${pid} 현재 CPC 읽기 실패`); continue; }
      const next = Math.round(cur * (1 + pct / 100) / 10) * 10;
      RAISE.push({ product_id: pid, cpc: next, before_hint: cur });
      console.log(`[pct] ${pid}: ${cur} → ${next} (+${pct}%)`);
    }
  }

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
      reasoning: setStr ? `수동 --set 적용 (${setStr})` : pct != null ? `수동 --pct ${pct}% 적용` : 'Phase1 볼륨 확보 — DEFAULT_TARGETS (주예산 ≤50% 소진 대응)',
      applied: res.ok,
      suggested_by: 'manual-raise-volume',
    }]);
    await page.waitForTimeout(1500);
  }
  await browser.close();
  console.log('\n=== 요약 ===');
  for (const r of results) console.log(JSON.stringify(r));
})().catch(e => { console.error(e); process.exit(1); });
