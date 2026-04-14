#!/usr/bin/env node
/**
 * 크몽 서비스 편집 페이지 전체 필드 정찰
 *  - TipTap 에디터 툴바 (#DESCRIPTION, #DESCRIPTION_PROGRESS, #DESCRIPTION_PREPARATION)
 *  - 모든 드롭다운(react-select) 라벨/옵션
 *  - 체크박스/토글(패키지 설정, 주말작업 등)
 *  - "판매 핵심 정보" 섹션 (검색 키워드, 태그, 이벤트 등)
 *  - 이미지 업로드 필드
 *  - 모달 트리거 버튼
 *
 * 출력: recon-full-fields.json
 * 사용: node recon-full-fields.js [draftId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 사용: node recon-full-fields.js <draftId> <rootCategoryId> <subCategoryId> [thirdCategoryId]
// 또는: node recon-full-fields.js <full URL>
const arg1 = process.argv[2] || '763080';
let DRAFT_URL;
if (arg1.startsWith('http')) {
  DRAFT_URL = arg1;
} else {
  const rootId = process.argv[3] || '1';
  const subId = process.argv[4] || '113';
  const thirdId = process.argv[5];
  DRAFT_URL = `https://kmong.com/my-gigs/edit/${arg1}?rootCategoryId=${rootId}&subCategoryId=${subId}` + (thirdId ? `&thirdCategoryId=${thirdId}` : '');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 3000 } });
  const page = await ctx.newPage();

  await login(page);

  // Warm-up: /my-gigs/new 경유 (session 활성화 + Referer 세팅)
  console.log(`[recon-full] warm-up: /my-gigs/new`);
  await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

  // 쿠키 우회: page.goto는 direct 접근으로 리다이렉트됨.
  // 클라이언트 사이드 navigation (window.location.href)으로 이동 → Referer 유지
  console.log(`[recon-full] client-side navigation to: ${DRAFT_URL}`);
  await page.evaluate((url) => { window.location.href = url; }, DRAFT_URL);
  await page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await sleep(8000);
  await closeModals(page).catch(() => {});
  const afterDraft = page.url();
  console.log(`[recon-full] after draft: ${afterDraft}`);
  if (!afterDraft.includes('/my-gigs/edit')) {
    console.log(`draft 리다이렉트됨 → ${afterDraft}`);
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'recon-draft-redirect.png'), fullPage: true });
  }

  // 전체 페이지 구조 수집
  const structure = await page.evaluate(() => {
    // 1) 섹션 헤더 수집 (h2/h3/strong text-lg/text-xl 등)
    const headings = [];
    document.querySelectorAll('h1,h2,h3,h4,p,strong,span,div').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 40 || t.length < 2) return;
      // 섹션 헤더 후보: 큰 폰트 또는 bold
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const fw = parseInt(cs.fontWeight) || 400;
      if (fs < 14) return;
      // 중복 피하기
      const directText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
      if (!directText) return;
      if (fw >= 600 || fs >= 18) {
        headings.push({ text: directText, tag: el.tagName, fs: Math.round(fs), fw, y: Math.round(r.top) });
      }
    });

    // 2) 모든 input/select/textarea/button 수집 (라벨과 근접 매칭)
    const fields = [];
    const allInputs = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    allInputs.forEach(el => {
      const r = el.getBoundingClientRect();
      const t = el.tagName;
      const type = el.getAttribute('type') || '';
      const id = el.id || '';
      const name = el.getAttribute('name') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const role = el.getAttribute('role') || '';
      const cls = (el.className || '').toString().slice(0, 60);

      // 가까운 라벨 탐색 (ancestor 내 p/label)
      let labelText = '';
      let cur = el.parentElement;
      for (let i = 0; i < 6 && cur; i++) {
        // ancestor 내 p/label 중 이 input 위쪽 가장 가까운 것
        const candidates = [...cur.querySelectorAll('p, label, h1,h2,h3,h4, span')].filter(c => {
          const cr = c.getBoundingClientRect();
          return cr.top < r.top && cr.top > r.top - 60;
        });
        if (candidates.length > 0) {
          labelText = (candidates[candidates.length - 1].innerText || '').trim().slice(0, 50);
          if (labelText) break;
        }
        cur = cur.parentElement;
      }

      fields.push({
        tag: t, type, id, name, placeholder, ariaLabel, role, cls,
        label: labelText,
        visible: r.width > 0 && r.height > 0,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    });

    // 3) 버튼 수집 (모달 트리거 후보)
    const buttons = [];
    document.querySelectorAll('button').forEach(btn => {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const t = (btn.innerText || '').trim();
      const aria = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';
      const type = btn.getAttribute('type') || '';
      // 너무 많으니 label이 있거나 text 있는 것만
      if (!t && !aria && !title) return;
      buttons.push({
        text: t.slice(0, 40), aria, title, type,
        x: Math.round(r.x), y: Math.round(r.y),
      });
    });

    // 4) TipTap 에디터 정보
    const editors = [];
    document.querySelectorAll('.ProseMirror').forEach(pm => {
      const root = pm.closest('[id]') || pm.parentElement;
      const r = pm.getBoundingClientRect();
      editors.push({
        containerId: root?.id || '',
        cls: (pm.className || '').toString().slice(0, 80),
        y: Math.round(r.top),
        htmlPreview: (pm.innerHTML || '').slice(0, 200),
      });
    });

    return { headings, fields, buttons, editors };
  });

  console.log('\n=== 섹션 헤딩 (상단→하단) ===');
  const sortedHeadings = structure.headings.sort((a, b) => a.y - b.y);
  sortedHeadings.forEach(h => console.log(`  y=${h.y}  ${h.tag}(fs=${h.fs}/fw=${h.fw}) "${h.text}"`));

  console.log('\n=== TipTap 에디터 ===');
  structure.editors.forEach(e => console.log(`  #${e.containerId} y=${e.y}`));

  console.log(`\n=== 필드 (${structure.fields.length}개, 상위 30개) ===`);
  structure.fields.filter(f => f.visible).sort((a,b)=>a.y-b.y).slice(0, 50).forEach(f => {
    console.log(`  y=${f.y}  ${f.tag}[${f.type}] id=${f.id.slice(0,30)} name=${f.name.slice(0,30)} ph="${f.placeholder.slice(0,20)}" aria="${f.ariaLabel.slice(0,30)}" label="${f.label}"`);
  });

  console.log(`\n=== 버튼 (${structure.buttons.length}개, 상위 40개 텍스트) ===`);
  structure.buttons.sort((a,b)=>a.y-b.y).slice(0, 40).forEach(b => {
    console.log(`  y=${b.y}  "${b.text || b.aria || b.title}"`);
  });

  // 판매 핵심 정보 섹션 찾기
  const kwHeading = structure.headings.find(h => /판매\s*핵심|검색\s*키워드|태그|키워드/.test(h.text));
  if (kwHeading) {
    console.log(`\n>> 판매핵심정보/키워드 섹션 발견: y=${kwHeading.y} "${kwHeading.text}"`);
  } else {
    console.log(`\n>> 판매핵심정보 섹션 헤딩 미발견 — 페이지 하단 확인 필요`);
  }

  // 스크린샷 (전체)
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'recon-full-fields.png'), fullPage: true });

  fs.writeFileSync(path.join(__dirname, 'recon-full-fields.json'),
    JSON.stringify({ url: DRAFT_URL, structure }, null, 2));
  console.log('\n저장: recon-full-fields.json + screenshots/recon-full-fields.png');

  await browser.close();
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
