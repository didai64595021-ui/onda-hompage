const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies', 'kmong-session.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

const KMONG_EMAIL = process.env.KMONG_EMAIL;
const KMONG_PASSWORD = process.env.KMONG_PW;
if (!KMONG_EMAIL || !KMONG_PASSWORD) throw new Error('KMONG_EMAIL, KMONG_PW 환경변수가 필요합니다');

// 크몽 로그인 방식 (2026-04-03 Playwright 실테스트 검증됨):
// - /login → 404
// - /?open=login_modal&next_page=/seller/click-up → 정상 동작 (모달 자동 오픈)
//   실테스트: 이메일+비밀번호 입력 → 제출 → /seller/click-up 리다이렉트 → 21.1초 성공
// - input[name="email"] + input[name="password"] + button[type="submit"]:has-text("로그인")
const SELLER_URL = 'https://kmong.com/seller/click-up';
const LOGIN_MODAL_URL = 'https://kmong.com/?open=login_modal&next_page=%2Fseller%2Fclick-up';

const BROWSER_OPTIONS = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
  ],
};

const CONTEXT_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
};

function hasFreshCookies() {
  try {
    if (!fs.existsSync(COOKIE_PATH)) return false;
    const stat = fs.statSync(COOKIE_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 12 * 60 * 60 * 1000) return false;
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    return Array.isArray(cookies) && cookies.length > 0;
  } catch {
    return false;
  }
}

async function saveErrorScreenshot(page, label) {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const filename = `error-${label}-${Date.now()}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
    console.log(`[스크린샷] ${filename}`);
  } catch (e) {
    console.error(`[스크린샷 실패] ${e.message}`);
  }
}

async function isLoggedIn(page) {
  try {
    await page.goto(SELLER_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    return url.includes('/seller/') && !url.includes('open=login_modal') && !url.includes('auth-refreshing');
  } catch {
    return false;
  }
}

async function login(opts = {}) {
  const browser = await chromium.launch({
    ...BROWSER_OPTIONS,
    slowMo: opts.slowMo || 100,
  });
  const context = await browser.newContext(CONTEXT_OPTIONS);

  if (hasFreshCookies()) {
    console.log('[로그인] 저장된 쿠키 복원 시도...');
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    await context.addCookies(cookies);
    const page = await context.newPage();
    const valid = await isLoggedIn(page);
    if (valid) {
      console.log('[로그인] 쿠키 유효 — 로그인 스킵');
      return { browser, context, page };
    }
    console.log(`[로그인] 쿠키 만료 — 재로그인 진행 (URL: ${page.url()})`);
    try { fs.unlinkSync(COOKIE_PATH); } catch {}
    await page.close();
  }

  const page = await context.newPage();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[로그인] 시도 ${attempt}/2 — 로그인 모달 직접 오픈...`);
      await page.goto(LOGIN_MODAL_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      console.log(`[로그인] 현재 URL: ${page.url()}`);

      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.fill(KMONG_EMAIL);
      await page.waitForTimeout(500);
      console.log('[로그인] 이메일 입력 완료');

      const pwInput = page.locator('input[name="password"], input[type="password"]').first();
      await pwInput.waitFor({ state: 'visible', timeout: 10000 });
      await pwInput.fill(KMONG_PASSWORD);
      await page.waitForTimeout(500);
      console.log('[로그인] 비밀번호 입력 완료');

      const submitBtn = page.locator('button[type="submit"]:has-text("로그인")').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
      } else {
        const anySubmit = page.locator('button[type="submit"]').first();
        if (await anySubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
          await anySubmit.click();
        } else {
          await pwInput.press('Enter');
        }
      }
      console.log('[로그인] 제출 완료, 응답 대기...');
      await page.waitForTimeout(5000);

      const errorText = await page.locator('[class*="error"], [class*="alert"], [class*="invalid"]')
        .first().innerText({ timeout: 2000 }).catch(() => '');
      if (errorText && (errorText.includes('비밀번호') || errorText.includes('이메일') || errorText.includes('일치'))) {
        throw new Error(`인증 실패: ${errorText.substring(0, 100)}`);
      }

      const valid = await isLoggedIn(page);
      if (valid) {
        console.log(`[로그인] 성공 — URL: ${page.url()}`);
        const freshCookies = await context.cookies();
        fs.mkdirSync(path.dirname(COOKIE_PATH), { recursive: true });
        fs.writeFileSync(COOKIE_PATH, JSON.stringify(freshCookies, null, 2));
        console.log('[로그인] 쿠키 저장 완료');
        return { browser, context, page };
      }
      console.log(`[로그인] 시도 ${attempt}: 셀러 페이지 접근 실패`);
      await saveErrorScreenshot(page, `login-verify-fail-${attempt}`);
    } catch (err) {
      console.error(`[로그인] 시도 ${attempt} 실패: ${err.message}`);
      await saveErrorScreenshot(page, `login-fail-${attempt}`);
      if (attempt === 2) {
        await browser.close();
        throw new Error(`[로그인 실패] 2회 시도 모두 실패: ${err.message}`);
      }
      await page.goto('about:blank');
      await page.waitForTimeout(2000);
    }
  }
  await saveErrorScreenshot(page, 'login-final-fail');
  await browser.close();
  throw new Error('[로그인 실패] 인증 후 셀러 페이지 접근 불가');
}

module.exports = { login, saveErrorScreenshot };
