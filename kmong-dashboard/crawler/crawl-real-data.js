/**
 * 크몽 실제 데이터 크롤링
 * - 로그인 → 셀러 대시보드 → 광고/문의/주문 데이터 수집
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const KMONG_EMAIL = process.env.KMONG_EMAIL;
const KMONG_PW = process.env.KMONG_PW;
if (!KMONG_EMAIL || !KMONG_PW) throw new Error('KMONG_EMAIL, KMONG_PW 환경변수가 필요합니다');

const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function run() {
  console.log('🔑 크몽 실제 데이터 크롤링 시작\n');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR'
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  // API 응답 모니터
  const apiResponses = {};
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('kmong.com/api') || url.includes('kid.kmong.com')) {
      try {
        const body = await response.json().catch(() => null);
        if (body) {
          const key = url.split('?')[0].split('/').slice(-2).join('/');
          apiResponses[key] = body;
        }
      } catch(e) {}
    }
  });
  
  try {
    // ========== 1. 로그인 ==========
    console.log('[1/5] 로그인...');
    await page.goto('https://kmong.com', { waitUntil: 'load' });
    await sleep(5000);
    
    // 로그인 모달 열기
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, a');
      for (const b of btns) {
        if (b.innerText.trim() === '로그인') { b.click(); break; }
      }
    });
    await sleep(3000);
    
    // 이메일/비밀번호 입력
    const emailInput = await page.$('input[type="email"]');
    const pwInput = await page.$('input[type="password"]');
    
    if (!emailInput || !pwInput) {
      console.log('  ❌ 로그인 폼 못 찾음');
      await page.screenshot({ path: path.join(DATA_DIR, 'crawl-no-form.png') });
      await browser.close();
      return;
    }
    
    await emailInput.click({ force: true });
    await sleep(300);
    await page.keyboard.type(KMONG_EMAIL, { delay: 30 });
    
    await pwInput.click({ force: true });
    await sleep(300);
    await page.keyboard.type(KMONG_PW, { delay: 30 });
    
    // 제출
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.innerText.trim() === '로그인' && b.type !== 'button') { b.click(); break; }
      }
    });
    await sleep(8000);
    
    // 로그인 확인
    const hasLoginBtn = await page.$('button:has-text("로그인")');
    const headerText = await page.evaluate(() => {
      const h = document.querySelector('header, nav');
      return h ? h.innerText.substring(0, 200) : '';
    });
    
    const loggedIn = !headerText.includes('로그인') || headerText.includes('마이') || headerText.includes('셀러');
    console.log(`  → 로그인 상태: ${loggedIn ? '✅ 성공' : '❌ 실패'}`);
    console.log(`  → 헤더: ${headerText.substring(0, 100)}`);
    
    if (!loggedIn) {
      await page.screenshot({ path: path.join(DATA_DIR, 'crawl-login-fail.png') });
      
      // 에러 메시지 확인
      const errors = await page.$$eval('[class*="error"], [role="alert"]', els => els.map(e => e.innerText));
      console.log(`  → 에러: ${errors.join('; ') || '없음'}`);
      await browser.close();
      return;
    }
    
    await page.screenshot({ path: path.join(DATA_DIR, 'crawl-logged-in.png') });
    
    // 쿠키 저장
    const cookies = await context.cookies();
    fs.writeFileSync(path.join(DATA_DIR, 'kmong-cookies.json'), JSON.stringify(cookies, null, 2));
    
    // ========== 2. 셀러 대시보드 ==========
    console.log('\n[2/5] 셀러 대시보드...');
    
    // 셀러 페이지 탐색
    const sellerUrls = [
      'https://kmong.com/seller/home',
      'https://kmong.com/seller',
      'https://kmong.com/my-kmong',
      'https://kmong.com/seller/dashboard'
    ];
    
    let sellerFound = false;
    for (const url of sellerUrls) {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
      await sleep(3000);
      
      const text = await page.evaluate(() => document.body.innerText.substring(0, 500));
      const is404 = text.includes('404') || text.includes('찾을 수 없습니다');
      const isLogin = page.url().includes('login');
      
      if (!is404 && !isLogin) {
        console.log(`  → 셀러 페이지: ${page.url()}`);
        console.log(`  → 내용: ${text.substring(0, 200)}`);
        sellerFound = true;
        await page.screenshot({ path: path.join(DATA_DIR, 'crawl-seller.png') });
        break;
      }
    }
    
    if (!sellerFound) {
      console.log('  → 셀러 페이지 접근 불가, 네비게이션 메뉴 탐색...');
      await page.goto('https://kmong.com', { waitUntil: 'load' });
      await sleep(3000);
      
      // 셀러 관련 링크 전부 수집
      const allLinks = await page.$$eval('a[href]', els => els.map(e => ({
        text: e.innerText.trim().substring(0, 50),
        href: e.href
      })).filter(e => e.text && (e.href.includes('seller') || e.href.includes('my-kmong') || e.href.includes('dashboard'))));
      console.log('  → 셀러 관련 링크:', JSON.stringify(allLinks.slice(0, 10), null, 2));
    }
    
    // ========== 3. 광고 데이터 ==========
    console.log('\n[3/5] 광고 데이터 수집...');
    
    const adUrls = [
      'https://kmong.com/seller/click-up',
      'https://kmong.com/seller/click-up/report',
      'https://kmong.com/seller/ads',
      'https://kmong.com/seller/smart-pick'
    ];
    
    for (const url of adUrls) {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
      await sleep(4000);
      
      const currentUrl = page.url();
      const is404 = await page.evaluate(() => document.body.innerText.includes('404'));
      const isLogin = currentUrl.includes('login');
      
      if (!is404 && !isLogin) {
        console.log(`  ✅ 광고 페이지 접근: ${currentUrl}`);
        await page.screenshot({ path: path.join(DATA_DIR, `crawl-ads-${url.split('/').pop()}.png`) });
        
        // 광고 데이터 추출
        const adText = await page.evaluate(() => document.body.innerText);
        console.log(`  → 내용: ${adText.substring(0, 300)}`);
        
        // 테이블/숫자 데이터 추출
        const tables = await page.$$eval('table', tbls => tbls.map(t => {
          const rows = [];
          t.querySelectorAll('tr').forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td, th').forEach(td => cells.push(td.innerText.trim()));
            if (cells.length > 0) rows.push(cells);
          });
          return rows;
        }));
        
        if (tables.length > 0) {
          console.log(`  → 테이블 ${tables.length}개 발견`);
          tables.forEach((t, i) => {
            console.log(`  → 테이블 ${i+1}:`, JSON.stringify(t.slice(0, 5)));
          });
        }
        
        // 숫자 데이터 (클릭수, 노출수 등)
        const numbers = await page.$$eval('[class*="stat"], [class*="count"], [class*="number"], [class*="metric"]', 
          els => els.map(e => ({ text: e.innerText.trim(), class: e.className })));
        if (numbers.length > 0) {
          console.log(`  → 통계 요소: ${JSON.stringify(numbers.slice(0, 10))}`);
        }
      } else {
        console.log(`  ❌ ${url.split('/').pop()}: ${is404 ? '404' : '로그인 필요'}`);
      }
    }
    
    // ========== 4. 메시지/문의함 ==========
    console.log('\n[4/5] 메시지/문의함...');
    
    const inboxUrls = [
      'https://kmong.com/seller/inbox',
      'https://kmong.com/inbox',
      'https://kmong.com/message',
      'https://kmong.com/seller/message',
      'https://kmong.com/my-kmong/inbox'
    ];
    
    for (const url of inboxUrls) {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
      await sleep(4000);
      
      const is404 = await page.evaluate(() => document.body.innerText.includes('404'));
      const isLogin = page.url().includes('login');
      
      if (!is404 && !isLogin) {
        console.log(`  ✅ 메시지함 접근: ${page.url()}`);
        await page.screenshot({ path: path.join(DATA_DIR, 'crawl-inbox.png'), fullPage: true });
        
        const inboxText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        console.log(`  → 내용: ${inboxText.substring(0, 300)}`);
        
        // 메시지 목록 추출
        const messages = await page.$$eval('[class*="message"], [class*="chat"], [class*="inbox"] li, [class*="conversation"]', 
          els => els.map(e => e.innerText.trim().substring(0, 100)));
        if (messages.length > 0) {
          console.log(`  → 메시지 ${messages.length}개:`);
          messages.slice(0, 5).forEach(m => console.log(`    • ${m}`));
        }
        break;
      }
    }
    
    // ========== 5. 주문 내역 ==========
    console.log('\n[5/5] 주문 내역...');
    
    const orderUrls = [
      'https://kmong.com/seller/orders',
      'https://kmong.com/seller/order',
      'https://kmong.com/my-kmong/orders',
      'https://kmong.com/seller/projects'
    ];
    
    for (const url of orderUrls) {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
      await sleep(4000);
      
      const is404 = await page.evaluate(() => document.body.innerText.includes('404'));
      const isLogin = page.url().includes('login');
      
      if (!is404 && !isLogin) {
        console.log(`  ✅ 주문 페이지 접근: ${page.url()}`);
        await page.screenshot({ path: path.join(DATA_DIR, 'crawl-orders.png'), fullPage: true });
        
        const ordersText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        console.log(`  → 내용: ${ordersText.substring(0, 300)}`);
        
        // 주문 테이블 추출
        const orderTables = await page.$$eval('table', tbls => tbls.map(t => {
          const rows = [];
          t.querySelectorAll('tr').forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td, th').forEach(td => cells.push(td.innerText.trim()));
            if (cells.length > 0) rows.push(cells);
          });
          return rows;
        }));
        if (orderTables.length > 0) {
          console.log(`  → 주문 테이블:`);
          orderTables.forEach((t, i) => {
            t.slice(0, 5).forEach(row => console.log(`    ${JSON.stringify(row)}`));
          });
        }
        break;
      }
    }
    
    // ========== 6. 내 서비스 통계 ==========
    console.log('\n[보너스] 내 서비스 통계...');
    
    const serviceUrls = [
      'https://kmong.com/seller/my-services',
      'https://kmong.com/seller/services', 
      'https://kmong.com/seller/gigs',
      'https://kmong.com/my-kmong/selling'
    ];
    
    for (const url of serviceUrls) {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
      await sleep(4000);
      
      const is404 = await page.evaluate(() => document.body.innerText.includes('404'));
      const isLogin = page.url().includes('login');
      
      if (!is404 && !isLogin) {
        console.log(`  ✅ 서비스 관리: ${page.url()}`);
        await page.screenshot({ path: path.join(DATA_DIR, 'crawl-services.png'), fullPage: true });
        
        const svcText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        console.log(`  → 내용: ${svcText.substring(0, 300)}`);
        break;
      }
    }
    
    // ========== 7. API 응답 저장 ==========
    console.log('\n📋 수집된 API 응답:');
    Object.keys(apiResponses).forEach(key => {
      const data = apiResponses[key];
      console.log(`  → ${key}: ${JSON.stringify(data).substring(0, 200)}`);
    });
    
    fs.writeFileSync(path.join(DATA_DIR, 'api-responses.json'), JSON.stringify(apiResponses, null, 2));
    
    // ========== 완료 ==========
    console.log('\n' + '='.repeat(60));
    console.log('크롤링 완료');
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 에러:', error.message);
    await page.screenshot({ path: path.join(DATA_DIR, 'crawl-error.png') }).catch(() => {});
    await browser.close();
  }
}

run();
