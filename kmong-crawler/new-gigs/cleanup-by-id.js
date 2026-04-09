/**
 * 1회용: 사고로 생성된 draft를 ID로 직접 삭제
 *
 * 사용법: node cleanup-by-id.js [--execute] [draftId1] [draftId2] ...
 *
 * 안전:
 *  - 기본 dry — --execute 명시해야 실제 삭제
 *  - WAITING 탭의 카드 전체 dump → href 에서 ID 매칭 → 더보기 → 삭제 → 확인
 *  - 보호 ID 화이트리스트 (Phase D 정상 8개) — 실수로 매칭되어도 차단
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { login } = require('../lib/login');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Phase D 의 정상 draft ID — 절대 삭제 금지
const PROTECTED_IDS = new Set(['761234', '761236', '761237', '761239', '761240', '761242', '761243', '761245']);

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const targetIds = args.filter((a) => /^\d{6,}$/.test(a));

if (targetIds.length === 0) {
  console.error('사용법: node cleanup-by-id.js [--execute] <draftId1> [<draftId2> ...]');
  process.exit(1);
}

// 보호 ID 가 인자에 포함되면 즉시 거부
const blocked = targetIds.filter((id) => PROTECTED_IDS.has(id));
if (blocked.length > 0) {
  console.error(`✗ 보호된 ID 가 인자에 포함됨 — 차단: ${blocked.join(', ')}`);
  process.exit(2);
}

console.log(`[cleanup-by-id] 대상=${targetIds.join(',')} mode=${isExecute ? 'EXECUTE' : 'DRY'}`);

(async () => {
  const { browser, page } = await login({ slowMo: 150 });
  try {
    let totalDeleted = 0;
    for (let pageNo = 1; pageNo <= 5; pageNo++) {
      const url = `https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`;
      console.log(`\n[페이지 ${pageNo}] ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 1200));
        await sleep(400);
      }

      // 카드 dump — 카드 텍스트의 "#760000" 패턴에서 ID 추출
      const cards = await page.evaluate(() => {
        const editBtns = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === '편집하기');
        const out = [];
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
          // "#761411" 패턴
          let id = '';
          const m = text.match(/#(\d{6,})/);
          if (m) id = m[1];
          out.push({ id, titlePreview: text.split('\n').slice(0, 3).join(' | ').slice(0, 100) });
        }
        return out;
      });

      console.log(`  ${cards.length}개 카드`);
      cards.forEach((c) => console.log(`    [${c.id || '?'}] ${c.titlePreview}`));

      // 매칭된 ID
      const matched = cards.filter((c) => targetIds.includes(c.id));
      if (matched.length === 0) {
        if (pageNo === 1 && cards.length > 0) {
          // 1페이지에 없으면 다음 페이지로
          continue;
        }
        if (cards.length === 0) {
          console.log(`  카드 없음 — 종료`);
          break;
        }
        continue;
      }

      console.log(`  대상 매칭 ${matched.length}개: ${matched.map((m) => m.id).join(',')}`);
      if (!isExecute) {
        console.log(`  (DRY) 실제 삭제하려면 --execute`);
        continue;
      }

      // 실제 삭제 — 카드별로 더보기 → 삭제 → 확인
      for (const m of matched) {
        // 보호 가드 (이중 안전)
        if (PROTECTED_IDS.has(m.id)) {
          console.log(`    ✗ ${m.id}: 보호 ID — 차단`);
          continue;
        }
        console.log(`    [del] ${m.id} 처리 중...`);
        const opened = await page.evaluate((id) => {
          // 카드 다시 찾기 (페이지 re-render 후 안정)
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
            const cid = m ? m[1] : '';
            if (cid !== id) continue;
            // 더보기 버튼
            const moreBtn = [...card.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '더보기');
            if (moreBtn) {
              moreBtn.scrollIntoView({ block: 'center' });
              moreBtn.click();
              return true;
            }
          }
          return false;
        }, m.id);
        if (!opened) {
          console.log(`    ✗ ${m.id} 더보기 미발견`);
          continue;
        }
        await sleep(900);

        // "삭제" 메뉴 클릭 — BUTTON 이며 텍스트 정확 일치인 것만, 가장 큰 (메뉴 항목)
        const delClicked = await page.evaluate(() => {
          // 1) z-10 dropdown 컨테이너 안의 BUTTON 우선
          const dropdowns = [...document.querySelectorAll('div')].filter((d) => {
            const cls = String(d.className || '');
            return cls.includes('absolute') && cls.includes('z-10') && cls.includes('w-[160px]');
          });
          for (const dd of dropdowns) {
            const r = dd.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const btn = [...dd.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '삭제' || (b.innerText || '').trim() === '삭제하기');
            if (btn) {
              btn.click();
              return { ok: true, via: 'dropdown' };
            }
          }
          // 2) Fallback: 모든 BUTTON 중 텍스트 정확 일치
          const cands = [...document.querySelectorAll('button')].filter((b) => {
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const t = (b.innerText || '').trim();
            return t === '삭제' || t === '삭제하기';
          });
          if (cands.length === 0) return { ok: false };
          // 가장 큰 (메뉴 아이템 너비) 우선
          cands.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return br.width * br.height - ar.width * ar.height;
          });
          cands[0].click();
          return { ok: true, via: 'fallback' };
        });
        if (!delClicked || !delClicked.ok) {
          console.log(`    ✗ ${m.id} 삭제 메뉴 미발견`);
          continue;
        }
        await sleep(2000);

        // 확인 다이얼로그 — modal 안에서만
        const confirmed = await page.evaluate(() => {
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
          } else {
            // fallback
            buttons = [...document.querySelectorAll('button')].filter((b) => {
              const r = b.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            });
          }
          const cands = buttons.filter((b) => {
            const t = (b.innerText || '').trim();
            return /^(삭제|삭제하기|확인|예|네)$/.test(t);
          });
          if (cands.length === 0) return { ok: false };
          // 가장 아래 (모달 푸터의 primary action)
          cands.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
          cands[0].click();
          return { ok: true };
        });
        if (!confirmed || !confirmed.ok) {
          console.log(`    ✗ ${m.id} 확인 미발견`);
          continue;
        }
        await sleep(2500);
        console.log(`    ✓ ${m.id} 삭제 완료`);
        totalDeleted++;
        // 페이지 reload (re-render 안정)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);
      }

      // 다음 페이지로 가지 않고 종료 (모두 1페이지에 있을 것)
      break;
    }

    console.log(`\n[cleanup-by-id] 완료. 삭제=${totalDeleted}/${targetIds.length}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
