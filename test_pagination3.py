#!/usr/bin/env python3
"""전체 PID 이미 로드되었는지 + 페이지별 li 표시 변화 확인"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from urllib.parse import quote
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

def get_visible_items():
    """현재 보이는 li 아이템의 텍스트 (첫 줄=업체명)"""
    items = []
    lis = driver.find_elements(By.CSS_SELECTOR, "li")
    for li in lis:
        try:
            txt = li.text.strip()
            if not txt or len(txt) < 5:
                continue
            first_line = txt.split("\n")[0].strip()
            # 의미있는 업체명만
            if (len(first_line) > 1 and len(first_line) < 60
                and not first_line.startswith("이미지")
                and not re.match(r'^[\d,]+$', first_line)
                and not re.match(r'^의\d+$', first_line)):
                items.append(first_line)
        except:
            continue
    return items

print(f"검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

# 스크롤 다운
body = driver.find_element(By.TAG_NAME, "body")
for i in range(15):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.5)

all_pids = get_pids()
print(f"\n전체 HTML PID: {len(all_pids)}건")

# 현재 보이는 업체명
vis1 = get_visible_items()
print(f"\n=== 페이지 1 보이는 업체 ({len(vis1)}건) ===")
for i, name in enumerate(vis1[:5]):
    print(f"  {i+1}. {name}")
print(f"  ... (총 {len(vis1)}건)")

# 현재 활성 페이지 확인
active = driver.find_elements(By.CSS_SELECTOR, "a.mBN2s.qxokY")
if active:
    print(f"\n현재 활성 페이지: {active[0].text.strip()}")

# 2페이지 클릭 (scrollIntoView 후)
print("\n=== 2페이지 클릭 ===")
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
        time.sleep(0.5)
        ActionChains(driver).move_to_element(btn).pause(0.3).click().perform()
        break
time.sleep(3)

# 활성 페이지 변경 확인
active2 = driver.find_elements(By.CSS_SELECTOR, "a.mBN2s.qxokY")
if active2:
    print(f"활성 페이지: {active2[0].text.strip()}")

vis2 = get_visible_items()
print(f"보이는 업체 ({len(vis2)}건):")
for i, name in enumerate(vis2[:5]):
    print(f"  {i+1}. {name}")

# 겹침 확인
overlap = set(vis1) & set(vis2)
only_v1 = set(vis1) - set(vis2)
only_v2 = set(vis2) - set(vis1)
print(f"\n1페이지와 겹침: {len(overlap)}, 1만: {len(only_v1)}, 2만: {len(only_v2)}")

# PID 변화
pids2 = get_pids()
print(f"\nHTML PID: {len(pids2)}건 (변경: {set(pids2) != set(all_pids)})")

# 3페이지도
print("\n=== 3페이지 클릭 ===")
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "3":
        driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
        time.sleep(0.5)
        ActionChains(driver).move_to_element(btn).pause(0.3).click().perform()
        break
time.sleep(3)

active3 = driver.find_elements(By.CSS_SELECTOR, "a.mBN2s.qxokY")
if active3:
    print(f"활성 페이지: {active3[0].text.strip()}")

vis3 = get_visible_items()
print(f"보이는 업체 ({len(vis3)}건):")
for i, name in enumerate(vis3[:5]):
    print(f"  {i+1}. {name}")

overlap23 = set(vis2) & set(vis3)
print(f"2페이지와 겹침: {len(overlap23)}")

driver.quit()
print("\n완료!")
