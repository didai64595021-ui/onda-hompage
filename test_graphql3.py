#!/usr/bin/env python3
"""Selenium JS fetch + 원본 GraphQL 쿼리 전체 사용"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from urllib.parse import quote
import time, re, json

keyword = "부산피부과"

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

print(f"1. 검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

# 스크롤 + 로그 비우기
body = driver.find_element(By.TAG_NAME, "body")
for i in range(10):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

driver.get_log("performance")

# 2페이지 클릭 → 원본 쿼리 캡처
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
        time.sleep(0.3)
        ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
        print("2페이지 클릭!")
        break

time.sleep(4)

# 원본 GraphQL POST 데이터 캡처
logs = driver.get_log("performance")
original_payload = None
original_headers = {}

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
                if "getNxList" in post_data:
                    original_payload = json.loads(post_data)
                    original_headers = req.get("headers", {})
                    print(f"✅ 원본 쿼리 캡처! (payload 길이: {len(post_data)})")
                    break
    except:
        continue

if not original_payload:
    print("❌ 원본 쿼리 캡처 실패!")
    driver.quit()
    exit()

# getNxList 부분만 추출
gql_item = original_payload[0] if isinstance(original_payload, list) else original_payload

print(f"\n2. 페이지 1~5 JS fetch 호출...")
for pg in range(1, 7):
    start = 1 + (pg - 1) * 70
    
    # variables 복사 후 start 변경
    test_payload = json.loads(json.dumps(gql_item))
    test_payload["variables"]["input"]["start"] = start
    
    # 헤더 구성 (캡처한 것 사용)
    headers_js = {
        "Content-Type": "application/json",
        "Accept": "*/*",
    }
    for k in ["x-wtm-graphql", "x-wtm-ncaptcha-token"]:
        for hk, hv in original_headers.items():
            if hk.lower() == k:
                headers_js[hk] = hv

    headers_str = json.dumps(headers_js)
    payload_str = json.dumps([test_payload]).replace("\\", "\\\\").replace("`", "\\`")
    
    js = f"""
    try {{
        const resp = await fetch('https://pcmap-api.place.naver.com/graphql', {{
            method: 'POST',
            headers: {headers_str},
            body: `{payload_str}`,
            credentials: 'include'
        }});
        const text = await resp.text();
        return resp.status + '|||' + text;
    }} catch(e) {{
        return 'ERROR:' + e.message;
    }}
    """
    
    result = driver.execute_script(js)
    
    if result and "|||" in result:
        status, body_text = result.split("|||", 1)
        try:
            data = json.loads(body_text)
            if isinstance(data, list):
                data = data[0]
            
            biz = data.get("data", {}).get("businesses", {})
            total = biz.get("total", 0)
            items = biz.get("items", [])
            
            names = [it.get("name", "") for it in items[:5]]
            
            print(f"\n  페이지 {pg} (start={start}): HTTP {status}, {len(items)}건 (total={total})")
            print(f"    업체: {names}")
            
            if len(items) == 0:
                print(f"    → 데이터 없음, 종료")
                break
        except Exception as e:
            print(f"\n  페이지 {pg}: HTTP {status}, 파싱 에러 - {e}")
            print(f"    응답: {body_text[:200]}")
    else:
        print(f"\n  페이지 {pg}: {result[:200] if result else '빈 응답'}")
    
    time.sleep(1.5)

driver.quit()
print("\n완료!")
