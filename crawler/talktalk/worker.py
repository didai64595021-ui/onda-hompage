#!/usr/bin/env python3
"""
톡톡 발송 워커 - 서버 API 연동 버전
서버에서 발송 대상을 받아 Chrome으로 네이버 톡톡 메시지 발송

사용법:
  python3 worker.py                         # 기본 실행
  python3 worker.py --server http://IP:3400 # 서버 지정
  python3 worker.py --campaign CAMPAIGN_ID  # 캠페인 지정
  python3 worker.py --dry-run               # 테스트 (발송 안 함)
  python3 worker.py --visible               # 브라우저 표시
"""
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
import urllib.request
import urllib.parse
import json
import time
import random
import os
import sys
import argparse
import signal
import socket
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACCOUNTS_FILE = os.path.join(BASE_DIR, "accounts.txt")
SCREENSHOT_DIR = os.path.join(BASE_DIR, "screenshots")

DEFAULT_SERVER = "http://localhost:3400"
ACCOUNT_LIFETIME = 7200       # 2시간 (초)
MAX_PER_ACCOUNT = 200         # 계정당 최대 발송
DEFAULT_DELAY = 30            # 기본 발송 간격 (초)
FETCH_COUNT = 10              # 한 번에 가져올 대상 수
MAX_RETRIES_PER_TARGET = 2    # 대상당 최대 재시도
CONSECUTIVE_FAIL_PAUSE = 60   # 연속 실패 시 일시정지 (초)
CONSECUTIVE_FAIL_LIMIT = 3    # 연속 실패 허용 수
SERVER_RETRY_COUNT = 3        # 서버 연결 재시도
SERVER_RETRY_BACKOFF = 2      # 서버 재시도 백오프 배수

# ANSI 색상 코드
C_RESET = "\033[0m"
C_RED = "\033[91m"
C_GREEN = "\033[92m"
C_YELLOW = "\033[93m"
C_BLUE = "\033[94m"
C_CYAN = "\033[96m"
C_DIM = "\033[2m"
C_BOLD = "\033[1m"

# ---------------------------------------------------------------------------
# 전역 상태
# ---------------------------------------------------------------------------
shutdown_requested = False


def signal_handler(signum, frame):
    """SIGINT/SIGTERM 핸들러"""
    global shutdown_requested
    shutdown_requested = True
    log("WARN", "종료 신호 수신 -- 현재 배치 완료 후 종료합니다")


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ---------------------------------------------------------------------------
# 로깅
# ---------------------------------------------------------------------------
def log(level, msg):
    """타임스탬프 + 컬러 로그 출력"""
    ts = datetime.now().strftime("%H:%M:%S")
    color_map = {
        "INFO": C_CYAN,
        "OK": C_GREEN,
        "WARN": C_YELLOW,
        "ERR": C_RED,
        "SEND": C_GREEN + C_BOLD,
        "SKIP": C_DIM,
        "SUM": C_BLUE + C_BOLD,
    }
    c = color_map.get(level, "")
    print(f"{C_DIM}[{ts}]{C_RESET} {c}[{level}]{C_RESET} {msg}")


# ---------------------------------------------------------------------------
# 서버 API
# ---------------------------------------------------------------------------
def api_get(server_url, path):
    """GET 요청"""
    url = f"{server_url.rstrip('/')}{path}"
    for attempt in range(SERVER_RETRY_COUNT):
        try:
            req = urllib.request.Request(url)
            req.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            log("ERR", f"API GET {path} -> HTTP {e.code}: {body[:200]}")
            if attempt < SERVER_RETRY_COUNT - 1:
                wait = SERVER_RETRY_BACKOFF ** (attempt + 1)
                log("WARN", f"  {wait}초 후 재시도 ({attempt + 1}/{SERVER_RETRY_COUNT})")
                time.sleep(wait)
            else:
                return None
        except Exception as e:
            log("ERR", f"API GET {path} -> {e}")
            if attempt < SERVER_RETRY_COUNT - 1:
                wait = SERVER_RETRY_BACKOFF ** (attempt + 1)
                log("WARN", f"  {wait}초 후 재시도 ({attempt + 1}/{SERVER_RETRY_COUNT})")
                time.sleep(wait)
            else:
                return None
    return None


