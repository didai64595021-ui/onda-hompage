#!/usr/bin/env python3
"""iframe URL 직접 조작으로 페이지 전환 테스트"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from urllib.parse import quote, urlencode, parse_qs, urlparse, urlunparse
import time, re

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

def get_pids():
    src = driver.page_source
    seen = set()
    pids = []
    for m in re.finditer(r'"id"\s*:\s*"(\d{5,})"', src):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            pids.append(m.group(1))
    return pids

def get_visible_count():
    count = 0
    for li in driver.find_elements(By.CSS_SELECTOR, "li"):
        txt = li.text or ""
        if "출발" in txt or "도착" in txt:
            count += 1
    return count

print(f"1. 검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

# iframe src 확인
iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
original_src = iframe.get_attribute("src")
print(f"\n2. iframe src:\n{original_src}")

# URL 파싱
parsed = urlparse(original_src)
print(f"\n3. 파라미터:")
params = parse_qs(parsed.query)
for k, v in sorted(params.items()):
    print(f"   {k} = {v[0][:80]}")

# iframe 진입 + 페이지1 PID
driver.switch_to.frame(iframe)
time.sleep(2)
body = driver.find_element(By.TAG_NAME, "body")
for i in range(15):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

pids1 = get_pids()
vis1 = get_visible_count()
print(f"\n4. 페이지 1: PID {len(pids1)}건, 보이는 카드 {vis1}건")

# 네트워크 요청 가로채기: 2페이지 클릭 시 어떤 URL이 호출되는지
driver.switch_to.default_content()
print("\n5. Performance log로 페이지 전환 시 네트워크 요청 확인...")

# CDP로 네트워크 모니터링 활성화
driver.execute_cdp_cmd("Network.enable", {})

# iframe 다시 진입해서 2페이지 클릭
iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(1)

# 하단 스크롤
body = driver.find_element(By.TAG_NAME, "body")
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)

# 2페이지 클릭
from selenium.webdriver.common.action_chains import ActionChains
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
        time.sleep(0.3)
        ActionChains(driver).move_to_element(btn).pause(0.2).click().perform()
        print("   2페이지 클릭!")
        break

time.sleep(4)

# 활성 페이지 확인
active = driver.find_elements(By.CSS_SELECTOR, "a.mBN2s.qxokY")
if active:
    print(f"   활성 페이지: {active[0].text.strip()}")

# 새 PID/보이는 카드
pids2 = get_pids()
vis2 = get_visible_count()
print(f"   PID: {len(pids2)}건 (변경: {set(pids2) != set(pids1)}), 보이는 카드: {vis2}건")

# iframe src 변경 확인
driver.switch_to.default_content()
iframe2 = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
new_src = iframe2.get_attribute("src")
src_changed = new_src != original_src
print(f"\n6. iframe src 변경: {src_changed}")
if src_changed:
    print(f"   새 src: {new_src[:200]}")

# 방법: iframe src에 직접 page 파라미터 테스트
print("\n7. iframe src 직접 변경 테스트...")

# display=70 → start 파라미터 시도
test_urls = []

# pcmap.place.naver.com/place/list 의 가능한 페이지 파라미터
base = original_src
for param_name in ["page", "start", "startIndex", "offset", "pageIndex"]:
    for value in ["2", "71", "70"]:
        sep = "&" if "?" in base else "?"
        test_url = f"{base}{sep}{param_name}={value}"
        test_urls.append((f"{param_name}={value}", test_url))

# display 변경
test_urls.append(("display=140", re.sub(r'display=\d+', 'display=140', base)))

print(f"   {len(test_urls)}개 URL 테스트...")
for label, url in test_urls:
    try:
        driver.execute_script(f'document.getElementById("searchIframe").src = arguments[0]', url)
        time.sleep(3)
        iframe_el = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
        driver.switch_to.frame(iframe_el)
        pids_test = get_pids()
        changed = set(pids_test) != set(pids1)
        print(f"   {label}: PID {len(pids_test)}건, 변경={changed}")
        if changed:
            print(f"      처음 3개: {pids_test[:3]}")
            print(f"      ★★★ 성공! ★★★")
        driver.switch_to.default_content()
    except Exception as e:
        print(f"   {label}: 에러 - {str(e)[:50]}")
        driver.switch_to.default_content()

driver.quit()
print("\n완료!")
