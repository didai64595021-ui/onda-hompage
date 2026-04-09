#!/usr/bin/env node
/**
 * 가격 정보 섹션 진단 — 기존 draft 재사용
 *
 * 1. 가장 최근 draft 1개를 이어서 열기 (테스트용)
 * 2. 가격 섹션 스크롤
 * 3. 모든 버튼 text + react-select menu 구조 덤프
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');
const { closeModals } = require('../lib/modal-handler');

const SS = path.join(__dirname, 'screenshots');

// 인자: --gig <id>  또는 새로 생성
const args = process.argv.slice(2);
let gigId = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--gig' && args[i + 1]) gigId = args[++i];
}

(async () => {
  let browser;
  try {
    const r = await login({ slowMo: 150 });
    browser = r.browser;
    const page = r.page;

    if (gigId) {
      console.log(`[debug] 기존 draft 열기: ${gigId}`);
      await page.goto(`https://kmong.com/my-gigs/edit/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
      console.log(`[debug] 새 draft 생성 (제목/카테고리 입력)`);
      await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      await closeModals(page).catch(() => {});

      await page.locator('input[placeholder*="제목"]').first().fill('진단용 임시 24시간 알림봇 제작');
      await page.waitForTimeout(800);
      await page.locator('button:has-text("1차 카테고리")').first().click();
      await page.waitForTimeout(2000);
      await page.getByText('IT·프로그래밍', { exact: true }).first().click();
      await page.waitForTimeout(2000);
      await page.locator('button:has-text("2차 카테고리")').first().click();
      await page.waitForTimeout(2000);
      await page.getByText('봇·챗봇', { exact: true }).first().click();
      await page.waitForTimeout(2000);
      await page.locator('button:has-text("다음")').first().click();
      await page.waitForTimeout(6000);
    }

    console.log(`[debug] 현재 URL: ${page.url()}`);
    await page.waitForTimeout(2000);

    // ─── 가격 정보 섹션으로 스크롤 ───
    const priceSec = page.locator('h3:has-text("기본 가격"), h3:has-text("가격 정보"), h2:has-text("가격 정보")').first();
    if (await priceSec.count() > 0) {
      await priceSec.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: path.join(SS, 'debug-pricing-section.png'), fullPage: false });

    // ─── 가격 정보 부근의 모든 visible button 덤프 ───
    const btns = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button').forEach((el, idx) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const t = (el.innerText || '').trim();
        if (!t) return;
        // bounding rect 위치 — 페이지 중간 근처(가격 섹션) 근처만 (선택)
        out.push({
          idx,
          text: t.slice(0, 60),
          y: Math.round(r.y),
          disabled: el.disabled,
          ariaLabel: el.getAttribute('aria-label') || '',
        });
      });
      return out;
    });
    console.log(`\n[debug] visible buttons: ${btns.length}`);
    btns.forEach(b => console.log(`   y=${b.y}\t"${b.text}"${b.disabled ? ' (disabled)' : ''}`));

    // ─── disabled textareas ───
    const taInfo = await page.evaluate(() => {
      return [...document.querySelectorAll('textarea')].map((el, idx) => ({
        idx,
        name: el.name || '',
        disabled: el.disabled,
        rows: el.rows,
      }));
    });
    console.log(`\n[debug] textareas: ${taInfo.length}`);
    taInfo.forEach(t => console.log(`   ${t.idx}\t${t.disabled ? 'DISABLED' : 'enabled '}\t${t.name}`));

    // ─── react-select 5개의 menu 구조 시도 (1개 클릭해서 menu DOM 덤프) ───
    console.log('\n[debug] 첫 번째 react-select(기술 수준) 클릭 → 메뉴 DOM 덤프');
    const ts = page.locator('#react-select-2-input').locator('xpath=ancestor::div[contains(@class, "-control")][1]');
    if (await ts.count() > 0) {
      await ts.scrollIntoViewIfNeeded();
      await ts.click({ force: true });
      await page.waitForTimeout(800);
      const menu = await page.evaluate(() => {
        // 모든 visible div 중 최상단에서 가장 가까운 menu-like 요소
        const all = [...document.querySelectorAll('div')].filter(el => {
          const cls = el.className || '';
          if (typeof cls !== 'string') return false;
          return /menu|MenuList|listbox/i.test(cls);
        }).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const out = [];
        all.forEach(el => {
          out.push({
            cls: (el.className || '').toString().slice(0, 100),
            childCount: el.children.length,
            firstText: ((el.children[0]?.innerText) || '').slice(0, 30),
          });
        });
        // 옵션도 dump
        const options = [...document.querySelectorAll('[class*="option"]')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).map(el => ({
          cls: (el.className || '').toString().slice(0, 80),
          text: (el.innerText || '').trim().slice(0, 40),
        }));
        return { menus: out, options };
      });
      console.log(`menus (${menu.menus.length}):`);
      menu.menus.forEach(m => console.log(`   .${m.cls} children=${m.childCount} firstText="${m.firstText}"`));
      console.log(`\noptions (${menu.options.length}):`);
      menu.options.forEach(o => console.log(`   .${o.cls} → "${o.text}"`));
      await page.keyboard.press('Escape').catch(() => {});
    }

    // ─── "패키지로 설정" 토글 구조 ───
    console.log('\n[debug] "패키지로 설정" 토글 부근 DOM:');
    const toggleInfo = await page.evaluate(() => {
      // text="패키지로 설정" 가진 가장 작은 div 찾기
      const all = [...document.querySelectorAll('*')].filter(el => {
        const t = (el.innerText || '').trim();
        return t === '패키지로 설정';
      });
      if (all.length === 0) return null;
      // 가장 작은 = 직접 라벨 텍스트
      all.sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
      const target = all[0];
      // 부모 3단계 + 자식들
      const out = { target: { tag: target.tagName, cls: String(target.className || '').slice(0, 100) }, ancestors: [], siblings: [] };
      let cur = target;
      for (let i = 0; i < 5; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        out.ancestors.push({
          tag: cur.tagName,
          cls: String(cur.className || '').slice(0, 100),
          children: cur.children.length,
        });
      }
      // 부모의 자식들 검사 (input, button)
      const parent = target.parentElement;
      if (parent) {
        [...parent.querySelectorAll('input, button, label, [role="switch"], [role="checkbox"]')].forEach(el => {
          out.siblings.push({
            tag: el.tagName,
            type: el.type || '',
            role: el.getAttribute('role') || '',
            cls: String(el.className || '').slice(0, 80),
            checked: el.checked,
            ariaChecked: el.getAttribute('aria-checked'),
          });
        });
      }
      // 부모의 부모도 검사
      const grand = parent?.parentElement;
      if (grand) {
        out.grandSiblings = [];
        [...grand.querySelectorAll('input, button, [role="switch"], [role="checkbox"]')].forEach(el => {
          out.grandSiblings.push({
            tag: el.tagName,
            type: el.type || '',
            role: el.getAttribute('role') || '',
            cls: String(el.className || '').slice(0, 80),
            checked: el.checked,
          });
        });
      }
      return out;
    });
    console.log(JSON.stringify(toggleInfo, null, 2));

    // ─── 9개 react-select 옵션 전부 덤프 ───
    console.log('\n[debug] 9개 react-select 옵션 덤프:');
    const labels = ['기술 수준', '팀 규모', '상주 여부', '작업기간 STD', '작업기간 DLX', '작업기간 PRM', '수정횟수 STD', '수정횟수 DLX', '수정횟수 PRM'];
    for (let i = 2; i <= 10; i++) {
      const inputId = `react-select-${i}-input`;
      const ctrl = page.locator(`#${inputId}`).locator('xpath=ancestor::div[contains(@class, "-control")][1]');
      if (await ctrl.count() === 0) {
        console.log(`   ${i} (${labels[i-2]}): control 미발견`);
        continue;
      }
      try {
        await ctrl.scrollIntoViewIfNeeded({ timeout: 1500 });
        await ctrl.click({ force: true });
        await page.waitForTimeout(700);
        // 옵션 dump (kmong 시그니처)
        const opts = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('div').forEach(el => {
            const cls = String(el.className || '');
            if (!cls.includes('!flex') || !cls.includes('items-center') || !cls.includes('text-gray-900')) return;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            out.push((el.innerText || '').trim());
          });
          return out;
        });
        console.log(`   ${i} (${labels[i-2]}): [${opts.join(' / ')}]`);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      } catch (e) {
        console.log(`   ${i} (${labels[i-2]}): ERROR ${e.message}`);
      }
    }

    console.log('\n[debug] 완료. 스크린샷: debug-pricing-section.png');
  } catch (e) {
    console.error('[debug 실패]', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
