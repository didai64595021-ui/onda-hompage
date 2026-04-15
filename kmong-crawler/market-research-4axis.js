#!/usr/bin/env node
/**
 * 크몽 4축 통과 카테고리 광범위 시장조사 (30~60개 키워드)
 *
 * 4축 통과 기준:
 *   1. 수요: 카테고리 총 누적 리뷰 ≥ 5,000건
 *   2. 경쟁: 상위3 셀러 리뷰 독식률 < 60%
 *   3. 단가: 시장 중앙 시작가 ≥ 10만원
 *   4. 자동화: Claude Code로 큰 틀(코드/콘텐츠/디자인 본체) 자동화율 ≥ 70%
 *
 * 출력:
 *   - market-research-4axis-{ts}.json (전체 데이터)
 *   - 4axis-passed-{ts}.json (통과 후보만)
 *   - 통과 즉시 텔레그램 단건 보고 (-1003738825402)
 *
 * 사용:
 *   node market-research-4axis.js [batchSize=30]
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TS = Date.now();
const TG_CHANNEL = '-1003738825402';
const TG_SCRIPT = '/home/onda/scripts/telegram-sender.js';

// ============ 자동화 친화도 가이드 ============
// Claude Code로 자동화 가능한 비율(%):
// - 코드 생성(앱/봇/매크로/크롤러) → 80~95% (★★★★★)
// - HTML/콘텐츠/디자인 패키지 본체 → 75~90% (★★★★)
// - 영상 편집(자막/컷편집/모션) → 60~80% (★★★)  - FFmpeg + Whisper + LLM
// - 일러스트/캐릭터/굿즈 → 70~85% (★★★★) - SDXL/MJ + 후보정
// - 광고 운영(GA/픽셀/광고카피) → 50~70% (★★★)  - 분석/카피만 자동, 운영은 사람
// - 컨설팅(사업계획서/IR/마케팅) → 70~85% (★★★★) - LLM 본체 + 사람 검수
// - 음원/사운드/작곡 → 50~70% (★★★) - Suno/Udio + 후보정
// - 인테리어/공간 디자인 → 30~50% (★★) - 도면 자동화 약함
// - 인플루언서/라이브커머스 → 10~30% (★) - 사람 출연 필수

const KEYWORDS = [
  // ===== 영상/콘텐츠 자동화 친화 (★★★~★★★★) =====
  { key: 'video_subtitle',  q: '영상 자막',          cat: '영상자막',        autoScore: 85, autoStar: 4 },
  { key: 'video_intro',     q: '영상 인트로',        cat: '영상인트로',      autoScore: 80, autoStar: 4 },
  { key: 'motion_info',     q: '모션 인포그래픽',    cat: '모션인포그래픽',  autoScore: 75, autoStar: 4 },
  { key: 'video_dub',       q: '영상 더빙',          cat: '영상더빙',        autoScore: 80, autoStar: 4 },
  { key: 'subtitle_trans',  q: '자막 번역',          cat: '자막번역',        autoScore: 90, autoStar: 5 },
  { key: 'video_trans',     q: '영상 통역',          cat: '영상통역',        autoScore: 80, autoStar: 4 },

  // ===== 디자인 자동화 친화 (★★★★) =====
  { key: 'illust',          q: '일러스트',           cat: '일러스트',        autoScore: 75, autoStar: 4 },
  { key: 'character',       q: '캐릭터 디자인',      cat: '캐릭터디자인',    autoScore: 75, autoStar: 4 },
  { key: 'webtoon_cover',   q: '웹툰 표지',          cat: '웹툰표지',        autoScore: 75, autoStar: 4 },
  { key: 'book_cover',      q: '책 표지',            cat: '책표지',          autoScore: 80, autoStar: 4 },
  { key: 'emoticon',        q: '이모티콘',           cat: '이모티콘',        autoScore: 70, autoStar: 4 },
  { key: 'invitation',      q: '청첩장',             cat: '청첩장',          autoScore: 85, autoStar: 4 },
  { key: 'calligraphy',     q: '캘리그라피',         cat: '캘리그라피',      autoScore: 60, autoStar: 3 },
  { key: 'cad3d',           q: '3D 모델링',          cat: '3D모델링',        autoScore: 60, autoStar: 3 },

  // ===== 개발/자동화 친화 (★★★★★) =====
  { key: 'android_app',     q: '안드로이드 앱',      cat: '안드로이드앱',    autoScore: 85, autoStar: 5 },
  { key: 'ios_app',         q: '아이폰 앱',          cat: '아이폰앱',        autoScore: 80, autoStar: 4 },
  { key: 'hybrid_app',      q: '하이브리드 앱',      cat: '하이브리드앱',    autoScore: 85, autoStar: 5 },
  { key: 'game_dev',        q: '게임 개발',          cat: '게임개발',        autoScore: 70, autoStar: 4 },
  { key: 'api_integ',       q: 'API 연동',           cat: 'API연동',         autoScore: 90, autoStar: 5 },
  { key: 'kakao_auto',      q: '카카오 자동화',      cat: '카카오자동화',    autoScore: 90, autoStar: 5 },
  { key: 'naver_auto',      q: '네이버 자동화',      cat: '네이버자동화',    autoScore: 90, autoStar: 5 },
  { key: 'telegram_bot',    q: '텔레그램 봇',        cat: '텔레그램봇',      autoScore: 95, autoStar: 5 },
  { key: 'data_viz',        q: '데이터 시각화',      cat: '데이터시각화',    autoScore: 85, autoStar: 5 },
  { key: 'dashboard',       q: '대시보드',           cat: '대시보드',        autoScore: 85, autoStar: 5 },
  { key: 'excel_macro',     q: '엑셀 매크로',        cat: '엑셀매크로',      autoScore: 95, autoStar: 5 },
  { key: 'gsheet_auto',     q: '구글시트 자동화',    cat: '구글시트자동화',  autoScore: 95, autoStar: 5 },
  { key: 'rpa',             q: 'RPA',                cat: 'RPA',             autoScore: 85, autoStar: 5 },
  { key: 'data_label',      q: '데이터 라벨링',      cat: '데이터라벨링',    autoScore: 90, autoStar: 5 },
  { key: 'crawling',        q: '크롤링',             cat: '크롤링',          autoScore: 95, autoStar: 5 },
  { key: 'web_scraping',    q: '웹 스크래핑',        cat: '웹스크래핑',      autoScore: 95, autoStar: 5 },

  // ===== 마케팅/광고 (단가 높은 영역) =====
  { key: 'google_ad',       q: '구글 광고',          cat: '구글광고',        autoScore: 60, autoStar: 3 },
  { key: 'kakao_ad',        q: '카카오 광고',        cat: '카카오광고',      autoScore: 60, autoStar: 3 },
  { key: 'keyword_ad',      q: '키워드 광고',        cat: '키워드광고',      autoScore: 60, autoStar: 3 },
  { key: 'ad_agency',       q: '광고 대행',          cat: '광고대행',        autoScore: 50, autoStar: 3 },
  { key: 'fb_pixel',        q: '페이스북 픽셀',      cat: '페이스북픽셀',    autoScore: 80, autoStar: 4 },
  { key: 'ga_setup',        q: 'GA 세팅',            cat: 'GA세팅',          autoScore: 85, autoStar: 4 },
  { key: 'ad_copy',         q: '광고 카피',          cat: '광고카피',        autoScore: 80, autoStar: 4 },

  // ===== 컨설팅 (자동화 가능 영역, LLM 강점) =====
  { key: 'biz_plan',        q: '사업계획서',         cat: '사업계획서',      autoScore: 80, autoStar: 4 },
  { key: 'ir_doc',          q: 'IR 자료',            cat: 'IR자료',          autoScore: 75, autoStar: 4 },
  { key: 'mkt_consult',     q: '마케팅 컨설팅',      cat: '마케팅컨설팅',    autoScore: 60, autoStar: 3 },
  { key: 'brand_consult',   q: '브랜드 컨설팅',      cat: '브랜드컨설팅',    autoScore: 60, autoStar: 3 },

  // ===== 프리미엄 영역 (단가/경쟁 검증) =====
  { key: 'funding_page',    q: '펀딩 페이지',        cat: '펀딩페이지',      autoScore: 75, autoStar: 4 },
  { key: 'wadiz',           q: '와디즈',             cat: '와디즈',          autoScore: 75, autoStar: 4 },
  { key: 'tumblbug',        q: '텀블벅',             cat: '텀블벅',          autoScore: 75, autoStar: 4 },
];

const BATCH_SIZE = parseInt(process.argv[2] || '50', 10);
const TARGET = KEYWORDS.slice(0, BATCH_SIZE);

const OUT_JSON = path.join(__dirname, `market-research-4axis-${TS}.json`);
const PASSED_JSON = path.join(__dirname, `4axis-passed-${TS}.json`);

function tg(msg) {
  try {
    execSync(`node ${TG_SCRIPT} send ${JSON.stringify(msg)} ${TG_CHANNEL}`, { stdio: 'pipe', timeout: 15000 });
    return true;
  } catch (e) {
    console.log(`[TG ERR] ${e.message}`);
    return false;
  }
}

function parsePrice(text) {
  const m1 = text.match(/([\d,]+)\s*원/);
  if (m1) return parseInt(m1[1].replace(/,/g, ''), 10);
  const m2 = text.match(/(\d+)\s*만\s*원/);
  if (m2) return parseInt(m2[1], 10) * 10000;
  return null;
}
function parseRating(text) {
  const m = text.match(/(\d\.\d)/);
  return m ? parseFloat(m[1]) : null;
}
function parseReviews(text) {
  const m = text.match(/\((\d{1,4}(?:,\d{3})*)\)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

function stats(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    count: s.length,
    sum,
    min: s[0],
    max: s[s.length - 1],
    avg: Math.round(sum / s.length),
    median: s[Math.floor(s.length / 2)],
    p25: s[Math.floor(s.length * 0.25)],
    p75: s[Math.floor(s.length * 0.75)],
  };
}

function evaluate4Axis(r) {
  const passes = {
    demand:    r.totalReviews >= 5000,
    compete:   r.top3ShareOfReviews !== null && r.top3ShareOfReviews < 0.60,
    price:     r.priceStats && r.priceStats.median >= 100000,
    auto:      r.autoScore >= 70,
  };
  const passed = passes.demand && passes.compete && passes.price && passes.auto;
  return { passes, passed };
}

(async () => {
  console.log(`[4축 시장조사] ${TARGET.length}개 키워드 — ts=${TS}`);
  tg(`[4축 시장조사] 시작\n키워드 ${TARGET.length}개 (영상/디자인/개발/마케팅/컨설팅/프리미엄)\n4축 통과 발견 시 단건 보고 예정`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();

  const results = {};
  const passed = [];
  let done = 0;

  for (const kw of TARGET) {
    done++;
    const searchUrl = `https://kmong.com/search?keyword=${encodeURIComponent(kw.q)}`;
    console.log(`\n[${done}/${TARGET.length}] ${kw.key} "${kw.q}"`);
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2500);
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await sleep(500);
      }
      const finalUrl = page.url();

      const cards = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a')].filter(a => /\/gig\/\d+/.test(a.href));
        const seen = new Set();
        const out = [];
        for (const a of links) {
          const id = (a.href.match(/\/gig\/(\d+)/) || [])[1];
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const text = (a.innerText || '').trim();
          if (text.length < 5) continue;
          out.push({ id, href: a.href, text });
        }
        return out;
      });

      const top = cards.slice(0, 20);
      const parsed = top.map(c => {
        const lines = c.text.split('\n').map(l => l.trim()).filter(Boolean);
        return {
          id: c.id,
          href: c.href,
          title: (lines[0] || '').slice(0, 100),
          price: parsePrice(c.text),
          rating: parseRating(c.text),
          reviews: parseReviews(c.text),
          seller: (lines.filter(l => !/(빠른 응답|세금계산서|원|^\d+\.\d+$|^\(\d+\)$|^★)/.test(l))[1] || '').slice(0, 30),
        };
      });

      const prices = parsed.filter(p => p.price && p.price >= 1000).map(p => p.price);
      const reviews = parsed.map(p => p.reviews || 0);
      const priceStats = stats(prices);
      const reviewStats = stats(reviews.filter(r => r > 0));
      const totalReviews = reviews.reduce((a, b) => a + b, 0);
      const sortedByReviews = [...parsed].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
      const top3Reviews = sortedByReviews.slice(0, 3).reduce((a, b) => a + (b.reviews || 0), 0);
      const top3ShareOfReviews = totalReviews > 0 ? (top3Reviews / totalReviews) : null;
      const opportunity = (priceStats && parsed.length > 0)
        ? Math.round((priceStats.avg * totalReviews) / parsed.length)
        : null;

      const result = {
        ...kw,
        finalUrl,
        totalCards: parsed.length,
        priceStats,
        reviewStats,
        totalReviews,
        top3Reviews,
        top3ShareOfReviews,
        opportunity,
        cards: parsed,
        dataAvailable: parsed.length > 0,
      };
      const evalRes = evaluate4Axis(result);
      result.evaluation = evalRes;

      const avgMan = priceStats?.avg ? Math.round(priceStats.avg/10000) : 0;
      const medMan = priceStats?.median ? Math.round(priceStats.median/10000) : 0;
      const top3Pct = top3ShareOfReviews ? (top3ShareOfReviews*100).toFixed(0) : '-';
      const passLine = `D=${evalRes.passes.demand?'O':'X'} C=${evalRes.passes.compete?'O':'X'} P=${evalRes.passes.price?'O':'X'} A=${evalRes.passes.auto?'O':'X'}`;
      console.log(`  cards=${parsed.length} 평균=${avgMan}만 중앙=${medMan}만 총리뷰=${totalReviews} 상위3=${top3Pct}% [${passLine}] ${evalRes.passed?'★PASSED★':''}`);

      if (evalRes.passed) {
        passed.push(result);
        const stars = '★'.repeat(kw.autoStar);
        const msg = `[4축통과] ${kw.cat} 발견\n` +
                    `- 수요: 총리뷰 ${totalReviews.toLocaleString()}건 (>=5000 ${evalRes.passes.demand?'O':'X'})\n` +
                    `- 경쟁: 상위3 독식 ${top3Pct}% (<60% ${evalRes.passes.compete?'O':'X'})\n` +
                    `- 단가: 중앙 ${medMan}만원 (>=10만 ${evalRes.passes.price?'O':'X'})\n` +
                    `- 자동화: ${stars} (${kw.autoScore}점, >=70 ${evalRes.passes.auto?'O':'X'})\n` +
                    `- 검색: ${kw.q}\n- 카드: ${parsed.length}개`;
        tg(msg);
      }

      results[kw.key] = result;
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      results[kw.key] = { ...kw, error: e.message, cards: [], dataAvailable: false };
    }

    // 누진 저장
    fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, criteria: { demand: 5000, compete_lt: 0.60, price_gte: 100000, auto_gte: 70 }, keywords: results, passed_count: passed.length }, null, 2));
    fs.writeFileSync(PASSED_JSON, JSON.stringify({ generated_at: new Date().toISOString(), count: passed.length, passed }, null, 2));
  }

  await browser.close();

  // ============ 종합 보고 ============
  console.log(`\n==== 완료 ====`);
  console.log(`  data: ${OUT_JSON}`);
  console.log(`  passed: ${PASSED_JSON} (${passed.length}건)`);

  // 통과 후보별 요약
  let summaryLines = [];
  if (passed.length > 0) {
    summaryLines = passed.map((r, i) => {
      const med = r.priceStats?.median ? Math.round(r.priceStats.median/10000) : 0;
      const top3 = r.top3ShareOfReviews ? (r.top3ShareOfReviews*100).toFixed(0) : '-';
      return `${i+1}. ${r.cat} (${r.q}) — ${r.totalReviews.toLocaleString()}리뷰 / 중앙${med}만 / 독식${top3}% / 자동화 ${'★'.repeat(r.autoStar)}`;
    });
  }

  // 거의 통과 (3축 통과)
  const almostPassed = Object.values(results)
    .filter(r => !r.error && r.evaluation)
    .filter(r => {
      const p = r.evaluation.passes;
      const passCount = [p.demand, p.compete, p.price, p.auto].filter(Boolean).length;
      return passCount === 3 && !r.evaluation.passed;
    })
    .map(r => {
      const med = r.priceStats?.median ? Math.round(r.priceStats.median/10000) : 0;
      const top3 = r.top3ShareOfReviews ? (r.top3ShareOfReviews*100).toFixed(0) : '-';
      const failedAxis = [];
      if (!r.evaluation.passes.demand) failedAxis.push(`수요(${r.totalReviews})`);
      if (!r.evaluation.passes.compete) failedAxis.push(`경쟁(${top3}%)`);
      if (!r.evaluation.passes.price) failedAxis.push(`단가(${med}만)`);
      if (!r.evaluation.passes.auto) failedAxis.push(`자동화(${r.autoScore})`);
      return `- ${r.cat}: 미달 ${failedAxis.join(',')} | 리뷰${r.totalReviews}/중앙${med}만/독식${top3}%/자동${r.autoScore}`;
    });

  const finalMsg = `[크몽 4축 시장조사 — 종합]\n` +
    `조사 ${TARGET.length}개 / 4축통과 ${passed.length}개\n\n` +
    (passed.length > 0
      ? `[4축 통과 ${passed.length}개]\n${summaryLines.join('\n')}\n\n`
      : `[4축 통과 0개]\n`) +
    (almostPassed.length > 0
      ? `[3축 통과 — 1축만 보강하면 후보] ${almostPassed.length}개\n${almostPassed.slice(0, 10).join('\n')}\n\n`
      : '') +
    `데이터: ${path.basename(OUT_JSON)}\n` +
    `통과목록: ${path.basename(PASSED_JSON)}`;

  // 4000자 이하 보장
  const trimmed = finalMsg.length > 3900 ? finalMsg.slice(0, 3850) + '\n... (truncated)' : finalMsg;
  tg(trimmed);

  console.log(`\n[종합보고]\n${trimmed}`);
})();
