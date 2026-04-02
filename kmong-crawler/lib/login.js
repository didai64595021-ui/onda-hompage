const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies', 'kmong-session.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

const KMONG_EMAIL = process.env.KMONG_EMAIL;
const KMONG_PASSWORD = process.env.KMONG_PW;
if (!KMONG_EMAIL || !KMONG_PASSWORD) throw new Error('KMONG_EMAIL, KMONG_PW 환경변수가 필요합니다');
const MAIN_URL = 'https://kmong.com';

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

/**
 * 저장된 쿠키가 유효한지 확인
 */
function hasFreshCookies() {
  try {
    if (!fs.existsSync(COOKIE_PATH)) return false;
    const stat = fs.statSync(COOKIE_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    // 쿠키 12시간 이내면 유효로 간주
    if (ageMs > 12 * 60 * 60 * 1000) return false;
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    return Array.isArray(cookies) && cookies.length > 0;
  } catch {
    return false;
  }
}

/**
 * 에러 스크린샷 저장
 */
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

/**
 * 브라우저 + 로그인된 컨텍스트를 반환
 * @param {object} opts - { slowMo: number }
 * @returns {{ browser, context, page }}
 */
async function login(opts = {}) {
  const browser = await chromium.launch({
    ...BROWSER_OPTIONS,
    slowMo: opts.slowMo || 100,
  });

  const context = await browser.newContext(CONTEXT_OPTIONS);

  // 저장된 쿠키 복원 시도
  if (hasFreshCookies()) {
    console.log('[로그인] 저장된 쿠키 복원 시도...');
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    await context.addCookies(cookies);

    const page = await context.newPage();
    // 쿠키로 셀러 대시보드 접근 시도
    await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    // auth-refreshing 리다이렉트도 쿠키 만료로 간주
    if (!currentUrl.includes('/login') && !currentUrl.includes('auth-refreshing')) {
      console.log('[로그인] 쿠키 유효 — 로그인 스킵');
      return { browser, context, page };
    }
    console.log(`[로그인] 쿠키 만료 — 재로그인 진행 (URL: ${currentUrl})`);
    // 만료된 쿠키 파일 삭제
    try { fs.unlinkSync(COOKIE_PATH); } catch {}
    await page.close();
  }

  // 새 로그인 — 크몽은 메인에서 모달 로그인
  const page = await context.newPage();
  console.log('[로그인] 크몽 메인 페이지 접속...');
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  try {
    // 헤더의 "로그인" 버튼 클릭 → 모달 오픈
    const headerLoginBtn = page.locator('a:has-text("로그인"), button:has-text("로그인")').first();
    await headerLoginBtn.waitFor({ state: 'visible', timeout: 20000 });
    await headerLoginBtn.click();
    await page.waitForTimeout(2000);
    console.log('[로그인] 로그인 모달 오픈');
    await saveErrorScreenshot(page, 'login-modal-opened');

    // 모달 내 이메일 입력
    const emailInput = page.locator('div[role="dialog"] input[type="email"], div[role="dialog"] input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 }); // Increase timeout
    await emailInput.fill(KMONG_EMAIL);
    await page.waitForTimeout(1000);
    await saveErrorScreenshot(page, 'login-email-filled');

    // 모달 내 비밀번호 입력
    const pwInput = page.locator('div[role="dialog"] input[type="password"], div[role="dialog"] input[name="password"]').first();
    await pwInput.waitFor({ state: 'visible', timeout: 15000 }); // Increase timeout
    await pwInput.fill(KMONG_PASSWORD);
    await page.waitForTimeout(1000);
    await saveErrorScreenshot(page, 'login-password-filled');

    // 모달 내 로그인 버튼 (submit or "로그인" 텍스트 버튼)
    const submitBtn = page.locator('div[role="dialog"] button[type="submit"], div[role="dialog"] button:has-text("로그인")').first();
    await submitBtn.waitFor({ state: 'visible', timeout: 15000 });
    await submitBtn.click();
    console.log('[로그인] 로그인 버튼 클릭');

    // 로그인 완료 대기 — 모달 닫히거나 페이지 변경
    // 모달이 닫히면 로그인 성공
    await page.waitForTimeout(5000);

    // 로그인 성공 확인: 프로필/마이페이지 요소가 보이거나, 로그인 버튼이 사라졌는지
    const isLoggedIn = await page.locator('[class*="profile"], [class*="my"], a[href*="mypage"], a[href*="seller"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!isLoggedIn) {
      // 이메일/비밀번호 오류 메시지 확인
      const errorMsg = await page.locator('[class*="error"], [class*="alert"], [class*="warning"]').first().innerText().catch(() => '');
      if (errorMsg) {
        throw new Error(`로그인 오류: ${errorMsg}`);
      }
    }

    console.log(`[로그인] 성공 — 현재 URL: ${page.url()}`);

    // 쿠키 저장
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log('[로그인] 쿠키 저장 완료');

    return { browser, context, page };
  } catch (err) {
    await saveErrorScreenshot(page, 'login');
    await browser.close();
    throw new Error(`[로그인 실패] ${err.message}`);
  }
}

module.exports = { login, saveErrorScreenshot };
