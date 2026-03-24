#!/usr/bin/env python3
"""5페이지 클릭 시 실제 GraphQL 요청의 start/display 값 캡처"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from urllib.parse import quote
import time, json

keyword = "부산피부과"

opts = Options()
opts.add_argument("--disable-blink-features=AutomationControlled")
opts.add_argument("--no-sandbox")
opts.add_argument("--window-size=1920,1080")
opts.add_argument("--window-position=-32000,-32000")
opts.add_experimental_option("excludeSwitches", ["enable-automation"])
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

print(f"검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

body = driver.find_element(By.TAG_NAME, "body")

# 각 페이지 클릭하면서 실제 요청 캡처
for target_page in range(2, 7):
    # 스크롤
    for _ in range(10):
        driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
        time.sleep(0.3)
    
    # 로그 비우기
    driver.get_log("performance")
    
    # 페이지 버튼 클릭
    clicked = False
    for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
        if btn.text.strip() == str(target_page):
            driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
            time.sleep(0.3)
            ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
            clicked = True
            break
    
    if not clicked:
        # 다음 페이지 버튼
        for btn in driver.find_elements(By.CSS_SELECTOR, "a.eUTV2"):
            btn_text = btn.get_attribute("textContent") or ""
            if "다음" in btn_text:
                ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
                clicked = True
                break
    
    if not clicked:
        print(f"  페이지 {target_page}: 버튼 없음 → 종료")
        break
    
    time.sleep(3)
    
    # GraphQL 요청 캡처
    logs = driver.get_log("performance")
    for entry in logs:
        try:
            log = json.loads(entry["message"])
            msg = log.get("message", {})
            if msg.get("method") == "Network.requestWillBeSent":
                req = msg.get("params", {}).get("request", {})
                if "graphql" in req.get("url", "") and req.get("method") == "POST":
                    post_data = req.get("postData", "")
                    if "getNxList" in post_data:
                        payload = json.loads(post_data)
                        if isinstance(payload, list):
                            payload = payload[0]
                        inp = payload.get("variables", {}).get("input", {})
                        start = inp.get("start", "?")
                        display = inp.get("display", "?")
                        print(f"  페이지 {target_page}: start={start}, display={display}")
                        break
        except:
            continue
    
    # body 재획득
    try:
        body = driver.find_element(By.TAG_NAME, "body")
    except:
        pass
    
    time.sleep(1)

driver.quit()
print("\n완료!")
