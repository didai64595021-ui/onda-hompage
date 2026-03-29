const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const cookieData = fs.readFileSync(path.join(DATA_DIR, 'kmong-cookies.json'), 'utf8');
  const cookies = JSON.parse(cookieData);
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  await context.addCookies(cookies);
  
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  
  // API 응답 캡처
  const apiData = {};
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('click-up') || url.includes('smart-pick') || url.includes('inbox-groups') || url.includes('orders') || url.includes('gigs') || url.includes('services')) {
      try {
        const json = await res.json().catch(() => null);
        if (json) {
          const key = url.split('?')[0].replace('https://kmong.com/api/', '');
          apiData[key] = json;
          console.log(`  [API] ${key}: ${JSON.stringify(json).substring(0, 200)}`);
        }
      } catch(e) {}
    }
  });
  
  // 1. 클릭업 광고
  console.log('=== 클릭업 광고 상세 ===');
  await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'load' });
  await sleep(5000);
  
  // 테이블 데이터 (서비스명 포함)
  const clickUpData = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    return Array.from(rows).map(row => {
      const cells = row.querySelectorAll('td');
      const allText = Array.from(cells).map(c => c.innerText.trim());
      // 서비스 링크에서 gig id 추출
      const links = row.querySelectorAll('a[href]');
      let gigId = '';
      for (const l of links) {
        const match = l.href.match(/gig\/(\d+)/);
        if (match) gigId = match[1];
      }
      return { cells: allText, gigId };
    });
  });
  
  console.log('클릭업 테이블 행:', clickUpData.length);
  clickUpData.forEach((r, i) => {
    console.log(`  [${i}] gigId=${r.gigId}, cells=${JSON.stringify(r.cells)}`);
  });
  
  // 상세 보기 클릭 → 일별 리포트 추출
  const detailBtns = await page.$$('text=상세 보기');
  console.log(`\n상세 보기 버튼: ${detailBtns.length}개`);
  
  const allDailyReports = [];
  
  for (let i = 0; i < detailBtns.length; i++) {
    try {
      // 매번 페이지 다시 로드하여 detailBtns 재탐색
      if (i > 0) {
        await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'load' });
        await sleep(4000);
      }
      
      const btns = await page.$$('text=상세 보기');
      if (btns[i]) {
        await btns[i].click({ force: true });
        await sleep(4000);
        
        console.log(`\n  상세 ${i+1}: ${page.url()}`);
        await page.screenshot({ path: path.join(DATA_DIR, `detail-${i+1}.png`) });
        
        // 일별 데이터 테이블
        const dailyRows = await page.evaluate(() => {
          const tables = document.querySelectorAll('table');
          const result = [];
          for (const t of tables) {
            const headers = Array.from(t.querySelectorAll('th')).map(h => h.innerText.trim());
            const rows = t.querySelectorAll('tbody tr');
            for (const r of rows) {
              const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
              result.push({ headers, cells });
            }
          }
          return result;
        });
        
        console.log(`  일별 데이터: ${dailyRows.length}행`);
        dailyRows.slice(0, 5).forEach(r => console.log(`    ${JSON.stringify(r.cells)}`));
        
        // 페이지 전체 텍스트에서 통계 추출
        const pageText = await page.evaluate(() => document.body.innerText);
        const stats = pageText.match(/노출\s*수?\s*:?\s*([\d,]+)|클릭\s*수?\s*:?\s*([\d,]+)|비용\s*:?\s*([\d,]+)|CTR\s*:?\s*([\d.]+)/gi) || [];
        console.log(`  통계 텍스트: ${stats.join(' | ')}`);
        
        allDailyReports.push({ index: i, url: page.url(), dailyRows });
      }
    } catch(e) {
      console.log(`  상세 ${i+1} 에러: ${e.message.substring(0, 100)}`);
    }
  }
  
  // 2. 메시지함 상세
  console.log('\n=== 메시지함 상세 ===');
  await page.goto('https://kmong.com/inboxes', { waitUntil: 'load' });
  await sleep(5000);
  
  // 대화 목록 추출
  const conversations = await page.evaluate(() => {
    // API에서 가져온 데이터가 DOM에 있을 수 있음
    const items = [];
    // 모든 클릭 가능한 대화 항목
    const links = document.querySelectorAll('a[href*="inbox"], [role="listitem"], li');
    for (const l of links) {
      const text = l.innerText.trim();
      if (text.length > 3 && text.length < 500 && !text.includes('엔터프라이즈')) {
        items.push(text.substring(0, 200));
      }
    }
    return items.slice(0, 30);
  });
  
  console.log(`대화 목록: ${conversations.length}건`);
  conversations.slice(0, 10).forEach((c, i) => console.log(`  [${i}] ${c.substring(0, 100)}`));
  
  // 3. 주문 내역
  console.log('\n=== 주문 내역 ===');
  const orderUrls = [
    'https://kmong.com/seller/orders',
    'https://kmong.com/my-kmong/selling',
    'https://kmong.com/seller/projects'
  ];
  
  for (const url of orderUrls) {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    await sleep(4000);
    const is404 = await page.evaluate(() => document.body.innerText.includes('404'));
    if (!is404) {
      console.log(`주문 페이지: ${page.url()}`);
      await page.screenshot({ path: path.join(DATA_DIR, 'orders-detail.png'), fullPage: true });
      
      const orderText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
      console.log(orderText.substring(0, 500));
      break;
    }
  }
  
  // API 데이터 저장
  console.log('\n=== API 데이터 ===');
  Object.keys(apiData).forEach(k => {
    console.log(`${k}: ${JSON.stringify(apiData[k]).substring(0, 300)}`);
  });
  
  fs.writeFileSync(path.join(DATA_DIR, 'crawl-details.json'), JSON.stringify({
    clickUp: clickUpData,
    dailyReports: allDailyReports,
    conversations: conversations.slice(0, 20),
    apiData,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log('\n✅ 상세 크롤링 완료');
  await browser.close();
}

run();
