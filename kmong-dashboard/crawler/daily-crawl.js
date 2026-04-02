#!/usr/bin/env node
/**
 * 크몽 일일 자동 크롤링
 * PM2 cron으로 매일 23:00 실행
 * 
 * 수집 항목:
 * 1. CPC 광고 데이터 (당일) — API
 * 2. 주문 내역 (신규) — API
 * 3. 메시지/문의 매핑 (신규) — Playwright
 * 4. 쿠키 갱신
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COOKIE_FILE = path.join(DATA_DIR, 'kmong-cookies.json');
const LOG_FILE = path.join(DATA_DIR, 'crawl-log.json');

const KMONG_EMAIL = process.env.KMONG_EMAIL;
const KMONG_PW = process.env.KMONG_PW;
if (!KMONG_EMAIL || !KMONG_PW) throw new Error('KMONG_EMAIL, KMONG_PW 환경변수가 필요합니다');

const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function today() { return new Date().toISOString().split('T')[0]; }
function log(msg) { console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${msg}`); }

async function supabaseUpsert(table, data, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(Array.isArray(data) ? data : [data])
  });
  if (!res.ok) {
    const err = await res.text();
    log(`  ⚠️ Supabase ${table} 에러: ${err.substring(0, 200)}`);
  }
  return res.ok;
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(Array.isArray(data) ? data : [data])
  });
  return res.ok;
}

async function supabaseQuery(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  return res.ok ? await res.json() : [];
}

async function initBrowser() {
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR'
  });
  
  // 저장된 쿠키 로드
  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    await ctx.addCookies(cookies);
    log('쿠키 로드 완료');
  }
  
  return { browser, ctx };
}

async function ensureLogin(ctx) {
  const page = await ctx.newPage();
  
  // 쿠키로 로그인 상태 확인
  await page.goto('https://kmong.com', { waitUntil: 'load', timeout: 30000 });
  await sleep(3000);
  
  const headerText = await page.evaluate(() => {
    const h = document.querySelector('header, nav');
    return h ? h.innerText : '';
  });
  
  if (!headerText.includes('로그인')) {
    log('기존 쿠키로 로그인 유지됨 ✅');
    await page.close();
    return true;
  }
  
  // 재로그인 필요
  log('쿠키 만료 → 재로그인...');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a');
    for (const b of btns) {
      if (b.innerText.trim() === '로그인') { b.click(); break; }
    }
  });
  await sleep(3000);
  
  const emailInput = await page.$('input[type="email"]');
  const pwInput = await page.$('input[type="password"]');
  if (!emailInput || !pwInput) {
    log('❌ 로그인 폼 못 찾음');
    await page.close();
    return false;
  }
  
  await emailInput.click({ force: true });
  await page.keyboard.type(KMONG_EMAIL, { delay: 30 });
  await pwInput.click({ force: true });
  await page.keyboard.type(KMONG_PW, { delay: 30 });
  
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.innerText.trim() === '로그인' && b.type !== 'button') { b.click(); break; }
    }
  });
  await sleep(8000);
  
  // 쿠키 갱신 저장
  const cookies = await ctx.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  log('로그인 성공 + 쿠키 갱신 ✅');
  
  await page.close();
  return true;
}

// =============================================
// 1. CPC 광고 데이터 (API)
// =============================================
async function crawlCPC(ctx) {
  log('📊 CPC 데이터 수집...');
  const page = await ctx.newPage();
  
  // inbox 페이지 접속해서 세션 확보
  await page.goto('https://kmong.com/inboxes', { waitUntil: 'load', timeout: 30000 });
  await sleep(3000);
  
  const dt = today();
  
  // 당일 + 최근 7일 데이터 수집 (보정용)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const startStr = startDate.toISOString().split('T')[0];
  
  // 쿠키 문자열 생성 (api.kmong.com용)
  const cookies = await page.context().cookies();
  const cookieStr = cookies.filter(c => c.domain && c.domain.includes('kmong')).map(c => `${c.name}=${c.value}`).join('; ');
  
  const cpcResult = [];
  const startD = new Date(startStr);
  const endD = new Date(dt);
  
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().split('T')[0];
    try {
      const resp = await page.evaluate(async (args) => {
        const r = await fetch(args.url, {
          headers: { 'Cookie': args.cookie, 'Accept': 'application/json' },
          credentials: 'include'
        });
        return await r.json();
      }, {
        url: `https://api.kmong.com/order-app/kmong-ad/v2/gig/click/click-up/reports?startedDate=${ds}&endedDate=${ds}`,
        cookie: cookieStr
      });
      
      const items = resp.items || [];
      for (const item of items) {
        const cr = item.clickUpReport || {};
        const imp = cr.totalImpressionCount || 0;
        const clk = cr.totalValidClickCount || 0;
        const cost = cr.totalDeductedClickAmount || 0;
        
        if (imp > 0 || clk > 0) {
          cpcResult.push({
            date: ds,
            product_id: String(item.gigId),
            impressions: imp,
            clicks: clk,
            cpc_cost: cost,
            ctr: imp > 0 ? +(clk / imp * 100).toFixed(2) : 0
          });
        }
      }
    } catch(e) {}
  }
  
  if (cpcResult.length > 0) {
    await supabaseUpsert('kmong_cpc_daily', cpcResult);
    log(`  → CPC ${cpcResult.length}행 저장 (${startStr} ~ ${dt})`);
  } else {
    log(`  → 오늘 CPC 데이터 없음`);
  }
  
  await page.close();
  return cpcResult.length;
}

// =============================================
// 2. 주문 데이터 (API)
// =============================================
async function crawlOrders(ctx) {
  log('🛒 주문 데이터 수집...');
  const page = await ctx.newPage();
  
  await page.goto('https://kmong.com/inboxes', { waitUntil: 'load', timeout: 30000 });
  await sleep(3000);
  
  const cookies2 = await page.context().cookies();
  const cookieStr2 = cookies2.filter(c => c.domain && c.domain.includes('kmong')).map(c => `${c.name}=${c.value}`).join('; ');
  
  const orders = await page.evaluate(async (ck) => {
    try {
      const resp = await fetch('https://api.kmong.com/order-app/order/v1/orders/seller/histories?statusType=ALL&sortType=UPDATED_AT&page=1&pageSize=50', {
        headers: { 'Cookie': ck, 'Accept': 'application/json' },
        credentials: 'include'
      });
      const data = await resp.json();
      return (data.contents || []).map(o => ({
        order_id: String(o.orderId),
        product_id: String(o.gigId),
        order_date: o.orderCreatedDateTime || o.orderStartedDateTime,
        package_type: (o.packageTitle || 'standard').toLowerCase(),
        amount: o.totalPaymentAmount || o.packagePaymentAmount || 0,
        status: o.sellerOrderStatus === 'COMPLETED' ? 'completed' : 
                o.sellerOrderStatus === 'CANCELLED' ? 'cancelled' : 'in_progress',
        buyer_name: o.buyerName || ''
      }));
    } catch(e) { return []; }
  }, cookieStr2);
  
  if (orders.length > 0) {
    // 기존 주문과 비교해서 신규만 삽입
    const existing = await supabaseQuery('kmong_orders', 'select=order_id');
    const existingIds = new Set(existing.map(o => o.order_id));
    const newOrders = orders.filter(o => !existingIds.has(o.order_id));
    
    if (newOrders.length > 0) {
      await supabaseInsert('kmong_orders', newOrders);
      log(`  → 신규 주문 ${newOrders.length}건 저장`);
    } else {
      log(`  → 신규 주문 없음 (기존 ${existing.length}건)`);
    }
    
    // 상태 업데이트 (진행중→완료 등)
    for (const o of orders) {
      if (existingIds.has(o.order_id)) {
        await fetch(`${SUPABASE_URL}/rest/v1/kmong_orders?order_id=eq.${o.order_id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: o.status })
        });
      }
    }
  }
  
  await page.close();
  return orders.length;
}

// =============================================
// 3. 문의/메시지 매핑 (Playwright)
// =============================================
async function crawlInquiries(ctx) {
  log('💬 문의 데이터 수집...');
  const page = await ctx.newPage();
  
  await page.goto('https://kmong.com/inboxes', { waitUntil: 'load', timeout: 30000 });
  await sleep(5000);
  
  // inbox-groups에서 전체 대화 목록
  const allGroups = await page.evaluate(async () => {
    const groups = [];
    for (let p = 1; p <= 15; p++) {
      const resp = await fetch('/api/v5/inbox-groups?page=' + p);
      const data = await resp.json();
      groups.push(...data.inbox_groups);
      if (p >= data.last_page) break;
    }
    return groups;
  });
  
  log(`  → 전체 대화 ${allGroups.length}건`);
  
  // 기존 DB 문의 고객명 목록
  const existingInq = await supabaseQuery('kmong_inquiries', 'select=customer_name');
  const existingNames = new Set(existingInq.map(i => i.customer_name));
  
  // 최근 1주일 대화만 확인 (이미 처리된 건 스킵)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const recentGroups = allGroups.filter(g => {
    const created = new Date(g.group_created_at);
    return created >= oneWeekAgo && !existingNames.has(g.partner?.username);
  });
  
  log(`  → 신규 대화 ${recentGroups.length}건 확인`);
  
  let newInquiries = 0;
  
  for (const g of recentGroups) {
    const groupId = g.inbox_group_id;
    const partnerId = g.partner?.USERID;
    const partner = g.partner?.username || 'unknown';
    const createdAt = g.group_created_at;
    
    // 대화방 열어서 서비스 매핑
    await page.goto(`https://kmong.com/inboxes?inbox_group_id=${groupId}&partner_id=${partnerId}`, {
      waitUntil: 'load', timeout: 15000
    }).catch(() => {});
    await sleep(2000);
    
    const serviceInfo = await page.evaluate(() => {
      const gigLinks = document.querySelectorAll('a[href*="/gig/"]');
      for (const a of gigLinks) {
        const match = a.getAttribute('href')?.match(/\/gig\/(\d+)/);
        if (match) return { gigId: match[1], title: a.innerText?.trim()?.substring(0, 100) || '' };
      }
      return null;
    });
    
    if (serviceInfo?.gigId) {
      await supabaseInsert('kmong_inquiries', {
        product_id: serviceInfo.gigId,
        inquiry_date: createdAt,
        customer_name: partner,
        inquiry_type: 'message',
        status: 'pending',
        notes: `자동수집: ${serviceInfo.title || serviceInfo.gigId}`
      });
      newInquiries++;
      log(`  → 신규 문의: ${partner} → gig:${serviceInfo.gigId}`);
    }
  }
  
  log(`  → 신규 문의 ${newInquiries}건 저장`);
  
  await page.close();
  return newInquiries;
}

// =============================================
// 메인
// =============================================
async function main() {
  const startTime = Date.now();
  log('========================================');
  log('🚀 크몽 일일 크롤링 시작');
  log('========================================');
  
  const result = { date: today(), cpc: 0, orders: 0, inquiries: 0, error: null };
  
  try {
    const { browser, ctx } = await initBrowser();
    
    // 로그인 확인
    const loggedIn = await ensureLogin(ctx);
    if (!loggedIn) {
      result.error = '로그인 실패';
      log('❌ 로그인 실패 → 중단');
      await browser.close();
      saveLog(result);
      return;
    }
    
    // 데이터 수집
    result.cpc = await crawlCPC(ctx);
    result.orders = await crawlOrders(ctx);
    result.inquiries = await crawlInquiries(ctx);
    
    await browser.close();
    
  } catch (err) {
    result.error = err.message;
    log(`❌ 에러: ${err.message}`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  log('========================================');
  log(`✅ 크롤링 완료 (${elapsed}초)`);
  log(`   CPC: ${result.cpc}행 | 주문: ${result.orders}건 | 문의: ${result.inquiries}건`);
  if (result.error) log(`   에러: ${result.error}`);
  log('========================================');
  
  saveLog(result);
}

function saveLog(result) {
  let logs = [];
  if (fs.existsSync(LOG_FILE)) {
    try { logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8')); } catch {}
  }
  logs.unshift({ ...result, timestamp: new Date().toISOString() });
  // 최근 90일만 보관
  logs = logs.slice(0, 90);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
