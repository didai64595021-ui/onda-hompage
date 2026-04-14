#!/usr/bin/env node
/**
 * 크몽 WAITING 탭 draft 빈 필드/누락 검증봇 (읽기전용)
 *
 * 기능:
 *  - 55-run-log.json에서 productId별 최신 draftId 수집
 *  - /my-gigs?statusType=WAITING listing → "편집하기" 클릭으로 쿠키 우회
 *  - 각 draft의 필수 필드 검증:
 *      1) 서비스 설명 (#DESCRIPTION .ProseMirror) 100자+
 *      2) 서비스 제공 절차 (#DESCRIPTION_PROGRESS) 50자+ (있으면)
 *      3) 의뢰인 준비사항 (#DESCRIPTION_PREPARATION) 50자+ (있으면)
 *      4) 메인 이미지 (#MAIN_GALLERY) 1개+
 *      5) 패키지 textarea 6개 전부 채움
 *      6) 패키지 금액 input 3개 전부 채움
 *      7) react-select "작업 기간", "수정 횟수" 각 3개
 *      8) 키워드 input (판매 핵심 정보)
 *  - 검증만 수행, draft 수정/저장 절대 금지
 *
 * 입력:  55-run-log.json (productId별 최신 savedUrl)
 *        gig-data-55.js (productId → image 매핑 — 참조용)
 * 출력:  verify-fields-report.json
 *        screenshots/verify-fields-{draftId}.png (실패 건만)
 *
 * 사용:
 *   node verify-fields.js                     # 전체 (run-log 기반)
 *   node verify-fields.js 763115,763104       # 지정 draftId만
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const LOG_FILE = path.join(__dirname, '55-run-log.json');
const REPORT = path.join(__dirname, 'verify-fields-report.json');
const SHOT_DIR = path.join(__dirname, 'screenshots');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * run-log에서 productId별 최신 savedUrl 추출 → draftId 반환
 * 반환: [{ productId, draftId, at }]
 */
function collectDrafts() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`run-log 파일 없음: ${LOG_FILE}`);
    return [];
  }
  const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  const byId = {};
  for (const r of log.runs || []) {
    const m = (r.savedUrl || '').match(/\/edit\/(\d+)/);
    if (!m) continue;
    if (!byId[r.id] || r.at > byId[r.id].at) {
      byId[r.id] = { draftId: m[1], at: r.at, productId: r.id };
    }
  }
  return Object.values(byId);
}

/**
 * listing 페이지에서 draftId 카드를 찾아 "편집하기" 클릭
 */
async function clickEditForDraft(page, draftId) {
  return await page.evaluate((targetId) => {
    const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
    for (const eb of editBtns) {
      let card = eb;
      for (let i = 0; i < 10; i++) {
        card = card.parentElement;
        if (!card) break;
        const text = (card.innerText || '');
        if (text.includes('#' + targetId)) {
          eb.scrollIntoView({ block: 'center' });
          eb.click();
          return true;
        }
      }
    }
    return false;
  }, draftId);
}

/**
 * 편집 페이지에서 필드 검증 실행
 */
