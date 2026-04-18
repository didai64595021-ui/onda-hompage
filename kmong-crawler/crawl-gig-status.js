#!/usr/bin/env node
/**
 * 크몽 서비스 심사 상태 크롤러
 * - /my-gigs 에서 서비스별 상태 수집 (판매중/승인전/비승인/수정중 등)
 * - Supabase kmong_gig_status 테이블에 저장
 * - 비승인/승인전 서비스 있으면 텔레그램 경고
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase } = require('./lib/supabase');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { matchProductId } = require('./lib/product-map');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { notifyTyped } = require('./lib/notify-filter');

const MY_GIGS_URL = 'https://kmong.com/my-gigs';

/**
 * 서비스 상태 정규화
 */
function normalizeGigStatus(text) {
  if (!text) return 'unknown';
  const t = text.trim();
  if (t.includes('판매중') || t.includes('판매 중')) return '판매중';
  if (t.includes('승인전') || t.includes('승인 전') || t.includes('심사중') || t.includes('심사 중')) return '승인전';
  if (t.includes('비승인') || t.includes('반려')) return '비승인';
  if (t.includes('수정중') || t.includes('수정 중')) return '수정중';
  if (t.includes('판매중지') || t.includes('판매 중지') || t.includes('비활성')) return '판매중지';
  if (t.includes('임시저장') || t.includes('임시 저장')) return '임시저장';
  return t.substring(0, 20);
}

async function crawlGigStatus() {
  const startTime = Date.now();
  let browser;

  try {
    console.log('=== 크몽 서비스 심사 상태 크롤러 시작 ===');

    const result = await login({ slowMo: 100 });
    browser = result.browser;
    const page = result.page;

    // 내 서비스 페이지 — 모든 탭 순회 (SELLING/WAITING/REJECT/STOP)
    // 2026-04-15: 셀렉터 교체 — 편집하기 버튼 → article ancestor 단위 카드 추출
    const STATUS_TABS = [
      { type: 'SELLING', label: '판매중' },
      { type: 'WAITING', label: '임시저장' },
      { type: 'REJECT',  label: '비승인' },
      { type: 'STOP',    label: '판매중지' },
    ];
    const gigs = [];
    for (const tab of STATUS_TABS) {
      for (let pgNo = 1; pgNo <= 5; pgNo++) {
        const url = `${MY_GIGS_URL}?statusType=${tab.type}&page=${pgNo}`;
        console.log(`[이동] ${url}`);
        await page.evaluate((u) => { window.location.href = u; }, url).catch(async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        });
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(4000);
        if (!page.url().includes('/my-gigs?')) { console.log(`  ${tab.type} page ${pgNo}: 리다이렉트`); break; }
        for (let i = 0; i < 5; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await page.waitForTimeout(500); }

        // 편집하기 버튼 기준 카드 단위 추출
        const items = await page.evaluate((statusLabel) => {
          const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
          const out = [];
          for (const eb of editBtns) {
            // article ancestor 또는 단계적 상승
            let card = eb.closest('article');
            if (!card) {
              let cur = eb;
              for (let i = 0; i < 6; i++) { cur = cur.parentElement; if (!cur) break; if ((cur.innerText || '').match(/#\d{6,}/)) { card = cur; break; } }
            }
            if (!card) continue;
            const text = (card.innerText || '').trim();
            const idMatch = text.match(/#(\d{6,})/);
            const titleLine = text.split('\n').find(l => l.trim().length > 5 && !/^(편집|상태|분류|판매중|임시|비승인|판매 중지|#)/.test(l.trim()));
            const prices = [...text.matchAll(/([\d,]+)\s*원/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10)).filter(n => n >= 1000 && n < 100000000);
            out.push({
              draftId: idMatch ? idMatch[1] : null,
              title: titleLine ? titleLine.trim().slice(0, 200) : '(제목 없음)',
              status: statusLabel,
              prices,
              priceMin: prices.length ? Math.min(...prices) : null,
              priceMax: prices.length ? Math.max(...prices) : null,
            });
          }
          return out;
        }, tab.label);

        if (items.length === 0) { console.log(`  ${tab.type} page ${pgNo}: 0건 → 종료`); break; }
        console.log(`  ${tab.type} page ${pgNo}: ${items.length}건`);
        for (const it of items) {
          if (!it.draftId) continue;
          const productId = matchProductId(it.title) || 'unknown';
          gigs.push({
            product_id: productId,
            gig_title: it.title,
            status: it.status,
          });
        }
      }
    }
    // 중복 제거 (draftId 기준)
    const seen = new Set();
    const unique = gigs.filter(g => { const k = g.draft_id || g.gig_title; if (seen.has(k)) return false; seen.add(k); return true; });
    gigs.length = 0; gigs.push(...unique);

    console.log(`[추출] 총 ${gigs.length}건 서비스 상태 수집 (중복 제거 후)`);

    // Supabase 저장
    if (gigs.length > 0) {
      const { error } = await supabase
        .from('kmong_gig_status')
        .insert(gigs);

      if (error) {
        // insert 실패 시 (중복 등) 개별 upsert 시도
        console.log(`[Supabase] insert 실패 (${error.message}), 개별 처리...`);
        for (const gig of gigs) {
          try { await supabase.from('kmong_gig_status').upsert(gig, { onConflict: 'product_id' }); } catch {}
        }
      }
      console.log(`[Supabase] ${gigs.length}건 저장 완료`);
    }

    // 비승인/승인전 서비스 경고
    const warnings = gigs.filter(g => ['비승인', '승인전'].includes(g.status));
    if (warnings.length > 0) {
      const warnMsg = warnings.map(g => `⚠️ ${g.gig_title.substring(0, 30)}: ${g.status}`).join('\n');
      notifyTyped('error', `🚨 크몽 서비스 심사 경고!\n${warnMsg}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const statusSummary = {};
    gigs.forEach(g => { statusSummary[g.status] = (statusSummary[g.status] || 0) + 1; });
    const summaryText = Object.entries(statusSummary).map(([k, v]) => `${k}:${v}`).join(' ');

    const msg = `크몽 크롤: 서비스 상태 ${gigs.length}건 (${summaryText}) (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notifyTyped('crawl', msg);

    await browser.close();
    return gigs;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notifyTyped('error', `크몽 서비스 상태 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

crawlGigStatus();
