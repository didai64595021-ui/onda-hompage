#!/usr/bin/env node
/**
 * 리뷰 서비스 4상품 썸네일 생성
 * - Playwright HTML → screenshot (652x488, 크몽 권장)
 * - 텔레그램 전송
 */
require('dotenv').config({ path: __dirname + '/../.env' });
require('dotenv').config({ path: '/home/onda/.env' });

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = path.join(__dirname, '03-images');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const PRODUCTS = [
  {
    id: 'R01',
    file: 'R01-receipt-review.png',
    html: `
    <div style="width:652px;height:488px;background:linear-gradient(135deg,#1a237e 0%,#0d47a1 50%,#01579b 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Noto Sans KR',sans-serif;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22none%22 stroke=%22rgba(255,255,255,0.05)%22 stroke-width=%221%22/></svg>') repeat;"></div>
      <div style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.15);padding:6px 14px;border-radius:20px;font-size:13px;color:#fff;">사진+텍스트 풀소재</div>
      <div style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:16px;padding:30px 40px;text-align:center;backdrop-filter:blur(10px);max-width:90%;">
        <div style="font-size:16px;color:#90caf9;margin-bottom:8px;letter-spacing:2px;">N E I V E R &nbsp; M A P &nbsp; R E V I E W</div>
        <div style="font-size:42px;font-weight:900;color:#fff;line-height:1.2;text-shadow:0 2px 8px rgba(0,0,0,0.3);">영수증리뷰</div>
        <div style="font-size:22px;color:#e3f2fd;margin-top:6px;font-weight:500;">사진 촬영 + 텍스트 후기 원스톱</div>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:20px;">
          <div style="background:#ff6f00;color:#fff;padding:8px 16px;border-radius:8px;font-size:15px;font-weight:700;">5건 24,000원</div>
          <div style="background:#2e7d32;color:#fff;padding:8px 16px;border-radius:8px;font-size:15px;font-weight:700;">시장가 30% ↓</div>
        </div>
      </div>
      <div style="position:absolute;bottom:16px;display:flex;gap:16px;font-size:13px;color:rgba(255,255,255,0.7);">
        <span>📸 현장사진</span><span>📝 텍스트후기</span><span>🛡 블라인드방지</span><span>📊 분산등록</span>
      </div>
    </div>`
  },
  {
    id: 'R02',
    file: 'R02-receipt-premium.png',
    html: `
    <div style="width:652px;height:488px;background:linear-gradient(135deg,#311b92 0%,#4a148c 50%,#880e4f 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Noto Sans KR',sans-serif;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><polygon points=%22100,10 40,180 160,180%22 fill=%22none%22 stroke=%22rgba(255,255,255,0.04)%22 stroke-width=%221%22/></svg>') repeat;"></div>
      <div style="position:absolute;top:20px;left:20px;background:linear-gradient(90deg,#ffab00,#ff6d00);padding:6px 16px;border-radius:20px;font-size:13px;color:#fff;font-weight:700;">PREMIUM PACKAGE</div>
      <div style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.15);padding:6px 14px;border-radius:20px;font-size:13px;color:#fff;">영수증+예약자</div>
      <div style="text-align:center;max-width:90%;">
        <div style="font-size:16px;color:#ce93d8;margin-bottom:8px;letter-spacing:3px;">B U L K &nbsp; R E V I E W</div>
        <div style="font-size:38px;font-weight:900;color:#fff;line-height:1.2;">대량 영수증리뷰</div>
        <div style="font-size:24px;color:#f8bbd0;margin-top:4px;font-weight:600;">30~100건 풀커버 패키지</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap;">
          <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);padding:10px 18px;border-radius:10px;text-align:center;">
            <div style="font-size:13px;color:#ce93d8;">30건</div>
            <div style="font-size:18px;color:#fff;font-weight:800;">105,000원</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);padding:10px 18px;border-radius:10px;text-align:center;">
            <div style="font-size:13px;color:#ce93d8;">50건</div>
            <div style="font-size:18px;color:#fff;font-weight:800;">160,000원</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);padding:10px 18px;border-radius:10px;text-align:center;">
            <div style="font-size:13px;color:#ce93d8;">100건</div>
            <div style="font-size:18px;color:#fff;font-weight:800;">290,000원</div>
          </div>
        </div>
        <div style="margin-top:16px;font-size:15px;color:#ffab00;font-weight:700;">타사 대비 최대 58% 절감</div>
      </div>
      <div style="position:absolute;bottom:16px;display:flex;gap:16px;font-size:13px;color:rgba(255,255,255,0.7);">
        <span>📸 사진풀커버</span><span>🏪 멀티매장</span><span>📋 중간보고</span>
      </div>
    </div>`
  },
  {
    id: 'R03',
    file: 'R03-blog-review.png',
    html: `
    <div style="width:652px;height:488px;background:linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 30%,#a5d6a7 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Noto Sans KR',sans-serif;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><rect x=%2225%22 y=%2225%22 width=%2270%22 height=%2270%22 rx=%2210%22 fill=%22none%22 stroke=%22rgba(0,100,0,0.06)%22 stroke-width=%221%22/></svg>') repeat;"></div>
      <div style="position:absolute;top:20px;right:20px;background:#2e7d32;padding:6px 14px;border-radius:20px;font-size:13px;color:#fff;font-weight:600;">NAVER BLOG</div>
      <div style="text-align:center;max-width:90%;">
        <div style="display:inline-block;background:#fff;border-radius:50%;width:60px;height:60px;line-height:60px;font-size:32px;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin-bottom:12px;">📝</div>
        <div style="font-size:40px;font-weight:900;color:#1b5e20;line-height:1.2;">블로그리뷰</div>
        <div style="font-size:20px;color:#2e7d32;margin-top:6px;font-weight:500;">사진 10장 + 1,500자 체험 후기</div>
        <div style="background:#fff;border-radius:12px;padding:16px 24px;margin-top:20px;box-shadow:0 4px 16px rgba(0,0,0,0.08);display:inline-block;">
          <div style="display:flex;gap:24px;align-items:center;">
            <div style="text-align:center;">
              <div style="font-size:13px;color:#666;">1건</div>
              <div style="font-size:22px;color:#1b5e20;font-weight:800;">3,500원</div>
            </div>
            <div style="width:1px;height:36px;background:#e0e0e0;"></div>
            <div style="text-align:center;">
              <div style="font-size:13px;color:#666;">3건</div>
              <div style="font-size:22px;color:#1b5e20;font-weight:800;">9,500원</div>
            </div>
            <div style="width:1px;height:36px;background:#e0e0e0;"></div>
            <div style="text-align:center;">
              <div style="font-size:13px;color:#666;">5건</div>
              <div style="font-size:22px;color:#1b5e20;font-weight:800;">15,000원</div>
            </div>
          </div>
        </div>
        <div style="margin-top:14px;font-size:14px;color:#388e3c;font-weight:600;">시장가 대비 30% 저렴 | 사진+텍스트 풀커버</div>
      </div>
      <div style="position:absolute;bottom:16px;display:flex;gap:16px;font-size:13px;color:#2e7d32;">
        <span>📸 방문촬영</span><span>✍️ 체험후기</span><span>🔍 SEO키워드</span><span>✅ 사전검수</span>
      </div>
    </div>`
  },
  {
    id: 'R04',
    file: 'R04-blog-experience.png',
    html: `
    <div style="width:652px;height:488px;background:linear-gradient(135deg,#fff3e0 0%,#ffe0b2 30%,#ffcc80 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Noto Sans KR',sans-serif;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><circle cx=%2240%22 cy=%2240%22 r=%2235%22 fill=%22none%22 stroke=%22rgba(230,81,0,0.05)%22 stroke-width=%221%22/></svg>') repeat;"></div>
      <div style="position:absolute;top:20px;left:20px;background:#e65100;padding:6px 14px;border-radius:20px;font-size:13px;color:#fff;font-weight:600;">체험단 전문</div>
      <div style="position:absolute;top:20px;right:20px;background:rgba(230,81,0,0.15);padding:6px 14px;border-radius:20px;font-size:13px;color:#bf360c;font-weight:600;">방문형</div>
      <div style="text-align:center;max-width:90%;">
        <div style="font-size:15px;color:#e65100;margin-bottom:6px;letter-spacing:2px;">E X P E R I E N C E &nbsp; T E A M</div>
        <div style="font-size:38px;font-weight:900;color:#bf360c;line-height:1.2;">블로그 체험단</div>
        <div style="font-size:20px;color:#e65100;margin-top:6px;font-weight:500;">사진+글 풀커버 | 블로거 섭외~등록</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:20px;flex-wrap:wrap;">
          <div style="background:#fff;border:2px solid #ff6d00;padding:10px 20px;border-radius:10px;text-align:center;">
            <div style="font-size:13px;color:#e65100;">3명</div>
            <div style="font-size:20px;color:#bf360c;font-weight:800;">10,000원</div>
          </div>
          <div style="background:#fff;border:2px solid #ff6d00;padding:10px 20px;border-radius:10px;text-align:center;">
            <div style="font-size:13px;color:#e65100;">5명</div>
            <div style="font-size:20px;color:#bf360c;font-weight:800;">15,000원</div>
          </div>
          <div style="background:#fff;border:2px solid #ff6d00;padding:10px 20px;border-radius:10px;text-align:center;">
            <div style="font-size:13px;color:#e65100;">10명</div>
            <div style="font-size:20px;color:#bf360c;font-weight:800;">28,000원</div>
          </div>
        </div>
        <div style="margin-top:14px;font-size:14px;color:#e65100;font-weight:600;">기존 체험단 퀄리티 불만? → 사진10장+1,500자 보장</div>
      </div>
      <div style="position:absolute;bottom:16px;display:flex;gap:16px;font-size:13px;color:#bf360c;">
        <span>👥 블로거섭외</span><span>📸 방문촬영</span><span>✍️ 원고작성</span><span>✅ 검수포함</span>
      </div>
    </div>`
  },
];

