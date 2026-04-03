#!/usr/bin/env python3
"""
Selenium 디버그 테스트 — 네이버 지도 iframe 탐색 + CDP 네트워크 캡처

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
print(f"URL 인코딩: {quote(keyword)}")
print("=" * 60)

# ── 드라이버 생성 ──
opts = Options()
# opts.add_argument("--headless=new")  # 디버그: 화면 보이게
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.add_argument("--disable-gpu")
opts.add_argument("--window-size=1920,1080")
opts.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")

# CDP 네트워크 로깅
opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

print("[1] Chrome 드라이버 시작...")
if USE_WDM:
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
else:
    driver = webdriver.Chrome(options=opts)
print("    ✅ 드라이버 OK")

# ── CDP Network 활성화 ──
try:
    driver.execute_cdp_cmd("Network.enable", {})
    print("[1.5] CDP Network.enable ✅")
except Exception as e:
    print(f"[1.5] CDP Network.enable 실패: {e}")

# ── 테스트 1: quote() 인코딩 URL ──
url_encoded = f"https://map.naver.com/p/search/{quote(keyword)}"
print(f"\n[2] 접속 (quote 인코딩): {url_encoded}")
driver.get(url_encoded)
time.sleep(5)

# 차단 확인
src = driver.page_source
if "서비스 이용이 제한" in src or "ncaptcha" in src:
    print("    ❌ IP 차단됨!")
    print("    → VPN 켜거나 30분 후 재시도")
    driver.quit()
    sys.exit(1)
else:
    print("    ✅ 차단 아님")

# 현재 URL 확인
print(f"    현재 URL: {driver.current_url}")

# ── 테스트 2: iframe 탐색 ──
print("\n[3] iframe 탐색...")
iframe_selectors = [
    "iframe#searchIframe",
    "iframe[name='searchIframe']",
    "iframe[src*='search']",
]

# 모든 iframe 나열
all_iframes = driver.find_elements(By.TAG_NAME, "iframe")
print(f"    전체 iframe 수: {len(all_iframes)}")
for i, iframe in enumerate(all_iframes):
    fid = iframe.get_attribute("id") or "(없음)"
    fname = iframe.get_attribute("name") or "(없음)"
    fsrc = iframe.get_attribute("src") or "(없음)"
    print(f"    [{i}] id={fid}, name={fname}, src={fsrc[:80]}...")

found_iframe = False
for sel in iframe_selectors:
    try:
        iframe = WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, sel))
        )
        print(f"    ✅ 셀렉터 '{sel}' → iframe 발견!")
        driver.switch_to.frame(iframe)
        found_iframe = True
        break
    except Exception:
        print(f"    ❌ 셀렉터 '{sel}' → 못 찾음")

if found_iframe:
    # place 링크 수집
    time.sleep(2)
    links = driver.find_elements(By.CSS_SELECTOR, "a[href*='/place/']")
    print(f"\n[4] iframe 내 place 링크: {len(links)}개")
    pid_pattern = re.compile(r'/place/(\d+)')
    for i, link in enumerate(links[:10]):
        href = link.get_attribute("href") or ""
        text = link.text.strip()[:30]
        m = pid_pattern.search(href)
        pid = m.group(1) if m else "?"
        print(f"    [{i+1}] pid={pid}, text={text}")
    
    driver.switch_to.default_content()
else:
    print("\n    ⚠️ 모든 iframe 셀렉터 실패!")
    
    # 페이지 새로고침 후 재시도
    print("\n[3.5] 페이지 새로고침 후 재시도...")
    driver.refresh()
    time.sleep(6)
    
    all_iframes = driver.find_elements(By.TAG_NAME, "iframe")
    print(f"    새로고침 후 iframe 수: {len(all_iframes)}")
    for i, iframe in enumerate(all_iframes):
        fid = iframe.get_attribute("id") or "(없음)"
        fname = iframe.get_attribute("name") or "(없음)"
        fsrc = iframe.get_attribute("src") or "(없음)"
        print(f"    [{i}] id={fid}, name={fname}, src={fsrc[:80]}...")

# ── 테스트 3: CDP 네트워크 로그에서 allSearch 찾기 ──
print("\n[5] CDP 네트워크 로그 분석...")
try:
    logs = driver.get_log("performance")
    print(f"    로그 수: {len(logs)}")
    
    search_responses = []
    for entry in logs:
        try:
            msg = json.loads(entry["message"])["message"]
            if msg["method"] == "Network.responseReceived":
                url = msg["params"]["response"]["url"]
                if "allSearch" in url or "search" in url.lower():
                    search_responses.append({
                        "url": url[:100],
                        "status": msg["params"]["response"]["status"],
                        "requestId": msg["params"]["requestId"],
                    })
        except Exception:
            pass
    
    print(f"    검색 관련 응답: {len(search_responses)}개")
    for i, resp in enumerate(search_responses):
        print(f"    [{i}] status={resp['status']}, url={resp['url']}")
        
        # allSearch 응답 본문 가져오기
        if "allSearch" in resp["url"]:
            try:
                body = driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": resp["requestId"]})
                data = json.loads(body.get("body", "{}"))
                place = data.get("result", {}).get("place", {})
                items = place.get("list", [])
                total = place.get("totalCount", 0)
                print(f"    → allSearch 파싱 성공! total={total}, items={len(items)}")
                for j, it in enumerate(items[:5]):
                    print(f"      [{j+1}] id={it.get('id')}, name={it.get('name')}")
            except Exception as e:
                print(f"    → 본문 파싱 실패: {e}")

except Exception as e:
    print(f"    ❌ 로그 조회 실패: {e}")

# ── 테스트 4: 직접 API 호출 (Selenium 세션 쿠키 활용) ──
print("\n[6] 직접 allSearch API 호출 테스트...")
try:
    api_url = f"https://map.naver.com/p/api/search/allSearch?query={quote(keyword)}&type=all&searchCoord=&boundary="
    driver.execute_script(f"""
        fetch("{api_url}")
            .then(r => r.json())
            .then(d => {{
                document.title = JSON.stringify({{
                    total: d.result?.place?.totalCount || 0,
                    count: d.result?.place?.list?.length || 0,
                    first5: (d.result?.place?.list || []).slice(0, 5).map(x => ({{id: x.id, name: x.name}}))
                }});
            }})
            .catch(e => {{ document.title = "FETCH_ERROR:" + e.message; }});
    """)
    time.sleep(3)
    title = driver.title
    if title.startswith("FETCH_ERROR"):
        print(f"    ❌ API 호출 실패: {title}")
    else:
        try:
            result = json.loads(title)
            print(f"    ✅ API 응답: total={result['total']}, count={result['count']}")
            for it in result.get("first5", []):
                print(f"      id={it['id']}, name={it['name']}")
        except Exception:
            print(f"    ⚠️ title 파싱 실패: {title[:100]}")
except Exception as e:
    print(f"    ❌ API 테스트 실패: {e}")

print("\n" + "=" * 60)
print("디버그 완료. 10초 후 브라우저 종료...")
time.sleep(10)
driver.quit()
