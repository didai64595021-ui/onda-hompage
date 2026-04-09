/** 1회용: 카드 1개 더보기/삭제 흐름 단계별 디버깅 + 스크린샷 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { login } = require('../lib/login');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHOT_DIR = path.join(__dirname, 'screenshots', 'debug-delete');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const targetId = process.argv[2] || '761411';

(async () => {
  const { browser, page } = await login({ slowMo: 100 });
  try {
    await page.goto('https://kmong.com/my-gigs?statusType=WAITING&page=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await sleep(400);
    }
    await page.screenshot({ path: path.join(SHOT_DIR, '01-list.png'), fullPage: true });

    // Step 1: 더보기 버튼 찾고 클릭
    const opened = await page.evaluate((id) => {
      const editBtns = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === '편집하기');
      for (const eb of editBtns) {
        let card = eb;
        for (let i = 0; i < 10; i++) {
          card = card.parentElement;
          if (!card) break;
          const r = card.getBoundingClientRect();
          if (card.querySelector('img') && r.height > 80 && r.height < 250) break;
        }
        if (!card) continue;
        const text = (card.innerText || '').trim();
        const m = text.match(/#(\d{6,})/);
        if (!m || m[1] !== id) continue;
        const moreBtn = [...card.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '더보기');
        if (moreBtn) {
          moreBtn.scrollIntoView({ block: 'center' });
          const r = moreBtn.getBoundingClientRect();
          moreBtn.click();
          return { ok: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
        }
        return { ok: false, reason: 'moreBtn 없음' };
      }
      return { ok: false, reason: 'card 없음' };
    }, targetId);
    console.log('Step1 더보기:', JSON.stringify(opened));
    await sleep(1500);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-after-more.png'), fullPage: true });

    // Step 2: 페이지 안의 모든 visible 메뉴 후보 dump
    const menuCandidates = await page.evaluate(() => {
      const all = [...document.querySelectorAll('button, [role="menuitem"], a, li, div')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 30) return false;
        return /삭제|복사|편집|정지|일시|보기|중지|삭제하기/.test(t);
      });
      return all.slice(0, 40).map((el) => ({
        tag: el.tagName,
        text: (el.innerText || '').trim().slice(0, 40),
        cls: (el.className || '').slice(0, 60),
        role: el.getAttribute('role') || '',
      }));
    });
    console.log('메뉴 후보:', JSON.stringify(menuCandidates, null, 2));

    // Step 3: 삭제 클릭
    const delClicked = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('button, [role="menuitem"], a, li, div')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const t = (el.innerText || '').trim();
        return t === '삭제' || t === '삭제하기';
      });
      if (cands.length === 0) return { ok: false };
      cands.sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
      const c = cands[0];
      const r = c.getBoundingClientRect();
      c.click();
      return { ok: true, count: cands.length, picked: { tag: c.tagName, text: (c.innerText||'').trim(), x: r.x, y: r.y, w: r.width } };
    });
    console.log('Step3 삭제 클릭:', JSON.stringify(delClicked));
    await sleep(2000);
    await page.screenshot({ path: path.join(SHOT_DIR, '03-after-delete-click.png'), fullPage: true });

    // Step 4: 모달 dump
    const modalDump = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return buttons.map((b) => ({
        text: (b.innerText || '').trim().slice(0, 30),
        role: b.getAttribute('role') || '',
        type: b.type || '',
        z: getComputedStyle(b.closest('[role="dialog"], [class*="modal"], [class*="Modal"]') || b.parentElement || b).zIndex,
      })).filter(b => b.text.length > 0 && b.text.length < 20).slice(0, 30);
    });
    console.log('모달 버튼들:', JSON.stringify(modalDump, null, 2));

    // Step 5: 확인 클릭 — 모달 안에서
    const confirmed = await page.evaluate(() => {
      // 1) role=dialog 안의 버튼 우선
      const dialogs = [...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="Modal" i]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      let buttons = [];
      if (dialogs.length > 0) {
        for (const d of dialogs) {
          buttons.push(...[...d.querySelectorAll('button')].filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }));
        }
      }
      if (buttons.length === 0) {
        buttons = [...document.querySelectorAll('button')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      }
      // 텍스트 = "삭제" / "삭제하기" / "확인" / "예"
      const cands = buttons.filter((b) => {
        const t = (b.innerText || '').trim();
        return /^(삭제|삭제하기|확인|예|네)$/.test(t);
      });
      if (cands.length === 0) return { ok: false, totalButtons: buttons.length };
      // 가장 아래 (모달 푸터)
      cands.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
      const picked = cands[0];
      const r = picked.getBoundingClientRect();
      picked.click();
      return { ok: true, picked: { text: (picked.innerText || '').trim(), x: r.x, y: r.y } };
    });
    console.log('Step5 확인:', JSON.stringify(confirmed));
    await sleep(3000);
    await page.screenshot({ path: path.join(SHOT_DIR, '04-after-confirm.png'), fullPage: true });

    // Step 6: 페이지 reload + 카드 다시 dump
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);
    const finalCount = await page.evaluate(() => {
      const editBtns = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === '편집하기');
      return editBtns.length;
    });
    console.log(`최종 카드 수: ${finalCount}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
