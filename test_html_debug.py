#!/usr/bin/env python3
"""iframe 안 HTML에서 id+name 패턴 확인"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from urllib.parse import quote
import time, re, json

keyword = "포항성형외과"

opts = Options()
opts.add_argument("--disable-blink-features=AutomationControlled")
opts.add_argument("--no-sandbox")
opts.add_argument("--window-size=1920,1080")
opts.add_argument("--window-position=-32000,-32000")
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

print(f"검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(7)

# iframe 확인
p_src = driver.page_source
print(f"searchIframe 있음: {'searchIframe' in p_src}")

try:
    iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
    driver.switch_to.frame(iframe)
    print("iframe 진입 성공!")
except:
    print("iframe 없음!")
    driver.quit()
    exit()

time.sleep(2)

# 스크롤
body = driver.find_element(By.TAG_NAME, "body")
for i in range(15):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

src = driver.page_source

# 패턴1: "id":"숫자" 찾기
pids = re.findall(r'"id"\s*:\s*"(\d{5,})"', src)
print(f"\n=== PID 패턴 (\"id\":\"숫자\") ===")
print(f"  총 {len(pids)}개: {pids[:10]}")

# 패턴2: "name":"텍스트" 찾기
names = re.findall(r'"name"\s*:\s*"([^"]{2,60})"', src)
print(f"\n=== name 패턴 ===")
print(f"  총 {len(names)}개: {names[:20]}")

# 패턴3: 같은 {} 블록에 id+name
blocks = re.findall(r'\{[^{}]{10,500}\}', src)
matched = []
for b in blocks:
    id_m = re.search(r'"id"\s*:\s*"(\d{7,})"', b)
    name_m = re.search(r'"name"\s*:\s*"([^"]{2,60})"', b)
    if id_m and name_m:
        matched.append((id_m.group(1), name_m.group(1)))

print(f"\n=== 같은 블록에 id+name ===")
print(f"  총 {len(matched)}개")
for pid, name in matched[:10]:
    print(f"  {pid} → {name}")

# 패턴4: 7자리+ 숫자 (PID 후보)
long_nums = set(re.findall(r'(\d{7,})', src))
print(f"\n=== 7자리+ 숫자 ===")
print(f"  총 {len(long_nums)}개: {list(long_nums)[:10]}")

# 패턴5: apolloCacheId (GraphQL 캐시)
apollo = re.findall(r'"apolloCacheId"\s*:\s*"([^"]+)"', src)
print(f"\n=== apolloCacheId ===")
print(f"  총 {len(apollo)}개: {apollo[:10]}")

# HTML 일부 저장
with open("debug_iframe_html.txt", "w", encoding="utf-8") as f:
    f.write(src[:50000])
print(f"\nHTML 저장: debug_iframe_html.txt ({len(src)}자)")

driver.quit()
print("\n완료!")