async function verifyDraft(page, draftId) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await sleep(4500);
  await closeModals(page).catch(() => {});

  if (!page.url().includes('/my-gigs/edit')) {
    return { ok: false, reason: `편집 진입 실패 URL=${page.url()}`, checks: {}, missing: ['page_not_edit'] };
  }

  // 페이지 끝까지 스크롤 (lazy 섹션 렌더 유도 — 키워드/태그 등)
  await page.evaluate(async () => {
    for (let y = 0; y < 8000; y += 800) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await sleep(1500);

  // 필드 전수 수집
  const data = await page.evaluate(() => {
    // 1) ProseMirror 에디터 3개
    const pmMap = {};
    document.querySelectorAll('.ProseMirror').forEach(pm => {
      const root = pm.closest('#DESCRIPTION, #DESCRIPTION_PROGRESS, #DESCRIPTION_PREPARATION');
      if (!root) return;
      const txt = (pm.innerText || '').trim();
      pmMap[root.id] = { textLen: txt.length, preview: txt.slice(0, 80) };
    });

    // 섹션 존재 여부 (그 카테고리에 필드가 있는지)
    const hasProgress = !!document.querySelector('#DESCRIPTION_PROGRESS');
    const hasPreparation = !!document.querySelector('#DESCRIPTION_PREPARATION');

    // 2) 메인 이미지
    const mainGallery = document.querySelector('#MAIN_GALLERY');
    let mainImgCount = 0;
    if (mainGallery) {
      mainImgCount = mainGallery.querySelectorAll('img').length;
    }

    // 3) 패키지 textarea (PACKAGE_OPTION_GROUP.valueData.packages.*.values.*.packageValue)
    const pkgTextareas = [];
    document.querySelectorAll('textarea').forEach(ta => {
      const name = ta.getAttribute('name') || '';
      if (name.includes('PACKAGE_OPTION_GROUP') && name.includes('packageValue')) {
        pkgTextareas.push({
          name,
          value: (ta.value || '').trim(),
          empty: !(ta.value || '').trim(),
        });
      }
    });

    // 4) 패키지 금액 input — label "금액(VAT 포함)" 또는 name=PRICE
    // 크몽은 text input (콤마 포맷)이며 라벨로 구분
    const priceInputs = [];
    const allInputs = [...document.querySelectorAll('input')];
    allInputs.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // 근접 label 탐색
      let label = '';
      let cur = el.parentElement;
      for (let i = 0; i < 5 && cur; i++) {
        const candidates = [...cur.querySelectorAll('p, label, span')].filter(c => {
          const cr = c.getBoundingClientRect();
          return cr.top < r.top && cr.top > r.top - 50;
        });
        if (candidates.length > 0) {
          label = (candidates[candidates.length - 1].innerText || '').trim().slice(0, 40);
          if (label) break;
        }
        cur = cur.parentElement;
      }
      if (label.includes('금액') && label.includes('VAT')) {
        priceInputs.push({ value: (el.value || '').trim(), empty: !(el.value || '').trim() });
      }
    });

    // 5) react-select: "작업 기간", "수정 횟수"
    // 선택된 값은 .css-... single-value 또는 다른 영역에 render됨
    // 전략: react-select input의 근접 label로 매칭 + 선택값 탐색
    const rsRows = { '작업 기간': [], '수정 횟수': [] };
    const rsInputs = document.querySelectorAll('input[id^="react-select"]');
    rsInputs.forEach(rs => {
      const r = rs.getBoundingClientRect();
      // 라벨 탐색
      let label = '';
      let cur = rs.parentElement;
      for (let i = 0; i < 8 && cur; i++) {
        const candidates = [...cur.querySelectorAll('p, label, span')].filter(c => {
          const cr = c.getBoundingClientRect();
          return cr.top < r.top && cr.top > r.top - 60;
        });
        if (candidates.length > 0) {
          label = (candidates[candidates.length - 1].innerText || '').trim().slice(0, 40);
          if (label) break;
        }
        cur = cur.parentElement;
      }
      const normalized = label.replace(/\*/g, '').replace(/\n/g, '').trim();
      if (!Object.keys(rsRows).includes(normalized)) return;

      // 선택된 값 탐색: react-select control 안의 single-value/multi-value
      const control = rs.closest('[class*="control"]');
      let selectedText = '';
      if (control) {
        const sv = control.querySelector('[class*="singleValue"], [class*="single-value"]');
        if (sv) selectedText = (sv.innerText || '').trim();
        if (!selectedText) {
          const mv = control.querySelectorAll('[class*="multiValue"], [class*="multi-value"]');
          if (mv.length > 0) selectedText = [...mv].map(m => (m.innerText || '').trim()).join(',');
        }
      }
      rsRows[normalized].push({ label: normalized, selected: selectedText, empty: !selectedText });
    });

    // 6) 키워드 / 판매 핵심 정보 input
    // 섹션 헤더 "판매 핵심 정보" 또는 "키워드"
    let keywordSectionFound = false;
    let keywordInputs = [];
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,strong,p,span,div')].filter(el => {
      const t = (el.innerText || '').trim();
      return /판매\s*핵심|검색\s*키워드/.test(t) && t.length < 40;
    });
    if (headings.length > 0) {
      keywordSectionFound = true;
      // 가장 가까운 section 컨테이너에서 input 수집
      const sec = headings[0].closest('section, div[class*="Section"], div[class*="section"]') || headings[0].parentElement?.parentElement;
      if (sec) {
        sec.querySelectorAll('input[type="text"], input:not([type])').forEach(inp => {
          const r = inp.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          // react-select 내부 input 제외
          if ((inp.id || '').startsWith('react-select')) return;
          keywordInputs.push({ value: (inp.value || '').trim(), empty: !(inp.value || '').trim() });
        });
      }
    }

    return {
      pm: pmMap,
      hasProgress,
      hasPreparation,
      mainImgCount,
      pkgTextareas,
      priceInputs,
      rsRows,
      keywordSectionFound,
      keywordInputs,
    };
  });

  // 검증 로직
  const checks = {};
  const missing = [];

  // 1) DESCRIPTION 100자+
  const descLen = data.pm['DESCRIPTION']?.textLen || 0;
  checks.description = { len: descLen, pass: descLen >= 100 };
  if (!checks.description.pass) missing.push(`DESCRIPTION(${descLen}자 < 100)`);

  // 2) DESCRIPTION_PROGRESS (있으면 50자+)
  if (data.hasProgress) {
    const pLen = data.pm['DESCRIPTION_PROGRESS']?.textLen || 0;
    checks.progress = { len: pLen, pass: pLen >= 50, exists: true };
    if (!checks.progress.pass) missing.push(`PROGRESS(${pLen}자 < 50)`);
  } else {
    checks.progress = { exists: false, pass: true };
  }

  // 3) DESCRIPTION_PREPARATION (있으면 50자+)
  if (data.hasPreparation) {
    const pLen = data.pm['DESCRIPTION_PREPARATION']?.textLen || 0;
    checks.preparation = { len: pLen, pass: pLen >= 50, exists: true };
    if (!checks.preparation.pass) missing.push(`PREPARATION(${pLen}자 < 50)`);
  } else {
    checks.preparation = { exists: false, pass: true };
  }

  // 4) 메인 이미지
  checks.mainImage = { count: data.mainImgCount, pass: data.mainImgCount >= 1 };
  if (!checks.mainImage.pass) missing.push('MAIN_IMAGE(0개)');

  // 5) 패키지 textarea 6개
  const pkgFilled = data.pkgTextareas.filter(t => !t.empty).length;
  const pkgTotal = data.pkgTextareas.length;
  checks.packageTextareas = { total: pkgTotal, filled: pkgFilled, pass: pkgTotal >= 6 && pkgFilled >= 6 };
  if (!checks.packageTextareas.pass) missing.push(`PKG_TEXTAREA(${pkgFilled}/${pkgTotal})`);

  // 6) 패키지 금액 input 3개
  const priceFilled = data.priceInputs.filter(p => !p.empty).length;
  const priceTotal = data.priceInputs.length;
  checks.priceInputs = { total: priceTotal, filled: priceFilled, pass: priceTotal >= 3 && priceFilled >= 3 };
  if (!checks.priceInputs.pass) missing.push(`PRICE(${priceFilled}/${priceTotal})`);

  // 7) react-select 필수값 (작업 기간, 수정 횟수)
  const workPeriodFilled = data.rsRows['작업 기간'].filter(r => !r.empty).length;
  const reviseFilled = data.rsRows['수정 횟수'].filter(r => !r.empty).length;
  checks.workPeriod = { filled: workPeriodFilled, pass: workPeriodFilled >= 3 };
  checks.revise = { filled: reviseFilled, pass: reviseFilled >= 3 };
  if (!checks.workPeriod.pass) missing.push(`작업기간(${workPeriodFilled}/3)`);
  if (!checks.revise.pass) missing.push(`수정횟수(${reviseFilled}/3)`);

  // 8) 키워드
  const kwTotal = data.keywordInputs.length;
  const kwFilled = data.keywordInputs.filter(k => !k.empty).length;
  checks.keywords = {
    sectionFound: data.keywordSectionFound,
    total: kwTotal,
    filled: kwFilled,
    pass: data.keywordSectionFound ? kwFilled >= 1 : false,
  };
  if (!checks.keywords.pass) {
    if (!data.keywordSectionFound) missing.push('KW_SECTION(미발견)');
    else missing.push(`KW(${kwFilled}/${kwTotal})`);
  }

  const ok = missing.length === 0;
  return { ok, checks, missing, raw: data };
}

