#!/usr/bin/env python3
"""페이지네이션 디버그 테스트 — 2페이지 클릭 전후 비교"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from urllib.parse import quote
import time, re, json

keyword = "부산피부과"

opts = Options()
opts.add_argument("--disable-blink-features=AutomationControlled")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-gpu")
opts.add_argument("--window-size=1920,1080")
opts.add_experimental_option("excludeSwitches", ["enable-automation"])
opts.add_experimental_option("useAutomationExtension", False)

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

# iframe 진입
print("2. iframe 진입")
iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

# 스크롤 다운 (전체 로드)
body = driver.find_element(By.TAG_NAME, "body")
for i in range(10):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.5)

# 페이지1 PID
src1 = driver.page_source
pids1 = []
for m in re.finditer(r'"id"\s*:\s*"(\d{5,})"', src1):
    if m.group(1) not in pids1:
        pids1.append(m.group(1))
print(f"\n=== 페이지 1 ===")
print(f"PID: {len(pids1)}건")
print(f"처음 5개: {pids1[:5]}")

# 하단 스크롤 (페이지 버튼 보이게)
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)

# 페이지 버튼 전체 분석
print(f"\n=== 페이지 버튼 분석 ===")

# a.mBN2s 찾기
mbn_btns = driver.find_elements(By.CSS_SELECTOR, "a.mBN2s")
print(f"a.mBN2s 개수: {len(mbn_btns)}")
for i, btn in enumerate(mbn_btns):
    txt = btn.text.strip()
    cls = btn.get_attribute("class") or ""
    aria = btn.get_attribute("aria-current") or ""
    outer = (btn.get_attribute("outerHTML") or "")[:150]
    print(f"  [{i}] text='{txt}' class='{cls}' aria-current='{aria}'")
    print(f"       outer: {outer}")

# zRM9F 컨테이너
print(f"\n=== zRM9F 페이지 컨테이너 ===")
try:
    container = driver.find_element(By.CSS_SELECTOR, "div.zRM9F")
    children = container.find_elements(By.CSS_SELECTOR, "*")
    print(f"자식 요소 {len(children)}개:")
    for i, ch in enumerate(children[:15]):
        tag = ch.tag_name
        txt = ch.text.strip()
        cls = ch.get_attribute("class") or ""
        outer = (ch.get_attribute("outerHTML") or "")[:150]
        print(f"  [{i}] <{tag}> text='{txt}' class='{cls}'")
        print(f"       outer: {outer}")
except Exception as e:
    print(f"  zRM9F 못 찾음: {e}")

# 2페이지 클릭
print(f"\n=== 2페이지 클릭 테스트 ===")
clicked = False
for btn in mbn_btns:
    if btn.text.strip() == "2":
        print(f"'2' 버튼 발견 → 클릭!")
        btn.click()
        clicked = True
        break

if not clicked:
    print("a.mBN2s에서 '2' 못 찾음!")
else:
    # 클릭 후 대기
    print("클릭 후 3초 대기...")
    time.sleep(3)
    
    # 같은 iframe에서 PID 확인
    src2_same = driver.page_source
    pids2_same = []
    for m in re.finditer(r'"id"\s*:\s*"(\d{5,})"', src2_same):
        if m.group(1) not in pids2_same:
            pids2_same.append(m.group(1))
    print(f"\n같은 iframe에서 PID: {len(pids2_same)}건 (변경: {set(pids2_same) != set(pids1)})")
    print(f"처음 5개: {pids2_same[:5]}")
    
    # iframe 나갔다 다시 진입
    print("\niframe 나갔다 다시 진입...")
    driver.switch_to.default_content()
    time.sleep(1)
    iframe2 = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
    driver.switch_to.frame(iframe2)
    time.sleep(2)
    
    src2_new = driver.page_source
    pids2_new = []
    for m in re.finditer(r'"id"\s*:\s*"(\d{5,})"', src2_new):
        if m.group(1) not in pids2_new:
            pids2_new.append(m.group(1))
    print(f"재진입 후 PID: {len(pids2_new)}건 (변경: {set(pids2_new) != set(pids1)})")
    print(f"처음 5개: {pids2_new[:5]}")
    
    # 겹침 분석
    overlap = set(pids1) & set(pids2_new)
    only_p1 = set(pids1) - set(pids2_new)
    only_p2 = set(pids2_new) - set(pids1)
    print(f"\n겹침: {len(overlap)}건, 1페이지만: {len(only_p1)}건, 2페이지만: {len(only_p2)}건")

driver.quit()
print("\n완료!")