def api_post(server_url, path, data):
    """POST 요청 (JSON body)"""
    url = f"{server_url.rstrip('/')}{path}"
    payload = json.dumps(data).encode("utf-8")
    for attempt in range(SERVER_RETRY_COUNT):
        try:
            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            log("ERR", f"API POST {path} -> HTTP {e.code}: {body[:200]}")
            if attempt < SERVER_RETRY_COUNT - 1:
                wait = SERVER_RETRY_BACKOFF ** (attempt + 1)
                log("WARN", f"  {wait}초 후 재시도 ({attempt + 1}/{SERVER_RETRY_COUNT})")
                time.sleep(wait)
            else:
                return None
        except Exception as e:
            log("ERR", f"API POST {path} -> {e}")
            if attempt < SERVER_RETRY_COUNT - 1:
                wait = SERVER_RETRY_BACKOFF ** (attempt + 1)
                log("WARN", f"  {wait}초 후 재시도 ({attempt + 1}/{SERVER_RETRY_COUNT})")
                time.sleep(wait)
            else:
                return None
    return None


def check_server_health(server_url):
    """서버 헬스체크"""
    result = api_get(server_url, "/api/health")
    return result is not None


def get_campaigns(server_url):
    """활성 캠페인 목록 조회"""
    result = api_get(server_url, "/api/campaigns")
    if result is None:
        return []
    # 응답이 리스트이거나 campaigns 키에 리스트가 있을 수 있음
    if isinstance(result, list):
        return result
    return result.get("campaigns", result.get("data", []))


def fetch_targets(server_url, campaign_id, worker_id, count=FETCH_COUNT):
    """서버에서 발송 대상 가져오기"""
    data = {
        "campaignId": campaign_id,
        "workerId": worker_id,
        "count": count,
    }
    result = api_post(server_url, "/api/worker/fetch", data)
    if result is None:
        return []
    if isinstance(result, list):
        return result
    return result.get("targets", result.get("data", []))


def report_results(server_url, campaign_id, worker_id, results):
    """발송 결과 보고"""
    data = {
        "campaignId": campaign_id,
        "workerId": worker_id,
        "results": results,
    }
    return api_post(server_url, "/api/worker/report", data)


# ---------------------------------------------------------------------------
# 계정 관리
# ---------------------------------------------------------------------------
def load_accounts(path):
    """계정 파일 로드 (ID:PW 또는 ID PW 형식, 줄당 1개)"""
    accounts = []
    if not os.path.exists(path):
        log("ERR", f"계정 파일 없음: {path}")
        return accounts
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.replace("\t", ":").replace(" ", ":").split(":")
            if len(parts) >= 2:
                accounts.append({"id": parts[0].strip(), "pw": parts[1].strip()})
    log("INFO", f"계정 {len(accounts)}개 로드")
    return accounts


# ---------------------------------------------------------------------------
# Chrome / 브라우저
# ---------------------------------------------------------------------------
def create_driver(headless=True):
    """undetected_chromedriver로 Chrome 생성"""
    o = uc.ChromeOptions()
    if headless:
        o.add_argument("--headless=new")
    o.add_argument("--no-sandbox")
    o.add_argument("--disable-dev-shm-usage")
    o.add_argument("--disable-gpu")
    o.add_argument("--disable-extensions")
    o.add_argument("--disable-software-rasterizer")
    o.add_argument("--disable-background-networking")
    o.add_argument("--disable-default-apps")
    o.add_argument("--no-first-run")
    o.add_argument("--js-flags=--max-old-space-size=256")
    # 세션마다 약간 다른 창 크기 (봇 탐지 회피)
    w = random.randint(1890, 1930)
    h = random.randint(1050, 1100)
    o.add_argument(f"--window-size={w},{h}")
    return uc.Chrome(options=o, version_main=145)


