const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies', 'kmong-session.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

const KMONG_EMAIL = process.env.KMONG_EMAIL;
const KMONG_PASSWORD = process.env.KMONG_PW;
if (!KMONG_EMAIL || !KMONG_PASSWORD) throw new Error('KMONG_EMAIL, KMONG_PW 환경변수가 필요합니다');

// 크몽 로그인 방식 (2026-04-03):
// - 보호 페이지(/seller/click-up) 접근 → /?open=login_modal 자동 리다이렉트
// - input[name="email"] + input[name="password"] + button[type="submit"]
// - auth-refreshing 쿠키가 남아있으면 모달이 안 열림 → 새 컨텍스트 필요
const SELLER_URL = 'https://kmong.com/seller/click-up';

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

async function isOnSellerPage(page) {
  const url = page.url();
  return url.includes('/seller/') && !url.includes('open=login_modal') && !url.includes('auth-refreshing');
}

/**
 * 로그인 폼을 찾아 인증 수행
 * - /seller/click-up 접근 → 리다이렉트된 페이지에서 로그인 폼 찾기
 * - /?open=login_modal 또는 /biz 어디든 이메일/비밀번호 필드 있으면 동작
 */
async function performLogin(context, page) {
  // 셀러 보호 페이지 접근 → 자동으로 로그인 페이지로 리다이렉트
  console.log('[로그인] 셀러 페이지 접근으로 로그인 유도...');
  await page.goto(SELLER_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  let currentUrl = page.url();
  console.log(`[로그인] 리다이렉트 URL: ${currentUrl}`);

  // 이미 셀러 페이지에 있으면 (로그인됨) 바로 리턴
  if (await isOnSellerPage(page)) {
    console.log('[로그인] 이미 로그인 상태');
    return true;
  }

  // 이메일 필드가 보이는지 확인 (모달이 자동으로 열렸을 수 있음)
  let emailInput = page.locator('input[name="email"], input[type="email"]').first();
  let emailVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);

  // 이메일 필드가 안 보이면 → 페이지에서 "로그인" 클릭 시도
  if (!emailVisible) {
    console.log('[로그인] 이메일 필드 미발견 — 로그인 요소 클릭 시도');

    // 로그인 텍스트를 가진 클릭 가능한 요소 찾기 (p, a, button, span 등)
    const loginClickables = [
      'p:has-text("로그인")',
      'span:has-text("로그인")',
      'a:has-text("로그인")',
      'button:has-text("로그인")',
      '[class*="login"]',
    ];

    for (const sel of loginClickables) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`[로그인] 클릭: ${sel}`);
        await el.click();
        await page.waitForTimeout(3000);
        break;
      }
    }

    // 다시 이메일 필드 확인
    emailVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
  }

  if (!emailVisible) {
    await saveErrorScreenshot(page, 'login-no-email');
    throw new Error('이메일 입력 필드를 찾을 수 없음');
  }

  // 이메일 입력
  await emailInput.fill(KMONG_EMAIL);
  await page.waitForTimeout(500);
  console.log('[로그인] 이메일 입력 완료');

  // 비밀번호 입력
  const pwInput = page.locator('input[name="password"], input[type="password"]').first();
  await pwInput.waitFor({ state: 'visible', timeout: 10000 });
  await pwInput.fill(KMONG_PASSWORD);
  await page.waitForTimeout(500);
  console.log('[로그인] 비밀번호 입력 완료');

  // 제출
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

  // 에러 확인
  const errorText = await page.locator('[class*="error"], [class*="alert"], [class*="invalid"]')
    .first().innerText({ timeout: 2000 }).catch(() => '');
  if (errorText && (errorText.includes('비밀번호') || errorText.includes('이메일') || errorText.includes('일치'))) {
    throw new Error(`인증 실패: ${errorText.substring(0, 100)}`);
  }

  // 셀러 페이지 접근 검증
  await page.goto(SELLER_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  return await isOnSellerPage(page);
}

async function login(opts = {}) {
  const browser = await chromium.launch({
    ...BROWSER_OPTIONS,
    slowMo: opts.slowMo || 100,
  });

  // === 1단계: 쿠키 복원 ===
  if (hasFreshCookies()) {
    console.log('[로그인] 저장된 쿠키 복원 시도...');
    const context = await browser.newContext(CONTEXT_OPTIONS);
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    await context.addCookies(cookies);
    const page = await context.newPage();

    await page.goto(SELLER_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    if (await isOnSellerPage(page)) {
      console.log('[로그인] 쿠키 유효 — 로그인 스킵');
      return { browser, context, page };
    }
    console.log(`[로그인] 쿠키 만료 (URL: ${page.url()})`);
    try { fs.unlinkSync(COOKIE_PATH); } catch {}
    await context.close(); // 오래된 컨텍스트 완전 폐기
  }

  // === 2단계: 새 컨텍스트로 로그인 (auth-refreshing 쿠키 오염 방지) ===
  for (let attempt = 1; attempt <= 2; attempt++) {
    const freshContext = await browser.newContext(CONTEXT_OPTIONS);
    const page = await freshContext.newPage();

    try {
      console.log(`[로그인] 시도 ${attempt}/2 — 새 컨텍스트 생성...`);
      const success = await performLogin(freshContext, page);

      if (success) {
        console.log(`[로그인] 성공 — URL: ${page.url()}`);
        const freshCookies = await freshContext.cookies();
        fs.mkdirSync(path.dirname(COOKIE_PATH), { recursive: true });
        fs.writeFileSync(COOKIE_PATH, JSON.stringify(freshCookies, null, 2));
        console.log('[로그인] 쿠키 저장 완료');
        return { browser, context: freshContext, page };
      }

      console.log(`[로그인] 시도 ${attempt}: 셀러 접근 실패`);
      await saveErrorScreenshot(page, `login-verify-fail-${attempt}`);
      await freshContext.close();

    } catch (err) {
      console.error(`[로그인] 시도 ${attempt} 실패: ${err.message}`);
      await saveErrorScreenshot(page, `login-fail-${attempt}`);
      await freshContext.close();
      if (attempt === 2) {
        await browser.close();
        throw new Error(`[로그인 실패] 2회 시도 모두 실패: ${err.message}`);
      }
    }
  }

  await browser.close();
  throw new Error('[로그인 실패] 모든 시도 실패');
}

module.exports = { login, saveErrorScreenshot };
