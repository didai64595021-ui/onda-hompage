#!/usr/bin/env python3
"""
네이버 톡톡 대량 발송 시스템
- 계정 리스트 순환 (ID:PW)
- DB에서 톡톡 가능 업체 자동 추출
- 30초 간격 발송
- 계정당 2시간 만료 타이머
- 발송 이력 중복 방지
- 실시간 로그 + JSON 리포트

사용법:
  python3 mass_sender.py                    # accounts.txt + DB 자동
  python3 mass_sender.py --accounts a.txt   # 계정 파일 지정
  python3 mass_sender.py --message "홍보문구" # 메시지 변경
  python3 mass_sender.py --limit 50         # 발송 제한
  python3 mass_sender.py --dry-run          # 실제 발송 안 함
"""
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
import time
import json
import random
import os
import sys
import argparse
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "history.json")
DB_PATH_ALT = os.path.join(BASE_DIR, "..", "output", "history.json")
SENT_LOG = os.path.join(BASE_DIR, "sent_history.json")
SESSION_LOG_DIR = os.path.join(BASE_DIR, "reports")
ACCOUNTS_FILE = os.path.join(BASE_DIR, "accounts.txt")

DEFAULT_MSG = "안녕하세요"
SEND_INTERVAL = 30  # 초
ACCOUNT_LIFETIME = 7200  # 2시간 (초)
MAX_PER_ACCOUNT = 200  # 계정당 최대 발송


def load_accounts(path):
    """계정 파일 로드 (ID:PW 또는 ID PW 형식, 줄당 1개)"""
    accounts = []
    if not os.path.exists(path):
        print(f"❌ 계정 파일 없음: {path}")
        return accounts
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.replace("\t", ":").replace(" ", ":").split(":")
            if len(parts) >= 2:
                accounts.append({"id": parts[0].strip(), "pw": parts[1].strip()})
    print(f"📋 계정 {len(accounts)}개 로드")
    return accounts


