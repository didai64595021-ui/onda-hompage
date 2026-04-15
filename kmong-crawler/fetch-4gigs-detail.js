#!/usr/bin/env node
/**
 * 4개 활성 gig의 PID 탐색 + 상세 정보 fetch
 * - SELLING 탭 스캔 → 제목 매칭 → gigId 추출 (카드 내 링크)
 * - 각 PID로 /api/v5/gigs/{PID} 호출
 * - JSON 저장
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { login } = require('./lib/login');
const { fetchGigDetail } = require('./lib/gig-detail');

const TARGETS = [
  { key: 'mobile-fix', keywords: ['모바일 깨짐', '24시간 해결'] },
  { key: 'responsive', keywords: ['반응형 전환'] },
  { key: 'no-homepage', keywords: ['홈페이지 없는', '3일완성'] },
  { key: 'onepage', keywords: ['원페이지', '랜딩'] },
];

function matchTarget(title) {
  if (!title) return null;
  let best = null; let bestScore = 0;
  for (const t of TARGETS) {
    let s = 0;
    for (const kw of t.keywords) if (title.includes(kw)) s += kw.length;
    if (s > bestScore) { bestScore = s; best = t.key; }
  }
  return best;
}

(async () => {
  const { browser, page } = await login({ slowMo: 50 });
  try {
    // SELLING 탭 순회 (최대 5페이지)
    const found = {};
    for (let pg = 1; pg <= 5; pg++) {
      const url = `https://kmong.com/my-gigs?statusType=SELLING&page=${pg}`;
      console.log(`[이동] ${url}`);
      await page.evaluate((u) => { window.location.href = u; }, url).catch(() => {});
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(4000);
      if (!page.url().includes('/my-gigs?')) { console.log(`  리다이렉트 → 종료`); break; }
      for (let i = 0; i < 5; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await page.waitForTimeout(400); }

      // 카드마다 제목 + gigId 추출 (링크 또는 data-gig-id 탐색)
      const cards = await page.evaluate(() => {
        const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
        const out = [];
        for (const eb of editBtns) {
          let card = eb.closest('article');
          if (!card) {
            let cur = eb;
            for (let i = 0; i < 8; i++) { cur = cur.parentElement; if (!cur) break; if ((cur.innerText || '').match(/#\d{6,}/)) { card = cur; break; } }
          }
          if (!card) continue;
          const text = (card.innerText || '').trim();
          const idMatch = text.match(/#(\d{6,})/);
          const titleLine = text.split('\n').find(l => l.trim().length > 5 && !/^(편집|상태|분류|판매중|임시|비승인|판매 중지|#|상세|문의|주문)/.test(l.trim()));
          // 링크에서도 gigId 추출 시도
          let gigIdFromLink = null;
          const links = card.querySelectorAll('a[href]');
          for (const a of links) {
            const m = a.getAttribute('href').match(/\/gig\/(\d{6,})/);
            if (m) { gigIdFromLink = m[1]; break; }
          }
          out.push({
            idFromHash: idMatch ? idMatch[1] : null,
            idFromLink: gigIdFromLink,
            title: titleLine ? titleLine.trim().slice(0, 200) : '(제목 없음)',
          });
        }
        return out;
      });

      if (cards.length === 0) { console.log(`  페이지 ${pg}: 0건`); break; }
      console.log(`  페이지 ${pg}: ${cards.length}건`);
      for (const c of cards) {
        const key = matchTarget(c.title);
        const gigId = c.idFromLink || c.idFromHash;
        console.log(`   - "${c.title.slice(0, 60)}" → id=${gigId} key=${key}`);
        if (key && gigId && !found[key]) {
          found[key] = { gigId, title: c.title };
        }
      }
    }

    console.log('\n=== 매칭 결과 ===');
    console.log(JSON.stringify(found, null, 2));

    // 각 gig 상세 fetch
    const details = {};
    for (const [key, info] of Object.entries(found)) {
      console.log(`\n[상세 fetch] ${key} (gigId=${info.gigId})`);
      const d = await fetchGigDetail(page, info.gigId);
      details[key] = d;
      console.log(`  제목: ${d?.title}`);
      console.log(`  카테고리: ${d?.category}`);
      console.log(`  시작가: ${d?.price}`);
      console.log(`  패키지: ${d?.packages?.length}개`);
      console.log(`  설명섹션: ${d?.descriptions?.length}개`);
    }

    // 못 찾은 것 경고
    for (const t of TARGETS) if (!found[t.key]) console.log(`[미발견] ${t.key}: ${t.keywords.join(',')}`);

    const outPath = path.join(__dirname, 'debug-4gigs-detail.json');
    fs.writeFileSync(outPath, JSON.stringify({ found, details }, null, 2), 'utf-8');
    console.log(`\n저장: ${outPath}`);

    await browser.close();
  } catch (e) {
    console.error('ERROR:', e.message);
    await browser.close();
    process.exit(1);
  }
})();
