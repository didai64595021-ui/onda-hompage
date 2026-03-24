#!/usr/bin/env python3
"""페이지 클릭 방법 테스트 — 어떤 방식이 진짜 작동하는지"""
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

def get_pids():
    src = driver.page_source
    seen = set()
    pids = []
    for m in re.finditer(r'"id"\s*:\s*"(\d{5,})"', src):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            pids.append(m.group(1))
    return pids

print(f"1. 검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

print("2. iframe 진입")
iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

# 스크롤
body = driver.find_element(By.TAG_NAME, "body")
for i in range(10):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.5)

pids1 = get_pids()
print(f"페이지1 PID: {len(pids1)}건, 처음3: {pids1[:3]}")

# 하단 스크롤
driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
time.sleep(1)

# 2페이지 버튼 찾기
btn2 = None
for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
    if btn.text.strip() == "2":
        btn2 = btn
        break

if not btn2:
    print("2번 버튼 못 찾음!")
    driver.quit()
    exit()

print("\n=== 방법별 클릭 테스트 ===")

# 방법A: Selenium .click()
print("\nA) Selenium .click()")
btn2.click()
time.sleep(4)
pidsA = get_pids()
changed_A = set(pidsA) != set(pids1)
print(f"   PID {len(pidsA)}건, 변경={changed_A}, 처음3: {pidsA[:3]}")

if not changed_A:
    # 방법B: JavaScript click
    print("\nB) JavaScript element.click()")
    # 버튼 다시 찾기
    for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
        if btn.text.strip() == "2":
            driver.execute_script("arguments[0].click()", btn)
            break
    time.sleep(4)
    pidsB = get_pids()
    changed_B = set(pidsB) != set(pids1)
    print(f"   PID {len(pidsB)}건, 변경={changed_B}, 처음3: {pidsB[:3]}")

if not changed_A and not changed_B:
    # 방법C: ActionChains 실제 마우스 클릭
    print("\nC) ActionChains 마우스 클릭")
    for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
        if btn.text.strip() == "2":
            ActionChains(driver).move_to_element(btn).click().perform()
            break
    time.sleep(4)
    pidsC = get_pids()
    changed_C = set(pidsC) != set(pids1)
    print(f"   PID {len(pidsC)}건, 변경={changed_C}, 처음3: {pidsC[:3]}")

if not changed_A and not changed_B and not changed_C:
    # 방법D: dispatchEvent
    print("\nD) JavaScript dispatchEvent (MouseEvent)")
    for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
        if btn.text.strip() == "2":
            driver.execute_script("""
                var evt = new MouseEvent('click', {
                    bubbles: true, cancelable: true, view: window
                });
                arguments[0].dispatchEvent(evt);
            """, btn)
            break
    time.sleep(4)
    pidsD = get_pids()
    changed_D = set(pidsD) != set(pids1)
    print(f"   PID {len(pidsD)}건, 변경={changed_D}, 처음3: {pidsD[:3]}")

if not changed_A and not changed_B and not changed_C and not changed_D:
    # 방법E: 스크롤 위치 확인 후 좌표 클릭
    print("\nE) 좌표 기반 클릭")
    for btn in driver.find_elements(By.CSS_SELECTOR, "a.mBN2s"):
        if btn.text.strip() == "2":
            loc = btn.location
            size = btn.size
            print(f"   버튼 위치: x={loc['x']}, y={loc['y']}, w={size['width']}, h={size['height']}")
            # 먼저 버튼이 보이게 스크롤
            driver.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
            time.sleep(1)
            ActionChains(driver).move_to_element(btn).click().perform()
            break
    time.sleep(4)
    pidsE = get_pids()
    changed_E = set(pidsE) != set(pids1)
    print(f"   PID {len(pidsE)}건, 변경={changed_E}, 처음3: {pidsE[:3]}")

if not changed_A and not changed_B and not changed_C and not changed_D and not changed_E:
    # 방법F: iframe URL 직접 변경
    print("\nF) iframe src URL에 page=2 파라미터")
    driver.switch_to.default_content()
    iframe_el = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
    iframe_src = iframe_el.get_attribute("src")
    print(f"   현재 src: {iframe_src}")
    if "page=" in iframe_src:
        new_src = re.sub(r'page=\d+', 'page=2', iframe_src)
    else:
        sep = "&" if "?" in iframe_src else "?"
        new_src = iframe_src + sep + "page=2"
    print(f"   새 src: {new_src}")
    driver.execute_script(f'document.getElementById("searchIframe").src = "{new_src}"')
    time.sleep(5)
    driver.switch_to.frame(driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe"))
    pidsF = get_pids()
    changed_F = set(pidsF) != set(pids1)
    print(f"   PID {len(pidsF)}건, 변경={changed_F}, 처음3: {pidsF[:3]}")

print("\n✅ 완료!")
driver.quit()
