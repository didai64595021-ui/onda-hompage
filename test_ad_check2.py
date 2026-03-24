#!/usr/bin/env python3
"""HTML 소스에서 광고 업체 구분 필드 확인 — 2페이지 없는 키워드도 대응"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from urllib.parse import quote
import time, json, re

keyword = "포항성형외과"

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

print(f"검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

body = driver.find_element(By.TAG_NAME, "body")
for i in range(15):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

# HTML 소스에서 업체 데이터 찾기
src = driver.page_source

# 방법1: __NEXT_DATA__ 또는 window.__PLACE_STATE__ 같은 초기 데이터
print("\n=== 1. 초기 데이터 (script 태그) ===")
for script in driver.find_elements(By.TAG_NAME, "script"):
    try:
        text = script.get_attribute("innerHTML") or ""
        if "businesses" in text or "items" in text or "adInfo" in text:
            # JSON 추출
            for m in re.finditer(r'\{[^{}]*"id"\s*:\s*"\d{5,}"[^{}]*\}', text):
                chunk = m.group()
                if '"name"' in chunk:
                    print(f"  데이터 청크: {chunk[:200]}...")
                    break
    except:
        pass

# 방법2: li 요소에서 광고 표시 확인
print("\n=== 2. li 요소 분석 (광고 표시 확인) ===")
lis = driver.find_elements(By.CSS_SELECTOR, "li")
biz_count = 0
for li in lis:
    try:
        text = li.text or ""
    except:
        continue
    if not text.strip() or len(text) < 10:
        continue
    
    has_marker = any(kw in text for kw in ["출발", "도착", "리뷰", "진료", "접수", "상세주소", "km"])
    if not has_marker:
        continue
    
    biz_count += 1
    lines = text.split("\n")
    is_ad = "광고" in text
    
    # 첫줄이 업체명
    name = lines[0].strip() if lines else "?"
    
    # 광고 위치 확인
    ad_line = None
    for i, line in enumerate(lines):
        if "광고" in line:
            ad_line = f"(줄 {i+1}: '{line.strip()}')"
            break
    
    marker = "🔴 광고" if is_ad else "✅ 일반"
    print(f"  [{biz_count}] {marker} | {name} {ad_line or ''}")

# 방법3: 광고 관련 CSS 클래스/속성
print("\n=== 3. 광고 관련 CSS/속성 ===")
ad_elements = driver.find_elements(By.CSS_SELECTOR, "[class*='ad'], [class*='Ad'], [data-ad], [class*='sponsor']")
for el in ad_elements[:10]:
    try:
        cls = el.get_attribute("class") or ""
        tag = el.tag_name
        text = (el.text or "")[:50]
        print(f"  <{tag} class='{cls}'> {text}")
    except:
        pass

# "광고" 텍스트를 포함하는 요소의 부모 구조 확인  
print("\n=== 4. '광고' 텍스트 요소 구조 ===")
ad_texts = driver.find_elements(By.XPATH, "//*[contains(text(), '광고')]")
for el in ad_texts[:5]:
    try:
        tag = el.tag_name
        cls = el.get_attribute("class") or ""
        parent = el.find_element(By.XPATH, "..")
        p_tag = parent.tag_name
        p_cls = parent.get_attribute("class") or ""
        
        # 가장 가까운 li 조상 찾기
        ancestor_li = None
        try:
            ancestor_li = el.find_element(By.XPATH, "ancestor::li")
        except:
            pass
        
        li_info = ""
        if ancestor_li:
            li_cls = ancestor_li.get_attribute("class") or ""
            li_data = ancestor_li.get_attribute("data-nclicks") or ""
            li_info = f" → li.class='{li_cls}' data-nclicks='{li_data}'"
        
        print(f"  <{tag}.{cls}> parent=<{p_tag}.{p_cls}>{li_info}")
    except:
        pass

driver.quit()
print("\n완료!")
