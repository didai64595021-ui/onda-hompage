#!/usr/bin/env python3
"""
Selenium 디버그 테스트 v2 — iframe 내부 HTML 덤프 + place 링크 구조 확인

사용법: python test_selenium_debug.py "구리 피부과"
"""
import sys
import time
import json
import re
from urllib.parse import quote

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    print("❌ selenium 미설치 — pip install selenium")
    sys.exit(1)

try:
    from webdriver_manager.chrome import ChromeDriverManager
    USE_WDM = True
except ImportError:
    USE_WDM = False

keyword = sys.argv[1] if len(sys.argv) > 1 else "구리 피부과"
print(f"키워드: [{keyword}]")
print(f"URL: https://map.naver.com/p/search/{quote(keyword)}")
print("=" * 60)

# ── 드라이버 생성 (화면 보이게) ──
opts = Options()
# headless 끔 — 화면 보면서 디버그
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.add_argument("--disable-gpu")
opts.add_argument("--window-size=1920,1080")
opts.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

print("[1] Chrome 시작...")
if USE_WDM:
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
else:
    driver = webdriver.Chrome(options=opts)
print("    ✅ OK")

# ── 접속 ──
url = f"https://map.naver.com/p/search/{quote(keyword)}"
print(f"\n[2] 접속: {url}")
driver.get(url)
time.sleep(6)
print(f"    현재 URL: {driver.current_url}")

# ── 모든 iframe 나열 ──
print("\n[3] iframe 목록:")
all_iframes = driver.find_elements(By.TAG_NAME, "iframe")
print(f"    총 {len(all_iframes)}개")
for i, f in enumerate(all_iframes):
    fid = f.get_attribute("id") or ""
    fname = f.get_attribute("name") or ""
    fsrc = f.get_attribute("src") or ""
    print(f"    [{i}] id='{fid}' name='{fname}' src='{fsrc[:100]}'")

# ── iframe 진입 시도 ──
print("\n[4] iframe 진입 시도...")
selectors = [
    "iframe#searchIframe",
    "iframe[name='searchIframe']",
    "iframe[src*='search']",
]
entered = False
for sel in selectors:
    try:
        iframe = WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, sel))
        )
        driver.switch_to.frame(iframe)
        entered = True
        print(f"    ✅ '{sel}' 성공!")
        break
    except:
        print(f"    ❌ '{sel}' 실패")

if not entered:
    # 아무 iframe이나 시도
    if all_iframes:
        print("    → 첫 번째 iframe으로 시도...")
        try:
            driver.switch_to.frame(all_iframes[0])
            entered = True
            print("    ✅ 첫 번째 iframe 진입 성공")
        except:
            print("    ❌ 실패")

