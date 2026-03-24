#!/usr/bin/env python3
"""네이버 지도 Selenium 디버그 테스트 — iframe 구조 확인용"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from urllib.parse import quote
import time, re, json

keyword = "부산피부과"

opts = Options()
opts.add_argument("--window-position=-32000,-32000")  # 화면 밖 숨김
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

print(f"1. 네이버 지도 검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(6)

print(f"2. 현재 URL: {driver.current_url}")
print(f"3. 페이지 제목: {driver.title}")

# 차단 확인
src = driver.page_source
print(f"4. 페이지 길이: {len(src)}")
print(f"5. ncaptcha 존재: {'ncaptcha' in src}")
print(f"6. searchIframe 존재: {'searchIframe' in src}")
print(f"7. 서비스제한 존재: {'서비스 이용이 제한' in src}")

# iframe 찾기
iframes = driver.find_elements(By.CSS_SELECTOR, "iframe")
print(f"\n8. iframe 개수: {len(iframes)}")
for i, ifr in enumerate(iframes):
    ifr_id = ifr.get_attribute("id") or ""
    ifr_src = ifr.get_attribute("src") or ""
    print(f"   [{i}] id='{ifr_id}' src='{ifr_src[:80]}'")

# searchIframe 진입 시도
print("\n9. searchIframe 진입 시도...")
try:
    iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
    driver.switch_to.frame(iframe)
    print("   ✅ iframe 진입 성공!")
    
    # iframe 내부 분석
    isrc = driver.page_source
    print(f"   iframe HTML 길이: {len(isrc)}")
    
    # place ID 패턴
    place_refs = re.findall(r'/place/(\d{5,})', isrc)
    id_refs = re.findall(r'"id":"(\d{5,})"', isrc)
    print(f"   /place/ 패턴: {len(place_refs)}건 (유니크: {len(set(place_refs))})")
    print(f"   \"id\":\"숫자\" 패턴: {len(id_refs)}건 (유니크: {len(set(id_refs))})")
    if place_refs:
        print(f"   처음 5개: {place_refs[:5]}")
    
    # li 개수
    lis = driver.find_elements(By.CSS_SELECTOR, "li")
    print(f"   li 개수: {len(lis)}")
    
    # 첫 li 내용
    if lis:
        for j, li in enumerate(lis[:3]):
            li_html = (li.get_attribute("innerHTML") or "")[:200]
            li_text = (li.text or "")[:100]
            print(f"   li[{j}] text: {li_text}")
            print(f"   li[{j}] html: {li_html}")
            print()
    
    # a 태그에서 place 링크
    a_tags = driver.find_elements(By.CSS_SELECTOR, "a")
    place_links = []
    for a in a_tags:
        h = a.get_attribute("href") or ""
        if "/place/" in h:
            place_links.append(h[:80])
    print(f"   a[href*=place] 링크: {len(place_links)}건")
    if place_links:
        for pl in place_links[:5]:
            print(f"     {pl}")
    
    # data-cid
    cids = driver.find_elements(By.CSS_SELECTOR, "[data-cid]")
    print(f"   data-cid 요소: {len(cids)}건")
    
    # 페이지 버튼
    print(f"\n   페이지 버튼 탐색...")
    for sel in ["a.page", "button.page", ".pagination a", ".pagination button", 
                 "a[role='page']", "div[class*='paging'] a", "div[class*='page'] a"]:
        els = driver.find_elements(By.CSS_SELECTOR, sel)
        if els:
            texts = [e.text.strip() for e in els[:10]]
            print(f"     {sel}: {texts}")
    
    # 숫자 텍스트 버튼
    num_btns = []
    for btn in driver.find_elements(By.CSS_SELECTOR, "a, button"):
        t = btn.text.strip()
        if t.isdigit() and 1 <= int(t) <= 20:
            num_btns.append(t)
    print(f"   숫자 버튼: {num_btns[:20]}")

except Exception as e:
    print(f"   ❌ iframe 진입 실패: {e}")
    
    # iframe 없을 때 메인 페이지 분석
    print("\n   메인 페이지 분석:")
    place_refs = re.findall(r'/place/(\d{5,})', src)
    print(f"   /place/ 패턴: {len(place_refs)}건")

driver.quit()
print("\n완료!")
