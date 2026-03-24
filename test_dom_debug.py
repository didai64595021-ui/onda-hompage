#!/usr/bin/env python3
"""DOM에서 업체 li 구조 확인"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from urllib.parse import quote
import time

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

print(f"검색: {keyword}")
driver.get(f"https://map.naver.com/p/search/{quote(keyword)}")
time.sleep(7)

iframe = driver.find_element(By.CSS_SELECTOR, "iframe#searchIframe")
driver.switch_to.frame(iframe)
time.sleep(2)

body = driver.find_element(By.TAG_NAME, "body")
for i in range(15):
    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", body)
    time.sleep(0.3)

# JS로 li 구조 분석
js = """
const results = [];
const lis = document.querySelectorAll('li');
let bizCount = 0;
for (const li of lis) {
    const text = (li.innerText || '').trim();
    if (text.length < 10) continue;
    
    // 업체 카드인지 확인
    const hasMarker = ['출발','도착','리뷰','진료','접수','km','상세주소','휴무'].some(k => text.includes(k));
    if (!hasMarker) continue;
    
    bizCount++;
    if (bizCount > 5) break;  // 처음 5개만
    
    // a 태그의 href 전부
    const links = [];
    for (const a of li.querySelectorAll('a[href]')) {
        links.push(a.getAttribute('href'));
    }
    
    // data 속성들
    const dataAttrs = {};
    for (const attr of li.attributes) {
        if (attr.name.startsWith('data-')) {
            dataAttrs[attr.name] = attr.value;
        }
    }
    
    // 첫 3줄
    const lines = text.split('\\n').slice(0, 5).map(l => l.trim());
    
    results.push({
        idx: bizCount,
        lines: lines,
        links: links.slice(0, 5),
        dataAttrs: dataAttrs,
        className: li.className,
        outerHTML: li.outerHTML.substring(0, 300)
    });
}
return JSON.stringify(results, null, 2);
"""

result = driver.execute_script(js)
print(result)

driver.quit()
print("\n완료!")
