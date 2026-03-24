#!/usr/bin/env python3
"""광고 업체 필드 확인용 — 어떤 필드로 광고 구분하는지 파악"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from urllib.parse import quote
import time, json

keyword = "포항성형외과"

opts = Options()
opts.add_argument("--disable-blink-features=AutomationControlled")
opts.add_argument("--no-sandbox")
opts.add_argument("--window-size=1920,1080")
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
for i in range(10):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

driver.get_log("performance")

# 2페이지 클릭 시도
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
        print("2페이지 클릭!")
        break
else:
    print("2페이지 버튼 없음 — 1페이지로 진행")

time.sleep(4)

logs = driver.get_log("performance")
gql_payload = None

for entry in logs:
    try:
        log = json.loads(entry["message"])
        msg = log.get("message", {})
        if msg.get("method") == "Network.requestWillBeSent":
            params = msg.get("params", {})
            req = params.get("request", {})
            url = req.get("url", "")
            if "graphql" in url and req.get("method") == "POST":
                post_data = req.get("postData", "")
                if "getNxList" in post_data or "getPlaceList" in post_data:
                    gql_payload = json.loads(post_data)
                    if isinstance(gql_payload, list):
                        gql_payload = gql_payload[0]
                    print(f"✅ GraphQL 캡처!")
                    break
    except:
        continue

if gql_payload:
    # 1페이지 fetch
    import base64
    test_payload = json.loads(json.dumps(gql_payload))
    test_payload["variables"]["input"]["start"] = 1
    payload_b64 = base64.b64encode(json.dumps([test_payload]).encode()).decode()
    
    js = f"""
    try {{
        const resp = await fetch('https://pcmap-api.place.naver.com/graphql', {{
            method: 'POST',
            headers: {{'Content-Type': 'application/json'}},
            body: atob('{payload_b64}'),
            credentials: 'include'
        }});
        return await resp.text();
    }} catch(e) {{
        return 'ERROR:' + e.message;
    }}
    """
    result = driver.execute_script(js)
    data = json.loads(result)
    if isinstance(data, list):
        data = data[0]
    
    items = data.get("data", {}).get("businesses", {}).get("items", [])
    print(f"\n총 {len(items)}건\n")
    
    for i, it in enumerate(items[:15]):
        # 광고 관련 필드 전부 출력
        ad_fields = {}
        for key in it.keys():
            val = it[key]
            if any(kw in key.lower() for kw in ["ad", "sponsor", "promo", "mark", "type", "label"]):
                ad_fields[key] = val
        
        print(f"[{i+1}] {it.get('name', '?')} (id={it.get('id','')})")
        print(f"    광고 관련 필드: {ad_fields}")
        print(f"    전체 키: {list(it.keys())[:15]}")
        print()
else:
    print("GraphQL 캡처 실패 — 1페이지만")

driver.quit()
