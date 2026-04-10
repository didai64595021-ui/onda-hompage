#!/usr/bin/env node
/**
 * 크몽 시장조사 — 영수증리뷰 + 블로그리뷰
 * 1) 카테고리 구조 정찰 (마케팅 카테고리 하위)
 * 2) 상위 판매자 분석 (가격, 리뷰수, 제목, 핵심 키워드)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT_DIR = __dirname;

async function run() {
  console.log('[RESEARCH] 크몽 리뷰 서비스 시장조사 시작...');

  const { page, browser } = await login();
  await closeModals(page).catch(() => {});

  const results = {
    timestamp: new Date().toISOString(),
    categories: {},
    searches: {},
  };

  // ─── 1. 카테고리 구조 정찰 ───
  console.log('\n[STEP 1] 카테고리 구조 정찰...');

  // 크몽 신규 등록 페이지에서 카테고리 탐색
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);
  await closeModals(page).catch(() => {});

  // 1차 카테고리 목록 가져오기
  try {
    const cat1Btn = page.locator('button').filter({ hasText: '1차 카테고리' }).first();
    await cat1Btn.click();
    await sleep(1500);

    const cat1Options = await page.evaluate(() => {
      // popover 메뉴에서 모든 옵션 텍스트 추출
      const items = document.querySelectorAll('[role="listbox"] [role="option"], [class*="popover"] button, [class*="menu"] button, [class*="dropdown"] button, [class*="list"] button');
      const texts = [];
      items.forEach(el => {
        const t = (el.innerText || '').trim();
        if (t && t.length < 30 && t !== '1차 카테고리') texts.push(t);
      });
      // 또한 popover 내 모든 텍스트 노드도 시도
      const all = document.querySelectorAll('div[class*="absolute"], div[class*="popover"], div[class*="Popover"], ul, [role="menu"]');
      all.forEach(container => {
        container.querySelectorAll('*').forEach(el => {
          const t = (el.innerText || el.textContent || '').trim();
          if (t && t.length > 1 && t.length < 25 && !texts.includes(t)) {
            // 리프 노드 체크
            if (el.children.length === 0 || el.tagName === 'BUTTON' || el.tagName === 'LI') {
              texts.push(t);
            }
          }
        });
      });
      return [...new Set(texts)];
    });

    console.log('  1차 카테고리 목록:', cat1Options);
    results.categories.cat1 = cat1Options;

    // "마케팅" 관련 카테고리 찾기
    const marketingKeywords = ['마케팅', '광고', '홍보', '리뷰', '블로그', 'SNS', '콘텐츠'];
    const marketingCat = cat1Options.find(opt =>
      marketingKeywords.some(kw => opt.includes(kw))
    );

    if (marketingCat) {
      console.log(`  → 마케팅 카테고리 발견: "${marketingCat}"`);

      // 마케팅 카테고리 클릭
      await page.getByText(marketingCat, { exact: true }).click();
      await sleep(1500);

      // 2차 카테고리 열기
      const cat2Btn = page.locator('button').filter({ hasText: '2차 카테고리' }).first();
      await cat2Btn.click();
      await sleep(1500);

      const cat2Options = await page.evaluate(() => {
        const items = [];
        const all = document.querySelectorAll('div[class*="absolute"], div[class*="popover"], div[class*="Popover"], ul, [role="menu"]');
        all.forEach(container => {
          container.querySelectorAll('*').forEach(el => {
            const t = (el.innerText || el.textContent || '').trim();
            if (t && t.length > 1 && t.length < 30 && el.children.length === 0) {
              items.push(t);
            }
          });
        });
        return [...new Set(items)].filter(t => t !== '2차 카테고리');
      });

      console.log('  2차 카테고리(마케팅):', cat2Options);
      results.categories.cat2_marketing = cat2Options;
    }

    // ESC로 닫기
    await page.keyboard.press('Escape');
    await sleep(500);
  } catch (e) {
    console.log('  카테고리 정찰 실패:', e.message);
  }

  // ─── 2. 검색 기반 시장조사 ───
  console.log('\n[STEP 2] 키워드별 검색 시장조사...');

  const keywords = [
    '영수증리뷰',
    '블로그리뷰',
    '네이버 영수증리뷰',
    '네이버 블로그리뷰',
    '리뷰 대행',
    '체험단 리뷰',
    '블로그 체험단',
    '네이버 리뷰 마케팅',
  ];

  for (const kw of keywords) {
    console.log(`\n  [검색] "${kw}"...`);
    try {
      await page.goto(`https://kmong.com/search?keyword=${encodeURIComponent(kw)}`, {
        waitUntil: 'networkidle', timeout: 20000
      });
      await sleep(2000);
      await closeModals(page).catch(() => {});

      // 검색 결과 파싱
      const searchResult = await page.evaluate((keyword) => {
        const cards = [];
        // 카드 셀렉터 여러 패턴 시도
        const cardEls = document.querySelectorAll(
          'a[href*="/gig/"], div[class*="card"], article, [class*="GigCard"], [class*="gig-card"]'
        );

        // 링크 기반으로 가격+제목 추출
        const links = document.querySelectorAll('a[href*="/gig/"]');
        const seen = new Set();

        links.forEach(a => {
          const href = a.getAttribute('href');
          if (seen.has(href)) return;
          seen.add(href);

          const container = a.closest('div') || a;
          const title = (container.querySelector('h3, h4, [class*="title"], [class*="Title"]') || a).innerText?.trim()?.slice(0, 80);

          // 가격 찾기
          const allText = container.innerText || '';
          const priceMatch = allText.match(/(\d{1,3}(,\d{3})*)\s*원/);
          const price = priceMatch ? priceMatch[1] : '';

          // 리뷰 수 찾기
          const reviewMatch = allText.match(/리뷰\s*(\d+)|(\d+)\s*개\s*리뷰|\((\d+)\)/);
          const reviews = reviewMatch ? (reviewMatch[1] || reviewMatch[2] || reviewMatch[3]) : '';

          // 별점
          const ratingMatch = allText.match(/(\d\.\d)/);
          const rating = ratingMatch ? ratingMatch[1] : '';

          if (title && title.length > 5) {
            cards.push({ title, price, reviews, rating, href });
          }
        });

        // 총 결과 수
        const totalMatch = (document.body.innerText || '').match(/(\d{1,6})\s*개의?\s*(서비스|결과)/);
        const total = totalMatch ? totalMatch[1] : 'unknown';

        return { keyword, total, topCards: cards.slice(0, 15) };
      }, kw);

      console.log(`    → ${searchResult.total}개 결과, 상위 ${searchResult.topCards.length}개 카드`);
      searchResult.topCards.forEach((c, i) => {
        console.log(`    ${i+1}. [${c.price}원] ${c.title} (리뷰:${c.reviews})`);
      });

      results.searches[kw] = searchResult;

      // 상위 3개 상세 페이지 조사 (첫 2개 키워드만)
      if (['영수증리뷰', '블로그리뷰'].includes(kw) && searchResult.topCards.length > 0) {
        const detailResults = [];
        const topN = searchResult.topCards.slice(0, 3);

        for (const card of topN) {
          if (!card.href) continue;
          const url = card.href.startsWith('http') ? card.href : `https://kmong.com${card.href}`;
          console.log(`    [상세] ${url}...`);

          try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            await sleep(1500);
            await closeModals(page).catch(() => {});

            const detail = await page.evaluate(() => {
              const getText = (sel) => (document.querySelector(sel)?.innerText || '').trim().slice(0, 500);

              // 카테고리 경로
              const breadcrumb = [...document.querySelectorAll('nav a, [class*="breadcrumb"] a, [class*="Breadcrumb"] a')]
                .map(a => a.innerText?.trim()).filter(Boolean);

              // 제목
              const title = getText('h1') || getText('[class*="title"]');

              // 가격 패키지
              const packages = [];
              const pkgEls = document.querySelectorAll('[class*="package"], [class*="Package"], [class*="pricing"]');
              pkgEls.forEach(el => {
                packages.push(el.innerText?.trim()?.slice(0, 200));
              });

              // 본문 미리보기
              const desc = getText('[class*="description"], [class*="Description"]')?.slice(0, 800);

              // 리뷰 수
              const reviewCount = (document.body.innerText.match(/리뷰\s*(\d+)|(\d+)\s*개/) || [])[1] || '';

              // 판매 수
              const salesMatch = (document.body.innerText.match(/(\d{1,6})\s*건?\s*판매|거래\s*(\d+)/) || []);
              const sales = salesMatch[1] || salesMatch[2] || '';

              // 셀러 정보
              const sellerEl = document.querySelector('[class*="seller"], [class*="Seller"]');
              const seller = sellerEl ? sellerEl.innerText?.trim()?.slice(0, 100) : '';

              // 태그
              const tags = [...document.querySelectorAll('[class*="tag"], [class*="Tag"] a, [class*="keyword"]')]
                .map(el => el.innerText?.trim()).filter(t => t && t.length < 20);

              return { title, breadcrumb, packages, desc, reviewCount, sales, seller, tags };
            });

            detailResults.push({ ...card, detail });
            console.log(`      카테고리: ${detail.breadcrumb.join(' > ')}`);
            console.log(`      리뷰: ${detail.reviewCount}, 판매: ${detail.sales}`);
            console.log(`      태그: ${detail.tags.join(', ')}`);
          } catch (e) {
            console.log(`      상세 조사 실패: ${e.message}`);
          }
        }

        results.searches[kw].details = detailResults;
      }
    } catch (e) {
      console.log(`    검색 실패: ${e.message}`);
      results.searches[kw] = { error: e.message };
    }
  }

  // ─── 3. 카테고리 직접 탐색 (마케팅 하위) ───
  console.log('\n[STEP 3] 마케팅 카테고리 직접 탐색...');

  // 크몽의 마케팅 카테고리 URL 패턴 시도
  const catUrls = [
    'https://kmong.com/category/3',    // 마케팅 메인
    'https://kmong.com/category/3/subcategory',
  ];

  for (const url of catUrls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);
      await closeModals(page).catch(() => {});

      const catInfo = await page.evaluate(() => {
        const allText = document.body.innerText || '';
        const heading = (document.querySelector('h1, h2') || {}).innerText || '';

        // 서브카테고리 링크 수집
        const subCats = [];
        document.querySelectorAll('a[href*="/category/"]').forEach(a => {
          const text = a.innerText?.trim();
          const href = a.getAttribute('href');
          if (text && text.length < 30 && href) subCats.push({ text, href });
        });

        return { url: location.href, heading, subCats: subCats.slice(0, 30) };
      });

      console.log(`  ${url} → ${catInfo.heading}`);
      catInfo.subCats.forEach(s => console.log(`    - ${s.text}: ${s.href}`));
      results.categories[url] = catInfo;
    } catch (e) {
      console.log(`  ${url} 실패: ${e.message}`);
    }
  }

  // ─── 4. 신규 등록 페이지에서 전체 카테고리 트리 정찰 ───
  console.log('\n[STEP 4] 전체 카테고리 트리 정찰 (신규등록 페이지)...');

  try {
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    await closeModals(page).catch(() => {});

    // 1차 카테고리 버튼 클릭
    const cat1Btn = page.locator('button').filter({ hasText: '1차 카테고리' }).first();
    await cat1Btn.click();
    await sleep(1500);

    // 스크린샷 저장
    await page.screenshot({
      path: path.join(OUT_DIR, 'screenshots', 'cat1-menu.png'),
      fullPage: true
    });

    // 모든 1차 카테고리 순회하면서 2차 카테고리 수집
    const fullTree = await page.evaluate(() => {
      // popover 내 버튼/옵션 추출
      const getMenuItems = () => {
        const items = [];
        // 여러 선택자 시도
        const candidates = document.querySelectorAll(
          'button, li, [role="option"], [role="menuitem"], div[class*="item"], div[class*="option"]'
        );
        candidates.forEach(el => {
          const t = (el.innerText || el.textContent || '').trim();
          const rect = el.getBoundingClientRect();
          // 보이는 요소만, 적절한 텍스트 길이
          if (t && t.length >= 2 && t.length <= 25 && rect.height > 0 && rect.height < 60) {
            if (!items.includes(t)) items.push(t);
          }
        });
        return items;
      };

      return getMenuItems();
    });

    console.log('  1차 카테고리 후보들:', fullTree.slice(0, 20));
    results.categories.fullTree = fullTree;

    // 각 마케팅 관련 1차 카테고리 클릭 후 2차 수집
    const marketingNames = fullTree.filter(name =>
      ['마케팅', '광고', 'SNS', '콘텐츠', '홍보'].some(kw => name.includes(kw))
    );

    console.log('  마케팅 관련:', marketingNames);

    for (const catName of marketingNames) {
      console.log(`\n  [${catName}] 2차 카테고리 탐색...`);
      try {
        // ESC로 현재 메뉴 닫기
        await page.keyboard.press('Escape');
        await sleep(500);

        // 1차 카테고리 다시 열기
        await cat1Btn.click().catch(() => {});
        await sleep(1000);

        // 해당 카테고리 클릭
        await page.getByText(catName, { exact: true }).click();
        await sleep(1500);

        // 2차 카테고리 버튼 클릭
        const cat2Btn = page.locator('button').filter({ hasText: '2차 카테고리' }).first();
        await cat2Btn.click();
        await sleep(1500);

        await page.screenshot({
          path: path.join(OUT_DIR, 'screenshots', `cat2-${catName}.png`),
          fullPage: true
        });

        const cat2Items = await page.evaluate(() => {
          const items = [];
          // 활성 팝오버/드롭다운 내 항목 추출
          const containers = document.querySelectorAll(
            '[data-radix-popper-content-wrapper], [class*="popover"], [class*="Popover"], [class*="dropdown"], [role="listbox"]'
          );
          containers.forEach(container => {
            container.querySelectorAll('*').forEach(el => {
              const t = (el.innerText || '').trim();
              const rect = el.getBoundingClientRect();
              if (t && t.length >= 2 && t.length <= 30 && rect.height > 10 && rect.height < 60) {
                if (el.children.length === 0 || el.tagName === 'BUTTON' || el.tagName === 'LI') {
                  if (!items.includes(t) && t !== '2차 카테고리') items.push(t);
                }
              }
            });
          });
          return items;
        });

        console.log(`    2차 카테고리: ${cat2Items.join(', ')}`);
        results.categories[`cat2_${catName}`] = cat2Items;

        await page.keyboard.press('Escape');
        await sleep(500);
      } catch (e) {
        console.log(`    실패: ${e.message}`);
      }
    }
  } catch (e) {
    console.log('  카테고리 트리 정찰 실패:', e.message);
  }

  // 저장
  const outPath = path.join(OUT_DIR, 'market-research-review.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[DONE] 결과 저장: ${outPath}`);

  await browser.close();
}

run().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
