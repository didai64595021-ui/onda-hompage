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
 * 
 * 크몽 로그인 방식 (2026-04 확인):
 * - /login URL은 404 (존재하지 않음)
 * - /?open=login_modal도 404 (작동 안 함)
 * - 유일한 방법: 메인 페이지(kmong.com) → 헤더 "로그인" 버튼 클릭 → 모달 로그인
 * 
 * @param {object} opts - { slowMo: number }
 * @returns {{ browser, context, page }}
 */
async function login(opts = {}) {
  const browser = await chromium.launch({
    ...BROWSER_OPTIONS,
    slowMo: opts.slowMo || 100,
  });

  const context = await browser.newContext(CONTEXT_OPTIONS);

  // === 1단계: 저장된 쿠키 복원 시도 ===
  if (hasFreshCookies()) {
    console.log('[로그인] 저장된 쿠키 복원 시도...');
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    await context.addCookies(cookies);

    const page = await context.newPage();
    await page.goto('https://kmong.com/seller/click-up', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (!currentUrl.includes('/login') && !currentUrl.includes('auth-refreshing') && !currentUrl.includes('open=login_modal')) {
      console.log('[로그인] 쿠키 유효 — 로그인 스킵');
      return { browser, context, page };
    }
    console.log(`[로그인] 쿠키 만료 — 재로그인 진행 (URL: ${currentUrl})`);
    try { fs.unlinkSync(COOKIE_PATH); } catch {}
    await page.close();
  }

  // === 2단계: 메인 페이지 → 모달 로그인 ===
  const page = await context.newPage();
  console.log('[로그인] 크몽 메인 접속...');
  await page.goto(MAIN_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log(`[로그인] 현재 URL: ${page.url()}`);

  // 이미 로그인 상태인지 확인 (쿠키가 브라우저에 남아있는 경우)
  const loginBtnVisible = await page.locator('a:has-text("로그인"), button:has-text("로그인")').first()
    .isVisible({ timeout: 5000 }).catch(() => false);

  if (!loginBtnVisible) {
    // 프로필/셀러 링크 등 로그인 상태 표시 요소 확인
    const isAlreadyLoggedIn = await page.evaluate(() => {
      const selectors = [
        'a[href*="seller"]', 'a[href*="mypage"]', 'a[href*="my-kmong"]',
        '[class*="profile"]', '[class*="avatar"]', '[class*="user-menu"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return true;
      }
      return false;
    });

    if (isAlreadyLoggedIn) {
      console.log('[로그인] 이미 로그인 상태 — 쿠키 저장 후 진행');
      const cookies = await context.cookies();
      fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
      return { browser, context, page };
    }

    // 페이지 새로고침 후 재확인
    console.log('[로그인] 로그인 버튼/프로필 미발견 → 새로고침');
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(5000);

    const retryBtn = await page.locator('a:has-text("로그인"), button:has-text("로그인")').first()
      .isVisible({ timeout: 10000 }).catch(() => false);
    if (!retryBtn) {
      const retryLoggedIn = await page.evaluate(() => {
        const sels = ['a[href*="seller"]', 'a[href*="mypage"]', '[class*="profile"]'];
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) return true;
        }
        return false;
      });
      if (retryLoggedIn) {
        console.log('[로그인] 이미 로그인 상태 (재확인) — 쿠키 저장');
        const cookies = await context.cookies();
        fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
        return { browser, context, page };
      }
      await saveErrorScreenshot(page, 'login-btn-final-fail');
      await browser.close();
      throw new Error('[로그인 실패] 로그인 버튼을 찾을 수 없음');
    }
  }

  // === 3단계: 모달 로그인 실행 ===
  try {
    const headerLoginBtn = page.locator('a:has-text("로그인"), button:has-text("로그인")').first();
    await headerLoginBtn.click();
    await page.waitForTimeout(2000);
    console.log('[로그인] 로그인 모달 오픈');

    // 모달 내 이메일 입력
    const emailInput = page.locator('div[role="dialog"] input[type="email"], div[role="dialog"] input[name="email"], input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(KMONG_EMAIL);
    await page.waitForTimeout(500);
    console.log('[로그인] 이메일 입력 완료');

    // 모달 내 비밀번호 입력
    const pwInput = page.locator('div[role="dialog"] input[type="password"], div[role="dialog"] input[name="password"], input[type="password"], input[name="password"]').first();
    await pwInput.waitFor({ state: 'visible', timeout: 15000 });
    await pwInput.fill(KMONG_PASSWORD);
    await page.waitForTimeout(500);
    console.log('[로그인] 비밀번호 입력 완료');

    // 로그인 제출
    const submitBtn = page.locator('div[role="dialog"] button[type="submit"], div[role="dialog"] button:has-text("로그인"), button[type="submit"]:has-text("로그인")').first();
    await submitBtn.waitFor({ state: 'visible', timeout: 15000 });
    await submitBtn.click();
    console.log('[로그인] 로그인 버튼 클릭');

    await page.waitForTimeout(5000);

    // 에러 메시지 확인
    const errorMsg = await page.locator('[class*="error"], [class*="alert"]').first().innerText({ timeout: 2000 }).catch(() => '');
    if (errorMsg && (errorMsg.includes('비밀번호') || errorMsg.includes('이메일'))) {
      throw new Error(`로그인 오류: ${errorMsg.substring(0, 100)}`);
    }

    console.log(`[로그인] 성공 — 현재 URL: ${page.url()}`);

    // 쿠키 저장
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log('[로그인] 쿠키 저장 완료');

    return { browser, context, page };
  } catch (err) {
    await saveErrorScreenshot(page, 'login-modal-fail');
    await browser.close();
    throw new Error(`[로그인 실패] ${err.message}`);
  }
}

module.exports = { login, saveErrorScreenshot };
