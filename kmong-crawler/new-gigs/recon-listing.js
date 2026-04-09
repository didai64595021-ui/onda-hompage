#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { login } = require('../lib/login');
const fs = require('fs');
const path = require('path');

const SS = path.join(__dirname, 'screenshots');

(async () => {
  let browser;
  try {
    const r = await login({ slowMo: 150 });
    browser = r.browser;
    const page = r.page;

    // 승인 전 (= 임시저장/검토중) 탭으로 이동
    await page.goto('https://kmong.com/my-gigs?statusType=WAITING', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    // 페이지 끝까지 스크롤 (lazy load)
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await new Promise(r => setTimeout(r, 700));
    }
    await page.screenshot({ path: path.join(SS, 'listing-waiting.png'), fullPage: true });

    // 모든 카드 dump — "편집하기" 버튼 또는 img + 가까운 텍스트로 찾기
    const cards = await page.evaluate(() => {
      const out = [];
      // 1. "편집하기" 버튼 (card 1개당 1개)
      const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
      editBtns.forEach(eb => {
        // 부모 카드 찾기 (image + 텍스트가 있는 컨테이너)
        let card = eb;
        for (let i = 0; i < 10; i++) {
          card = card.parentElement;
          if (!card) break;
          if (card.querySelector('img') && card.querySelectorAll('button').length >= 1) {
            // 카드는 보통 한 row 라서 height 적당함
            const r = card.getBoundingClientRect();
            if (r.height > 80 && r.height < 250) break;
          }
        }
        if (!card) return;
        const r = card.getBoundingClientRect();
        const text = (card.innerText || '').trim();
        // gigId — onClick 핸들러나 data 속성에 있을 수 있음. 또는 카드 클릭 시 navigate.
        // 일단 텍스트에서 추출 시도 (제목이 있을 것)
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        // 제목은 보통 첫 1-2 줄 (긴 텍스트)
        const title = lines.find(l => l.length > 8 && l.length < 50 && !/판매중|승인|편집|임시|^\d/.test(l)) || lines[0] || '';
        const allBtns = [...card.querySelectorAll('button')].map(b => {
          const br = b.getBoundingClientRect();
          return {
            text: (b.innerText || '').trim().slice(0, 30),
            aria: b.getAttribute('aria-label') || '',
            hasIcon: !!b.querySelector('svg, img'),
            x: Math.round(br.x), y: Math.round(br.y),
            w: Math.round(br.width), h: Math.round(br.height),
          };
        });
        out.push({ y: Math.round(r.y), title, text: text.slice(0, 200), btns: allBtns });
      });
      return out;
    });

    console.log(`승인 전 카드: ${cards.length}개`);
    cards.forEach((c, i) => {
      console.log(`[${i}] ${c.gigId}\t"${c.title}"`);
      const meaningful = c.btns.filter(b => b.text || b.aria || b.hasIcon);
      meaningful.slice(0, 5).forEach(b => console.log(`     btn text="${b.text}" aria="${b.aria}" icon=${b.hasIcon}`));
    });
    fs.writeFileSync(path.join(__dirname, 'recon-listing.json'), JSON.stringify(cards, null, 2));

    // 첫 카드의 점 메뉴 클릭 시도
    if (cards.length > 0) {
      const firstId = cards[0].gigId;
      console.log(`\n[옵션 메뉴 시도] ${firstId}`);
      // 카드 컨테이너에서 svg 만 있고 텍스트 없는 버튼 (= ... 메뉴)
      const dotMenu = page.locator(`a[href*="/my-gigs/edit/${firstId}"]`).locator('xpath=ancestor::*[.//img][1]')
        .locator('button:not(:has-text("편집"))');
      const cnt = await dotMenu.count();
      console.log(`  카드 안 비-편집 버튼: ${cnt}개`);
      for (let i = 0; i < cnt; i++) {
        const txt = await dotMenu.nth(i).innerText().catch(() => '');
        console.log(`    [${i}] "${txt.trim()}"`);
      }
      if (cnt > 0) {
        const candidate = dotMenu.last(); // 마지막 = 우상단 ... 일 가능성
        await candidate.scrollIntoViewIfNeeded().catch(() => {});
        await candidate.click({ force: true });
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({ path: path.join(SS, 'listing-menu-open.png'), fullPage: false });
        const menuItems = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('button, [role="menuitem"], a').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || r.y < 100) return;
            const t = (el.innerText || '').trim();
            if (!t || t.length > 30) return;
            // small popover items
            if (r.width < 250) out.push({ text: t, y: Math.round(r.y), x: Math.round(r.x) });
          });
          return out.slice(0, 30);
        });
        console.log('\n메뉴 후보 항목:');
        menuItems.forEach(m => console.log(`  y=${m.y} x=${m.x}\t"${m.text}"`));
      }
    }
  } catch (e) {
    console.error('[recon 실패]', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