def naver_login(driver, account_id, account_pw):
    """네이버 로그인 (dispatchEvent 방식)"""
    log("INFO", f"  로그인: {account_id}")
    driver.get("https://nid.naver.com/nidlogin.login")
    time.sleep(3)

    # 로그인 정보 입력 (JS로 value 설정 + input 이벤트)
    safe_id = account_id.replace("'", "\\'")
    safe_pw = account_pw.replace("'", "\\'")
    driver.execute_script(f"""
        var id=document.getElementById('id');id.focus();id.value='{safe_id}';
        id.dispatchEvent(new Event('input',{{bubbles:true}}));
        var pw=document.getElementById('pw');pw.focus();pw.value='{safe_pw}';
        pw.dispatchEvent(new Event('input',{{bubbles:true}}));
    """)
    time.sleep(1)
    driver.find_element(By.ID, "log.login").click()
    time.sleep(5)

    if "nidlogin" in driver.current_url:
        src = driver.page_source
        if "captcha" in src.lower() or "캡차" in src:
            log("WARN", "  캡차 감지 -- AI 솔버 시도")
            try:
                from captcha_solver import solve_naver_captcha
                driver.execute_script(f"""
                    var pw=document.getElementById('pw');pw.focus();pw.value='{safe_pw}';
                    pw.dispatchEvent(new Event('input',{{bubbles:true}}));
                """)
                if solve_naver_captcha(driver, max_retries=3):
                    log("OK", "  캡차 통과!")
                    return True
            except ImportError:
                log("ERR", "  captcha_solver 모듈 없음")
            except Exception as e:
                log("ERR", f"  캡차 솔버 오류: {e}")
            save_screenshot(driver, f"login_fail_{account_id}")
            return False
        save_screenshot(driver, f"login_fail_{account_id}")
        log("ERR", "  로그인 실패 (비밀번호 오류 또는 보안 차단)")
        return False

    log("OK", "  로그인 성공!")
    return True


# ---------------------------------------------------------------------------
# 봇 탐지 회피 유틸
# ---------------------------------------------------------------------------
def random_mouse_move(driver):
    """랜덤 마우스 움직임 (봇 탐지 회피)"""
    try:
        actions = ActionChains(driver)
        x_offset = random.randint(100, 500)
        y_offset = random.randint(100, 400)
        actions.move_by_offset(x_offset, y_offset).perform()
        time.sleep(random.uniform(0.1, 0.3))
        actions.move_by_offset(-x_offset // 2, -y_offset // 2).perform()
    except Exception:
        pass


def random_scroll(driver):
    """랜덤 페이지 스크롤 (봇 탐지 회피)"""
    try:
        scroll_y = random.randint(50, 200)
        driver.execute_script(f"window.scrollBy(0, {scroll_y})")
        time.sleep(random.uniform(0.2, 0.5))
        driver.execute_script(f"window.scrollBy(0, -{scroll_y // 2})")
    except Exception:
        pass


def human_type(driver, element, text):
    """인간처럼 한 글자씩 타이핑"""
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(0.05, 0.15))


def human_delay(min_sec=1.0, max_sec=3.0):
    """인간적 랜덤 딜레이"""
    time.sleep(random.uniform(min_sec, max_sec))


