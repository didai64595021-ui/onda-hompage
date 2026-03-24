#!/usr/bin/env python3
"""Selenium 내부에서 JavaScript fetch로 GraphQL 호출 — 429 우회"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from urllib.parse import quote
import time, re, json

keyword = "부산피부과"

opts = Options()
opts.add_argument("--disable-blink-features=AutomationControlled")
opts.add_argument("--no-sandbox")
opts.add_argument("--window-size=1920,1080")
opts.add_experimental_option("excludeSwitches", ["enable-automation"])

try:
    from webdriver_manager.chrome import ChromeDriverManager
    from selenium.webdriver.chrome.service import Service
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
except:
    driver = webdriver.Chrome(options=opts)

driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
    "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
})

# GraphQL 쿼리 (캡처한 것)
GQL_QUERY = """query getNxList($input: HospitalListInput, $reverseGeocodingInput: ReverseGeocodingInput, $isNmap: Boolean = false, $isBounds: Boolean = false, $useReverseGeocode: Boolean = false) {
  businesses: hospitals(input: $input) {
    total
    items {
      id
      name
      category
      distance
      commonAddress
      roadAddress
      phone
      virtualPhone
      imageUrl
      imageCount
      blogCafeReviewCount
      visitorReviewCount
      visitorReviewScore
      x
      y
      __typename
    }
    __typename
  }
}"""

def fetch_page(drv, keyword, start, x="129.075022", y="35.179816"):
    """iframe 컨텍스트에서 JS fetch로 GraphQL 호출"""
    payload = json.dumps([{
        "operationName": "getNxList",
        "variables": {
            "isNmap": True,
            "isBounds": False,
            "useReverseGeocode": False,
            "input": {
                "query": keyword,
                "display": 70,
                "start": start,
                "filterBooking": False,
                "filterOpentime": False,
                "filterSpecialist": False,
                "filterWheelchairEntrance": False,
                "sortingOrder": "precision",
                "x": x,
                "y": y,
                "clientX": x,
                "clientY": y,
                "day": None,
                "deviceType": "pcmap"
            },
            "reverseGeocodingInput": {"x": x, "y": y}
        },
        "query": GQL_QUERY
    }])
    
    # JavaScript fetch (브라우저 세션 쿠키 자동 포함)
    js = f"""
    return await fetch('https://pcmap-api.place.naver.com/graphql', {{
        method: 'POST',
        headers: {{
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Origin': 'https://pcmap.place.naver.com',
        }},
        body: JSON.stringify({payload}),
        credentials: 'include'
    }}).then(r => r.text()).catch(e => 'ERROR:' + e.message);
    """
    
    result = drv.execute_script(js)
    return result

print(f"1. 검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

# iframe 진입 (GraphQL은 pcmap.place.naver.com 도메인에서 호출해야 CORS 통과)
iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

print("\n2. JavaScript fetch로 GraphQL 호출...")
for pg in range(1, 6):
    start = 1 + (pg - 1) * 70
    result = fetch_page(driver, keyword, start)
    
    if result and not result.startswith("ERROR"):
        try:
            data = json.loads(result)
            if isinstance(data, list):
                data = data[0]
            
            biz = data.get("data", {}).get("businesses", {})
            total = biz.get("total", 0)
            items = biz.get("items", [])
            
            names = [it["name"] for it in items[:5]]
            ids = [it["id"] for it in items[:3]]
            
            print(f"\n  페이지 {pg} (start={start}): ✅ {len(items)}건 (total={total})")
            print(f"    처음 5개: {names}")
            print(f"    PID: {ids}")
            
            if len(items) == 0:
                print(f"    → 마지막 페이지")
                break
        except Exception as e:
            print(f"\n  페이지 {pg}: 파싱 에러 - {e}")
            print(f"    응답: {result[:200]}")
    else:
        print(f"\n  페이지 {pg}: {result[:200] if result else '빈 응답'}")

    time.sleep(1)  # 속도 제한

driver.quit()
print("\n완료!")
