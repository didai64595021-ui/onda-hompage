#!/usr/bin/env node
/**
 * 크몽 4축 통과 카테고리 광범위 시장조사 — 2차 (신규 30개)
 *
 * 1차에서 통과 0건 → 2차에서 추가 키워드:
 *  - 단가/볼륨 둘다 잡힐 영역 위주
 *  - 통상 "전문 서비스" 영역, B2B 영역, 고가 SaaS/시스템 영역
 *  - 데이터 분석/AI/번역/통역(전문)/문서/특허 등
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

const KEYWORDS = [
  // 통상 단가 높은 전문 서비스
  { key: 'erp_dev',         q: 'ERP 개발',           cat: 'ERP개발',         autoScore: 80, autoStar: 4 },
  { key: 'crm_dev',         q: 'CRM 개발',           cat: 'CRM개발',         autoScore: 85, autoStar: 5 },
  { key: 'pos_dev',         q: 'POS 개발',           cat: 'POS개발',         autoScore: 75, autoStar: 4 },
  { key: 'reservation_sys', q: '예약 시스템',        cat: '예약시스템',      autoScore: 90, autoStar: 5 },
  { key: 'reservation_app', q: '예약 앱',            cat: '예약앱',          autoScore: 85, autoStar: 5 },
  { key: 'shop_mall',       q: '쇼핑몰 제작',        cat: '쇼핑몰제작',      autoScore: 85, autoStar: 5 },
  { key: 'shop_cafe24',     q: '카페24',             cat: '카페24',          autoScore: 80, autoStar: 4 },
  { key: 'shop_godo',       q: '고도몰',             cat: '고도몰',          autoScore: 75, autoStar: 4 },
  { key: 'imweb',           q: '아임웹',             cat: '아임웹',          autoScore: 90, autoStar: 5 },
  { key: 'wix',             q: '윅스',               cat: '윅스',            autoScore: 90, autoStar: 5 },
  { key: 'wordpress',       q: '워드프레스',         cat: '워드프레스',      autoScore: 90, autoStar: 5 },
  { key: 'shopify',         q: '쇼피파이',           cat: '쇼피파이',        autoScore: 85, autoStar: 5 },
  { key: 'admin_page',      q: '관리자 페이지',      cat: '관리자페이지',    autoScore: 90, autoStar: 5 },
  { key: 'membership_sys',  q: '회원 시스템',        cat: '회원시스템',      autoScore: 90, autoStar: 5 },
  { key: 'payment_integ',   q: '결제 연동',          cat: '결제연동',        autoScore: 90, autoStar: 5 },

  // 콘텐츠 + LLM
  { key: 'pdf_doc',         q: 'PDF 제작',           cat: 'PDF제작',         autoScore: 90, autoStar: 5 },
  { key: 'ppt_design',      q: 'PPT 디자인',         cat: 'PPT디자인',       autoScore: 80, autoStar: 4 },
  { key: 'proposal',        q: '제안서',             cat: '제안서',          autoScore: 85, autoStar: 4 },
  { key: 'edu_content',     q: '교육 콘텐츠',        cat: '교육콘텐츠',      autoScore: 80, autoStar: 4 },
  { key: 'ebook',           q: '전자책 제작',        cat: '전자책제작',      autoScore: 85, autoStar: 4 },
  { key: 'manual_doc',      q: '매뉴얼 제작',        cat: '매뉴얼제작',      autoScore: 85, autoStar: 4 },

  // AI/데이터 (단가 높은 영역)
  { key: 'ai_chatbot',      q: 'AI 챗봇',            cat: 'AI챗봇',          autoScore: 90, autoStar: 5 },
  { key: 'ai_solution',     q: 'AI 솔루션',          cat: 'AI솔루션',        autoScore: 85, autoStar: 5 },
  { key: 'data_analysis',   q: '데이터 분석',        cat: '데이터분석',      autoScore: 80, autoStar: 4 },
  { key: 'data_modeling',   q: '데이터 모델링',      cat: '데이터모델링',    autoScore: 80, autoStar: 4 },
  { key: 'machine_learn',   q: '머신러닝',           cat: '머신러닝',        autoScore: 75, autoStar: 4 },
  { key: 'ai_image',        q: 'AI 이미지',          cat: 'AI이미지',        autoScore: 90, autoStar: 5 },

  // 디지털 마케팅 (자동화 가능)
  { key: 'youtube_seo',     q: '유튜브 SEO',         cat: '유튜브SEO',       autoScore: 75, autoStar: 4 },
  { key: 'newsletter',      q: '뉴스레터',           cat: '뉴스레터',        autoScore: 80, autoStar: 4 },
  { key: 'email_mkt',       q: '이메일 마케팅',      cat: '이메일마케팅',    autoScore: 85, autoStar: 5 },
];

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
function parseRating(text) { const m = text.match(/(\d\.\d)/); return m ? parseFloat(m[1]) : null; }
function parseReviews(text) { const m = text.match(/\((\d{1,4}(?:,\d{3})*)\)/); return m ? parseInt(m[1].replace(/,/g, ''), 10) : null; }
function stats(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { count: s.length, sum, min: s[0], max: s[s.length-1], avg: Math.round(sum/s.length), median: s[Math.floor(s.length/2)], p25: s[Math.floor(s.length*0.25)], p75: s[Math.floor(s.length*0.75)] };
}
function evaluate4Axis(r) {
  const passes = {
    demand:  r.totalReviews >= 5000,
    compete: r.top3ShareOfReviews !== null && r.top3ShareOfReviews < 0.60,
    price:   r.priceStats && r.priceStats.median >= 100000,
    auto:    r.autoScore >= 70,
  };
  return { passes, passed: passes.demand && passes.compete && passes.price && passes.auto };
}

(async () => {
  console.log(`[4축 시장조사 2차] ${KEYWORDS.length}개 키워드 — ts=${TS}`);
  tg(`[4축 시장조사 2차] 추가 ${KEYWORDS.length}개 키워드 시작 (ERP/CRM/쇼핑몰/예약/AI/문서). 1차 통과 0개 → 2차로 단가+볼륨 영역 노림.`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();

  const results = {};
  const passed = [];
  let done = 0;

  for (const kw of KEYWORDS) {
    done++;
    const searchUrl = `https://kmong.com/search?keyword=${encodeURIComponent(kw.q)}`;
    console.log(`\n[${done}/${KEYWORDS.length}] ${kw.key} "${kw.q}"`);
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2500);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await sleep(500); }
      const finalUrl = page.url();

      const cards = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a')].filter(a => /\/gig\/\d+/.test(a.href));
        const seen = new Set(); const out = [];
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
          id: c.id, href: c.href,
          title: (lines[0] || '').slice(0, 100),
          price: parsePrice(c.text), rating: parseRating(c.text), reviews: parseReviews(c.text),
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
      const opportunity = (priceStats && parsed.length > 0) ? Math.round((priceStats.avg * totalReviews) / parsed.length) : null;

      const result = { ...kw, finalUrl, totalCards: parsed.length, priceStats, reviewStats, totalReviews, top3Reviews, top3ShareOfReviews, opportunity, cards: parsed, dataAvailable: parsed.length > 0 };
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
          `- 수요: 총리뷰 ${totalReviews.toLocaleString()}건 (>=5000 O)\n` +
          `- 경쟁: 상위3 독식 ${top3Pct}% (<60% O)\n` +
          `- 단가: 중앙 ${medMan}만원 (>=10만 O)\n` +
          `- 자동화: ${stars} (${kw.autoScore}점, >=70 O)\n` +
          `- 검색: ${kw.q}\n- 카드: ${parsed.length}개`;
        tg(msg);
      }
      results[kw.key] = result;
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      results[kw.key] = { ...kw, error: e.message, cards: [], dataAvailable: false };
    }

    fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), timestamp: TS, batch: 2, criteria: { demand: 5000, compete_lt: 0.60, price_gte: 100000, auto_gte: 70 }, keywords: results, passed_count: passed.length }, null, 2));
    fs.writeFileSync(PASSED_JSON, JSON.stringify({ generated_at: new Date().toISOString(), batch: 2, count: passed.length, passed }, null, 2));
  }

  await browser.close();
  console.log(`\n==== 2차 완료 ====`);
  console.log(`  data: ${OUT_JSON}`);
  console.log(`  passed: ${PASSED_JSON} (${passed.length}건)`);

  const summaryLines = passed.map((r, i) => {
    const med = r.priceStats?.median ? Math.round(r.priceStats.median/10000) : 0;
    const top3 = r.top3ShareOfReviews ? (r.top3ShareOfReviews*100).toFixed(0) : '-';
    return `${i+1}. ${r.cat} (${r.q}) — ${r.totalReviews.toLocaleString()}리뷰 / 중앙${med}만 / 독식${top3}% / 자동화 ${'★'.repeat(r.autoStar)}`;
  });

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

  const finalMsg = `[크몽 4축 시장조사 2차 — 종합]\n조사 ${KEYWORDS.length}개 / 4축통과 ${passed.length}개\n\n` +
    (passed.length > 0 ? `[4축 통과 ${passed.length}개]\n${summaryLines.join('\n')}\n\n` : `[4축 통과 0개]\n`) +
    (almostPassed.length > 0 ? `[3축 통과 — 1축만 보강하면 후보] ${almostPassed.length}개\n${almostPassed.slice(0, 12).join('\n')}\n\n` : '') +
    `데이터: ${path.basename(OUT_JSON)}\n통과목록: ${path.basename(PASSED_JSON)}`;

  const trimmed = finalMsg.length > 3900 ? finalMsg.slice(0, 3850) + '\n... (truncated)' : finalMsg;
  tg(trimmed);
  console.log(`\n[종합보고]\n${trimmed}`);
})();
