#!/usr/bin/env node
/**
 * 크몽 매출(수익금) 크롤러
 * - API: /api/v5/user/profits-chart?type=monthly → 월별 매출 차트
 * - API: /api/v5/user/withdraw → 출금 정보
 * - 페이지: /seller/profits_history → 개별 거래 내역 (DOM 파싱)
 * - Supabase: kmong_profits_monthly, kmong_profits_transactions, kmong_profits_summary
 */

const { login } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');

/**
 * 금액 텍스트에서 숫자 추출 ("172,326원" → 172326)
 */
function parseAmount(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9]/g, '');
  return parseInt(cleaned, 10) || 0;
}

/**
 * 날짜 텍스트 파싱 ("26.03.28 14:14" → ISO string)
 */
function parseOrderDate(text) {
  if (!text) return null;
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{2})\s*(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
      parseInt(m[4]), parseInt(m[5]));
    return d.toISOString();
  }
  return null;
}

async function crawlProfits() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 매출(수익금) 크롤러 시작 ===');

    const result = await login({ slowMo: 50 });
    browser = result.browser;
    const page = result.page;

    await page.waitForURL((url) => url.origin === 'https://kmong.com', { waitUntil: 'domcontentloaded' });

    // ── 1단계: 월별 매출 차트 API ──
    console.log('[API] 월별 매출 차트 조회...');
    const chartData = await page.evaluate(async () => {
      const r = await fetch('https://kmong.com/api/v5/user/profits-chart?type=monthly', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    });

    let monthlyCount = 0;
    if (chartData && chartData.terms) {
      console.log(`[API] 월별 데이터: ${chartData.terms.length}개월`);
      const monthlyRows = [];
      for (let i = 0; i < chartData.terms.length; i++) {
        const term = chartData.terms[i];
        const completed = parseInt(chartData.completed_data?.[i]) || 0;
        const canceled = parseInt(chartData.canceled_data?.[i]) || 0;
        if (completed > 0 || canceled > 0) {
          monthlyRows.push({
            term,
            completed_amount: completed,
            canceled_amount: canceled,
            crawled_at: new Date().toISOString(),
          });
        }
      }

      if (monthlyRows.length > 0) {
        const { error } = await supabase
          .from('kmong_profits_monthly')
          .upsert(monthlyRows, { onConflict: 'term' });
        if (error) {
          console.error(`[에러] 월별 매출 저장 실패: ${error.message}`);
        } else {
          monthlyCount = monthlyRows.length;
          console.log(`[저장] 월별 매출 ${monthlyCount}건 upsert`);
        }
      }
    } else {
      console.warn('[경고] 월별 매출 차트 API 응답 없음');
    }

    // ── 2단계: 출금 정보 API ──
    console.log('[API] 출금 정보 조회...');
    const withdrawData = await page.evaluate(async () => {
      const r = await fetch('https://kmong.com/api/v5/user/withdraw', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    });

    if (withdrawData) {
      console.log(`[API] 출금 정보: ${JSON.stringify(withdrawData).substring(0, 200)}`);
    }

    // ── 3단계: 매출 페이지 이동 → 거래 내역 + 수익금 요약 ──
    console.log('[페이지] /seller/profits_history 이동...');
    await page.goto('https://kmong.com/seller/profits_history', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // 수익금 요약 추출 (출금가능/예상/출금완료)
    console.log('[DOM] 수익금 요약 추출...');
    const summary = await page.evaluate(() => {
      const text = document.body.innerText;
      const getAmount = (label) => {
        const regex = new RegExp(label + '[:\\s]*([\\d,]+)\\s*원');
        const m = text.match(regex);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
      };
      return {
        available: getAmount('출금 가능 수익금'),
        expected: getAmount('예상 수익금'),
        withdrawn: getAmount('출금 완료 수익금'),
      };
    });

    console.log(`[수익금] 출금가능: ${summary.available}원, 예상: ${summary.expected}원, 출금완료: ${summary.withdrawn}원`);

    const { error: sumErr } = await supabase
      .from('kmong_profits_summary')
      .insert({
        available_profit: summary.available,
        expected_profit: summary.expected,
        withdrawn_profit: summary.withdrawn,
        crawled_at: new Date().toISOString(),
      });
    if (sumErr) {
      console.error(`[에러] 수익금 요약 저장 실패: ${sumErr.message}`);
    } else {
      console.log('[저장] 수익금 요약 insert 완료');
    }

    // 거래 내역 추출
    console.log('[DOM] 거래 내역 추출...');
    const transactions = await page.evaluate(() => {
      const text = document.body.innerText;
      const results = [];

      // 주문번호 패턴으로 블록 분할
      const blocks = text.split(/(#\d{5,})/);
      for (let i = 1; i < blocks.length; i += 2) {
        const orderNum = blocks[i]; // "#7199199"
        const content = blocks[i + 1] || '';

        // 수익금 추출
        const profitMatch = content.match(/수익금[:\s]*([\d,]+)\s*원/);
        const profitAmount = profitMatch ? parseInt(profitMatch[1].replace(/,/g, ''), 10) : 0;

        // 실 거래 금액
        const actualMatch = content.match(/실\s*거래\s*금액[:\s]*([\d,]+)\s*원/);
        const actualAmount = actualMatch ? parseInt(actualMatch[1].replace(/,/g, ''), 10) : 0;

        // 주문 접수일
        const dateMatch = content.match(/주문\s*접수일[:\s]*(\d{2}\.\d{2}\.\d{2}\s*\d{1,2}:\d{2})/);
        let orderDate = null;
        if (dateMatch) {
          const m = dateMatch[1].match(/(\d{2})\.(\d{2})\.(\d{2})\s*(\d{1,2}):(\d{2})/);
          if (m) {
            const d = new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
              parseInt(m[4]), parseInt(m[5]));
            orderDate = d.toISOString();
          }
        }

        // 상태 추출
        let status = '진행중';
        if (content.includes('거래완료') || content.includes('완료')) status = '완료';
        else if (content.includes('취소')) status = '취소';
        else if (content.includes('진행중') || content.includes('작업중')) status = '진행중';

        if (orderNum) {
          results.push({
            order_number: orderNum,
            order_date: orderDate,
            actual_amount: actualAmount,
            profit_amount: profitAmount,
            status,
          });
        }
      }
      return results;
    });

    console.log(`[DOM] 거래 내역 ${transactions.length}건 추출`);

    // 페이지네이션: 추가 페이지 확인
    let allTransactions = [...transactions];
    try {
      const hasNextPage = await page.locator('a:has-text("다음"), button:has-text("다음"), .pagination .next:not(.disabled)').first().isVisible({ timeout: 2000 }).catch(() => false);
      if (hasNextPage) {
        console.log('[페이지] 다음 페이지 존재 — 이동...');
        await page.locator('a:has-text("다음"), button:has-text("다음"), .pagination .next:not(.disabled)').first().click();
        await page.waitForTimeout(3000);

        const page2Transactions = await page.evaluate(() => {
          const text = document.body.innerText;
          const results = [];
          const blocks = text.split(/(#\d{5,})/);
          for (let i = 1; i < blocks.length; i += 2) {
            const orderNum = blocks[i];
            const content = blocks[i + 1] || '';
            const profitMatch = content.match(/수익금[:\s]*([\d,]+)\s*원/);
            const profitAmount = profitMatch ? parseInt(profitMatch[1].replace(/,/g, ''), 10) : 0;
            const actualMatch = content.match(/실\s*거래\s*금액[:\s]*([\d,]+)\s*원/);
            const actualAmount = actualMatch ? parseInt(actualMatch[1].replace(/,/g, ''), 10) : 0;
            const dateMatch = content.match(/주문\s*접수일[:\s]*(\d{2}\.\d{2}\.\d{2}\s*\d{1,2}:\d{2})/);
            let orderDate = null;
            if (dateMatch) {
              const m = dateMatch[1].match(/(\d{2})\.(\d{2})\.(\d{2})\s*(\d{1,2}):(\d{2})/);
              if (m) {
                const d = new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
                  parseInt(m[4]), parseInt(m[5]));
                orderDate = d.toISOString();
              }
            }
            let status = '진행중';
            if (content.includes('거래완료') || content.includes('완료')) status = '완료';
            else if (content.includes('취소')) status = '취소';
            results.push({ order_number: orderNum, order_date: orderDate, actual_amount: actualAmount, profit_amount: profitAmount, status });
          }
          return results;
        });
        allTransactions = allTransactions.concat(page2Transactions);
        console.log(`[페이지2] 추가 ${page2Transactions.length}건`);
      }
    } catch (e) {
      console.log('[페이지] 추가 페이지 없음 또는 탐색 실패');
    }

    // Supabase upsert
    let txCount = 0;
    for (const tx of allTransactions) {
      const { error } = await supabase
        .from('kmong_profits_transactions')
        .upsert({
          order_number: tx.order_number,
          order_date: tx.order_date,
          actual_amount: tx.actual_amount,
          profit_amount: tx.profit_amount,
          status: tx.status,
          crawled_at: new Date().toISOString(),
        }, { onConflict: 'order_number' });

      if (error) {
        console.error(`[에러] 거래 ${tx.order_number} 저장 실패: ${error.message}`);
      } else {
        txCount++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = `크몽 매출: 월별 ${monthlyCount}건, 거래 ${txCount}건, 출금가능 ${summary.available}원, 출금완료 ${summary.withdrawn}원 (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notify(msg);

    await browser.close();

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 매출 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

crawlProfits();
