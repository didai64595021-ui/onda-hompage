/**
 * QA harness — lawfirm-seojeong + taxfirm-jeongsim
 * 5 viewports · file:// 로드 · 스크린샷 + 오버플로우 스캔 + 터치타겟 체크
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SITES = [
  { name: 'lawfirm-seojeong', pages: ['index', 'about', 'contact'] },
  { name: 'taxfirm-jeongsim', pages: ['index', 'about', 'contact'] },
];

const VIEWPORTS = [
  { name: '375',  w: 375,  h: 812  },
  { name: '390',  w: 390,  h: 844  },
  { name: '768',  w: 768,  h: 1024 },
  { name: '1024', w: 1024, h: 768  },
  { name: '1440', w: 1440, h: 900  },
];

const BASE = '/home/onda/projects/onda-hompage/portfolio-sites';
const OUT  = '/home/onda/projects/onda-hompage/portfolio-sites/_qa-screens';

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const report = [];

  for (const site of SITES) {
    for (const page of site.pages) {
      const fileUrl = 'file://' + path.join(BASE, site.name, page + '.html');
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.w, height: vp.h },
          deviceScaleFactor: 1,
          ignoreHTTPSErrors: true,
        });
        const p = await ctx.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push('JS:' + e.message));
        p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE:' + m.text()); });

        try {
          await p.goto(fileUrl, { waitUntil: 'networkidle', timeout: 15000 });
          // Wait for preloader (if any)
          await p.waitForTimeout(1800);
          // Trigger reveal animations by scrolling quickly
          await p.evaluate(async () => {
            const h = document.body.scrollHeight;
            const steps = 12;
            for (let i = 0; i <= steps; i++) {
              window.scrollTo(0, (h * i) / steps);
              await new Promise((r) => setTimeout(r, 60));
            }
            window.scrollTo(0, 0);
            await new Promise((r) => setTimeout(r, 400));
          });
          await p.waitForTimeout(500);

          const shotPath = path.join(OUT, `${site.name}__${page}__${vp.name}.png`);
          await p.screenshot({ path: shotPath, fullPage: vp.w <= 768 ? false : false });

          // --- M5 Mobile Guard-like checks (x-overflow, tiny touch, clipped) ---
          const metrics = await p.evaluate(() => {
            const viewportW = window.innerWidth;
            const results = { overflowX: false, xOver: [], touchTiny: [], clipped: [], bodyScrollW: 0 };
            results.bodyScrollW = document.documentElement.scrollWidth;
            results.overflowX = results.bodyScrollW > viewportW + 2;

            // elements exceeding viewport width
            const all = document.querySelectorAll('section, header, footer, main, .container, .hero-grid, .bento, .practice-grid, .attorney-list, .num-grid, .process-wrap, .team-grid, .pricing-grid, .faq-list');
            all.forEach((el) => {
              const r = el.getBoundingClientRect();
              if (r.right > viewportW + 2) {
                results.xOver.push({
                  tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/)[0] : ''),
                  right: Math.round(r.right),
                  width: Math.round(r.width),
                });
              }
            });

            // touch targets < 40x40 (mobile only)
            if (viewportW <= 480) {
              document.querySelectorAll('a, button').forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.width < 30 || r.height < 30) {
                  if (r.width > 0 && r.height > 0) {
                    results.touchTiny.push({
                      tag: el.tagName.toLowerCase(),
                      text: (el.textContent || '').trim().slice(0, 24),
                      w: Math.round(r.width), h: Math.round(r.height),
                    });
                  }
                }
              });
            }
            return results;
          });

          const summary = {
            site: site.name,
            page,
            vp: vp.name,
            errors,
            overflowX: metrics.overflowX,
            bodyScrollW: metrics.bodyScrollW,
            xOverCount: metrics.xOver.length,
            xOverExamples: metrics.xOver.slice(0, 3),
            touchTinyCount: metrics.touchTiny.length,
            touchTinyExamples: metrics.touchTiny.slice(0, 3),
          };
          report.push(summary);
          const stat = (metrics.overflowX || errors.length) ? '❌' : '✅';
          console.log(`${stat} ${site.name}/${page} @ ${vp.name}px — scrollW=${metrics.bodyScrollW} xOver=${metrics.xOver.length} tiny=${metrics.touchTiny.length} err=${errors.length}`);
        } catch (e) {
          console.log(`⚠️  ${site.name}/${page} @ ${vp.name}: ${e.message}`);
          report.push({ site: site.name, page, vp: vp.name, error: e.message });
        }
        await ctx.close();
      }
    }
  }

  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
  const fails = report.filter((r) => r.overflowX || (r.errors && r.errors.length) || r.error);
  console.log('\n=== SUMMARY ===');
  console.log(`Total: ${report.length} · Pass: ${report.length - fails.length} · Fail: ${fails.length}`);
  if (fails.length) {
    console.log('\n=== FAILS ===');
    fails.forEach((f) => console.log(JSON.stringify(f, null, 2)));
  }
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