/**
 * 지정 draftId 리스트만 처리
 */
function parseTargets(argv) {
  if (argv.length <= 2) return null;
  const ids = argv[2].split(',').map(s => s.trim()).filter(Boolean);
  return ids;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const allDrafts = collectDrafts();
  const targetIds = parseTargets(process.argv);
  const drafts = targetIds
    ? allDrafts.filter(d => targetIds.includes(d.draftId))
    : allDrafts;

  if (targetIds && drafts.length < targetIds.length) {
    const found = new Set(drafts.map(d => d.draftId));
    const miss = targetIds.filter(id => !found.has(id));
    // run-log에 없는 id도 draftId만으로 처리 (productId 미상)
    for (const id of miss) drafts.push({ draftId: id, productId: '?', at: '' });
  }

  console.log(`검증 대상: ${drafts.length}개 (전체 run-log=${allDrafts.length}개)`);
  if (drafts.length === 0) { console.log('대상 없음 종료'); process.exit(0); }

  const { browser, page } = await login({ slowMo: 80 });

  // warm-up
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  const results = [];
  let ok = 0, ng = 0;
  const processedIds = new Set();
  const draftIdSet = new Set(drafts.map(d => d.draftId));

  // listing page 순회 — WAITING 탭
  pageLoop:
  for (let pageNo = 1; pageNo <= 6; pageNo++) {
    const listingUrl = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
    console.log(`\n[listing ${pageNo}] → ${listingUrl}`);
    await page.evaluate((u) => { window.location.href = u; }, listingUrl);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await sleep(5000);
    await closeModals(page).catch(() => {});

    if (!page.url().includes('/my-gigs?')) {
      console.log(`  listing 접근 실패 URL=${page.url()} — 중단`);
      break;
    }

    // 스크롤로 카드 전체 렌더
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await sleep(400);
    }

    // 이 페이지에 보이는 draftId 수집
    const visibleIds = await page.evaluate(() => {
      const out = [];
      const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
      for (const eb of editBtns) {
        let card = eb;
        for (let i = 0; i < 10; i++) {
          card = card.parentElement;
          if (!card) break;
          const text = (card.innerText || '');
          const m = text.match(/#(\d{6,})/);
          if (m) { out.push(m[1]); break; }
        }
      }
      return out;
    });
    console.log(`  page ${pageNo} 카드수: ${visibleIds.length}`);
    if (visibleIds.length === 0) break; // 더 이상 페이지 없음

    // 매칭 대상
    const targets = visibleIds.filter(id => draftIdSet.has(id) && !processedIds.has(id));
    console.log(`  처리 대상: ${targets.length}`);

    for (const draftId of targets) {
      const draft = drafts.find(d => d.draftId === draftId);
      const progress = `${processedIds.size + 1}/${drafts.length}`;
      process.stdout.write(`  [${progress}] draft=${draftId} pid=${draft?.productId || '?'} ... `);

      const clickOk = await clickEditForDraft(page, draftId);
      if (!clickOk) {
        console.log('편집하기 클릭 실패');
        results.push({ draftId, productId: draft?.productId, ok: false, reason: '편집하기 클릭 실패', checks: {}, missing: ['edit_click_fail'] });
        ng++; processedIds.add(draftId);
        continue;
      }

      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4500);

      let result;
      try {
        result = await verifyDraft(page, draftId);
      } catch (e) {
        result = { ok: false, reason: `verify error: ${e.message}`, checks: {}, missing: ['exception'] };
      }

      if (result.ok) {
        console.log('OK');
        ok++;
      } else {
        console.log(`NG [${(result.missing || []).join(', ')}]`);
        ng++;
        // 실패 스크린샷
        try {
          await page.screenshot({ path: path.join(SHOT_DIR, `verify-fields-${draftId}.png`), fullPage: true });
        } catch {}
      }

      results.push({
        draftId,
        productId: draft?.productId,
        ok: result.ok,
        checks: result.checks,
        missing: result.missing || [],
        reason: result.reason,
      });
      processedIds.add(draftId);

      // listing 재진입
      await page.evaluate((u) => { window.location.href = u; }, listingUrl);
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await sleep(4000);
      await closeModals(page).catch(() => {});
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await sleep(400);
      }
    }

    if (processedIds.size >= drafts.length) {
      console.log('모든 draft 검증 완료');
      break pageLoop;
    }
  }

  // 미처리 draft (listing에서 못 찾음)
  for (const d of drafts) {
    if (processedIds.has(d.draftId)) continue;
    results.push({
      draftId: d.draftId,
      productId: d.productId,
      ok: false,
      checks: {},
      missing: ['listing_not_found'],
      reason: 'WAITING listing에서 카드 미발견',
    });
    ng++;
  }

  const report = {
    generated_at: new Date().toISOString(),
    total: drafts.length,
    ok, ng,
    results,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  console.log(`\n==== 검증 완료 ====`);
  console.log(`  처리: ${processedIds.size}/${drafts.length}`);
  console.log(`  OK ${ok} / NG ${ng}`);
  console.log(`  리포트: ${REPORT}`);

  await browser.close();
  process.exit(ng > 0 ? 2 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
