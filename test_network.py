#!/usr/bin/env python3
"""페이지 클릭 시 발생하는 네트워크 요청 캡처"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
from urllib.parse import quote
import time, re, json

keyword = "부산피부과"

opts = Options()
opts.add_argument("--disable-blink-features=AutomationControlled")
opts.add_argument("--no-sandbox")
opts.add_argument("--window-size=1920,1080")
opts.add_experimental_option("excludeSwitches", ["enable-automation"])
# Performance 로그 활성화
opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

try:
    from webdriver_manager.chrome import ChromeDriverManager
    from selenium.webdriver.chrome.service import Service
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
except:
    driver = webdriver.Chrome(options=opts)

driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
    "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
})

print(f"1. 검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

# 스크롤
body = driver.find_element(By.TAG_NAME, "body")
for i in range(10):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

# 로그 비우기 (지금까지의 요청 무시)
try:
    driver.get_log("performance")
except:
    pass

print("\n2. 로그 초기화 완료. 2페이지 클릭합니다...")

# 하단 스크롤
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)

# 2페이지 클릭
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
        time.sleep(0.3)
        ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
        print("   2페이지 클릭!")
        break

time.sleep(5)

# 네트워크 요청 캡처
print("\n3. 클릭 후 네트워크 요청:")
logs = driver.get_log("performance")
requests_found = []

for entry in logs:
    try:
        log = json.loads(entry["message"])
        msg = log.get("message", {})
        method = msg.get("method", "")
        
        if method == "Network.requestWillBeSent":
            params = msg.get("params", {})
            req = params.get("request", {})
            url = req.get("url", "")
            req_method = req.get("method", "")
            
            # place/list, search, graphql 관련 요청 필터
            if any(kw in url.lower() for kw in ["place", "search", "graphql", "list", "hospital", "restaurant", "api"]):
                post_data = req.get("postData", "")
                requests_found.append({
                    "method": req_method,
                    "url": url[:200],
                    "postData": post_data[:300] if post_data else ""
                })
    except:
        continue

if requests_found:
    for i, r in enumerate(requests_found):
        print(f"\n  [{i+1}] {r['method']} {r['url']}")
        if r['postData']:
            print(f"      POST: {r['postData']}")
else:
    print("  (관련 요청 없음)")
    
    # 모든 요청 출력
    print("\n  [전체 요청 목록]")
    all_urls = set()
    for entry in logs:
        try:
            log = json.loads(entry["message"])
            msg = log.get("message", {})
            if msg.get("method") == "Network.requestWillBeSent":
                url = msg["params"]["request"]["url"]
                if url.startswith("http") and "google" not in url and "gstatic" not in url:
                    all_urls.add(url[:150])
        except:
            continue
    for u in sorted(all_urls):
        print(f"    {u}")

# 3페이지도 클릭해보기
print("\n4. 3페이지 클릭...")
try:
    driver.get_log("performance")  # 로그 비우기
except:
    pass

for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "3":
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
        time.sleep(0.3)
        ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
        print("   3페이지 클릭!")
        break

time.sleep(5)

logs2 = driver.get_log("performance")
for entry in logs2:
    try:
        log = json.loads(entry["message"])
        msg = log.get("message", {})
        if msg.get("method") == "Network.requestWillBeSent":
            url = msg["params"]["request"]["url"]
            req_method = msg["params"]["request"]["method"]
            if any(kw in url.lower() for kw in ["place", "search", "graphql", "list", "hospital"]):
                post = msg["params"]["request"].get("postData", "")
                print(f"  {req_method} {url[:200]}")
                if post:
                    print(f"  POST: {post[:500]}")
    except:
        continue

driver.quit()
print("\n완료!")