async function run() {
  console.log('[IMAGE] 리뷰 상품 이미지 생성 시작...');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 652, height: 488 } });

  const results = [];

  for (const product of PRODUCTS) {
    console.log(`\n[${product.id}] ${product.file}...`);

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 652px; height: 488px; overflow: hidden; }
  </style>
</head>
<body>${product.html}</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: 'networkidle' });
    await new Promise(r => setTimeout(r, 1000)); // 폰트 로딩 대기

    const outPath = path.join(OUT_DIR, product.file);
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`  ✓ ${outPath}`);
    results.push(outPath);
  }

  await browser.close();

  // 텔레그램 전송
  console.log('\n[TELEGRAM] 이미지 전송...');
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-4662419871';

  if (!TELEGRAM_BOT_TOKEN) {
    console.log('  ⚠ TELEGRAM_BOT_TOKEN 없음, 텔레그램 전송 건너뜀');
    return;
  }

  for (const imgPath of results) {
    const fileName = path.basename(imgPath);
    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('photo', fs.createReadStream(imgPath));
      form.append('caption', `크몽 리뷰 상품 이미지: ${fileName}`);

      const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      const data = await resp.json();
      console.log(`  ${data.ok ? '✓' : '✗'} ${fileName} → telegram`);
    } catch (e) {
      console.log(`  ✗ ${fileName}: ${e.message}`);
      // fallback: curl
      try {
        const { execSync } = require('child_process');
        execSync(`curl -s -F "chat_id=${TELEGRAM_CHAT_ID}" -F "photo=@${imgPath}" -F "caption=크몽 리뷰 상품: ${fileName}" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto"`, { timeout: 15000 });
        console.log(`  ✓ ${fileName} → telegram (curl fallback)`);
      } catch (e2) {
        console.log(`  ✗ ${fileName} curl도 실패: ${e2.message}`);
      }
    }
  }

  console.log('\n[DONE] 이미지 생성 + 텔레그램 전송 완료');
}

run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
