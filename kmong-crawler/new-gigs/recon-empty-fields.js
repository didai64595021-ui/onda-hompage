/**
 * 정찰: draft 페이지에서 빈 필드 전수 식별
 *
 * 사용법: node recon-empty-fields.js [draftId]
 *   기본 draftId = 761234 (PDF AI 상담봇)
 *
 * 출력: recon-empty-fields-{draftId}.json
 *   - 모든 input/textarea/select 의 (label, value, empty 여부)
 *   - 이미지 슬롯 (메인/추가)
 *   - FAQ 섹션 존재 여부
 *   - 태그 입력란 위치
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');

const draftId = process.argv[2] || '761234';
const subCategoryId = process.argv[3] || '667';
const OUT_PATH = path.join(__dirname, `recon-empty-fields-${draftId}.json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[recon] draftId=${draftId} subCategoryId=${subCategoryId}`);
  const { browser, page } = await login({ slowMo: 80 });
  try {
    const thirdCategoryId = process.argv[4] || '';
    const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${subCategoryId}${thirdCategoryId ? `&thirdCategoryId=${thirdCategoryId}` : ''}`;
    console.log(`[recon] warm-up /my-gigs/new`);
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    console.log(`[recon] SPA nav → ${url}`);
    await page.evaluate((u) => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(4000);

    // Step1 페이지에서 시작 — Step1 폼 dump 후 "다음" 클릭하고 Step2 dump
    const out = { draftId, subCategoryId, at: new Date().toISOString(), step1: {}, step2: {} };

    // ======== Step 1 dump ========
    out.step1 = await dumpForm(page, 'step1');

    // 다음 버튼 클릭
    const nextBtn = page.locator('button:has-text("다음")').first();
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click({ force: true });
      await sleep(7000);
    }

    // ======== Step 2 dump ========
    out.step2 = await dumpForm(page, 'step2');

    // 스크린샷 (전체)
    const shotPath = path.join(__dirname, 'screenshots', `recon-${draftId}-step2-full.png`);
    fs.mkdirSync(path.dirname(shotPath), { recursive: true });
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`[recon] full screenshot: ${shotPath}`);

    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
    console.log(`[recon] saved: ${OUT_PATH}`);

    // 요약
    console.log('\n=== 요약 ===');
    console.log(`Step1 inputs: ${out.step1.inputs.length}, empty: ${out.step1.inputs.filter(i => i.empty).length}`);
    console.log(`Step1 textareas: ${out.step1.textareas.length}, empty: ${out.step1.textareas.filter(i => i.empty).length}`);
    console.log(`Step1 selects: ${out.step1.selects.length}, empty: ${out.step1.selects.filter(i => i.empty).length}`);
    console.log(`Step2 inputs: ${out.step2.inputs.length}, empty: ${out.step2.inputs.filter(i => i.empty).length}`);
    console.log(`Step2 textareas: ${out.step2.textareas.length}, empty: ${out.step2.textareas.filter(i => i.empty).length}`);
    console.log(`Step2 selects: ${out.step2.selects.length}, empty: ${out.step2.selects.filter(i => i.empty).length}`);
    console.log(`Step2 file inputs: ${out.step2.fileInputs.length}`);
    console.log(`Step2 sections detected: ${out.step2.sections.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

async function dumpForm(page, label) {
  return await page.evaluate(() => {
    function nearestLabel(el) {
      // 1) <label for="id"> 우선
      if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) return (lbl.innerText || '').trim();
      }
      // 2) 부모 8단계 이내의 첫 label/p
      let cur = el;
      for (let i = 0; i < 8 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        const lblEl = cur.querySelector('label, p, h2, h3, h4, span[class*="label"]');
        if (lblEl) {
          const t = (lblEl.innerText || '').trim();
          if (t && t.length < 80) return t;
        }
      }
      return '';
    }
    function isVisible(el) {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    const inputs = [];
    document.querySelectorAll('input').forEach((el, idx) => {
      if (!isVisible(el) && el.type !== 'hidden') return;
      // hidden file input은 별도 처리
      if (el.type === 'file') return;
      if (el.type === 'hidden') return;
      const v = el.value || '';
      inputs.push({
        idx,
        type: el.type,
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        value: v.length > 80 ? v.slice(0, 80) + '…' : v,
        empty: !v,
        label: nearestLabel(el),
      });
    });

    const textareas = [];
    document.querySelectorAll('textarea').forEach((el, idx) => {
      if (!isVisible(el)) return;
      const v = el.value || '';
      textareas.push({
        idx,
        name: el.name || '',
        placeholder: el.placeholder || '',
        value: v.length > 80 ? v.slice(0, 80) + '…' : v,
        empty: !v,
        disabled: el.disabled,
        label: nearestLabel(el),
      });
    });

    // ProseMirror (TipTap) — visible div
    const proseMirrors = [];
    document.querySelectorAll('.ProseMirror').forEach((el, idx) => {
      const t = (el.innerText || '').trim();
      proseMirrors.push({
        idx,
        textLen: t.length,
        preview: t.slice(0, 80),
        empty: t.length === 0,
        parentId: (el.closest('[id]') || {}).id || '',
      });
    });

    // react-select 상태 (selected 값 추출)
    const selects = [];
    document.querySelectorAll('[id^="react-select"][id$="-input"]').forEach((el, idx) => {
      // 부모에서 single value 찾기
      let container = el.closest('[class*="control"]');
      let cur = el;
      for (let i = 0; i < 10 && cur && !container; i++) {
        cur = cur.parentElement;
        if (cur && cur.className && typeof cur.className === 'string' && cur.className.includes('control')) container = cur;
      }
      let selected = '';
      if (container) {
        const sv = container.querySelector('[class*="singleValue"]');
        if (sv) selected = (sv.innerText || '').trim();
      }
      selects.push({
        idx,
        inputId: el.id,
        empty: !selected || selected === '선택' || selected === '선택해주세요',
        selected,
        label: nearestLabel(el),
      });
    });

    // 파일 input (이미지 슬롯)
    const fileInputs = [];
    document.querySelectorAll('input[type="file"]').forEach((el, idx) => {
      const container = el.closest('[id]');
      fileInputs.push({
        idx,
        name: el.name || '',
        accept: el.accept || '',
        parentId: container ? container.id : '',
      });
    });

    // 갤러리 이미지: data-testid 또는 img 태그로 추정 (메인 + 추가)
    const galleryImages = [];
    document.querySelectorAll('#MAIN_GALLERY img, [id*="GALLERY"] img, [class*="gallery"] img').forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      galleryImages.push({
        idx,
        src: (el.src || '').slice(0, 100),
        parentId: (el.closest('[id]') || {}).id || '',
      });
    });

    // 섹션 헤더 — 페이지 구조 파악
    const sections = [];
    document.querySelectorAll('h1, h2, h3, h4, [class*="section"] [class*="title"]').forEach((el) => {
      const t = (el.innerText || '').trim();
      if (!t || t.length > 60) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      sections.push(t);
    });

    return {
      url: location.href,
      title: document.title,
      inputs,
      textareas,
      proseMirrors,
      selects,
      fileInputs,
      galleryImages,
      sections: [...new Set(sections)].slice(0, 30),
    };
  });
}

main().catch((e) => {
  console.error('[recon] FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
