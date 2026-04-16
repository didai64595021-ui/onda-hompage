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
  const lines = ['[고객 메시지 내 URL 분석]'];
  for (const s of ok) {
    lines.push(`\n▼ ${s.url} (source=${s.source})`);
    if (s.title) lines.push(`  title: ${s.title}`);
    if (s.siteName && s.siteName !== s.title) lines.push(`  site: ${s.siteName}`);
    if (s.description) lines.push(`  description: ${s.description.slice(0, 300)}`);
    if (s.headings?.length) lines.push(`  headings: ${s.headings.slice(0, 6).join(' | ')}`);
    if (s.bodyText) lines.push(`  body: ${s.bodyText.slice(0, 900)}`);
  }
  return lines.join('\n');
}

module.exports = { extractUrls, summarizeUrl, formatForPrompt };