# ---------------------------------------------------------------------------
# 스크린샷
# ---------------------------------------------------------------------------
def save_screenshot(driver, name):
    """실패 시 스크린샷 저장"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(SCREENSHOT_DIR, f"{name}_{ts}.png")
    try:
        driver.save_screenshot(path)
        log("INFO", f"  스크린샷: {path}")
    except Exception as e:
        log("ERR", f"  스크린샷 저장 실패: {e}")
    return path


# ---------------------------------------------------------------------------
# 메시지 발송
# ---------------------------------------------------------------------------
def send_message(driver, talk_id, message, dry_run=False):
    """
    톡톡 메시지 발송
    Returns: (result_code, detail)
        result_code: 'sent', 'verify_needed', 'no_textarea', 'btn_disabled', 'error'
    """
    url = f"https://talk.naver.com/ct/{talk_id}"
    driver.get(url)

    # 페이지 로드 대기 (3~5초 랜덤)
    time.sleep(random.uniform(3.0, 5.0))

    # 본인확인 팝업 체크
    if "본인 확인 후 톡톡" in driver.page_source:
        return "verify_needed", "본인확인 필요"

    if dry_run:
        return "dry_run", "DRY RUN"

    # 랜덤 마우스 + 스크롤 (봇 탐지 회피)
    random_mouse_move(driver)
    random_scroll(driver)
    human_delay(0.5, 1.5)

    # textarea 찾기
    try:
        ta = driver.find_element(By.CSS_SELECTOR, "textarea.chat_input")
    except Exception:
        # JS로 재시도
        ta_exists = driver.execute_script(
            "return document.querySelector('textarea.chat_input') !== null"
        )
        if not ta_exists:
            save_screenshot(driver, f"no_textarea_{talk_id}")
            return "no_textarea", "채팅 입력창 없음"
        ta = None

    # 메시지 입력: human typing 방식
    if ta:
        try:
            ta.click()
            human_delay(0.3, 0.8)
            human_type(driver, ta, message)
            human_delay(0.3, 0.8)
        except Exception as e:
            # JS 폴백으로 입력
            log("WARN", f"  타이핑 폴백 -> JS 입력: {e}")
            safe_msg = message.replace("'", "\\'").replace("\n", "\\n")
            driver.execute_script(f"""
                var ta = document.querySelector('textarea.chat_input');
                if(ta) {{
                    ta.focus();
                    var s = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype, 'value'
                    ).set;
                    s.call(ta, '{safe_msg}');
                    ta.dispatchEvent(new Event('input', {{bubbles:true}}));
                }}
            """)
            human_delay(0.5, 1.0)
    else:
        # element를 못 잡았지만 존재는 하는 경우 -> JS로 입력
        safe_msg = message.replace("'", "\\'").replace("\n", "\\n")
        driver.execute_script(f"""
            var ta = document.querySelector('textarea.chat_input');
            if(ta) {{
                ta.focus();
                var s = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                s.call(ta, '{safe_msg}');
                ta.dispatchEvent(new Event('input', {{bubbles:true}}));
            }}
        """)
        human_delay(0.5, 1.0)

    # 전송 버튼 클릭
    result = driver.execute_script("""
        var btn = document.querySelector('button.btn_submit');
        if(btn && !btn.disabled) { btn.click(); return 'sent'; }
        if(btn && btn.disabled) return 'btn_disabled';
        return 'no_button';
    """)

    if result == "sent":
        # 발송 확인: 채팅에 메시지가 나타났는지 검증 (1초 대기 후)
        time.sleep(1)
        try:
            page_src = driver.page_source
            # 메시지 앞 20글자만 비교 (긴 메시지 대응)
            check_text = message[:20]
            if check_text in page_src:
                return "sent", "발송 확인 완료"
            else:
                return "sent", "발송됨 (확인 불확실)"
        except Exception:
            return "sent", "발송됨"
    elif result == "btn_disabled":
        save_screenshot(driver, f"btn_disabled_{talk_id}")
        return "btn_disabled", "전송 버튼 비활성"
    else:
        save_screenshot(driver, f"no_button_{talk_id}")
        return "no_button", "전송 버튼 없음"


# ---------------------------------------------------------------------------
# 워커 ID 생성
# ---------------------------------------------------------------------------
def generate_worker_id():
    """hostname + PID 기반 워커 ID"""
    hostname = socket.gethostname()
    pid = os.getpid()
    return f"{hostname}_{pid}"


# ---------------------------------------------------------------------------
# 요약 출력
# ---------------------------------------------------------------------------
def print_summary(total_sent, total_fail, total_skip, batch_num, elapsed_sec):
    """발송 요약 출력"""
    elapsed_min = elapsed_sec / 60
    rate = total_sent / elapsed_min if elapsed_min > 0 else 0
    log("SUM", "=" * 50)
    log("SUM", f"  배치 #{batch_num} 누적 요약")
    log("SUM", f"  성공: {total_sent}  실패: {total_fail}  스킵: {total_skip}")
    log("SUM", f"  경과: {elapsed_min:.1f}분  속도: {rate:.1f}건/분")
    log("SUM", "=" * 50)


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="톡톡 발송 워커 - 서버 API 연동"
    )
    parser.add_argument(
        "--server", default=DEFAULT_SERVER,
        help=f"캠페인 서버 URL (기본: {DEFAULT_SERVER})"
    )
    parser.add_argument(
        "--campaign", default=None,
        help="캠페인 ID (미지정 시 활성 캠페인 자동 선택)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="테스트 모드 (실제 발송 안 함)"
    )
    parser.add_argument(
        "--accounts", default=ACCOUNTS_FILE,
        help=f"계정 파일 경로 (기본: {ACCOUNTS_FILE})"
    )
    parser.add_argument(
        "--visible", action="store_true",
        help="브라우저 화면 표시 (headless 해제)"
    )
    parser.add_argument(
        "--delay", type=int, default=DEFAULT_DELAY,
        help=f"발송 간격 초 (기본: {DEFAULT_DELAY})"
    )
    args = parser.parse_args()

    headless = not args.visible
    server_url = args.server
    worker_id = generate_worker_id()

    # ----- 시작 배너 -----
    log("INFO", "=" * 55)
    log("INFO", "  톡톡 발송 워커 v1.0")
    log("INFO", f"  서버: {server_url}")
    log("INFO", f"  워커: {worker_id}")
    log("INFO", f"  모드: {'DRY RUN' if args.dry_run else 'LIVE'}")
    log("INFO", f"  헤드리스: {'Y' if headless else 'N (브라우저 표시)'}")
    log("INFO", f"  발송 간격: {args.delay}초 (+/- 랜덤)")
    log("INFO", f"  계정 수명: {ACCOUNT_LIFETIME // 3600}시간 / 최대 {MAX_PER_ACCOUNT}건")
    log("INFO", "=" * 55)

    # ----- 서버 헬스체크 -----
    log("INFO", "서버 연결 확인...")
    if not check_server_health(server_url):
        log("ERR", f"서버 연결 실패: {server_url}")
        log("ERR", "서버가 실행 중인지 확인하세요.")
        sys.exit(1)
    log("OK", "서버 연결 OK")

    # ----- 계정 로드 -----
    accounts = load_accounts(args.accounts)
    if not accounts:
        log("ERR", "사용 가능한 계정 없음. accounts.txt를 확인하세요.")
        sys.exit(1)

    # ----- 캠페인 선택 -----
    campaign_id = args.campaign
    if not campaign_id:
        log("INFO", "활성 캠페인 조회...")
        campaigns = get_campaigns(server_url)
        if not campaigns:
            log("ERR", "활성 캠페인 없음. --campaign 옵션으로 ID를 지정하세요.")
            sys.exit(1)

        # 활성 캠페인 목록 출력
        active = [c for c in campaigns if c.get("status") == "active"]
        if not active:
            active = campaigns  # 상태 필드가 없으면 전체 사용

        log("INFO", f"캠페인 {len(active)}개 발견:")
        for idx, c in enumerate(active):
            name = c.get("name", c.get("title", "이름없음"))
            cid = c.get("id", c.get("_id", ""))
            remaining = c.get("remaining", "?")
            log("INFO", f"  [{idx + 1}] {name} (ID: {cid}, 남은대상: {remaining})")

        # 첫 번째 활성 캠페인 자동 선택
        campaign_id = active[0].get("id", active[0].get("_id", ""))
        campaign_name = active[0].get("name", active[0].get("title", ""))
        log("OK", f"캠페인 자동 선택: {campaign_name} ({campaign_id})")

    log("INFO", f"캠페인 ID: {campaign_id}")

    # ----- 발송 루프 -----
    driver = None
    account_idx = 0
    account_start_time = None
    account_sent = 0
    total_sent = 0
    total_fail = 0
    total_skip = 0
    batch_num = 0
    consecutive_fails = 0
    start_time = time.time()

    try:
        while not shutdown_requested:
            # === 계정 준비 (로그인 / 교체) ===
            need_new_account = (
                driver is None
                or (account_start_time and time.time() - account_start_time > ACCOUNT_LIFETIME)
                or account_sent >= MAX_PER_ACCOUNT
            )

            if need_new_account:
                # 기존 드라이버 정리
                if driver:
                    reason = "수명 만료" if account_sent < MAX_PER_ACCOUNT else f"{account_sent}건 도달"
                    log("WARN", f"계정 교체 사유: {reason}")
                    try:
                        driver.quit()
                    except Exception:
                        pass
                    driver = None
                    time.sleep(2)

                # 계정 소진 체크
                if account_idx >= len(accounts):
                    log("WARN", f"모든 계정 소진 ({account_idx}/{len(accounts)})")
                    break

                acct = accounts[account_idx]
                account_idx += 1
                account_sent = 0

                log("INFO", f"계정 #{account_idx}/{len(accounts)}: {acct['id']}")

                # Chrome 시작
                try:
                    driver = create_driver(headless=headless)
                except Exception as e:
                    log("ERR", f"Chrome 시작 실패: {e}")
                    time.sleep(5)
                    continue

                # 네이버 로그인
                if not naver_login(driver, acct["id"], acct["pw"]):
                    log("ERR", f"로그인 실패: {acct['id']} -- 다음 계정으로")
                    try:
                        driver.quit()
                    except Exception:
                        pass
                    driver = None
                    continue

                account_start_time = time.time()
                expire_time = datetime.fromtimestamp(
                    account_start_time + ACCOUNT_LIFETIME
                ).strftime("%H:%M:%S")
                log("OK", f"로그인 완료 (만료: {expire_time})")

            # === 대상 가져오기 ===
            batch_num += 1
            log("INFO", f"배치 #{batch_num}: 대상 {FETCH_COUNT}건 요청...")
            targets = fetch_targets(server_url, campaign_id, worker_id, FETCH_COUNT)

            if not targets:
                log("OK", "대상 소진 -- 발송 완료")
                break

            log("INFO", f"대상 {len(targets)}건 수신")

            # === 대상별 발송 ===
            batch_results = []

            for t_idx, target in enumerate(targets):
                if shutdown_requested:
                    log("WARN", "종료 요청 -- 남은 대상 스킵")
                    break

                talk_id = target.get("talkId", target.get("talk_id", ""))
                name = target.get("name", target.get("businessName", ""))
                message = target.get("message", target.get("msg", ""))
                target_id = target.get("id", target.get("_id", talk_id))

                if not talk_id:
                    log("SKIP", f"  [{t_idx + 1}/{len(targets)}] talkId 없음 -- 스킵")
                    batch_results.append({
                        "targetId": target_id,
                        "talkId": talk_id,
                        "status": "skipped",
                        "detail": "talkId 없음",
                        "timestamp": datetime.now().isoformat(),
                    })
                    total_skip += 1
                    continue

                if not message:
                    log("WARN", f"  [{t_idx + 1}/{len(targets)}] 메시지 없음 -- 스킵")
                    batch_results.append({
                        "targetId": target_id,
                        "talkId": talk_id,
                        "status": "skipped",
                        "detail": "메시지 없음",
                        "timestamp": datetime.now().isoformat(),
                    })
                    total_skip += 1
                    continue

                log("INFO", f"  [{t_idx + 1}/{len(targets)}] {name} -> {talk_id}")

                # 인간적 딜레이 (액션 전)
                human_delay(1.0, 3.0)

                # 재시도 루프
                result_code = None
                detail = ""
                for retry in range(MAX_RETRIES_PER_TARGET + 1):
                    if retry > 0:
                        log("WARN", f"    재시도 {retry}/{MAX_RETRIES_PER_TARGET}")
                        human_delay(2.0, 5.0)

                    try:
                        result_code, detail = send_message(
                            driver, talk_id, message, dry_run=args.dry_run
                        )
                        break
                    except Exception as e:
                        result_code = "error"
                        detail = str(e)[:100]
                        log("ERR", f"    발송 예외: {e}")
                        save_screenshot(driver, f"error_{talk_id}")
                        if retry >= MAX_RETRIES_PER_TARGET:
                            break

                # 결과 처리
                if result_code == "sent" or result_code == "dry_run":
                    total_sent += 1
                    account_sent += 1
                    consecutive_fails = 0
                    status_label = "DRY" if result_code == "dry_run" else "SEND"
                    log(status_label if result_code == "sent" else "SKIP",
                        f"    -> {result_code}: {detail} (계정 누적: {account_sent}건)")
                    batch_results.append({
                        "targetId": target_id,
                        "talkId": talk_id,
                        "status": "sent" if result_code == "sent" else "dry_run",
                        "detail": detail,
                        "account": accounts[account_idx - 1]["id"],
                        "timestamp": datetime.now().isoformat(),
                    })
                elif result_code == "verify_needed":
                    log("ERR", f"    -> 본인확인 필요 -- 계정 즉시 교체")
                    total_fail += 1
                    consecutive_fails += 1
                    batch_results.append({
                        "targetId": target_id,
                        "talkId": talk_id,
                        "status": "verify_needed",
                        "detail": detail,
                        "timestamp": datetime.now().isoformat(),
                    })
                    # 계정 교체 트리거
                    try:
                        driver.quit()
                    except Exception:
                        pass
                    driver = None
                    break
                else:
                    total_fail += 1
                    consecutive_fails += 1
                    log("ERR", f"    -> {result_code}: {detail}")
                    batch_results.append({
                        "targetId": target_id,
                        "talkId": talk_id,
                        "status": result_code or "unknown_error",
                        "detail": detail,
                        "timestamp": datetime.now().isoformat(),
                    })

                # 연속 실패 체크
                if consecutive_fails >= CONSECUTIVE_FAIL_LIMIT:
                    log("WARN", f"연속 {consecutive_fails}회 실패 -- {CONSECUTIVE_FAIL_PAUSE}초 일시정지")
                    time.sleep(CONSECUTIVE_FAIL_PAUSE)
                    consecutive_fails = 0

                # 발송 간 딜레이 (마지막 건 제외)
                if t_idx < len(targets) - 1 and result_code in ("sent",):
                    jitter = random.uniform(-8, 15)
                    wait = max(15, args.delay + jitter)
                    log("INFO", f"    대기 {wait:.0f}초...")
                    time.sleep(wait)

                # 10건마다 요약
                total_processed = total_sent + total_fail + total_skip
                if total_processed > 0 and total_processed % 10 == 0:
                    print_summary(
                        total_sent, total_fail, total_skip,
                        batch_num, time.time() - start_time
                    )

            # === 배치 결과 보고 ===
            if batch_results:
                log("INFO", f"배치 #{batch_num} 결과 보고 ({len(batch_results)}건)...")
                resp = report_results(server_url, campaign_id, worker_id, batch_results)
                if resp is not None:
                    log("OK", "결과 보고 완료")
                else:
                    log("ERR", "결과 보고 실패 (서버 응답 없음)")

            # === 배치 간 딜레이 ===
            if not shutdown_requested and targets:
                batch_delay = random.uniform(25, 45)
                log("INFO", f"배치 간 대기 {batch_delay:.0f}초...")
                time.sleep(batch_delay)

    except KeyboardInterrupt:
        log("WARN", "Ctrl+C -- 종료 중...")
    except Exception as e:
        log("ERR", f"예기치 않은 오류: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # ----- 정리 -----
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

        elapsed = time.time() - start_time

        # ----- 최종 요약 -----
        log("SUM", "")
        log("SUM", "=" * 55)
        log("SUM", "  최종 발송 결과")
        log("SUM", "=" * 55)
        log("SUM", f"  성공: {total_sent}")
        log("SUM", f"  실패: {total_fail}")
        log("SUM", f"  스킵: {total_skip}")
        log("SUM", f"  배치: {batch_num}회")
        log("SUM", f"  사용 계정: {account_idx}/{len(accounts)}개")
        log("SUM", f"  경과 시간: {elapsed / 60:.1f}분")
        if elapsed > 0 and total_sent > 0:
            log("SUM", f"  발송 속도: {total_sent / (elapsed / 60):.1f}건/분")
        log("SUM", "=" * 55)


if __name__ == "__main__":
    main()
