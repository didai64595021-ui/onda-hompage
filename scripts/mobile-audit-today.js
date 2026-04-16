#!/usr/bin/env node
/**
 * Mobile Audit - 6 sites x 5 viewports
 * Created: 2026-04-17
 *
 * Static analysis (Read+Grep) + runtime (Playwright headless chromium)
 * Output:
 *   - JSON: /home/onda/logs/mobile-audit-2026-04-17.json
 *   - MD:   /home/onda/logs/mobile-audit-2026-04-17.md
 *   - PNG:  /home/onda/logs/mobile-audit-2026-04-17/screenshots/{slug}/{vp}.png (optional)
 *
 * Usage:
 *   node mobile-audit-today.js              # measure only (fast)
 *   node mobile-audit-today.js --capture    # also screenshots
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// playwright is installed inside onda-hompage
const playwrightPath = path.join(__dirname, '..', 'node_modules', 'playwright');
const { chromium } = require(playwrightPath);

const CAPTURE = process.argv.includes('--capture');
const TODAY   = '2026-04-17';
const OUT_DIR = `/home/onda/logs/mobile-audit-${TODAY}`;
const SHOT_DIR= path.join(OUT_DIR, 'screenshots');
const JSON_PATH = `/home/onda/logs/mobile-audit-${TODAY}.json`;
const MD_PATH   = `/home/onda/logs/mobile-audit-${TODAY}.md`;

if (!fs.existsSync(OUT_DIR))  fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const SITES = [
  { slug: 'goldapple',     name: 'goldapple-renewal/mirror', file: '/home/onda/projects/goldapple-renewal/mirror/index.html' },
  { slug: 'park-sunick',   name: 'park-sunick-cool',         file: '/home/onda/projects/park-sunick-cool/index.html' },
  { slug: 'webgl-orb',     name: 'webgl-orb-hero',           file: '/home/onda/projects/webgl-orb-hero/index.html' },
  { slug: 'saeumdental',   name: 'saeumdental-responsive',   file: '/home/onda/projects/saeumdental-responsive/index.html' },
  { slug: 'onda-mindmap',  name: 'onda-mindmap',             file: '/home/onda/projects/onda-mindmap/index.html' },
  { slug: 'theskyst',      name: 'theskyst-renewal',         file: null, buildRequired: true,
    note: 'Next.js SSR app — built artifact in .next/server/app/index.html requires running server (npm run start). file:// 로딩 시 hydration 불가.' },
];

const VIEWPORTS = {
  vp_320: { w: 320, h: 568 },
  vp_375: { w: 375, h: 667 },
  vp_390: { w: 390, h: 844 },
  vp_414: { w: 414, h: 896 },
  vp_430: { w: 430, h: 932 },
};

// ------- Static analysis (file content) -------
function analyzeStatic(filePath) {
  const stat = { file: filePath, exists: false };
  if (!fs.existsSync(filePath)) return stat;
  stat.exists = true;
  const txt = fs.readFileSync(filePath, 'utf8');
  stat.bytes = txt.length;
  stat.viewportMeta = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(txt);
  stat.viewportMetaContent = (txt.match(/<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']+)["']/i) || [,null])[1];
  stat.mediaQueries  = (txt.match(/@media[^{]+\{/g) || []).length;
  // 100vh occurrences (excluding 100vhd/etc)
  stat.use100vh   = (txt.match(/\b100vh\b/g) || []).length;
  stat.use100svh  = (txt.match(/\b100svh\b/g) || []).length;
  stat.use100dvh  = (txt.match(/\b100dvh\b/g) || []).length;
  stat.useVw      = (txt.match(/\b\d+(?:\.\d+)?vw\b/g) || []).length;
  stat.useClamp   = (txt.match(/\bclamp\s*\(/g) || []).length;
  // Inline width:Npx >= 600 (potential overflow on mobile)
  stat.inlineWidePx = (txt.match(/style=["'][^"']*width\s*:\s*\d{3,}px/gi) || []).length;
  return stat;
}

// ------- Runtime measurement in page context -------
async function measurePage(page, vpW) {
  return await page.evaluate((vpW) => {
    const docEl = document.documentElement;
    const bodyEl = document.body;
    const scrollW = docEl.scrollWidth;
    const clientW = docEl.clientWidth;
    const horizOverflow = scrollW > clientW + 1; // 1px tolerance
    const overflowPx = scrollW - clientW;

    // detect overflow:hidden / clip on root or body (false-negative trap)
    const htmlCs = getComputedStyle(docEl);
    const bodyCs = getComputedStyle(bodyEl);
    const overflowClipped = ['hidden','clip','scroll'].includes(htmlCs.overflowX) ||
                            ['hidden','clip','scroll'].includes(bodyCs.overflowX);

    // top elements wider than viewport (real bounding rect)
    const overflowOffenders = [];
    const all = document.querySelectorAll('body *');
    let maxRight = vpW;
    for (const el of all) {
      try {
        const r = el.getBoundingClientRect();
        if (r.right > vpW + 1 && r.width > 0) {
          if (r.right > maxRight) maxRight = r.right;
          overflowOffenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && typeof el.className === 'string' ? el.className.slice(0, 80) : ''),
            id:  el.id || '',
            sw:  Math.round(el.scrollWidth),
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
      } catch (e) {}
    }
    overflowOffenders.sort((a,b) => b.right - a.right);
    // potentialOverflow: 자식 박스가 viewport 밖인데 root scrollWidth로는 안 잡히는 false-negative
    const potentialOverflow = !horizOverflow && overflowOffenders.length > 0;
    const potentialOverflowPx = potentialOverflow ? Math.round(maxRight - vpW) : 0;

    // small touch targets (<44 px in any dim)
    const interactives = document.querySelectorAll('button, a, [role="button"]');
    let smallTouch = 0;
    const smallTouchSamples = [];
    for (const el of interactives) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // hidden
      if (r.width < 44 || r.height < 44) {
        smallTouch++;
        if (smallTouchSamples.length < 5) {
          smallTouchSamples.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || '').trim().slice(0, 40),
            w: Math.round(r.width), h: Math.round(r.height),
          });
        }
      }
    }

    // small font-size inputs (<16 -> iOS will zoom)
    const inputs = document.querySelectorAll('input, textarea, select');
    let smallFontInputs = 0;
    for (const el of inputs) {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (fs > 0 && fs < 16) smallFontInputs++;
    }

    // fixed/sticky elements covering >30% viewport
    const allEls = document.querySelectorAll('body *');
    const vpH = window.innerHeight;
    const vpArea = vpW * vpH;
    let bigFixed = 0;
    const bigFixedSamples = [];
    for (const el of allEls) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        const r = el.getBoundingClientRect();
        const visW = Math.max(0, Math.min(r.right, vpW) - Math.max(r.left, 0));
        const visH = Math.max(0, Math.min(r.bottom, vpH) - Math.max(r.top, 0));
        const area = visW * visH;
        if (area > 0 && area / vpArea > 0.30) {
          bigFixed++;
          if (bigFixedSamples.length < 3) {
            bigFixedSamples.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && typeof el.className === 'string' ? el.className.slice(0, 60) : ''),
              cover: Math.round((area / vpArea) * 100),
              pos: cs.position,
            });
          }
        }
      }
    }

    return {
      scrollW, clientW, horizOverflow, overflowPx,
      overflowClipped, potentialOverflow, potentialOverflowPx,
      overflowOffenders: overflowOffenders.slice(0, 5),
      offenderCount: overflowOffenders.length,
      smallTouch, smallTouchSamples,
      smallFontInputs,
      bigFixed, bigFixedSamples,
      interactiveCount: interactives.length,
      inputCount: inputs.length,
    };
  }, vpW);
}

async function auditSite(browser, site) {
  const result = { slug: site.slug, name: site.name, file: site.file, viewports: {}, errors: [] };

  if (site.buildRequired) {
    result.skipped = true;
    result.reason = 'build_required';
    result.note = site.note;
    return result;
  }

  // static
  result.static = analyzeStatic(site.file);
  if (!result.static.exists) {
    result.skipped = true;
    result.reason = 'file_missing';
    return result;
  }

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const t0 = Date.now();
    try {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();

      // suppress console noise but capture errors
      const consoleErrors = [];
      page.on('pageerror', err => consoleErrors.push(String(err).slice(0, 200)));

      try {
        await page.goto(`file://${site.file}`, { waitUntil: 'load', timeout: 15000 });
      } catch (e) {
        // try domcontentloaded as fallback
        try { await page.goto(`file://${site.file}`, { waitUntil: 'domcontentloaded', timeout: 10000 }); }
        catch (e2) { throw e2; }
      }

      // wait briefly for layout
      await page.waitForTimeout(800);

      const metrics = await measurePage(page, vp.w);
      metrics.consoleErrors = consoleErrors;
      metrics.elapsedMs = Date.now() - t0;

      if (CAPTURE) {
        const dir = path.join(SHOT_DIR, site.slug);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const shotPath = path.join(dir, `${vpName}.png`);
        try {
          await page.screenshot({ path: shotPath, fullPage: true, timeout: 15000 });
          metrics.screenshot = shotPath;
        } catch (e) {
          metrics.screenshotError = String(e).slice(0, 120);
        }
      }

      await ctx.close();
      result.viewports[vpName] = metrics;
    } catch (e) {
      result.viewports[vpName] = { error: String(e).slice(0, 200), elapsedMs: Date.now() - t0 };
      result.errors.push(`${vpName}: ${String(e).slice(0, 120)}`);
    }
  }
  return result;
}

// ------- Verdict / pattern aggregation -------
function verdict(r) {
  if (r.skipped) return { sym: 'SKIP', reason: r.reason };
  let crit = 0, warn = 0;
  for (const [vpName, m] of Object.entries(r.viewports)) {
    if (!m || m.error) { crit++; continue; }
    if (m.horizOverflow) crit++;
    // overflow:hidden 으로 root scrollWidth는 막혔지만 자식이 viewport 밖이면 잠재 깨짐
    if (m.potentialOverflow && m.potentialOverflowPx > 50) crit++;
    if (m.bigFixed > 0) warn++;
    if (m.smallTouch > 5) warn++;
    if (m.smallFontInputs > 0) warn++;
  }
  if (crit > 0)  return { sym: 'BROKEN', crit, warn };
  if (warn > 2)  return { sym: 'WARN',  crit, warn };
  return { sym: 'PASS', crit, warn };
}

// ------- MD report -------
function buildMd(results) {
  const lines = [];
  lines.push(`# Mobile Audit Report (${TODAY})`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}  |  Capture: ${CAPTURE ? 'on' : 'off'}`);
  lines.push('');
  lines.push('## 한 줄 요약');
  lines.push('');
  lines.push('| 사이트 | 상태 | 가로오버플로(실측) | 잠재오버플로(clipped) | 작은터치 | 작은입력 | 큰fixed | viewportMeta |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const v = verdict(r);
    const sym = v.sym === 'PASS' ? '[PASS]' : v.sym === 'WARN' ? '[WARN]' : v.sym === 'BROKEN' ? '[BROKEN]' : '[SKIP]';
    if (r.skipped) {
      lines.push(`| ${r.slug} | ${sym} | - | - | - | - | - | - |`);
      continue;
    }
    const overflowList    = Object.entries(r.viewports).map(([vp,m]) => m && !m.error && m.horizOverflow      ? `${vp}(+${m.overflowPx}px)` : '').filter(Boolean).join(', ') || '-';
    const potentialList   = Object.entries(r.viewports).map(([vp,m]) => m && !m.error && m.potentialOverflow  ? `${vp}(+${m.potentialOverflowPx}px,${m.offenderCount})` : '').filter(Boolean).join(', ') || '-';
    const maxTouch = Math.max(0, ...Object.values(r.viewports).map(m => m && !m.error ? m.smallTouch : 0));
    const maxInput = Math.max(0, ...Object.values(r.viewports).map(m => m && !m.error ? m.smallFontInputs : 0));
    const maxFixed = Math.max(0, ...Object.values(r.viewports).map(m => m && !m.error ? m.bigFixed : 0));
    lines.push(`| ${r.slug} | ${sym} | ${overflowList} | ${potentialList} | ${maxTouch} | ${maxInput} | ${maxFixed} | ${r.static.viewportMeta ? 'OK' : 'MISSING'} |`);
  }

  lines.push('');
  lines.push('## 정적 분석');
  lines.push('');
  lines.push('| 사이트 | bytes | @media | 100vh | svh/dvh | vw | clamp | inlineWidth>=3자리 |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (r.skipped || !r.static) { lines.push(`| ${r.slug} | - | - | - | - | - | - | - |`); continue; }
    const s = r.static;
    lines.push(`| ${r.slug} | ${s.bytes} | ${s.mediaQueries} | ${s.use100vh} | ${s.use100svh+s.use100dvh} | ${s.useVw} | ${s.useClamp} | ${s.inlineWidePx} |`);
  }

  lines.push('');
  lines.push('## 깨짐 사이트 상세');
  lines.push('');
  for (const r of results) {
    const v = verdict(r);
    if (v.sym === 'PASS' || v.sym === 'SKIP') continue;
    lines.push(`### ${r.slug} (${v.sym})`);
    for (const [vp, m] of Object.entries(r.viewports)) {
      if (!m) continue;
      if (m.error) { lines.push(`- ${vp}: ERROR — ${m.error}`); continue; }
      const issues = [];
      if (m.horizOverflow)      issues.push(`가로오버 +${m.overflowPx}px (scroll ${m.scrollW} vs client ${m.clientW})`);
      if (m.potentialOverflow)  issues.push(`잠재 가로오버 +${m.potentialOverflowPx}px (clipped=${m.overflowClipped}, ${m.offenderCount}개 자식 viewport 밖)`);
      if (m.smallTouch > 0)     issues.push(`터치영역<44px ${m.smallTouch}/${m.interactiveCount}`);
      if (m.smallFontInputs > 0) issues.push(`입력폰트<16px ${m.smallFontInputs}/${m.inputCount}`);
      if (m.bigFixed > 0)        issues.push(`fixed/sticky가 viewport 30%↑ ${m.bigFixed}개`);
      if (issues.length === 0) continue;
      lines.push(`- **${vp}**: ${issues.join(' | ')}`);
      if (m.overflowOffenders && m.overflowOffenders.length) {
        for (const o of m.overflowOffenders.slice(0, 3)) {
          lines.push(`  - overflow offender: \`${o.tag}${o.id?'#'+o.id:''}${o.cls?'.'+o.cls.replace(/\s+/g,'.'):''}\` right=${o.right}px width=${o.width}px`);
        }
      }
      if (m.smallTouchSamples && m.smallTouchSamples.length) {
        for (const s of m.smallTouchSamples.slice(0, 2)) {
          lines.push(`  - small touch: \`${s.tag}\` ${s.w}x${s.h} "${s.text}"`);
        }
      }
      if (m.bigFixedSamples && m.bigFixedSamples.length) {
        for (const s of m.bigFixedSamples) {
          lines.push(`  - big fixed: \`${s.tag}.${s.cls}\` (${s.pos}) covers ${s.cover}%`);
        }
      }
    }
    lines.push('');
  }

  // patterns
  lines.push('## 공통 패턴 (6개 사이트 누적)');
  lines.push('');
  const counts = {
    horizOverflow: 0, potentialOverflow: 0, smallTouch: 0, smallInput: 0, bigFixed: 0,
    no100svhDvh: 0, manyVw: 0, inlineWidth: 0, missingViewport: 0,
    weakMediaQ: 0, clippedRoot: 0,
  };
  let totalSites = 0;
  for (const r of results) {
    if (r.skipped) continue;
    totalSites++;
    const anyOver  = Object.values(r.viewports).some(m => m && !m.error && m.horizOverflow);
    const anyPot   = Object.values(r.viewports).some(m => m && !m.error && m.potentialOverflow && m.potentialOverflowPx > 50);
    const anyClip  = Object.values(r.viewports).some(m => m && !m.error && m.overflowClipped);
    const anyTouch = Object.values(r.viewports).some(m => m && !m.error && m.smallTouch > 5);
    const anyInput = Object.values(r.viewports).some(m => m && !m.error && m.smallFontInputs > 0);
    const anyFixed = Object.values(r.viewports).some(m => m && !m.error && m.bigFixed > 0);
    if (anyOver)  counts.horizOverflow++;
    if (anyPot)   counts.potentialOverflow++;
    if (anyClip)  counts.clippedRoot++;
    if (anyTouch) counts.smallTouch++;
    if (anyInput) counts.smallInput++;
    if (anyFixed) counts.bigFixed++;
    const s = r.static;
    if (s.use100vh > 0 && (s.use100svh + s.use100dvh) === 0) counts.no100svhDvh++;
    if (s.useVw > 30) counts.manyVw++;
    if (s.inlineWidePx > 0) counts.inlineWidth++;
    if (!s.viewportMeta) counts.missingViewport++;
    if (s.mediaQueries < 3) counts.weakMediaQ++;
  }
  const items = [
    ['가로 스크롤 실측 발생 (root scrollWidth > clientWidth)', counts.horizOverflow],
    ['잠재 가로오버 (overflow:hidden 으로 가렸지만 자식이 viewport 밖)', counts.potentialOverflow],
    ['root/body 에 overflow-x:hidden 적용 (clipping 패턴 — false-negative 위험)', counts.clippedRoot],
    ['터치영역 44px 미달 5개 초과', counts.smallTouch],
    ['<input> 폰트 16px 미만 (iOS 자동확대 트리거)', counts.smallInput],
    ['fixed/sticky 요소가 viewport 30%↑ 가림', counts.bigFixed],
    ['100vh 사용하면서 svh/dvh 미사용 (모바일 주소창 잘림)', counts.no100svhDvh],
    ['vw 단위 30회 초과 (확대 시 깨짐)', counts.manyVw],
    ['style="width:NNNpx" 인라인 (가로 오버플로 주범)', counts.inlineWidth],
    ['<meta viewport> 누락', counts.missingViewport],
    ['@media 쿼리 3개 미만 (반응형 빈약)', counts.weakMediaQ],
  ];
  for (const [label, n] of items) {
    if (n > 0) lines.push(`- **${n}/${totalSites}** — ${label}`);
  }

  lines.push('');
  lines.push('## 즉시 패치 우선순위');
  lines.push('');
  lines.push('### P0 — 사용 불가 수준 (즉시 수정)');
  for (const r of results) {
    if (r.skipped) continue;
    const overflow = Object.entries(r.viewports).filter(([_,m]) => m && !m.error && m.horizOverflow);
    if (overflow.length > 0) {
      lines.push(`- **${r.slug}**: ${overflow.length}개 viewport 실제 가로 스크롤 → offender max-width:100% 처리`);
    }
    const potential = Object.entries(r.viewports).filter(([_,m]) => m && !m.error && m.potentialOverflow && m.potentialOverflowPx > 50);
    if (potential.length > 0) {
      const sample = potential[0][1].overflowOffenders[0];
      const sampleStr = sample ? ` (예: \`${sample.tag}.${(sample.cls||'').split(/\s+/)[0]||''}\` width=${sample.width}px)` : '';
      lines.push(`- **${r.slug}**: ${potential.length}개 viewport 잠재 가로오버 — overflow:hidden 으로 가려졌을 뿐 자식이 viewport 밖${sampleStr}. 회전·줌·iOS 모멘텀스크롤·접근성확대에서 깨짐.`);
    }
  }
  lines.push('');
  lines.push('### P1 — 사용성 저해 (이번 주)');
  for (const r of results) {
    if (r.skipped) continue;
    const m430 = r.viewports.vp_430;
    if (m430 && !m430.error) {
      if (m430.smallTouch > 5) lines.push(`- **${r.slug}**: 터치영역 ${m430.smallTouch}개가 44px 미만 → padding 확보`);
      if (m430.bigFixed > 0)   lines.push(`- **${r.slug}**: fixed/sticky가 화면 가림 → backdrop-filter 또는 z-index/높이 점검`);
    }
  }
  lines.push('');
  lines.push('### P2 — 품질 향상');
  for (const r of results) {
    if (r.skipped || !r.static) continue;
    const s = r.static;
    if (s.use100vh > 0 && (s.use100svh + s.use100dvh) === 0)
      lines.push(`- **${r.slug}**: 100vh ${s.use100vh}회 사용 → 100svh/100dvh로 교체`);
    if (s.inlineWidePx > 0)
      lines.push(`- **${r.slug}**: inline width:NNNpx ${s.inlineWidePx}회 → max-width 패턴`);
  }

  lines.push('');
  lines.push('## 스킵된 사이트');
  for (const r of results) if (r.skipped) lines.push(`- **${r.slug}**: ${r.reason} — ${r.note || ''}`);

  return lines.join('\n');
}

// ------- main -------
(async () => {
  console.log(`[mobile-audit] start. capture=${CAPTURE}`);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const site of SITES) {
    const t0 = Date.now();
    process.stdout.write(`  - ${site.slug} ... `);
    try {
      const r = await auditSite(browser, site);
      results.push(r);
      console.log(`done (${Date.now() - t0}ms)`);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      results.push({ slug: site.slug, name: site.name, error: String(e).slice(0, 200) });
    }
  }
  await browser.close();

  fs.writeFileSync(JSON_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), capture: CAPTURE, results }, null, 2));
  fs.writeFileSync(MD_PATH, buildMd(results));

  console.log(`\nJSON -> ${JSON_PATH}`);
  console.log(`MD   -> ${MD_PATH}`);
  if (CAPTURE) console.log(`PNG  -> ${SHOT_DIR}`);
})();
