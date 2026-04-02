#!/usr/bin/env python3
"""
네이버 톡톡 발송 테스트 — 10건
로그인 → 톡톡 채팅방 열기 → 메시지 전송
"""
import time
import json
import random
import os
import sys
from datetime import datetime

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    print("❌ 패키지 설치 필요: pip install undetected-chromedriver selenium")
    sys.exit(1)

from captcha_solver import solve_naver_captcha

NAVER_ID = os.environ.get('NAVER_ID', '')
NAVER_PW = os.environ.get('NAVER_PW', '')
MESSAGE = "안녕하세요"
MAX_SEND = 10
SEND_INTERVAL = 30
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_send_log.json")

def get_talktalk_targets():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history.json")
    if not os.path.exists(db_path):
        db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output", "history.json")
    with open(db_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    targets = []
    for key, biz in data.get("crawled", {}).items():
        talk = biz.get("naverTalktalk", "")
        if not talk:
            continue
        for link in talk.split(" / "):
            link = link.strip()
            if "talk.naver.com" in link:
                parts = link.rstrip("/").split("/")
                talk_id = parts[-1] if parts[-1] not in ("profile", "web", "policy", "operation", "form") else ""
                if talk_id and len(talk_id) >= 4:
                    targets.append({
                        "name": biz.get("name", ""),
                        "talk_url": f"https://talk.naver.com/ct/{talk_id}",
                        "talk_id": talk_id,
                        "category": biz.get("category", ""),
                    })
                    break
    
    seen = set()
    unique = []
    for t in targets:
        if t["talk_id"] not in seen:
            seen.add(t["talk_id"])
            unique.append(t)
    return unique

def create_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=ko-KR")
    driver = uc.Chrome(options=options, version_main=145)
    return driver

def naver_login(driver):
    print(f"🔑 네이버 로그인 시도... ({NAVER_ID})")
    driver.get("https://nid.naver.com/nidlogin.login")
    time.sleep(3)
    
    # dispatchEvent 방식 (봇 감지 우회)
    driver.execute_script(f'''
        var id = document.getElementById('id');
        id.focus();
        id.value = '{NAVER_ID}';
        id.dispatchEvent(new Event('input', {{bubbles: true}}));
        id.dispatchEvent(new Event('change', {{bubbles: true}}));
        
        var pw = document.getElementById('pw');
        pw.focus();
        pw.value = '{NAVER_PW}';
        pw.dispatchEvent(new Event('input', {{bubbles: true}}));
        pw.dispatchEvent(new Event('change', {{bubbles: true}}));
    ''')
    time.sleep(1)
    
    driver.find_element(By.ID, "log.login").click()
    time.sleep(5)
    
    current_url = driver.current_url
    if "nidlogin" in current_url:
        page_source = driver.page_source
        if "captcha" in page_source.lower() or "캡차" in page_source or "자동입력" in page_source:
            print("🔐 캡차 감지 — AI 솔버 작동...")
            driver.execute_script(f'''
                var pw = document.getElementById('pw');
                pw.focus(); pw.value = '{NAVER_PW}';
                pw.dispatchEvent(new Event('input', {{bubbles: true}}));
            ''')
            if solve_naver_captcha(driver, max_retries=3):
                print("✅ 캡차 통과 + 로그인 성공!")
                return True
            else:
                print("❌ 캡차 풀기 실패")
                return False
        print("⚠️ 로그인 실패 — 원인 불명")
        driver.save_screenshot(os.path.join(os.path.dirname(os.path.abspath(__file__)), "login_fail.png"))
        return False
    
    print("✅ 로그인 성공!")
    return True

def send_talktalk(driver, target):
    talk_url = target["talk_url"]
    name = target["name"]
    print(f"  💬 [{name}] {talk_url}")
    
    try:
        driver.get(talk_url)
        time.sleep(5)
        
        # 톡톡 채팅 입력창 찾기 — 여러 셀렉터 시도
        selectors = [
            "div[contenteditable='true']",
            "[data-placeholder*='대화']",
            "[data-placeholder*='메시지']",
            "[placeholder*='대화']",
            ".chat_input",
            ".textarea_chat",
            "#chatInput",
            "textarea",
            "[role='textbox']",
        ]
        
        input_el = None
        for sel in selectors:
            try:
                els = driver.find_elements(By.CSS_SELECTOR, sel)
                for el in els:
                    if el.is_displayed():
                        input_el = el
                        break
                if input_el:
                    break
            except:
                continue
        
        if not input_el:
            # JS로 찾기
            result = driver.execute_script('''
                var els = document.querySelectorAll('[contenteditable=true], textarea, [role=textbox]');
                for (var i = 0; i < els.length; i++) {
                    if (els[i].offsetParent !== null && els[i].offsetHeight > 10) {
                        return els[i].tagName + '|' + els[i].className + '|' + (els[i].id || '');
                    }
                }
                return null;
            ''')
            if result:
                tag, cls, eid = result.split('|')
                print(f"    🔍 JS로 입력창 발견: <{tag}> class={cls[:40]} id={eid}")
                if eid:
                    input_el = driver.find_element(By.ID, eid)
                elif cls:
                    input_el = driver.find_element(By.CSS_SELECTOR, f"{tag}.{cls.split()[0]}")
                else:
                    input_el = driver.find_element(By.TAG_NAME, tag)
        
        if input_el:
            input_el.click()
            time.sleep(0.5)
            
            # 인간적 타이핑
            for char in MESSAGE:
                input_el.send_keys(char)
                time.sleep(random.uniform(0.05, 0.15))
            
            time.sleep(0.5)
            
            # 보내기: Enter 또는 보내기 버튼
            try:
                send_btn = driver.find_element(By.CSS_SELECTOR, "button[class*='send'], button[class*='btn_send'], [aria-label*='보내기']")
                send_btn.click()
            except:
                input_el.send_keys(Keys.ENTER)
            
            time.sleep(1)
            print(f"    ✅ 전송 완료")
            return "success"
        else:
            ss_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"fail_{target['talk_id']}.png")
            driver.save_screenshot(ss_path)
            print(f"    ❌ 입력창 없음 (스크린샷: {ss_path})")
            return "no_input"
            
    except Exception as e:
        print(f"    ❌ 오류: {e}")
        return "error"

