#!/usr/bin/env node
/**
 * 크몽 전체 카테고리 ID 풀 발견
 *
 * 전략:
 *  1. 메인 /category 페이지 접속 → root 카테고리 링크 수집
 *  2. 알려진 root 카테고리 ID (1,2,3,4,5,6,7,8,9,10,11,12...) 순회
 *  3. 각 root 페이지 HTML에서 /category/{ID} 링크 전수 수집
 *  4. 카테고리명은 링크 앵커 텍스트에서 추출
 *
 * 결과: category-id-pool.json { categories: [{ id, name, source, depth }] }
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT_FILE = path.join(__dirname, 'category-id-pool.json');

// root 카테고리 후보 (알려진 것 + probe)
const ROOT_CANDIDATES = [
  { id: 1, name: '디자인' },
  { id: 2, name: 'IT·프로그래밍(구)' },
  { id: 3, name: '영상·사진·음향' },
  { id: 4, name: '마케팅' },
  { id: 5, name: '번역·통역' },
  { id: 6, name: 'IT·프로그래밍' },
  { id: 7, name: '문서·글쓰기' },
  { id: 8, name: '창업·비즈니스' },
  { id: 9, name: '주문제작' },
  { id: 10, name: '취미·생활' },
  { id: 11, name: '직무역량교육' },
  { id: 12, name: '투잡·노하우' },
  { id: 13, name: '세무·법무·노무' },
  { id: 14, name: '심리·운세' },
];

async function discoverSubsFromRoot(page, rootId, rootName) {
  const url = `https://kmong.com/category/${rootId}`;
  console.log(`  [${rootId} ${rootName}] ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.log(`    goto 실패: ${e.message}`);
    return { ok: false, subs: [] };
  }
  await sleep(3000);

  // URL 리다이렉트 체크 (존재하지 않는 root는 redirect됨)
  const finalUrl = page.url();
  if (!finalUrl.includes(`/category/${rootId}`) && !finalUrl.includes('/category/')) {
    console.log(`    redirect → ${finalUrl}`);
    return { ok: false, subs: [] };
  }

  // 페이지 제목 혹은 h1
  const pageTitle = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    return h1 ? h1.innerText.trim() : document.title;
  });

  // 모든 /category/{N} 링크 수집 (앵커 텍스트 포함)
  const links = await page.evaluate(() => {
    const out = [];
    const anchors = [...document.querySelectorAll('a[href*="/category/"]')];
    for (const a of anchors) {
      const m = a.href.match(/\/category\/(\d+)(?:\?|$|#)/);
      if (!m) continue;
      const id = parseInt(m[1], 10);
      const text = (a.innerText || a.textContent || '').trim().replace(/\s+/g, ' ');
      if (!text || text.length > 40) continue;
      out.push({ id, text });
    }
    return out;
  });

  // dedup by id
  const byId = new Map();
  for (const l of links) {
    if (!byId.has(l.id) || (byId.get(l.id).text.length < l.text.length && l.text.length < 30)) {
      byId.set(l.id, l);
    }
  }
  const subs = [...byId.values()];
  console.log(`    → h1="${pageTitle}" / ${subs.length}개 링크 발견`);
  return { ok: true, pageTitle, subs };
}

(async () => {
  console.log(`=== 카테고리 ID 풀 발견 시작 ${new Date().toISOString()} ===`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();

  // 0. 메인 페이지에서 카테고리 메뉴 수집
  console.log(`\n[main] kmong.com 메인 페이지에서 카테고리 링크 수집`);
  try {
    await page.goto('https://kmong.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);
    // 카테고리 토글 버튼이 있으면 클릭
    try {
      const catBtn = page.locator('button:has-text("카테고리"), a:has-text("전체 카테고리")').first();
      if (await catBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await catBtn.hover();
        await sleep(1500);
      }
    } catch {}
    const mainLinks = await page.evaluate(() => {
      const out = [];
      const anchors = [...document.querySelectorAll('a[href*="/category/"]')];
      for (const a of anchors) {
        const m = a.href.match(/\/category\/(\d+)(?:\?|$|#)/);
        if (!m) continue;
        const id = parseInt(m[1], 10);
        const text = (a.innerText || a.textContent || '').trim().replace(/\s+/g, ' ');
        if (!text || text.length > 40) continue;
        out.push({ id, text });
      }
      return out;
    });
    const byId = new Map();
    for (const l of mainLinks) {
      if (!byId.has(l.id)) byId.set(l.id, l);
    }
    console.log(`  메인에서 ${byId.size}개 unique 카테고리 ID 발견`);
    // save main-found
    var mainFound = [...byId.values()];
  } catch (e) {
    console.log(`  main fail: ${e.message}`);
    var mainFound = [];
  }

  // 1. root 카테고리 probe
  const allCategories = new Map(); // id → { id, name, source, depth }

  // 메인에서 찾은 건 depth=0 후보
  for (const l of mainFound) {
    allCategories.set(l.id, { id: l.id, name: l.text, source: 'main', depth: null });
  }

  console.log(`\n[root] root 카테고리 probe`);
  const validRoots = [];
  for (const rc of ROOT_CANDIDATES) {
    const { ok, pageTitle, subs } = await discoverSubsFromRoot(page, rc.id, rc.name);
    if (ok && subs.length > 0) {
      validRoots.push(rc);
      // root 자체 등록
      allCategories.set(rc.id, {
        id: rc.id,
        name: rc.name,
        h1: pageTitle || null,
        source: 'root',
        depth: 0,
      });
      // sub 후보 수집
      for (const s of subs) {
        if (s.id === rc.id) continue;
        if (!allCategories.has(s.id)) {
          allCategories.set(s.id, { id: s.id, name: s.text, source: `root-${rc.id}`, depth: 1 });
        }
      }
    }
    await sleep(2000);
  }

  console.log(`\n[root] 유효 ${validRoots.length}개: ${validRoots.map((r) => r.id + ' ' + r.name).join(', ')}`);

  // 2. sub 카테고리 probe — 각 sub에서도 하위 third 발견 가능
  const subIds = [...allCategories.values()].filter((c) => c.depth === 1).map((c) => c.id);
  console.log(`\n[sub] sub ${subIds.length}개 probe (하위 third 발견 목적)`);

  let subProbed = 0;
  for (const sid of subIds) {
    subProbed++;
    if (subProbed % 10 === 0) console.log(`  progress ${subProbed}/${subIds.length}`);
    const { ok, subs } = await discoverSubsFromRoot(page, sid, 'sub');
    if (ok) {
      for (const s of subs) {
        if (s.id === sid) continue;
        if (!allCategories.has(s.id)) {
          allCategories.set(s.id, { id: s.id, name: s.text, source: `sub-${sid}`, depth: 2 });
        }
      }
    }
    await sleep(1500);
  }

  await browser.close();

  const categories = [...allCategories.values()].sort((a, b) => a.id - b.id);
  const out = {
    generated_at: new Date().toISOString(),
    count: categories.length,
    roots: validRoots,
    categories,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\n=== 완료 ===`);
  console.log(`  총 ${categories.length}개 카테고리 → ${OUT_FILE}`);
  console.log(`  depth별: 0=${categories.filter(c=>c.depth===0).length} 1=${categories.filter(c=>c.depth===1).length} 2=${categories.filter(c=>c.depth===2).length} null=${categories.filter(c=>c.depth===null).length}`);
})().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
