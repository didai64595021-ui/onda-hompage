/**
 * 모바일 스크린샷 자동 캡처 + 진단 리포트 생성
 * 
 * 사용법:
 *   node screenshot.js                    전체 prospects 스크린샷
 *   node screenshot.js --new              신규만
 *   node screenshot.js --score 60         점수 60 이상만
 *   node screenshot.js --name "업체명"    특정 업체만
 *   node screenshot.js --report "업체명"  진단 리포트 HTML 생성
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
const REPORT_DIR = path.join(OUTPUT_DIR, 'reports');

// ── CSV 파싱 ──
function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8').replace(/^\ufeff/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

// ── 스크린샷 캡처 ──
async function captureScreenshots(url, name) {
  const safeName = name.replace(/[/\\?%*:|"<>]/g, '_');
  const dir = path.join(SCREENSHOT_DIR, safeName);
  fs.mkdirSync(dir, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);

    // 데스크톱 스크린샷
    await page.setViewport({ width: 1920, height: 1080 });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await new Promise(r => setTimeout(r, 2000));
    } catch {}
    await page.screenshot({ path: path.join(dir, 'desktop.png'), fullPage: false }).catch(() => {});

    // 모바일 스크린샷 (iPhone 14)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await new Promise(r => setTimeout(r, 2000));
    } catch {}
    await page.screenshot({ path: path.join(dir, 'mobile.png'), fullPage: false }).catch(() => {});

    // 모바일 풀페이지
    await page.screenshot({ path: path.join(dir, 'mobile-full.png'), fullPage: true }).catch(() => {});

    // 페이지 분석 데이터 수집
    const analysis = await page.evaluate(() => {
      const viewport = document.querySelector('meta[name="viewport"]');
      const forms = document.querySelectorAll('form');
      const telLinks = document.querySelectorAll('a[href^="tel:"]');
      const allLinks = Array.from(document.querySelectorAll('a'));
      const kakaoLinks = allLinks.filter(a => a.href.includes('kakao'));
      const mapIframes = document.querySelectorAll('iframe[src*="map"]');

      // 텍스트 크기 체크 (모바일에서 너무 작은 텍스트)
      const bodyFontSize = window.getComputedStyle(document.body).fontSize;

      // 버튼/링크 크기 체크
      const smallButtons = Array.from(document.querySelectorAll('a, button')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      }).length;

      // 가로 스크롤 체크
      const hasHorizontalScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;

      return {
        hasViewport: !!viewport,
        viewportContent: viewport?.content || '',
        formCount: forms.length,
        telLinkCount: telLinks.length,
        kakaoLinkCount: kakaoLinks.length,
        mapCount: mapIframes.length,
        bodyFontSize,
        smallButtonCount: smallButtons,
        hasHorizontalScroll,
        title: document.title,
        pageHeight: document.documentElement.scrollHeight,
      };
    });

    await browser.close();
    return { success: true, dir, analysis };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return { success: false, error: e.message };
  }
}

// ── 진단 리포트 HTML 생성 ──
function generateReport(prospect, screenshotResult) {
  const p = prospect;
  const a = screenshotResult.analysis || {};
  const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
  const ssDir = path.join(SCREENSHOT_DIR, safeName);

  const problems = (p['발견된문제'] || '').split(' / ').filter(x => x);
  const score = parseInt(p['우선순위점수'] || '0');

  // 점수 색상
  const scoreColor = score >= 60 ? '#e74c3c' : score >= 30 ? '#f39c12' : '#27ae60';
  const scoreLabel = score >= 60 ? '긴급 개선 필요' : score >= 30 ? '개선 권장' : '경미';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p['업체명']} - 모바일 홈페이지 진단 리포트</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Pretendard', -apple-system, sans-serif; background:#f5f5f5; color:#333; }
  .container { max-width:800px; margin:0 auto; padding:24px; }
  .header { background:linear-gradient(135deg, #667eea, #764ba2); color:white; padding:40px 32px; border-radius:16px; margin-bottom:24px; }
  .header h1 { font-size:24px; margin-bottom:8px; }
  .header p { opacity:0.9; font-size:14px; }
  .card { background:white; border-radius:12px; padding:24px; margin-bottom:16px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
  .card h2 { font-size:18px; margin-bottom:16px; color:#333; border-bottom:2px solid #eee; padding-bottom:8px; }
  .score-badge { display:inline-block; background:${scoreColor}; color:white; padding:8px 20px; border-radius:20px; font-size:20px; font-weight:bold; }
  .score-label { color:${scoreColor}; font-weight:bold; margin-left:12px; }
  .problem-list { list-style:none; }
  .problem-list li { padding:10px 16px; margin:6px 0; background:#fff3f3; border-left:4px solid #e74c3c; border-radius:4px; }
  .problem-list li.ok { background:#f0fff4; border-left-color:#27ae60; }
  .screenshots { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .screenshots img { width:100%; border-radius:8px; border:1px solid #ddd; }
  .screenshots .label { text-align:center; font-size:13px; color:#666; margin-top:4px; }
  .package-box { background:linear-gradient(135deg, #667eea22, #764ba222); border:2px solid #667eea; border-radius:12px; padding:20px; text-align:center; }
  .package-box h3 { color:#667eea; font-size:22px; margin-bottom:4px; }
  .package-box .price { font-size:28px; font-weight:bold; color:#333; }
  .checklist { list-style:none; }
  .checklist li { padding:6px 0; }
  .checklist li::before { content:'✅ '; }
  .checklist li.fail::before { content:'❌ '; }
  .cta { background:#667eea; color:white; text-align:center; padding:20px; border-radius:12px; margin-top:24px; }
  .cta h3 { font-size:20px; margin-bottom:8px; }
  .cta p { opacity:0.9; }
  .footer { text-align:center; color:#999; font-size:12px; padding:20px; }
  @media (max-width:600px) { .screenshots { grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📋 ${p['업체명']}</h1>
    <p>모바일 홈페이지 무료 진단 리포트 | ${new Date().toISOString().slice(0, 10)}</p>
  </div>

  <div class="card">
    <h2>🎯 종합 진단 점수</h2>
    <div style="display:flex;align-items:center;gap:12px;">
      <span class="score-badge">${score}점</span>
      <span class="score-label">${scoreLabel}</span>
    </div>
    <p style="margin-top:12px;color:#666;">100점에 가까울수록 개선이 시급합니다.</p>
  </div>

  <div class="card">
    <h2>⚠️ 발견된 문제</h2>
    <ul class="problem-list">
      ${problems.map(prob => `<li>${prob}</li>`).join('\n      ')}
      ${p['반응형'] === 'Y' ? '<li class="ok">✅ 반응형 대응 완료</li>' : ''}
    </ul>
  </div>

  <div class="card">
    <h2>📱 현재 사이트 스크린샷</h2>
    <div class="screenshots">
      <div>
        ${fs.existsSync(path.join(ssDir, 'desktop.png')) ? `<img src="../screenshots/${safeName}/desktop.png" alt="데스크톱">` : '<p>캡처 없음</p>'}
        <div class="label">💻 데스크톱 화면</div>
      </div>
      <div>
        ${fs.existsSync(path.join(ssDir, 'mobile.png')) ? `<img src="../screenshots/${safeName}/mobile.png" alt="모바일">` : '<p>캡처 없음</p>'}
        <div class="label">📱 모바일 화면</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>✅ 체크리스트</h2>
    <ul class="checklist">
      <li class="${p['반응형'] === 'Y' ? '' : 'fail'}">모바일 반응형 대응</li>
      <li class="${problems.includes('전화버튼 없음') ? 'fail' : ''}">클릭 전화 연결 버튼</li>
      <li class="${problems.includes('카톡버튼 없음') ? 'fail' : ''}">카카오톡 상담 버튼</li>
      <li class="${problems.includes('문의폼 없음') ? 'fail' : ''}">온라인 문의 폼</li>
      <li class="${problems.includes('지도 없음') ? 'fail' : ''}">오시는 길 지도</li>
      <li class="${(problems.find(x => x.includes('로딩느림'))) ? 'fail' : ''}">페이지 로딩 속도 3초 이내</li>
    </ul>
  </div>

  <div class="card">
    <h2>📦 추천 솔루션</h2>
    <div class="package-box">
      <h3>${p['추천패키지']?.split('(')[0]?.trim() || '스타터팩'}</h3>
      <div class="price">${p['추천패키지']?.match(/\(([^)]+)\)/)?.[1] || '10~12만원'}</div>
      <p style="margin-top:8px;color:#666;">24~48시간 내 작업 완료 | 전후 비교 시안 무료 제공</p>
    </div>
  </div>

  <div class="cta">
    <h3>지금 바로 개선하기</h3>
    <p>전화: 010-XXXX-XXXX | 카카오톡: XXXXX</p>
    <p style="margin-top:4px;font-size:13px;">전후 비교 시안 무료 제공 🎁</p>
  </div>

  <div class="footer">
    <p>본 리포트는 자동화 도구를 통해 생성되었습니다. | © 온다마케팅</p>
  </div>
</div>
</body>
</html>`;

  const reportPath = path.join(REPORT_DIR, `${safeName}.html`);
  fs.writeFileSync(reportPath, html, 'utf8');
  return reportPath;
}

// ── 메인 ──
async function main() {
  const args = process.argv.slice(2);
  
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const csvPath = path.join(OUTPUT_DIR, 'prospects.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('❌ prospects.csv 없음. 먼저 node crawl.js 실행');
    return;
  }

  let prospects = parseCSV(csvPath);

  // 필터
  if (args.includes('--new')) prospects = prospects.filter(p => p['신규여부'] === 'Y');
  const scoreIdx = args.indexOf('--score');
  if (scoreIdx !== -1) {
    const min = parseInt(args[scoreIdx + 1] || '0');
    prospects = prospects.filter(p => parseInt(p['우선순위점수'] || '0') >= min);
  }
  const nameIdx = args.indexOf('--name');
  if (nameIdx !== -1) {
    const name = args[nameIdx + 1];
    prospects = prospects.filter(p => p['업체명']?.includes(name));
  }

  // 리포트만 생성
  const reportIdx = args.indexOf('--report');
  if (reportIdx !== -1) {
    const name = args[reportIdx + 1];
    const p = prospects.find(x => x['업체명']?.includes(name));
    if (!p) { console.log(`❌ "${name}" 못 찾음`); return; }
    
    console.log(`📸 ${p['업체명']} 스크린샷 캡처 중...`);
    const ssResult = await captureScreenshots(p['홈페이지'], p['업체명']);
    
    console.log(`📋 진단 리포트 생성 중...`);
    const reportPath = generateReport(p, ssResult);
    console.log(`✅ 리포트 저장: ${reportPath}`);
    return;
  }

  console.log(`📸 스크린샷 캡처 시작: ${prospects.length}건\n`);

  let done = 0, fail = 0;
  for (const p of prospects) {
    if (!p['홈페이지']) continue;
    
    const safeName = p['업체명'].replace(/[/\\?%*:|"<>]/g, '_');
    const existing = path.join(SCREENSHOT_DIR, safeName, 'mobile.png');
    if (fs.existsSync(existing) && !args.includes('--force')) {
      console.log(`  ⏭️  ${p['업체명']} (이미 캡처됨)`);
      continue;
    }

    console.log(`  📸 ${p['업체명']} → ${p['홈페이지']}`);
    const result = await captureScreenshots(p['홈페이지'], p['업체명']);
    
    if (result.success) {
      done++;
      // 리포트도 같이 생성
      generateReport(p, result);
      console.log(`     ✅ 캡처 완료 + 리포트 생성`);
    } else {
      fail++;
      console.log(`     ❌ 실패: ${result.error}`);
    }
  }

  console.log(`\n📊 결과: 성공 ${done}, 실패 ${fail}`);
  console.log(`📁 스크린샷: ${SCREENSHOT_DIR}`);
  console.log(`📁 리포트: ${REPORT_DIR}`);
}

main().catch(e => console.error('❌ 에러:', e));
