#!/usr/bin/env python3
"""부산피부과 5페이지 확인 — start 값 범위 테스트"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from urllib.parse import quote
import time, json, base64

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
for i in range(10):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

driver.get_log("performance")

# 2페이지 클릭
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
        print("2페이지 클릭!")
        break
time.sleep(4)

logs = driver.get_log("performance")
gql_payload = None
for entry in logs:
    try:
        log = json.loads(entry["message"])
        msg = log.get("message", {})
        if msg.get("method") == "Network.requestWillBeSent":
            req = msg.get("params", {}).get("request", {})
            if "graphql" in req.get("url", "") and req.get("method") == "POST":
                post_data = req.get("postData", "")
                if "getNxList" in post_data:
                    gql_payload = json.loads(post_data)
                    if isinstance(gql_payload, list):
                        gql_payload = gql_payload[0]
                    print("✅ GraphQL 캡처!")
                    break
    except:
        continue

if not gql_payload:
    print("❌ 캡처 실패")
    driver.quit()
    exit()

# 페이지 1~6 테스트 (start 값 다양하게)
test_starts = [
    (1, "페이지1"),
    (71, "페이지2"),
    (141, "페이지3"),
    (211, "페이지4"),
    (281, "페이지5"),
    (351, "페이지6"),
]

for start, label in test_starts:
    test_payload = json.loads(json.dumps(gql_payload))
    test_payload["variables"]["input"]["start"] = start
    payload_b64 = base64.b64encode(json.dumps([test_payload]).encode()).decode()
    
    js = f"""
    try {{
        const resp = await fetch('https://pcmap-api.place.naver.com/graphql', {{
            method: 'POST',
            headers: {{'Content-Type': 'application/json'}},
            body: atob('{payload_b64}'),
            credentials: 'include'
        }});
        const text = await resp.text();
        return resp.status + '|||' + text;
    }} catch(e) {{
        return 'ERROR:' + e.message;
    }}
    """
    
    result = driver.execute_script(js)
    status, body_text = result.split("|||", 1)
    data = json.loads(body_text)
    if isinstance(data, list):
        data = data[0]
    
    biz = data.get("data", {}).get("businesses", {})
    total = biz.get("total", 0)
    items = biz.get("items", [])
    names = [it.get("name", "") for it in items[:3]]
    
    print(f"  {label} (start={start}): HTTP {status}, {len(items)}건, total={total}")
    if names:
        print(f"    → {names}")
    
    time.sleep(1)

driver.quit()
print("\n완료!")
