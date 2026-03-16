#!/usr/bin/env node
const { generateKeywords } = require('./config');
const { createBrowser, searchPlaces, checkTalktalk, delay } = require('./scraper');
const { checkHomepage } = require('./homepage-checker');
const db = require('./db');
const { exportBatch, exportCsv, exportJson, BATCH_SIZE } = require('./exporter');

// CLI 인자 파싱
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) {
      options.region = args[++i];
    } else if (args[i] === '--category' && args[i + 1]) {
      options.category = args[++i];
    } else if (args[i] === '--export' && args[i + 1]) {
      options.exportFormat = args[++i];
    } else if (args[i] === '--max-pages') {
      options.maxPages = parseInt(args[++i], 10) || 3;
    } else if (args[i] === '--stats') {
      options.stats = true;
    } else if (args[i] === '--help') {
      console.log(`네이버 톡톡 업체 크롤러 + 콜드메시지 타겟 분류

사용법:
  node crawl.js                       전체 크롤링 (우선순위 순)
  node crawl.js --region 강남          특정 지역만
  node crawl.js --category 피부과      특정 업종만
  node crawl.js --export csv           전체 CSV 내보내기 (크롤링 없이)
  node crawl.js --export json          전체 JSON 내보내기
  node crawl.js --export all           전체 CSV 하나로 내보내기
  node crawl.js --max-pages 5          키워드당 최대 페이지 수
  node crawl.js --stats                현재 수집 통계 출력

전환등급:
  S급: 톡톡O + 홈페이지O + 반응형X → 반응형전환 (7만)
  A급: 톡톡O + 홈페이지X + 리뷰적음 → 랜딩제작 (12만)
  B급: 톡톡O + 홈페이지X + 리뷰많음 → 랜딩제작
  C급: 톡톡O + 홈페이지O + 반응형O + 카톡X → 부가서비스
  D급: 톡톡O + 홈페이지O + 반응형O + 카톡O → 타겟아님`);
      process.exit(0);
    }
  }
  return options;
}

// 통계 출력
function printStats() {
  const stats = db.getStats();
  console.log('\n=== 수집 통계 ===');
  console.log(`전체 스캔: ${stats.totalAll}건 | 타겟 대상: ${stats.total}건\n`);

  if (stats.total === 0) {
    console.log('수집된 데이터가 없습니다.');
    return;
  }

  console.log('등급별:');
  const desc = {
    S: '반응형전환 타겟 (홈페이지O+반응형X)',
    A: '랜딩제작 타겟 (홈페이지X+리뷰적음)',
    B: '랜딩제작 타겟 (홈페이지X+리뷰많음)',
    C: '부가서비스 (반응형O+카톡X)',
    D: '현재 타겟아님 (반응형O+카톡O)',
  };
  for (const g of stats.byGrade) {
    console.log(`  ${g.grade}급: ${g.cnt}건 — ${desc[g.grade] || ''}`);
  }

  if (stats.byMenu && stats.byMenu.length > 0) {
    console.log('\n타겟 메뉴별:');
    for (const m of stats.byMenu) {
      console.log(`  ${m.target_menu}: ${m.cnt}건`);
    }
  }

  if (stats.byRegion.length > 0) {
    console.log('\n지역별 (상위 10):');
    for (const r of stats.byRegion) {
      console.log(`  ${r.region}: ${r.cnt}건`);
    }
  }

  if (stats.byCategory.length > 0) {
    console.log('\n업종그룹별:');
    for (const c of stats.byCategory) {
      console.log(`  ${c.category_group}: ${c.cnt}건`);
    }
  }
}