def main():
    print("=" * 60)
    print(f"🚀 네이버 톡톡 발송 테스트 ({MAX_SEND}건)")
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"👤 계정: {NAVER_ID}")
    print(f"💬 메시지: {MESSAGE}")
    print(f"⏱️ 발송간격: {SEND_INTERVAL}초")
    print("=" * 60)
    
    targets = get_talktalk_targets()
    print(f"\n📋 톡톡 발송 가능 업체: {len(targets)}건")
    
    if not targets:
        print("❌ 톡톡 링크가 있는 업체가 없습니다.")
        return
    
    selected = random.sample(targets, min(MAX_SEND, len(targets)))
    print(f"🎯 발송 대상: {len(selected)}건\n")
    for i, t in enumerate(selected):
        print(f"  {i+1}. {t['name']} ({t['category']}) → {t['talk_id']}")
    print()
    
    driver = None
    log = {"timestamp": datetime.now().isoformat(), "account": NAVER_ID, "message": MESSAGE, "results": []}
    
    try:
        driver = create_driver()
        
        if not naver_login(driver):
            log["status"] = "login_failed"
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
            return
        
        success = 0
        fail = 0
        
        for i, target in enumerate(selected):
            print(f"\n[{i+1}/{len(selected)}] 발송 중...")
            result = send_talktalk(driver, target)
            
            log["results"].append({
                "name": target["name"], "talk_id": target["talk_id"],
                "category": target["category"], "result": result,
                "time": datetime.now().isoformat(),
            })
            
            if result == "success":
                success += 1
            else:
                fail += 1
            
            if i < len(selected) - 1:
                wait = SEND_INTERVAL + random.uniform(-5, 5)
                print(f"  ⏳ {wait:.0f}초 대기...")
                time.sleep(max(10, wait))
        
        log["status"] = "completed"
        log["summary"] = {"success": success, "fail": fail, "total": len(selected)}
        
        print(f"\n{'=' * 60}")
        print(f"✅ 발송 완료! 성공: {success} / 실패: {fail} / 총: {len(selected)}")
        print(f"{'=' * 60}")
        
    except Exception as e:
        print(f"\n❌ 치명적 오류: {e}")
        log["status"] = "error"
        log["error"] = str(e)
    finally:
        if driver:
            try: driver.quit()
            except: pass
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(log, f, ensure_ascii=False, indent=2)
        print(f"📝 로그 저장: {LOG_FILE}")

if __name__ == "__main__":
    main()
