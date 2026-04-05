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
const { notify } = require('./lib/telegram');

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

    // 내 서비스 페이지 이동
    console.log('[이동] 내 서비스 목록...');
    await page.goto(MY_GIGS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log(`[페이지] URL: ${page.url()}`);

    const gigs = [];

    // 방법 1: 테이블/카드 구조에서 서비스 목록 파싱
    // 크몽 my-gigs 페이지는 서비스 카드 또는 리스트로 표시
    const fullText = await page.locator('main, #app, #__next, body').first().innerText();

    // 서비스별 블록 분리 시도 - 패턴: 상태 텍스트 + 서비스 제목
    // 카드/리스트에서 서비스를 추출
    const cards = page.locator('[class*="gig"], [class*="service"], [class*="card"], table tbody tr');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      console.log(`[추출] 서비스 카드/행: ${cardCount}개`);

      for (let i = 0; i < cardCount; i++) {
        try {
          const card = cards.nth(i);
          const text = await card.innerText();
          if (!text || text.length < 5) continue;

          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

          // 서비스명: 가장 긴 줄 (제목일 가능성이 높음)
          let gigTitle = '';
          let maxLen = 0;
          for (const line of lines) {
            if (line.length > maxLen && line.length > 5 && !line.match(/^\d+$/) && !line.includes('수정') && !line.includes('삭제')) {
              maxLen = line.length;
              gigTitle = line;
            }
          }

          // 상태 추출
          let status = 'unknown';
          const statusKeywords = ['판매중', '판매 중', '승인전', '승인 전', '심사중', '심사 중', '비승인', '반려', '수정중', '수정 중', '판매중지', '판매 중지', '임시저장', '비활성'];
          for (const line of lines) {
            for (const kw of statusKeywords) {
              if (line.includes(kw)) {
                status = normalizeGigStatus(line);
                break;
              }
            }
            if (status !== 'unknown') break;
          }

          if (gigTitle) {
            const productId = matchProductId(gigTitle);
            gigs.push({
              product_id: productId || 'unknown',
              gig_title: gigTitle.substring(0, 200),
              status,
            });
            console.log(`[서비스] ${gigTitle.substring(0, 50)} → ${productId || 'N/A'} | 상태: ${status}`);
          }
        } catch {
          // 개별 카드 파싱 실패 무시
        }
      }
    }

    // 카드에서 못 찾으면 전체 텍스트 파싱
    if (gigs.length === 0) {
      console.log('[폴백] 전체 텍스트에서 서비스 추출 시도...');
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 10);

      for (const line of lines) {
        // 서비스 제목 + 상태 패턴
        const statusMatch = line.match(/(판매중|판매 중|승인전|승인 전|심사중|비승인|수정중|판매중지)/);
        if (statusMatch) {
          const status = normalizeGigStatus(statusMatch[1]);
          const title = line.replace(statusMatch[0], '').trim();
          if (title.length > 5) {
            const productId = matchProductId(title);
            gigs.push({
              product_id: productId || 'unknown',
              gig_title: title.substring(0, 200),
              status,
            });
          }
        }
      }
    }

    console.log(`[추출] 총 ${gigs.length}건 서비스 상태 수집`);

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
      notify(`🚨 크몽 서비스 심사 경고!\n${warnMsg}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const statusSummary = {};
    gigs.forEach(g => { statusSummary[g.status] = (statusSummary[g.status] || 0) + 1; });
    const summaryText = Object.entries(statusSummary).map(([k, v]) => `${k}:${v}`).join(' ');

    const msg = `크몽 크롤: 서비스 상태 ${gigs.length}건 (${summaryText}) (${elapsed}초)`;
    console.log(`\n=== ${msg} ===`);
    notify(msg);

    await browser.close();
    return gigs;

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`크몽 서비스 상태 크롤 실패: ${err.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

crawlGigStatus();
