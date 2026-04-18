/**
 * select DOM 구조 완전 해부 — label 탐지 실패 원인 진단
 *
 * 대상:
 *   - 정상 case: "기술 수준" select (label 잘 잡힘)
 *   - 실패 case: "업종"/"개발 언어" select (label이 이전 값 '가구·인테리어'/'' 로 잡힘)
 *
 * 출력:
 *   1) 섹션별 스크린샷 (vision 검증용)
 *   2) 각 select 에 대해 parent chain 5단계 구조 + 주변 p/label/h 텍스트 전수 dump
 *   3) 정상 vs 실패 case 비교
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const draftId = '764211';  // N02 식스샵
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113`;
  const OUT = path.join(__dirname, 'probe-select-structure');
  fs.mkdirSync(OUT, { recursive: true });

  const { discoverSelects } = require('./create-gig.js');
  const { browser, page } = await login({ slowMo: 60 });
  try {
    console.log('[1] warm-up + nav');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    // 2) 주요 특징 섹션 스크린샷 (vision 용)
    console.log('[2] 주요 특징 섹션 위치 찾기 + 스크린샷');
    const featSection = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h1, h2, h3, h4')].find(h => (h.innerText || '').includes('주요 특징'));
      if (!heading) return null;
      const r = heading.getBoundingClientRect();
      return { top: r.top + window.scrollY, text: heading.innerText };
    });
    if (featSection) {
      console.log(`   섹션 발견: "${featSection.text}" y=${featSection.top}`);
      await page.evaluate(y => window.scrollTo(0, y - 100), featSection.top);
      await sleep(1000);
      await page.screenshot({ path: path.join(OUT, 'section-feat.png'), fullPage: false });
    }

    // 3) 모든 react-select에 대한 DOM 구조 전수 dump
    console.log('[3] 모든 select 구조 dump');
    const dump = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[id^="react-select-"][id$="-input"]')];
      return inputs.map(el => {
        // 현재 선택값
        let ctrl = el;
        for (let i = 0; i < 10 && ctrl; i++) {
          ctrl = ctrl.parentElement;
          if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
        }
        let selected = '';
        if (ctrl) {
          const sv = ctrl.querySelector('[class*="singleValue"]');
          if (sv) selected = (sv.innerText || '').trim();
        }

        // parent chain 상위 8단계 — 각 단계의 p/label/h* 텍스트 수집
        const chain = [];
        let cur = el;
        for (let i = 0; i < 8 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const texts = [];
          // 직계 자식 중 label/p/h* 만
          [...cur.children].forEach(child => {
            const tag = child.tagName;
            if (['LABEL', 'P', 'H1', 'H2', 'H3', 'H4', 'H5'].includes(tag)) {
              const t = (child.innerText || '').trim();
              if (t && t.length < 100) texts.push({ tag, text: t.slice(0, 80) });
            }
            // 깊이 1 더 내려가서 p/label 도 수집
            if (['DIV', 'SECTION', 'ARTICLE'].includes(tag)) {
              [...child.querySelectorAll(':scope > p, :scope > label')].forEach(gc => {
                const t = (gc.innerText || '').trim();
                if (t && t.length < 100) texts.push({ tag: `${tag}>${gc.tagName}`, text: t.slice(0, 80) });
              });
            }
          });
          chain.push({
            depth: i,
            tag: cur.tagName,
            cls: (cur.className || '').toString().slice(0, 80),
            id: cur.id || '',
            texts,
          });
        }

        return {
          inputId: el.id,
          selected,
          empty: !selected,
          chain,
        };
      });
    });
    console.log(`   총 ${dump.length}개 select`);

    // 3b) 패치된 discoverSelects 결과 확인
    console.log('\n[3b] 패치된 discoverSelects 결과');
    const ds = await discoverSelects(page);
    ds.forEach(s => console.log(`   ${s.inputId.padEnd(24)} label="${s.label.split('\n')[0]}"`));

    // 4) 정상 vs 실패 비교 출력
    console.log('\n[4] 주요 select 구조 비교\n');
    const technical = dump.find(d => d.inputId.includes('1455') || d.chain.some(c => c.texts.some(t => t.text.includes('기술 수준'))));
    const category = dump.find(d => d.inputId.includes('1457') || d.inputId.includes('1456'));
    const devLang = dump.find(d => d.inputId.includes('1458'));

    [
      { name: '정상 case: 기술 수준', d: technical },
      { name: '실패 case 1: 업종/카테고리 (이전에 "가구·인테리어" 로 잘못 fill)', d: category },
      { name: '실패 case 2: 개발 언어 (한 번도 안 채워짐)', d: devLang },
    ].forEach(({ name, d }) => {
      if (!d) { console.log(`--- ${name}: select 못찾음 ---\n`); return; }
      console.log(`--- ${name} ---`);
      console.log(`   inputId: ${d.inputId}, selected: "${d.selected}"`);
      d.chain.forEach(c => {
        if (c.texts.length > 0) {
          console.log(`   depth=${c.depth} <${c.tag}> cls="${c.cls.slice(0,40)}"`);
          c.texts.forEach(t => console.log(`     ${t.tag}: "${t.text}"`));
        }
      });
      console.log();
    });

    fs.writeFileSync(path.join(OUT, 'dump.json'), JSON.stringify(dump, null, 2));
    console.log(`\n[결과] dump.json + section-feat.png`);
  } finally {
    await browser.close().catch(() => {});
  }
})();
