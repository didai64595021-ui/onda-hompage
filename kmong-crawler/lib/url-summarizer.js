/**
 * 고객 문의 메시지의 URL 파악 헬퍼
 *  - 메시지에서 URL 추출
 *  - 1단계: https.get으로 HTML 수신 → meta/title/텍스트 추출 (가벼움)
 *  - 2단계: 본문 너무 짧으면 (SPA 의심) Playwright로 렌더링된 페이지 fetch
 *  - Claude 프롬프트에 주입할 요약 반환
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const TIMEOUT_MS = 8000;
const MAX_BYTES = 800 * 1024;  // 800KB 상한
const MIN_TEXT_FOR_OK = 200;   // 본문 200자 미만이면 SPA 의심

function extractUrls(text) {
  if (!text) return [];
  // http/https URL만, 끝 구두점 제거
  const re = /https?:\/\/[^\s"<>]+/g;
  const raw = text.match(re) || [];
  const urls = raw.map(u => u.replace(/[.,!?)\]]+$/, '')).filter(u => {
    try {
      const p = new URL(u);
      if (!['http:', 'https:'].includes(p.protocol)) return false;
      // 내부망/로컬 IP 차단
      const host = p.hostname;
      if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
      if (host === 'localhost') return false;
      return true;
    } catch { return false; }
  });
  return [...new Set(urls)].slice(0, 3);  // 최대 3개
}

function fetchHtml(url) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    let mod;
    try {
      mod = new URL(url).protocol === 'https:' ? https : http;
    } catch { return done({ ok: false, error: 'invalid URL' }); }

    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ONDA-InquiryBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      // 리다이렉트
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.destroy();
        try {
          const next = new URL(res.headers.location, url).toString();
          return fetchHtml(next).then(done);
        } catch { return done({ ok: false, error: 'bad redirect' }); }
      }
      if (res.statusCode !== 200) { res.destroy(); return done({ ok: false, error: `HTTP ${res.statusCode}` }); }
      const ct = res.headers['content-type'] || '';
      if (!/text\/html|application\/xhtml/i.test(ct)) { res.destroy(); return done({ ok: false, error: `non-html ${ct}` }); }

      let total = 0;
      const chunks = [];
      res.on('data', (c) => {
        total += c.length;
        if (total > MAX_BYTES) { res.destroy(); return done({ ok: true, html: Buffer.concat(chunks).toString('utf-8'), truncated: true }); }
        chunks.push(c);
      });
      res.on('end', () => done({ ok: true, html: Buffer.concat(chunks).toString('utf-8'), truncated: false }));
      res.on('error', (e) => done({ ok: false, error: e.message }));
    });
    req.on('error', (e) => done({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); done({ ok: false, error: 'timeout' }); });
  });
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// 기술 스택 감지 — 고객 사이트가 빌더인지 순수 HTML인지 파악
//  이유: "기존 구조 유지 디자인 개선" 요청이 왔을 때 빌더(워드프레스/카페24 등)면
//        우리 코딩 HTML 방식과 호환성 이슈가 있으니 답변이 달라져야 함
function detectTech(html) {
  if (!html) return { platforms: [], builder: null, signals: [] };
  const signals = [];
  const platforms = [];
  const push = (name) => { if (!platforms.includes(name)) platforms.push(name); };

  // generator meta
  const genMatches = [...html.matchAll(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/gi)];
  for (const g of genMatches) signals.push(`generator: ${g[1]}`);

  if (/\/wp-content\/|\/wp-json\/|<meta[^>]+content=["']WordPress/i.test(html)) push('WordPress');
  if (/elementor|Elementor/.test(html)) push('Elementor');
  if (/kadence/i.test(html)) push('Kadence');
  if (/\/cafe24|ga\.cafe24\.com|skin-custom|EC\/domain/i.test(html)) push('Cafe24');
  if (/imweb|static\.imweb\.me|cdn\.imweb/i.test(html)) push('아임웹');
  if (/modoo\.at|naver-modoo/i.test(html)) push('모두(Naver)');
  if (/wix\.com|parastorage\.com|wixstatic/i.test(html)) push('Wix');
  if (/squarespace/i.test(html)) push('Squarespace');
  if (/webflow\.com|website-files\.com/i.test(html)) push('Webflow');
  if (/cdn\.shopify\.com|myshopify\.com/i.test(html)) push('Shopify');
  if (/framer\.com|framer-motion/i.test(html)) push('Framer');
  if (/_next\/static|__NEXT_DATA__/.test(html)) push('Next.js');
  if (/gatsby-/i.test(html)) push('Gatsby');
  if (/godo\.co\.kr|gd_admin/i.test(html)) push('고도몰');

  // 빌더 vs 순수 HTML 판정
  const builderSet = ['WordPress', 'Cafe24', '아임웹', '모두(Naver)', 'Wix', 'Squarespace', 'Webflow', 'Shopify', 'Framer', '고도몰'];
  const builder = platforms.find(p => builderSet.includes(p)) || null;
  const isPureHtml = platforms.length === 0;

  return { platforms, builder, isPureHtml, signals };
}

function parseHtml(html) {
  if (!html) return null;
  const grabMeta = (nameRe) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nameRe}["'][^>]+content=["']([^"']+)["']`, 'i'))
         || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameRe}["']`, 'i'));
    return m ? decodeEntities(m[1]) : null;
  };
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const description = grabMeta('description') || grabMeta('og:description');
  const ogTitle = grabMeta('og:title');
  const ogSiteName = grabMeta('og:site_name');

  // 본문 텍스트: script/style 제거 → 태그 제거 → 공백 정리
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
  let bodyText = '';
  if (bodyMatch) {
    bodyText = bodyMatch[0]
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    bodyText = decodeEntities(bodyText);
  }

  // 헤딩 (h1/h2) 추출 — 브랜드/메뉴 파악에 유용
  const headings = [];
  const hRe = /<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi;
  let hm;
  while ((hm = hRe.exec(html)) && headings.length < 10) {
    const t = decodeEntities(hm[2].replace(/<[^>]+>/g, '').trim());
    if (t) headings.push(t);
  }

  return {
    title: title ? decodeEntities(title).trim() : null,
    ogTitle,
    siteName: ogSiteName,
    description,
    headings,
    bodyText: bodyText.slice(0, 2000),
    bodyLen: bodyText.length,
    tech: detectTech(html),
  };
}

async function fetchViaPlaywright(url) {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (compatible; ONDA-InquiryBot/1.0)' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    const html = await page.content();
    await browser.close();
    return { ok: true, html, truncated: false, rendered: true };
  } catch (e) {
    return { ok: false, error: `playwright: ${e.message}` };
  }
}

async function summarizeUrl(url, { allowPlaywrightFallback = true } = {}) {
  const r1 = await fetchHtml(url);
  if (!r1.ok) {
    if (allowPlaywrightFallback) {
      const r2 = await fetchViaPlaywright(url);
      if (r2.ok) {
        const p = parseHtml(r2.html);
        return { ok: true, url, ...p, source: 'playwright' };
      }
      return { ok: false, url, error: r1.error + ' / ' + r2.error };
    }
    return { ok: false, url, error: r1.error };
  }
  const p1 = parseHtml(r1.html);
  if (p1 && p1.bodyLen >= MIN_TEXT_FOR_OK) {
    return { ok: true, url, ...p1, source: 'https' };
  }
  // 본문 짧음 → SPA 의심 → Playwright fallback
  if (allowPlaywrightFallback) {
    const r2 = await fetchViaPlaywright(url);
    if (r2.ok) {
      const p2 = parseHtml(r2.html);
      if (p2) return { ok: true, url, ...p2, source: 'playwright' };
    }
  }
  return { ok: true, url, ...p1, source: 'https-thin' };
}

function formatForPrompt(summaries) {
  const ok = summaries.filter(s => s && s.ok);
  if (ok.length === 0) return '';
  // ⚠️ 이 URL들은 고객이 공유한 것 — 우리 작업물이 아님. "저희 포트폴리오" 주장 금지.
  const lines = ['[고객이 공유한 URL 분석 — 고객 제공 참고자료. 우리 작업물 아님. "저희가 작업한 곳" 주장 절대 금지]'];
  for (const s of ok) {
    lines.push(`\n▼ ${s.url} (source=${s.source})`);
    if (s.title) lines.push(`  title: ${s.title}`);
    if (s.siteName && s.siteName !== s.title) lines.push(`  site: ${s.siteName}`);
    if (s.description) lines.push(`  description: ${s.description.slice(0, 300)}`);
    if (s.tech) {
      if (s.tech.platforms?.length) {
        lines.push(`  tech stack: ${s.tech.platforms.join(' + ')}${s.tech.builder ? ` (빌더: ${s.tech.builder})` : ''}`);
      } else if (s.tech.isPureHtml) {
        lines.push(`  tech stack: 순수 HTML/CSS (빌더 흔적 없음)`);
      }
      if (s.tech.signals?.length) lines.push(`  tech signals: ${s.tech.signals.slice(0, 3).join(' | ')}`);
    }
    if (s.headings?.length) lines.push(`  headings: ${s.headings.slice(0, 6).join(' | ')}`);
    if (s.bodyText) lines.push(`  body: ${s.bodyText.slice(0, 900)}`);
  }
  return lines.join('\n');
}

module.exports = { extractUrls, summarizeUrl, formatForPrompt };
