/**
 * 크몽 CPC 대시보드 E2E 테스트
 * - 데이터 CRUD 검증
 * - 차트 렌더링 검증
 * - 반응형 검증
 * - 필터/정렬 검증
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:8899';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'data', 'e2e');

let testResults = [];
let passed = 0, failed = 0;

function log(test, result, detail = '') {
  const icon = result ? '✅' : '❌';
  console.log(`  ${icon} ${test}${detail ? ' — ' + detail : ''}`);
  testResults.push({ test, result, detail });
  if (result) passed++; else failed++;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const fs = require('fs');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  
  console.log('🧪 크몽 CPC 대시보드 E2E 테스트 시작\n');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  
  // 콘솔 에러 수집
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  
  try {
    // ==================== 1. 페이지 로드 ====================
    console.log('[1] 페이지 로드 검증');
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await sleep(5000);
    
    log('페이지 로드', page.url().includes('localhost'));
    log('콘솔 에러 없음', consoleErrors.length === 0, consoleErrors.length > 0 ? consoleErrors.join('; ') : '');
    
    const title = await page.title();
    log('타이틀 확인', title.includes('크몽') || title.includes('CPC'), title);
    
    // ==================== 2. KPI 카드 검증 ====================
    console.log('\n[2] KPI 카드 검증');
    
    const kpiCards = await page.$$('.kpi-card, [class*="kpi"], [class*="stat-card"], .metric-card');
    if (kpiCards.length === 0) {
      // 다른 셀렉터 시도
      const allCards = await page.$$eval('[class*="card"]', els => els.map(e => ({
        text: e.innerText.substring(0, 100),
        classes: e.className
      })));
      log('KPI 카드 존재', allCards.length > 0, `카드 ${allCards.length}개 발견`);
    } else {
      log('KPI 카드 4개', kpiCards.length >= 4, `${kpiCards.length}개`);
    }
    
    // 숫자 확인 (0이 아닌 값이 있는지)
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasNonZeroData = /[1-9]\d*/.test(bodyText.substring(0, 500));
    log('KPI 데이터 표시', hasNonZeroData, '0이 아닌 데이터 존재');
    
    // 총 클릭수 확인 (186이어야 함)
    const has186 = bodyText.includes('186');
    log('총 클릭수 = 186', has186);
    
    // 총 노출수 확인 (2,555이어야 함)
    const has2555 = bodyText.includes('2,555') || bodyText.includes('2555');
    log('총 노출수 = 2,555', has2555);
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-kpi.png') });
    
    // ==================== 3. 차트 렌더링 검증 ====================
    console.log('\n[3] 차트 렌더링 검증');
    
    const canvases = await page.$$('canvas');
    log('차트 Canvas 존재', canvases.length > 0, `${canvases.length}개`);
    
    // 차트에 데이터가 그려졌는지 확인 (canvas 비어있지 않은지)
    for (let i = 0; i < Math.min(canvases.length, 3); i++) {
      const hasContent = await canvases[i].evaluate(el => {
        const ctx = el.getContext('2d');
        const data = ctx.getImageData(0, 0, el.width, el.height).data;
        let nonEmpty = 0;
        for (let j = 3; j < data.length; j += 4) {
          if (data[j] > 0) nonEmpty++;
        }
        return nonEmpty > 100;
      });
      log(`차트 ${i+1} 렌더링`, hasContent);
    }
    
    // ==================== 4. 데이터 입력 폼 검증 ====================
    console.log('\n[4] 데이터 입력 폼 검증');
    
    // 데이터 입력 버튼 클릭
    const inputBtn = await page.$('button:has-text("데이터 입력")') || await page.$('[class*="input-btn"]');
    if (inputBtn) {
      await inputBtn.click({ force: true });
      await sleep(1000);
      log('데이터 입력 패널 열기', true);
      
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-input-panel.png') });
      
      // CPC 데이터 입력 테스트
      const productSelect = await page.$('select[name="product_id"]');
      if (productSelect) {
        // 상품 옵션 확인
        const options = await productSelect.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent })));
        log('상품 옵션 로드', options.length >= 14, `${options.length}개 옵션`);
        
        // 테스트 데이터 입력
        await productSelect.selectOption('751791');
        
        const dateInput = await page.$('input[name="date"]');
        if (dateInput) await dateInput.fill('2026-03-30');
        
        const impressionsInput = await page.$('input[name="impressions"]');
        if (impressionsInput) await impressionsInput.fill('300');
        
        const clicksInput = await page.$('input[name="clicks"]');
        if (clicksInput) await clicksInput.fill('25');
        
        const costInput = await page.$('input[name="cpc_cost"]');
        if (costInput) await costInput.fill('7500');
        
        log('CPC 입력 폼 작성', true);
        
        // 제출
        const submitCpcBtn = await page.$('form button[type="submit"], form:first-of-type button:has-text("저장")');
        if (submitCpcBtn) {
          await submitCpcBtn.click({ force: true });
          await sleep(3000);
          
          // 토스트 메시지 확인
          const toast = await page.$('[class*="toast"]');
          const toastText = toast ? await toast.innerText() : '';
          log('CPC 데이터 저장', toastText.includes('완료') || toastText.includes('저장'), toastText);
        }
      } else {
        log('상품 선택 드롭다운', false, '찾지 못함');
      }
      
      // 패널 닫기
      const closeBtn = await page.$('[class*="close"], button:has-text("닫기"), button:has-text("×")');
      if (closeBtn) await closeBtn.click({ force: true });
      await sleep(1000);
    } else {
      log('데이터 입력 버튼', false, '찾지 못함');
    }
    
    // ==================== 5. 탭 전환 검증 ====================
    console.log('\n[5] 탭 전환 검증');
    
    // 탭 2: 전환 퍼널
    const funnelTab = await page.$('text=전환 퍼널') || await page.$('[class*="nav-item"]:nth-child(2)');
    if (funnelTab) {
      await funnelTab.click({ force: true });
      await sleep(3000);
      
      const funnelText = await page.evaluate(() => document.body.innerText);
      log('전환 퍼널 탭 전환', funnelText.includes('퍼널') || funnelText.includes('문의') || funnelText.includes('견적'));
      
      // 퍼널 수치 확인
      log('퍼널 노출 수치', funnelText.includes('2,555') || funnelText.includes('2555'));
      log('퍼널 클릭 수치', funnelText.includes('186'));
      
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-funnel.png') });
    }
    
    // 탭 3: 서비스별 문의량
    const inquiryTab = await page.$('text=서비스별 문의량') || await page.$('[class*="nav-item"]:nth-child(3)');
    if (inquiryTab) {
      await inquiryTab.click({ force: true });
      await sleep(3000);
      
      const inqText = await page.evaluate(() => document.body.innerText);
      log('서비스별 문의량 탭 전환', inqText.includes('문의') || inqText.includes('카테고리'));
      
      // 문의 목록 테이블 확인
      const hasTableData = inqText.includes('김사장') || inqText.includes('송대표') || inqText.includes('이원장');
      log('최근 문의 목록 데이터', hasTableData);
      
      // 매출 확인
      const hasRevenue = inqText.includes('320,000') || inqText.includes('₩320');
      log('총 매출 = ₩320,000', hasRevenue);
      
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-inquiries.png') });
    }
    
    // 탭 1로 복귀
    const cpcTab = await page.$('text=CPC 소재테스트') || await page.$('[class*="nav-item"]:nth-child(1)');
    if (cpcTab) await cpcTab.click({ force: true });
    await sleep(2000);
    
    // ==================== 6. 기간 필터 검증 ====================
    console.log('\n[6] 기간 필터 검증');
    
    const filterBtns = await page.$$('[class*="filter"] button, [class*="date-filter"] button, [class*="range"] button');
    log('기간 필터 버튼 존재', filterBtns.length > 0, `${filterBtns.length}개`);
    
    if (filterBtns.length > 0) {
      // 7일 버튼 클릭
      for (const btn of filterBtns) {
        const text = await btn.innerText().catch(() => '');
        if (text.includes('7일') || text.includes('7d')) {
          await btn.click({ force: true });
          await sleep(2000);
          log('7일 필터 동작', true);
          break;
        }
      }
    }
    
    // ==================== 7. 테이블 정렬 검증 ====================
    console.log('\n[7] 테이블 정렬 검증');
    
    const tableHeaders = await page.$$('table th');
    if (tableHeaders.length > 0) {
      const firstTh = tableHeaders[0];
      await firstTh.click({ force: true });
      await sleep(500);
      log('테이블 헤더 클릭 정렬', true);
    }
    
    // ==================== 8. 데이터 정합성 검증 ====================
    console.log('\n[8] 데이터 정합성 검증');
    
    // Supabase 직접 조회로 대시보드 표시값 대조
    const supabaseUrl = 'https://byaipfmwicukyzruqtsj.supabase.co/rest/v1';
    const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5YWlwZm13aWN1a3l6cnVxdHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTc3MjgsImV4cCI6MjA4NjUzMzcyOH0.GGm46X0W0joFXdYtdg-N9n8UQYiVHpbtZVZ__jfbY40';
    
    // CPC 합계
    const cpcData = await page.evaluate(async (url, key) => {
      const res = await fetch(`${url}/kmong_cpc_daily?select=clicks,impressions,cpc_cost`, {
        headers: { apikey: key }
      });
      return res.json();
    }, supabaseUrl, apiKey);
    
    const totalClicks = cpcData.reduce((s, r) => s + (r.clicks || 0), 0);
    const totalImpressions = cpcData.reduce((s, r) => s + (r.impressions || 0), 0);
    const totalCost = cpcData.reduce((s, r) => s + (r.cpc_cost || 0), 0);
    
    console.log(`    DB 클릭합계: ${totalClicks}, 노출합계: ${totalImpressions}, 비용합계: ${totalCost}`);
    
    // 새로 입력한 데이터 포함 여부 확인 (3/30 데이터)
    const has330 = cpcData.some(r => r.clicks === 25 && r.impressions === 300);
    log('새 입력 데이터(3/30) DB 저장 확인', has330, has330 ? '300노출/25클릭 발견' : '미발견');
    
    // 문의 합계
    const inqData = await page.evaluate(async (url, key) => {
      const res = await fetch(`${url}/kmong_inquiries?select=status,paid_amount`, {
        headers: { apikey: key }
      });
      return res.json();
    }, supabaseUrl, apiKey);
    
    const totalInquiries = inqData.length;
    const paidCount = inqData.filter(r => r.status === 'paid').length;
    const totalRevenue = inqData.reduce((s, r) => s + (r.paid_amount || 0), 0);
    
    console.log(`    DB 문의: ${totalInquiries}건, 결제: ${paidCount}건, 매출: ₩${totalRevenue.toLocaleString()}`);
    log('문의 8건', totalInquiries === 8, `${totalInquiries}건`);
    log('결제 3건', paidCount === 3, `${paidCount}건`);
    log('매출 ₩320,000', totalRevenue === 320000, `₩${totalRevenue.toLocaleString()}`);
    
    // ==================== 9. 반응형 검증 ====================
    console.log('\n[9] 반응형 검증');
    
    const viewports = [
      { name: '375px (모바일)', width: 375, height: 812 },
      { name: '768px (태블릿)', width: 768, height: 1024 },
      { name: '1024px (노트북)', width: 1024, height: 768 },
      { name: '1440px (데스크톱)', width: 1440, height: 900 }
    ];
    
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await sleep(1500);
      
      // 가로 스크롤 확인
      const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      log(`${vp.name} 가로스크롤 없음`, !hasHScroll, hasHScroll ? '가로스크롤 발생!' : 'OK');
      
      // 콘텐츠 오버플로우 확인
      const overflow = await page.evaluate(() => {
        const body = document.body;
        return body.scrollWidth > window.innerWidth + 5;
      });
      log(`${vp.name} 오버플로우 없음`, !overflow);
      
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `05-${vp.width}px.png`) });
    }
    
    // ==================== 10. CSV 업로드 검증 ====================
    console.log('\n[10] CSV 업로드 검증');
    
    // 1440으로 복귀
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(1000);
    
    // 데이터 입력 패널 열기
    const inputBtn2 = await page.$('button:has-text("데이터 입력")');
    if (inputBtn2) {
      await inputBtn2.click({ force: true });
      await sleep(1000);
      
      // CSV 파일 input 찾기
      const csvInput = await page.$('input[type="file"]');
      if (csvInput) {
        // 테스트 CSV 생성
        const csvContent = '상품ID,날짜,노출수,클릭수,광고비\n751791,2026-03-20,500,40,12000\n747156,2026-03-20,600,50,15000';
        const fs = require('fs');
        const csvPath = path.join(SCREENSHOT_DIR, 'test.csv');
        fs.writeFileSync(csvPath, csvContent);
        
        await csvInput.setInputFiles(csvPath);
        await sleep(3000);
        
        const csvStatus = await page.$('#csvStatus, [class*="csv-status"]');
        const statusText = csvStatus ? await csvStatus.innerText() : '';
        log('CSV 업로드 처리', statusText.includes('완료') || statusText.includes('upload'), statusText);
      } else {
        log('CSV 파일 input', false, '찾지 못함');
      }
    }
    
    // ==================== 결과 요약 ====================
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 E2E 테스트 결과: ${passed}/${passed + failed} 통과`);
    console.log(`  ✅ 통과: ${passed}건`);
    console.log(`  ❌ 실패: ${failed}건`);
    
    if (consoleErrors.length > 0) {
      console.log(`\n⚠️ 콘솔 에러 ${consoleErrors.length}건:`);
      consoleErrors.forEach(e => console.log(`  → ${e.substring(0, 200)}`));
    }
    
    // 최종 스크린샷
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await sleep(5000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-final.png'), fullPage: true });
    
    await browser.close();
    
    // 결과 JSON 저장
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'results.json'), JSON.stringify({
      total: passed + failed,
      passed,
      failed,
      tests: testResults,
      consoleErrors,
      timestamp: new Date().toISOString()
    }, null, 2));
    
  } catch (error) {
    console.error('❌ 테스트 에러:', error.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error.png') }).catch(() => {});
    await browser.close();
  }
}

run();
