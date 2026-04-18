/**
 * 실패 select (카테고리/업종/개발스택) 완전 해부 + React internals 접근
 *
 * 전략:
 *   1) control 클릭 → dropdown 열기
 *   2) 옵션의 React fiber 에서 실제 onClick handler 찾기
 *   3) React props 의 onMouseDown 직접 호출
 *   4) 각 step 후 UI + 네트워크 상태 기록
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const { discoverSelects } = require('./create-gig.js');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const draftId = '764211';
  const url = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=601&thirdCategoryId=60113`;
  const OUT = path.join(__dirname, 'deep-investigate');
  fs.mkdirSync(OUT, { recursive: true });

  const { browser, page } = await login({ slowMo: 80 });
  try {
    // 네트워크 모니터 — 저장 시 실제 API call 파악
    const netLog = [];
    page.on('request', req => {
      const u = req.url();
      if (u.includes('kmong.com') && !u.includes('cdn') && !u.includes('thumbnail') && !u.includes('.css') && !u.includes('.js')) {
        netLog.push({ t: 'req', method: req.method(), url: u.slice(0, 200), body: (req.postData() || '').slice(0, 500) });
      }
    });

    console.log('[1] nav');
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    await page.evaluate(u => { window.location.href = u; }, url);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(5000);

    const selects = await discoverSelects(page);
    const cat = selects.find(s => s.label === '카테고리');
    console.log(`[2] 카테고리: ${cat?.inputId}`);

    // 1) control 클릭
    console.log('[3] control 클릭');
    const control = page.locator(`#${cat.inputId}`).locator('xpath=ancestor::div[contains(@class, "-control")][1]');
    await control.scrollIntoViewIfNeeded();
    await sleep(500);
    await control.click({ force: true });
    await sleep(1500);

    // 2) dropdown 구조 완전 해부
    console.log('\n[4] 열린 dropdown option 의 React fiber/props 직접 조사');
    const probe = await page.evaluate(() => {
      const target = [...document.querySelectorAll('[role="option"]')].find(el =>
        (el.innerText || '').trim() === '포트폴리오 홈페이지'
      );
      if (!target) return { err: 'option not found' };

      // React fiber key 찾기
      const keys = Object.keys(target);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
      const propsKey = keys.find(k => k.startsWith('__reactProps'));
      const fiber = fiberKey ? target[fiberKey] : null;
      const props = propsKey ? target[propsKey] : null;

      // props 의 함수 핸들러 이름 추출
      const propNames = props ? Object.keys(props) : [];
      const handlerNames = propNames.filter(k => typeof props[k] === 'function');

      // parent 체인의 fiber 확인 (react-select wrapper 찾기)
      let cur = target;
      const chain = [];
      for (let i = 0; i < 10 && cur; i++) {
        const ck = Object.keys(cur);
        const cfk = ck.find(k => k.startsWith('__reactFiber'));
        const cpk = ck.find(k => k.startsWith('__reactProps'));
        if (cpk) {
          const cp = cur[cpk];
          const hdls = Object.keys(cp || {}).filter(k => typeof cp[k] === 'function');
          chain.push({ depth: i, tag: cur.tagName, cls: (cur.className || '').slice(0, 60), handlers: hdls });
        }
        cur = cur.parentElement;
      }

      // 옵션 좌표 (실제 click)
      const rect = target.getBoundingClientRect();

      // 현재 control singleValue
      const input = document.getElementById('react-select-2146-input') ||
        [...document.querySelectorAll('input[id^="react-select-"][id$="-input"]')].find(el => {
          let c = el;
          for (let i = 0; i < 12 && c; i++) {
            c = c.parentElement;
            if (!c) break;
            const lbl = c.querySelector(':scope > label, :scope > div > label');
            if (lbl && (lbl.innerText || '').trim().startsWith('카테고리')) return true;
          }
          return false;
        });

      return {
        optionInfo: {
          tag: target.tagName,
          text: target.innerText,
          cls: target.className.slice(0, 150),
          attrs: [...target.attributes].map(a => `${a.name}=${a.value.slice(0, 40)}`),
          handlerNames,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height, centerX: rect.x + rect.width/2, centerY: rect.y + rect.height/2 },
        },
        parentChain: chain,
        listboxHTML: (target.closest('[role="listbox"]') || {}).outerHTML?.slice(0, 500) || 'no listbox',
      };
    });
    fs.writeFileSync(path.join(OUT, 'option-probe.json'), JSON.stringify(probe, null, 2));
    console.log(`   option handlers: ${JSON.stringify(probe.optionInfo?.handlerNames)}`);
    console.log(`   parent chain (handlers):`);
    (probe.parentChain || []).forEach(c => {
      if (c.handlers.length > 0) console.log(`     depth=${c.depth} <${c.tag}> ${c.handlers.join(',')}`);
    });
    console.log(`   rect: ${JSON.stringify(probe.optionInfo?.rect)}`);

    // 3) 공격 전략 A: React props.onMouseDown 직접 호출
    console.log('\n[5a] React props.onMouseDown 직접 호출');
    const attackA = await page.evaluate(() => {
      const target = [...document.querySelectorAll('[role="option"]')].find(el =>
        (el.innerText || '').trim() === '포트폴리오 홈페이지'
      );
      if (!target) return { err: 'not found' };
      const keys = Object.keys(target);
      const propsKey = keys.find(k => k.startsWith('__reactProps'));
      if (!propsKey) return { err: 'no reactProps' };
      const props = target[propsKey];

      const handlers = Object.keys(props).filter(k => typeof props[k] === 'function');
      const results = {};
      // synthetic event mock
      const mockEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        button: 0,
        type: 'mousedown',
        target,
        currentTarget: target,
      };
      for (const h of handlers) {
        try {
          props[h].call(target, mockEvent);
          results[h] = 'called';
        } catch (e) {
          results[h] = 'err: ' + e.message.slice(0, 60);
        }
      }
      return { handlers, results };
    });
    console.log(`   ${JSON.stringify(attackA)}`);
    await sleep(1500);

    // 결과 확인
    const afterA = await page.evaluate(() => {
      const sv = [...document.querySelectorAll('[class*="singleValue"]')].map(el => (el.innerText || '').trim());
      return sv;
    });
    console.log(`   after A: singleValues = ${JSON.stringify(afterA)}`);

    // 4) 공격 전략 B: 상위 control fiber 의 select 함수 찾아서 호출
    if (!afterA.includes('포트폴리오 홈페이지')) {
      console.log('\n[5b] React stateNode 에서 select 함수 찾기');
      const attackB = await page.evaluate(() => {
        const target = [...document.querySelectorAll('[role="option"]')].find(el =>
          (el.innerText || '').trim() === '포트폴리오 홈페이지'
        );
        if (!target) return { err: 'not found' };

        // fiber → stateNode → parent → onChange 등 추적
        const fiberKey = Object.keys(target).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) return { err: 'no fiber' };
        let fiber = target[fiberKey];

        // 상위로 올라가며 setValue / onChange 함수 가진 component 찾기
        const found = [];
        let count = 0;
        while (fiber && count < 30) {
          if (fiber.memoizedProps) {
            const pnames = Object.keys(fiber.memoizedProps).filter(k => typeof fiber.memoizedProps[k] === 'function');
            if (pnames.length > 0) {
              found.push({
                depth: count,
                elementType: typeof fiber.elementType === 'string' ? fiber.elementType : (fiber.elementType?.displayName || fiber.elementType?.name || 'unknown'),
                props: pnames.slice(0, 10),
              });
            }
          }
          fiber = fiber.return;
          count++;
        }
        return { found: found.slice(0, 15) };
      });
      console.log(`   fiber chain:`);
      (attackB.found || []).forEach(f => console.log(`     d=${f.depth} ${f.elementType} props=[${f.props.join(',')}]`));
    }

    // 5) 저장 클릭 → 네트워크 로그
    console.log('\n[6] 저장 버튼 클릭 + 네트워크 로그 캡처');
    netLog.length = 0;  // reset
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    await btn.scrollIntoViewIfNeeded();
    await sleep(500);
    await btn.click({ force: true });
    await sleep(8000);

    console.log(`   저장 시 발생한 요청 ${netLog.length}개:`);
    netLog.slice(0, 20).forEach(r => console.log(`     ${r.method} ${r.url}`));
    fs.writeFileSync(path.join(OUT, 'save-network.json'), JSON.stringify(netLog, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
})();
