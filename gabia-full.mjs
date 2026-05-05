import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';

const ID = process.env.GABIA_ID;
const PW = process.env.GABIA_PW;
const GKEY = fs.readFileSync('/tmp/gkey2.txt', 'utf8').trim();

async function solveCaptcha(pngPath) {
  const img = fs.readFileSync(pngPath).toString('base64');
  const body = { contents: [{ parts: [
    { text: '이 이미지에 보이는 4자리 숫자만 정확히 출력. 숫자 4개 외에 아무것도 출력 금지.' },
    { inline_data: { mime_type: 'image/png', data: img } }
  ]}] };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`, {
    method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
  });
  const j = await r.json();
  const t = (j.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().replace(/[^0-9]/g, '');
  return t;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport:{width:1280,height:800}, locale:'ko-KR', userAgent:'Mozilla/5.0 Chrome/120' });
const page = await ctx.newPage();

console.log('1. login page');
await page.goto('https://accounts.gabia.com/login', { waitUntil:'networkidle', timeout:30000 }).catch(()=>{});
await page.waitForTimeout(2000);

// 입력
await page.locator('input[placeholder="아이디"]').fill(ID);
await page.locator('input[placeholder="비밀번호"]').fill(PW);

// 캡차 풀이 (최대 4회 재시도)
let loggedIn = false;
for (let i=0; i<4 && !loggedIn; i++) {
  const cap = page.locator('img[src*="captcha"]').first();
  await cap.waitFor({ timeout: 5000 }).catch(()=>{});
  await cap.screenshot({ path: '/tmp/captcha.png' });
  const code = await solveCaptcha('/tmp/captcha.png');
  console.log(`  attempt ${i+1} captcha:`, JSON.stringify(code));
  if (!/^\d{4}$/.test(code)) {
    // 새 캡차 요청 (이미지 클릭 또는 새로고침)
    await cap.click().catch(()=>{});
    await page.waitForTimeout(800);
    continue;
  }
  await page.locator('input[placeholder="보안 문자 입력"]').fill(code);
  await page.locator('button:has-text("로그인")').first().click().catch(()=>{});
  await page.waitForTimeout(3500);
  
  const url = page.url();
  console.log('  after submit url:', url);
  if (!url.includes('/login') && !url.includes('accounts.gabia')) {
    loggedIn = true; break;
  }
  // 로그인 실패: 에러 메시지 확인
  const errs = await page.locator('[class*="error"], [class*="Error"], [class*="alert"]').allTextContents().catch(()=>[]);
  console.log('  errs:', errs.filter(t=>t.trim()).slice(0,3));
  // 다시 입력
  await page.locator('input[placeholder="아이디"]').fill(ID).catch(()=>{});
  await page.locator('input[placeholder="비밀번호"]').fill(PW).catch(()=>{});
}

if (!loggedIn) {
  console.log('LOGIN FAILED after 4 retries');
  await page.screenshot({ path:'/tmp/gabia-fail.png' });
  process.exit(1);
}

console.log('2. logged in:', page.url());
await ctx.storageState({ path:'/tmp/gabia-state.json' });
console.log('  state saved');

// 도메인 관리 페이지로
console.log('3. domain mgr');
await page.goto('https://my.gabia.com/service#/domain', { waitUntil:'domcontentloaded', timeout:20000 }).catch(()=>{});
await page.waitForTimeout(3000);
console.log('  domain mgr url:', page.url(), 'title:', await page.title());

await page.screenshot({ path:'/tmp/gabia-dash.png', fullPage:true });
console.log('  dashboard screenshot saved');

// 도메인명으로 vietnamcoco.com 찾기
const txt = await page.content();
console.log('  contains vietnamcoco:', txt.includes('vietnamcoco'));

await browser.close();
