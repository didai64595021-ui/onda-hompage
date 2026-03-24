#!/usr/bin/env python3
"""GraphQL getNxList 전체 쿼리 캡처 + 직접 호출 테스트"""
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

body = driver.find_element(By.TAG_NAME, "body")
for i in range(10):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

# 로그 비우기
driver.get_log("performance")

# 2페이지 클릭
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
        time.sleep(0.3)
        ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
        print("2페이지 클릭!")
        break

time.sleep(5)

# GraphQL 요청 전체 캡처
print("\n=== GraphQL 요청 전체 내용 ===")
logs = driver.get_log("performance")
graphql_request = None
graphql_headers = None

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
                headers = req.get("headers", {})
                graphql_request = post_data
                graphql_headers = headers
                print(f"URL: {url}")
                print(f"\nHeaders:")
                for k, v in sorted(headers.items()):
                    if k.lower() not in ("user-agent", "accept-encoding"):
                        print(f"  {k}: {v[:100]}")
                print(f"\nPOST 데이터 (전체):")
                print(post_data)
                break
    except:
        continue

if not graphql_request:
    print("GraphQL 요청 못 찾음!")
    driver.quit()
    exit()

# 직접 호출 테스트
print("\n\n=== 직접 GraphQL 호출 테스트 ===")
import requests

# 원본 요청 파싱
try:
    gql_data = json.loads(graphql_request)
    if isinstance(gql_data, list):
        gql_data = gql_data[0]
    
    print(f"operationName: {gql_data.get('operationName')}")
    variables = gql_data.get("variables", {})
    print(f"variables: {json.dumps(variables, ensure_ascii=False, indent=2)[:500]}")
    
    query = gql_data.get("query", "")
    print(f"\nquery 길이: {len(query)}")
    print(f"query 앞부분: {query[:300]}")
    
    # 페이지별 테스트
    session = requests.Session()
    
    # 헤더 복사
    req_headers = {
        "Content-Type": "application/json",
        "Origin": "https://pcmap.place.naver.com",
        "Referer": "https://pcmap.place.naver.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    # 중요 헤더 추가
    if graphql_headers:
        for k in ["cookie", "x-wtm-graphql", "x-naver-agent"]:
            for hk, hv in graphql_headers.items():
                if hk.lower() == k:
                    req_headers[hk] = hv

    for pg in [1, 2, 3, 4, 5]:
        start = 1 + (pg - 1) * 70
        
        # variables 복사 후 start 변경
        test_vars = json.loads(json.dumps(variables))
        if "input" in test_vars:
            test_vars["input"]["start"] = start
        
        payload = [{
            "operationName": gql_data["operationName"],
            "variables": test_vars,
            "query": query,
        }]
        
        resp = session.post("https://pcmap-api.place.naver.com/graphql",
                           json=payload, headers=req_headers, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            # 결과에서 PID 추출
            data_str = json.dumps(data, ensure_ascii=False)
            pids = list(set(re.findall(r'"id"\s*:\s*"(\d{5,})"', data_str)))
            
            # 업체명 추출
            names = re.findall(r'"name"\s*:\s*"([^"]+)"', data_str)
            biz_names = [n for n in names if len(n) > 2 and len(n) < 50 
                         and not n.startswith("get") and not n.startswith("place")]
            
            print(f"\n  페이지 {pg} (start={start}): HTTP {resp.status_code}")
            print(f"    PID: {len(pids)}건")
            print(f"    업체명: {biz_names[:5]}")
        else:
            print(f"\n  페이지 {pg} (start={start}): HTTP {resp.status_code}")
            print(f"    응답: {resp.text[:200]}")

except Exception as e:
    print(f"에러: {e}")
    import traceback
    traceback.print_exc()

driver.quit()
print("\n완료!")
