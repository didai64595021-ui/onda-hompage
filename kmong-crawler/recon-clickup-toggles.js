#!/usr/bin/env node
/**
 * 크몽 클릭업(광고) 페이지 토글 DOM 정찰
 *
 * 목적: batch-toggle-ads.js의 readToggleState 함수가 잘못된 패턴 매칭
 * ('react-switch' 클래스 자체에 'switch' 포함되어 ON/OFF 판정 불가)
 * → 진짜 ON/OFF를 판정할 수 있는 selector + 로직을 찾아 dump.
 *
 * 출력: /tmp/clickup-recon.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const { login } = require('./lib/login');
const { matchProductId } = require('./lib/product-map');

const CLICK_UP_URL = 'https://kmong.com/seller/click-up';

(async () => {
  let browser;
  try {
    console.log('[recon] click-up 진입');
    const session = await login({ slowMo: 100 });
    browser = session.browser;
    const page = session.page;

    await page.goto(CLICK_UP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // 모달 닫기
    try {
      await page.evaluate(() => {
        const m = document.querySelector('.kmong-modal-root');
        if (m) m.remove();
      });
    } catch {}

    const rows = await page.evaluate(() => {
      const trs = [...document.querySelectorAll('table tbody tr')];
      return trs.map((tr, i) => {
        const cells = [...tr.querySelectorAll('td')];
        if (cells.length < 3) return null;
        const svcName = cells[1]?.querySelector('img')?.alt || '';
        const statusText = cells[2]?.innerText || '';

        // 첫 번째 td (토글 셀)에 있는 모든 element 분석
        const toggleCell = cells[0];
        const inputs = [...toggleCell.querySelectorAll('input')].map((inp) => ({
          type: inp.type,
          role: inp.getAttribute('role'),
          checked: inp.checked,
          name: inp.name,
          className: inp.className,
        }));
        const switches = [...toggleCell.querySelectorAll('[class*="switch"], [class*="toggle"]')].map((el) => ({
          tag: el.tagName,
          className: el.className,
          ariaChecked: el.getAttribute('aria-checked'),
          ariaPressed: el.getAttribute('aria-pressed'),
          dataState: el.getAttribute('data-state'),
        }));
        const reactSwitchBg = toggleCell.querySelector('.react-switch-bg');
        const bgStyle = reactSwitchBg ? {
          background: reactSwitchBg.style.background,
          width: reactSwitchBg.style.width,
          height: reactSwitchBg.style.height,
        } : null;

        return {
          rowIndex: i,
          svcName,
          statusText: statusText.slice(0, 40),
          toggleCell_HTML: toggleCell.outerHTML.slice(0, 600),
          inputs,
          switches,
          reactSwitchBg_style: bgStyle,
        };
      }).filter(Boolean);
    });

    // product_id 매칭 추가
    const enriched = rows.map((r) => ({
      ...r,
      productId: matchProductId(r.svcName),
    }));

    fs.writeFileSync('/tmp/clickup-recon.json', JSON.stringify(enriched, null, 2));

    console.log('\n=== 토글 상태 정찰 결과 ===');
    enriched.forEach((r) => {
      const inputChecked = r.inputs[0]?.checked;
      const ariaChecked = r.switches[0]?.ariaChecked;
      const dataState = r.switches[0]?.dataState;
      console.log(
        (r.productId || '?').padEnd(15),
        '| input.checked=', inputChecked === undefined ? '-' : inputChecked,
        '| aria-checked=', ariaChecked || '-',
        '| data-state=', dataState || '-',
        '| 상태텍스트:', r.statusText.slice(0, 20)
      );
    });
    console.log('\n저장: /tmp/clickup-recon.json');

    await browser.close();
  } catch (err) {
    console.error('[recon 에러]', err.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
})();
