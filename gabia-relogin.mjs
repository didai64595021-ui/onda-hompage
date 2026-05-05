import { chromium } from 'playwright';
import fs from 'fs';

const ID = process.env.GABIA_ID;
const PW = process.env.GABIA_PW;
const GKEY = fs.readFileSync('/tmp/gkey2.txt', 'utf8').trim();

async function solveCaptcha(p) {
  const img = fs.readFileSync(p).toString('base64');
  const body = { contents: [{ parts: [
    { text: '이 이미지에 보이는 숫자만 출력. 4~5자리. 숫자 외 금지.' },
    { inline_data: { mime_type: 'image/png', data: img } }
  ]}] };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)});
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().replace(/[^0-9]/g, '');
}

const browser = await chromium.launch({ headless: true, args:['--disable-dev-shm-usage','--no-sandbox'] });
const ctx = await browser.newContext({ viewport:{width:1280,height:800}, locale:'ko-KR', userAgent:'Mozilla/5.0 Chrome/120' });
const page = await ctx.newPage();

await page.goto('https://accounts.gabia.com/login', { waitUntil:'networkidle', timeout:30000 }).catch(()=>{});
await page.waitForTimeout(2000);

await page.locator('input[placeholder="아이디"]').fill(ID);
await page.locator('input[placeholder="비밀번호"]').fill(PW);

const cap = page.locator('img[src*="captcha"]').first();
await cap.waitFor({ timeout: 5000 });
await cap.screenshot({ path: '/tmp/captcha.png' });
const code = await solveCaptcha('/tmp/captcha.png');
console.log('captcha:', code);
if (!/^\d{3,7}$/.test(code)) { console.log('bad captcha'); process.exit(1); }
await page.locator('input[placeholder="보안 문자 입력"]').fill(code);
await page.locator('button:has-text("로그인")').first().click();
await page.waitForTimeout(5000);
console.log('logged in url:', page.url());
await ctx.storageState({ path:'/tmp/gabia-state.json' });
console.log('state saved');

await browser.close();