def load_targets():
    """DB에서 톡톡 가능 업체 추출"""
    db_path = DB_PATH if os.path.exists(DB_PATH) else DB_PATH_ALT
    if not os.path.exists(db_path):
        print(f"❌ DB 없음: {db_path}")
        return []

    with open(db_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    targets = []
    for key, biz in data.get("crawled", {}).items():
        # talktalkId가 있으면 우선 사용
        talk_id = biz.get("talktalkId", "")
        if not talk_id:
            talk = biz.get("naverTalktalk", "")
            if not talk:
                continue
            for link in talk.split(" / "):
                if "talk.naver.com" in link:
                    parts = link.rstrip("/").split("/")
                    tid = parts[-1]
                    if tid not in ("profile", "web", "policy", "operation", "form", "ch") and len(tid) >= 4:
                        talk_id = tid
                        break
        if not talk_id:
            continue

        targets.append({
            "name": biz.get("name", ""),
            "talk_id": talk_id,
            "category": biz.get("category", ""),
            "address": biz.get("address", ""),
        })

    # 중복 제거
    seen = set()
    unique = []
    for t in targets:
        if t["talk_id"] not in seen:
            seen.add(t["talk_id"])
            unique.append(t)

    print(f"📋 톡톡 가능 업체 {len(unique)}건")
    return unique


def load_sent_history():
    """발송 이력 로드 (중복 방지)"""
    if os.path.exists(SENT_LOG):
        with open(SENT_LOG, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"sent": {}}  # {talk_id: {account, time, result}}


def save_sent_history(history):
    with open(SENT_LOG, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def create_driver():
    o = uc.ChromeOptions()
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
    o.add_argument("--window-size=1920,1080")
    return uc.Chrome(options=o, version_main=145)


def naver_login(driver, account_id, account_pw):
    """네이버 로그인 (dispatchEvent 방식)"""
    print(f"  🔑 로그인: {account_id}")
    driver.get("https://nid.naver.com/nidlogin.login")
    time.sleep(3)

    driver.execute_script(f"""
        var id=document.getElementById('id');id.focus();id.value='{account_id}';
        id.dispatchEvent(new Event('input',{{bubbles:true}}));
        var pw=document.getElementById('pw');pw.focus();pw.value='{account_pw}';
        pw.dispatchEvent(new Event('input',{{bubbles:true}}));
    """)
    time.sleep(1)
    driver.find_element(By.ID, "log.login").click()
    time.sleep(5)

    if "nidlogin" in driver.current_url:
        src = driver.page_source
        if "captcha" in src.lower() or "캡차" in src:
            print("  🔐 캡차 감지 — AI 솔버 시도")
            try:
                from captcha_solver import solve_naver_captcha
                driver.execute_script(f"""
                    var pw=document.getElementById('pw');pw.focus();pw.value='{account_pw}';
                    pw.dispatchEvent(new Event('input',{{bubbles:true}}));
                """)
                if solve_naver_captcha(driver, max_retries=3):
                    return True
            except:
                pass
            return False
        return False

    return True


def send_message(driver, talk_id, message):
    """톡톡 메시지 전송"""
    url = f"https://talk.naver.com/ct/{talk_id}"
    driver.get(url)
    time.sleep(5)

    # 본인확인 팝업 체크
    if "본인 확인 후 톡톡" in driver.page_source:
        return "verify_needed"

    # JS로 입력 + 보내기
    result = driver.execute_script(f"""
        var ta = document.querySelector('textarea.chat_input');
        if(!ta) return 'no_textarea';
        ta.focus();
        var s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
        s.call(ta, '{message}');
        ta.dispatchEvent(new Event('input', {{bubbles:true}}));
        var btn = document.querySelector('button.btn_submit');
        if(btn && !btn.disabled) {{ btn.click(); return 'sent'; }}
        return 'btn_disabled';
    """)

    time.sleep(1)
    return result


def main():
    parser = argparse.ArgumentParser(description="네이버 톡톡 대량 발송")
    parser.add_argument("--accounts", default=ACCOUNTS_FILE, help="계정 파일 경로")
    parser.add_argument("--message", default=DEFAULT_MSG, help="발송 메시지")
    parser.add_argument("--limit", type=int, default=0, help="최대 발송 수 (0=무제한)")
    parser.add_argument("--dry-run", action="store_true", help="실제 발송 안 함")
    parser.add_argument("--skip-sent", action="store_true", default=True, help="이미 발송한 업체 스킵")
    args = parser.parse_args()

    print("=" * 60)
    print(f"🚀 네이버 톡톡 대량 발송 시스템")
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"💬 메시지: {args.message}")
    print(f"⏱️ 발송간격: {SEND_INTERVAL}초")
    print(f"🔄 계정 수명: {ACCOUNT_LIFETIME // 3600}시간")
    print("=" * 60)

    # 로드
    accounts = load_accounts(args.accounts)
    if not accounts:
        print("❌ 계정 없음. accounts.txt에 ID:PW 형식으로 추가하세요.")
        return

    targets = load_targets()
    if not targets:
        print("❌ 톡톡 가능 업체 없음.")
        return

    sent_history = load_sent_history()

    # 이미 발송된 업체 제외
    if args.skip_sent:
        before = len(targets)
        targets = [t for t in targets if t["talk_id"] not in sent_history["sent"]]
        skipped = before - len(targets)
        if skipped:
            print(f"⏭️ 이미 발송된 {skipped}건 스킵 → 남은 {len(targets)}건")

    if args.limit > 0:
        targets = targets[:args.limit]
        print(f"🎯 발송 제한: {args.limit}건")

    random.shuffle(targets)

    # 세션 리포트 초기화
    os.makedirs(SESSION_LOG_DIR, exist_ok=True)
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_results = []

    total_sent = 0
    total_fail = 0
    account_idx = 0
    driver = None
    account_start_time = None
    account_sent = 0

    try:
        for i, target in enumerate(targets):
            # 계정 교체 필요 체크
            need_new_account = (
                driver is None
                or (account_start_time and time.time() - account_start_time > ACCOUNT_LIFETIME)
                or account_sent >= MAX_PER_ACCOUNT
            )

            if need_new_account:
                if driver:
                    try:
                        driver.quit()
                    except:
                        pass
                    time.sleep(2)

                if account_idx >= len(accounts):
                    print(f"\n⚠️ 모든 계정 소진 ({account_idx}/{len(accounts)})")
                    break

                acct = accounts[account_idx]
                account_idx += 1
                account_sent = 0

                print(f"\n🔄 계정 #{account_idx}: {acct['id']}")
                try:
                    driver = create_driver()
                except Exception as e:
                    print(f"  ❌ Chrome 시작 실패: {e}")
                    time.sleep(5)
                    continue

                if not naver_login(driver, acct["id"], acct["pw"]):
                    print(f"  ❌ 로그인 실패 — 다음 계정으로")
                    try:
                        driver.quit()
                    except:
                        pass
                    driver = None
                    continue

                account_start_time = time.time()
                print(f"  ✅ 로그인 성공 (만료: {datetime.fromtimestamp(account_start_time + ACCOUNT_LIFETIME).strftime('%H:%M:%S')})")

            # 발송
            name = target["name"]
            talk_id = target["talk_id"]
            print(f"\n[{i + 1}/{len(targets)}] {name} ({target['category']}) → {talk_id}")

            if args.dry_run:
                print(f"  🏃 DRY RUN — 스킵")
                session_results.append({"name": name, "talk_id": talk_id, "result": "dry_run"})
                continue

            try:
                result = send_message(driver, talk_id, args.message)
            except Exception as e:
                result = f"error:{str(e)[:50]}"
                print(f"  ❌ 예외: {e}")

            if result == "sent":
                total_sent += 1
                account_sent += 1
                print(f"  ✅ 전송! (계정 {account_sent}건째)")
            elif result == "verify_needed":
                print(f"  ❌ 본인확인 필요 — 계정 교체")
                driver.quit()
                driver = None
                total_fail += 1
            else:
                total_fail += 1
                print(f"  ❌ 실패: {result}")

            # 이력 저장
            sent_history["sent"][talk_id] = {
                "account": accounts[account_idx - 1]["id"],
                "time": datetime.now().isoformat(),
                "result": result,
                "name": name,
            }
            session_results.append({"name": name, "talk_id": talk_id, "result": result})

            # 중간 저장 (10건마다)
            if (i + 1) % 10 == 0:
                save_sent_history(sent_history)
                print(f"  💾 중간저장 ({total_sent}성공/{total_fail}실패)")

            # 대기
            if i < len(targets) - 1 and result == "sent":
                wait = SEND_INTERVAL + random.uniform(-5, 5)
                print(f"  ⏳ {wait:.0f}초 대기")
                time.sleep(max(15, wait))

    except KeyboardInterrupt:
        print("\n\n⚠️ 중단됨 — 저장 중...")
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass

        # 최종 저장
        save_sent_history(sent_history)

        # 세션 리포트
        report = {
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "message": args.message,
            "accounts_used": account_idx,
            "total_targets": len(targets),
            "sent": total_sent,
            "failed": total_fail,
            "results": session_results,
        }
        report_path = os.path.join(SESSION_LOG_DIR, f"session_{session_id}.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"\n{'=' * 60}")
        print(f"✅ 발송 완료!")
        print(f"📊 성공: {total_sent} / 실패: {total_fail} / 총: {len(targets)}")
        print(f"👤 사용 계정: {account_idx}개")
        print(f"📝 리포트: {report_path}")
        print(f"📝 발송 이력: {SENT_LOG}")
        print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
