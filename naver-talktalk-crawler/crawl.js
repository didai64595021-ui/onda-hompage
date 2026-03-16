#!/usr/bin/env node
const { generateKeywords } = require('./config');
const { createBrowser, searchPlaces, checkTalktalk, delay } = require('./scraper');
const { checkHomepage } = require('./homepage-checker');
const db = require('./db');
const { exportCsv, exportJson } = require('./exporter');

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
      console.log(`네이버 톡톡 업체 크롤러

사용법:
  node crawl.js                       전체 크롤링 (우선순위 순)
  node crawl.js --region 강남          특정 지역만
  node crawl.js --category 피부과      특정 업종만
  node crawl.js --export csv           CSV 내보내기만 (크롤링 없이)
  node crawl.js --export json          JSON 내보내기만
  node crawl.js --max-pages 5          키워드당 최대 페이지 수
  node crawl.js --stats                현재 수집 통계 출력

수집 필드 (8개):
  1. 업체명          2. 플레이스 링크
  3. 톡톡 활성여부    4. 방문자리뷰 수
  5. 블로그리뷰 수    6. 홈페이지 유무 + URL
  7. 반응형 여부      8. 카톡버튼 유무`);
      process.exit(0);
    }
  }
  return options;
}

// 통계 출력
function printStats() {
  const stats = db.getStats();
  console.log('\n=== 수집 통계 ===');
  console.log(`전체: ${stats.total}건\n`);

  if (stats.total === 0) {
    console.log('수집된 데이터가 없습니다.');
    return;
  }

  console.log('등급별:');
  const desc = { S: '톡톡O+홈페이지X+리뷰부족', A: '톡톡O+홈페이지X', B: '홈페이지O+반응형X', C: '홈페이지O+카톡X', D: '리뷰<30' };
  for (const g of stats.byGrade) {
    console.log(`  ${g.grade}급: ${g.cnt}건 (${desc[g.grade] || ''})`);
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

  const { browser, context, page } = await createBrowser();

  // 톡톡 확인용 별도 페이지
  const detailPage = await context.newPage();
  // 홈페이지 체크용 별도 페이지
  const homepagePage = await context.newPage();

  try {
    for (let ki = 0; ki < keywords.length; ki++) {
      const kw = keywords[ki];
      console.log(`\n[${ki + 1}/${keywords.length}] 키워드: "${kw.keyword}" (우선순위: ${kw.priority})`);

      // 검색 결과 수집 (API 인터셉트 방식, 키워드당 최대 20개)
      const places = await searchPlaces(page, kw.keyword);
      console.log(`  총 ${places.length}개 업체 발견`);

      let keywordCollected = 0;

      for (let pi = 0; pi < places.length; pi++) {
        const place = places[pi];

        // 중복 체크
        if (db.exists(place.id)) {
          totalSkipped++;
          continue;
        }

        console.log(`  [${pi + 1}/${places.length}] ${place.name} 수집 중...`);

        // 톡톡 확인 (상세 페이지 방문)
        const talktalkResult = await checkTalktalk(detailPage, place.id);

        // 홈페이지 체크 (톡톡 활성 + 홈페이지 URL 있을 때만)
        let homepageResult = { responsive: false, kakaoButton: false };
        if (talktalkResult.talktalk_active && place.homepage_url) {
          console.log(`    → 홈페이지 체크: ${place.homepage_url}`);
          homepageResult = await checkHomepage(homepagePage, place.homepage_url);
        }

        // DB 저장 데이터 구성 (톡톡 없는 업체도 저장하여 중복 크롤링 방지)
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
          console.log(`    → [${grade}급] 저장 (톡톡:${biz.talktalk_active} 홈페이지:${biz.homepage_exists} 반응형:${biz.responsive} 카톡:${biz.kakao_button} 리뷰:방문${place.visitor_review_count}/블로그${place.blog_review_count})`);
        } else if (!talktalkResult.talktalk_active) {
          console.log(`    → 톡톡 없음, 스킵`);
        } else {
          console.log(`    → 타겟 대상 아님 (조건 충족 업체)`);
        }

        processedCount++;
        // 차단 방지: 50개마다 30초 휴식
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
  } finally {
    await detailPage.close().catch(() => {});
    await homepagePage.close().catch(() => {});
    await browser.close();
  }

  // 결과 통계
  const stats = db.getStats();
  console.log(`\n=== 크롤링 완료 ===`);
  console.log(`이번 수집: ${totalCollected}건 | 중복 스킵: ${totalSkipped}건`);
  console.log(`DB 타겟: ${stats.total}건 (전체 스캔: ${stats.totalAll}건)`);
  for (const g of stats.byGrade) {
    console.log(`  ${g.grade}급: ${g.cnt}건`);
  }

  return stats;
}

// 메인 실행
async function main() {
  const options = parseArgs();

  // 통계만 출력
  if (options.stats) {
    printStats();
    db.close();
    return;
  }

  // 내보내기만
  if (options.exportFormat && !options.region && !options.category) {
    if (options.exportFormat === 'csv') {
      exportCsv();
    } else if (options.exportFormat === 'json') {
      exportJson();
    } else {
      console.log('지원하지 않는 형식입니다. csv 또는 json을 사용하세요.');
    }
    db.close();
    return;
  }

  // 크롤링 실행
  try {
    await crawl(options);

    // 크롤링 후 자동 CSV 내보내기
    console.log('\n자동 CSV 내보내기...');
    exportCsv();
  } catch (err) {
    console.error('크롤링 오류:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