// 메인 크롤링 함수
async function crawl(options = {}) {
  const keywords = generateKeywords(options);
  console.log(`\n=== 네이버 톡톡 크롤러 시작 ===`);
  console.log(`총 ${keywords.length}개 키워드 크롤링 예정\n`);

  let totalCollected = 0;
  let totalSkipped = 0;
  let processedCount = 0;
  let batchNum = 0;
  let batchBuffer = []; // 배치 출력용 버퍼
  let currentKeyword = '';

  const { browser, context, page } = await createBrowser();
  const detailPage = await context.newPage();
  const homepagePage = await context.newPage();

  try {
    for (let ki = 0; ki < keywords.length; ki++) {
      const kw = keywords[ki];
      currentKeyword = kw.keyword;
      console.log(`\n[${ki + 1}/${keywords.length}] 키워드: "${kw.keyword}" (우선순위: ${kw.priority})`);

      const places = await searchPlaces(page, kw.keyword);

      let keywordCollected = 0;

      for (let pi = 0; pi < places.length; pi++) {
        const place = places[pi];

        if (db.exists(place.id)) {
          totalSkipped++;
          continue;
        }

        console.log(`  [${pi + 1}/${places.length}] ${place.name} 수집 중...`);

        // 톡톡 확인
        const talktalkResult = await checkTalktalk(detailPage, place.id);

        // 홈페이지 체크 (홈페이지 URL 있을 때만)
        let homepageResult = { responsive: false, kakaoButton: false };
        if (place.homepage_url) {
          console.log(`    → 홈페이지 체크: ${place.homepage_url}`);
          homepageResult = await checkHomepage(homepagePage, place.homepage_url);
        }

        const biz = {
          place_id: place.id,
          name: place.name,
          place_url: place.placeUrl,
          talktalk_active: talktalkResult.talktalk_active ? 'O' : 'X',
          talktalk_url: talktalkResult.talktalk_url,
          category: place.category || kw.category,
          category_group: kw.categoryGroup,
          region: kw.region,
          address: place.address,
          homepage_url: place.homepage_url,
          homepage_exists: place.homepage_url ? 'O' : 'X',
          responsive: homepageResult.responsive ? 'O' : 'X',
          kakao_button: homepageResult.kakaoButton ? 'O' : 'X',
          visitor_review_count: place.visitor_review_count,
          blog_review_count: place.blog_review_count,
          phone: place.phone,
          search_keyword: kw.keyword,
        };

        const grade = db.upsert(biz);
        if (grade) {
          keywordCollected++;
          totalCollected++;
          batchBuffer.push({ ...biz, grade, target_menu: getTargetMenu(grade, biz) });

          console.log(`    → [${grade}급] 저장 (톡톡:${biz.talktalk_active} 홈페이지:${biz.homepage_exists} 반응형:${biz.responsive} 카톡:${biz.kakao_button} 리뷰:방문${place.visitor_review_count}/블로그${place.blog_review_count})`);

          // 100개 배치 출력
          if (batchBuffer.length >= BATCH_SIZE) {
            batchNum++;
            exportBatch(batchBuffer, batchNum, currentKeyword);
            batchBuffer = [];
          }
        } else {
          console.log(`    → 톡톡 없음 또는 타겟 아님, 스킵`);
        }

        processedCount++;
        if (processedCount > 0 && processedCount % 50 === 0) {
          console.log(`\n  --- ${processedCount}개 처리, 30초 휴식 ---`);
          await delay(25000, 30000);
        } else {
          await delay(3000, 5000);
        }
      }

      console.log(`  키워드 "${kw.keyword}" 완료: ${keywordCollected}건 수집`);
      await delay(3000, 6000);
    }

    // 남은 배치 출력
    if (batchBuffer.length > 0) {
      batchNum++;
      exportBatch(batchBuffer, batchNum, currentKeyword);
      batchBuffer = [];
    }
  } finally {
    await detailPage.close().catch(() => {});
    await homepagePage.close().catch(() => {});
    await browser.close();
  }

  // 결과 통계
  const stats = db.getStats();
  console.log(`\n=== 크롤링 완료 ===`);
  console.log(`이번 수집: ${totalCollected}건 | 중복 스킵: ${totalSkipped}건 | 배치 파일: ${batchNum}개`);
  console.log(`DB 타겟: ${stats.total}건 (전체 스캔: ${stats.totalAll}건)`);
  for (const g of stats.byGrade) {
    console.log(`  ${g.grade}급: ${g.cnt}건`);
  }

  return stats;
}

// 등급 → 타겟 메뉴 매핑 헬퍼
function getTargetMenu(grade, biz) {
  if (grade === 'S') return '반응형전환';
  if (grade === 'A' || grade === 'B') return '랜딩제작';
  return '해당없음';
}

// 메인 실행
async function main() {
  const options = parseArgs();

  if (options.stats) {
    printStats();
    db.close();
    return;
  }

  if (options.exportFormat && !options.region && !options.category) {
    if (options.exportFormat === 'csv' || options.exportFormat === 'all') {
      exportCsv();
    } else if (options.exportFormat === 'json') {
      exportJson();
    } else {
      console.log('지원하지 않는 형식입니다. csv, json, all 중 선택하세요.');
    }
    db.close();
    return;
  }

  try {
    await crawl(options);
    console.log('\n전체 CSV 내보내기...');
    exportCsv();
  } catch (err) {
    console.error('크롤링 오류:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
