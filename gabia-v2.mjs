import { chromium } from 'playwright';
import fs from 'fs';

const ID = process.env.GABIA_ID;
const PW = process.env.GABIA_PW;
const GKEY = fs.readFileSync('/tmp/gkey2.txt', 'utf8').trim();

async function solveCaptcha(pngPath) {
  const img = fs.readFileSync(pngPath).toString('base64');
  const body = { contents: [{ parts: [
    { text: '이 이미지에 보이는 숫자들만 정확히 출력. 4자리 또는 5자리 숫자. 숫자 외에는 아무것도 출력 금지.' },
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

await page.goto('https://accounts.gabia.com/login', { waitUntil:'networkidle' }).catch(()=>{});
await page.waitForTimeout(2500);

await page.locator('input[placeholder="아이디"]').fill(ID);
await page.locator('input[placeholder="비밀번호"]').fill(PW);

// 캡차
const cap = page.locator('img[src*="captcha"]').first();
await cap.waitFor({ timeout: 5000 });
await cap.screenshot({ path: '/tmp/captcha.png' });
const code = await solveCaptcha('/tmp/captcha.png');
console.log('captcha code:', JSON.stringify(code), 'length:', code.length);

if (!/^\d{3,7}$/.test(code)) {
  console.log('invalid captcha length, ABORT');
  await browser.close(); process.exit(1);
}

const capInput = page.locator('input[placeholder="보안 문자 입력"]').first();
await capInput.fill(code);
const filled = await capInput.inputValue();
console.log('captcha field after fill:', filled);

const idVal = await page.locator('input[placeholder="아이디"]').inputValue();
const pwVal = await page.locator('input[placeholder="비밀번호"]').inputValue();
console.log('id filled:', idVal === ID, 'pw len:', pwVal.length);

console.log('submitting...');
await page.locator('button:has-text("로그인")').first().click();
await page.waitForTimeout(5000);

const url = page.url();
console.log('after submit url:', url);

await page.screenshot({ path:'/tmp/gabia-after.png', fullPage: true });

// 에러/토스트/모달 텍스트 수집
const allText = await page.evaluate(() => {
  const visible = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display !== 'none' && cs.visibility !== 'hidden') {
      const t = el.textContent || '';
      if (t.length > 3 && t.length < 200 && /실패|오류|틀렸|일치|보안|차단|잠금|에러|error|invalid|잘못/i.test(t)) {
        visible.push(t.trim().slice(0,150));
      }
    }
  });
  return [...new Set(visible)].slice(0, 8);
});
console.log('error-like texts:');
allText.forEach(t => console.log('  >', t));

await ctx.storageState({ path:'/tmp/gabia-state.json' });
await browser.close();