if entered:
    # ── 스크롤 ──
    print("\n[5] iframe 내부 스크롤 + 링크 탐색...")
    time.sleep(2)
    
    body = driver.find_element(By.TAG_NAME, "body")
    for i in range(5):
        driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
        time.sleep(1)
    
    # ── 모든 <a> 태그 확인 ──
    all_links = driver.find_elements(By.TAG_NAME, "a")
    print(f"    전체 <a> 태그: {len(all_links)}개")
    
    # place 링크
    place_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='/place/']")
    print(f"    a[href*='/place/'] : {len(place_links)}개")
    
    # 다른 패턴들도 확인
    place_links2 = driver.find_elements(By.CSS_SELECTOR, "a[href*='place.naver']")
    print(f"    a[href*='place.naver'] : {len(place_links2)}개")
    
    place_links3 = driver.find_elements(By.CSS_SELECTOR, "[data-id]")
    print(f"    [data-id] 요소 : {len(place_links3)}개")
    
    place_links4 = driver.find_elements(By.CSS_SELECTOR, "li[data-id]")
    print(f"    li[data-id] 요소 : {len(place_links4)}개")

    # data-cid (네이버 place ID 다른 속성)
    place_links5 = driver.find_elements(By.CSS_SELECTOR, "[data-cid]")
    print(f"    [data-cid] 요소 : {len(place_links5)}개")

    # ── href 패턴 분석 ──
    print("\n[6] href 패턴 분석 (상위 20개 a 태그):")
    href_patterns = {}
    for link in all_links[:100]:
        href = link.get_attribute("href") or ""
        if href:
            # 도메인+경로 앞부분만 추출
            pattern = re.sub(r'\d+', '{N}', href)[:80]
            href_patterns[pattern] = href_patterns.get(pattern, 0) + 1
    
    for pattern, count in sorted(href_patterns.items(), key=lambda x: -x[1])[:15]:
        print(f"    [{count}x] {pattern}")

    # ── 실제 링크 샘플 출력 ──
    print("\n[7] place 관련 링크 샘플:")
    pid_pattern = re.compile(r'/place/(\d+)')
    found = 0
    for link in all_links:
        href = link.get_attribute("href") or ""
        if "/place/" in href or "place.naver" in href:
            text = link.text.strip()[:40] or "(텍스트없음)"
            m = pid_pattern.search(href)
            pid = m.group(1) if m else "?"
            print(f"    pid={pid} | text={text} | href={href[:80]}")
            found += 1
            if found >= 10:
                break
    
    if found == 0:
        print("    → place 링크 0건!")
    
    # ── iframe 내부 HTML 일부 덤프 ──
    print("\n[8] iframe body HTML (앞 3000자):")
    body_html = driver.find_element(By.TAG_NAME, "body").get_attribute("innerHTML")
    print(body_html[:3000])
    
    # HTML 파일로도 저장
    with open("debug_iframe_html.html", "w", encoding="utf-8") as f:
        f.write(body_html)
    print(f"\n    → 전체 HTML 저장: debug_iframe_html.html ({len(body_html)}자)")
    
    driver.switch_to.default_content()

else:
    print("\n    ⚠️ iframe 진입 불가!")
    # 메인 페이지 HTML 덤프
    print("\n[8] 메인 페이지 HTML (앞 3000자):")
    print(driver.page_source[:3000])

# ── CDP 네트워크: allSearch API ──
print("\n\n[9] CDP 네트워크 로그 — allSearch API:")
try:
    logs = driver.get_log("performance")
    for entry in logs:
        try:
            msg = json.loads(entry["message"])["message"]
            if msg["method"] == "Network.responseReceived":
                resp_url = msg["params"]["response"]["url"]
                if "allSearch" in resp_url:
                    req_id = msg["params"]["requestId"]
                    print(f"    URL: {resp_url[:120]}")
                    try:
                        body = driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": req_id})
                        data = json.loads(body.get("body", "{}"))
                        place = data.get("result", {}).get("place", {})
                        items = place.get("list", [])
                        total = place.get("totalCount", 0)
                        print(f"    → total={total}, items={len(items)}")
                        for j, it in enumerate(items[:5]):
                            print(f"      [{j+1}] id={it.get('id')}, name={it.get('name')}")
                    except Exception as e:
                        print(f"    → body 파싱 실패: {e}")
        except:
            pass
except Exception as e:
    print(f"    ❌ {e}")

# ── 직접 API fetch ──
print("\n[10] 직접 allSearch API fetch:")
try:
    api_url = f"https://map.naver.com/p/api/search/allSearch?query={quote(keyword)}&type=all&searchCoord=&boundary="
    script = f"""
        var result = await fetch("{api_url}").then(r => r.json());
        var place = result.result?.place || {{}};
        return JSON.stringify({{
            total: place.totalCount || 0,
            count: (place.list || []).length,
            first5: (place.list || []).slice(0, 5).map(x => ({{id: x.id, name: x.name}}))
        }});
    """
    res = driver.execute_script(f"return (async () => {{ {script} }})()")
    time.sleep(2)
    res = driver.execute_script(f"return (async () => {{ {script} }})()")
    data = json.loads(res)
    print(f"    ✅ total={data['total']}, count={data['count']}")
    for it in data.get("first5", []):
        print(f"      id={it['id']}, name={it['name']}")
except Exception as e:
    print(f"    ❌ {e}")

print("\n" + "=" * 60)
print("완료. 15초 후 종료 (브라우저 확인 가능)...")
time.sleep(15)
driver.quit()
