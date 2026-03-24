#!/usr/bin/env python3
"""pcmap API 직접 호출 테스트 — 페이지별 데이터 가져오기"""
import requests, json, re
from urllib.parse import quote

keyword = "부산피부과"

# pcmap.place.naver.com의 내부 API를 찾자
# 네이버 지도 검색 결과 iframe이 사용하는 API

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://map.naver.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
})

print("=== 방법 1: pcmap-api GraphQL ===")
# 이전에 429 차단됐지만, 적절한 헤더로 재시도
gql_url = "https://pcmap-api.place.naver.com/graphql"

# 네이버 지도 검색 GraphQL 쿼리
gql_query = """
query getPlacesList($input: PlacesInput) {
  businesses: places(input: $input) {
    total
    items {
      id
      name
      category
      rank
      x
      y
    }
  }
}
"""

for page_num in [1, 2, 3]:
    try:
        payload = {
            "operationName": "getPlacesList",
            "variables": {
                "input": {
                    "query": keyword,
                    "start": (page_num - 1) * 70 + 1,
                    "display": 70,
                    "x": "129.075022",
                    "y": "35.179816",
                }
            },
            "query": gql_query
        }
        resp = session.post(gql_url, json=payload, timeout=5)
        print(f"  페이지 {page_num}: HTTP {resp.status_code}, 길이 {len(resp.text)}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  데이터: {json.dumps(data, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"  페이지 {page_num}: 에러 - {e}")

print("\n=== 방법 2: pcmap.place.naver.com/place/list HTML 직접 ===")
for page_num in [1, 2]:
    url = f"https://pcmap.place.naver.com/place/list?query={quote(keyword)}&display=70&x=129.075022&y=35.179816&start={1 + (page_num-1)*70}"
    try:
        resp = session.get(url, timeout=5)
        pids = list(set(re.findall(r'"id"\s*:\s*"(\d{5,})"', resp.text)))
        print(f"  페이지 {page_num} (start={1+(page_num-1)*70}): HTTP {resp.status_code}, PID {len(pids)}건")
        if pids:
            print(f"    처음 5개: {pids[:5]}")
    except Exception as e:
        print(f"  페이지 {page_num}: 에러 - {e}")

print("\n=== 방법 3: hospital/list 경로 (피부과 전용) ===")
for page_num in [1, 2]:
    url = f"https://pcmap.place.naver.com/hospital/list?query={quote(keyword)}&display=70&x=129.075022&y=35.179816&start={1 + (page_num-1)*70}"
    try:
        resp = session.get(url, timeout=5)
        pids = list(set(re.findall(r'"id"\s*:\s*"(\d{5,})"', resp.text)))
        print(f"  페이지 {page_num} (start={1+(page_num-1)*70}): HTTP {resp.status_code}, PID {len(pids)}건")
        if pids:
            print(f"    처음 5개: {pids[:5]}")
    except Exception as e:
        print(f"  페이지 {page_num}: 에러 - {e}")

print("\n=== 방법 4: Selenium에서 React __NEXT_DATA__ 확인 ===")
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

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

driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
import time
time.sleep(6)

iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

# __NEXT_DATA__ 확인
try:
    next_data = driver.execute_script("return document.getElementById('__NEXT_DATA__')?.textContent")
    if next_data:
        data = json.loads(next_data)
        print(f"  __NEXT_DATA__ 발견! 키: {list(data.keys())}")
        # props 확인
        if "props" in data:
            props = data["props"]
            if "pageProps" in props:
                pp = props["pageProps"]
                print(f"  pageProps 키: {list(pp.keys())[:10]}")
                # 전체 아이템 수
                for key in pp:
                    if isinstance(pp[key], dict) and "total" in pp[key]:
                        print(f"  {key}.total = {pp[key]['total']}")
                    if isinstance(pp[key], list) and len(pp[key]) > 0:
                        print(f"  {key}: {len(pp[key])}건")
                        if isinstance(pp[key][0], dict) and "id" in pp[key][0]:
                            print(f"    첫번째: {pp[key][0].get('name', '')} (id: {pp[key][0]['id']})")
    else:
        print("  __NEXT_DATA__ 없음")
except Exception as e:
    print(f"  __NEXT_DATA__ 에러: {e}")

# React Fiber에서 페이지 상태 확인
try:
    result = driver.execute_script("""
        // React internal state에서 검색 결과 찾기
        var root = document.getElementById('app-root');
        if (root && root._reactRootContainer) {
            return 'React root 발견';
        }
        // __NEXT_DATA__ script 태그
        var scripts = document.querySelectorAll('script');
        for (var i = 0; i < scripts.length; i++) {
            var txt = scripts[i].textContent || '';
            if (txt.includes('__NEXT_DATA__') || txt.includes('pageProps')) {
                return 'NEXT script: ' + txt.substring(0, 300);
            }
        }
        return 'React state 못 찾음';
    """)
    print(f"  React: {result[:300]}")
except Exception as e:
    print(f"  React 에러: {e}")

# window.__NEXT_DATA__ 직접 접근
try:
    nd = driver.execute_script("return window.__NEXT_DATA__")
    if nd:
        print(f"  window.__NEXT_DATA__: {list(nd.keys())}")
        pp = nd.get("props", {}).get("pageProps", {})
        print(f"  pageProps 키: {list(pp.keys())[:15]}")
        # 검색 결과 찾기
        for k, v in pp.items():
            if isinstance(v, dict):
                if "items" in v:
                    items = v["items"]
                    print(f"  {k}.items: {len(items)}건")
                    if items and "id" in items[0]:
                        print(f"    [{items[0].get('name','')}] ~ [{items[-1].get('name','')}]")
                if "total" in v:
                    print(f"  {k}.total: {v['total']}")
except Exception as e:
    print(f"  window.__NEXT_DATA__ 에러: {e}")

driver.quit()
print("\n완료!")
