#!/usr/bin/env python3
"""
🔍 로컬 톡톡 체커 v1
- 폰 테더링 + 로컬 PC에서 실행
- 미확인 업체의 톡톡 O/X를 네이버 플레이스에서 직접 확인
- 결과는 results.json에 저장 → 서버에 git push로 반영

사용법:
  1. 폰 테더링 연결
  2. pip install requests beautifulsoup4
  3. python local_checker.py
  4. 완료 후 results.json을 서버에 업로드

차단 대응:
  - 자동 감지: 연속 실패 5회 → 30초 대기
  - 비행기모드 on/off → 새 IP
  - Ctrl+C로 중단해도 진행분 저장됨
"""

import json
import re
import time
import os
import sys
import signal
from urllib.parse import quote

try:
    import requests
except ImportError:
    print("❌ requests 설치 필요: pip install requests")
    sys.exit(1)

# ── 설정 ──
UNKNOWN_FILE = "unknown_list.json"  # 서버에서 받은 미확인 목록
RESULTS_FILE = "results.json"       # 결과 저장
DELAY_MS = 800                      # 요청 간격 (ms)
SAVE_EVERY = 10                     # N건마다 저장
MAX_CONSECUTIVE_FAILS = 5           # 연속 실패 시 대기
COOLDOWN_SEC = 30                   # 차단 감지 시 대기

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

stopping = False

def signal_handler(sig, frame):
    global stopping
    stopping = True
    print("\n🛑 중단 요청 — 현재 진행분 저장 중...")

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def search_place_id(name: str, address: str) -> dict:
    """네이버 검색으로 place_id + 톡톡 확인"""
    # HTML 엔티티 디코딩
    name = name.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    address = address.replace("&amp;", "&")
    
    addr_short = " ".join(address.split()[:2])
    query = f"{name} {addr_short}".strip()
    
    result = {"place_id": "", "talktalk": None, "method": "search"}
    
    try:
        url = f"https://search.naver.com/search.naver?where=nexearch&query={quote(query)}"
        r = requests.get(url, headers=HEADERS, timeout=12)
        
        if r.status_code != 200:
            result["error"] = f"status_{r.status_code}"
            return result
        
        html = r.text
        
        # CAPTCHA 감지
        if "captcha" in html.lower() or "자동입력방지" in html:
            result["error"] = "captcha"
            return result
        
        # place_id 추출
        pids = list(set(re.findall(r'place[/.](\d{5,})', html)))
        if pids:
            result["place_id"] = pids[0]
        
        # 톡톡 확인 — frm=mnmb/pnmb 패턴
        talk_match = re.search(
            r'talk\.naver\.com(?:\\u002F|/)([a-zA-Z0-9]+)\?frm=(?:mnmb|pnmb|nmb)', html
        )
        if talk_match:
            result["talktalk"] = "O"
            result["talk_id"] = talk_match.group(1)
        elif result["place_id"]:
            # place_id 주변에 talktalkUrl 있는지
            idx = html.find(result["place_id"])
            if idx > 0:
                block = html[max(0, idx - 3000):idx + 3000]
                if "talktalkUrl" in block:
                    result["talktalk"] = "O"
                else:
                    result["talktalk"] = "X"
            else:
                result["talktalk"] = "X"
        
    except requests.Timeout:
        result["error"] = "timeout"
    except Exception as e:
        result["error"] = str(e)[:100]
    
    return result


def check_place_page(place_id: str) -> dict:
    """네이버 플레이스 페이지에서 직접 톡톡 버튼 확인"""
    result = {"talktalk": None, "method": "place_page"}
    
    try:
        url = f"https://m.place.naver.com/place/{place_id}/home"
        r = requests.get(url, headers=HEADERS, timeout=12)
        
        if r.status_code != 200:
            result["error"] = f"status_{r.status_code}"
            return result
        
        html = r.text
        
        # 톡톡 버튼 패턴
        if "talk.naver.com" in html or "톡톡" in html:
            result["talktalk"] = "O"
        else:
            result["talktalk"] = "X"
            
    except Exception as e:
        result["error"] = str(e)[:100]
    
    return result


def main():
    # 미확인 목록 로드
    if not os.path.exists(UNKNOWN_FILE):
        print(f"❌ {UNKNOWN_FILE} 파일이 없습니다.")
        print("   서버에서 다운로드: crawler/output/unknown_list.json")
        sys.exit(1)
    
    with open(UNKNOWN_FILE, "r", encoding="utf-8") as f:
        items = json.load(f)
    
    # 기존 결과 로드 (이어하기)
    results = {}
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            existing = json.load(f)
            for r in existing:
                results[r["key"]] = r
        print(f"📂 기존 결과 {len(results)}건 로드 — 이어서 진행")
    
    # 미처리 필터
    todo = [item for item in items if item["key"] not in results]
    
    print(f"""
╔══════════════════════════════════════════╗
║  🔍 로컬 톡톡 체커 v1                    ║
║  전체: {len(items):>6}건                        ║
║  완료: {len(results):>6}건                        ║
║  남음: {len(todo):>6}건                        ║
║  예상: {len(todo) * DELAY_MS / 60000:.0f}분                           ║
╚══════════════════════════════════════════╝
""")
    
    done = 0
    talk_o = 0
    talk_x = 0
    fails = 0
    consecutive_fails = 0
    start_time = time.time()
    
    for item in todo:
        if stopping:
            break
        
        name = item["name"]
        address = item["address"]
        place_id = item.get("placeId", "")
        
        # 1단계: place_id 있으면 직접 페이지 확인, 없으면 검색
        if place_id:
            r = check_place_page(place_id)
            if r.get("talktalk") is None:
                # 페이지 실패 시 검색 폴백
                r = search_place_id(name, address)
        else:
            r = search_place_id(name, address)
            if r.get("place_id"):
                place_id = r["place_id"]
        
        # 결과 저장
        result = {
            "key": item["key"],
            "name": name,
            "category": item.get("category", ""),
            "place_id": place_id or r.get("place_id", ""),
            "talktalk": r.get("talktalk", "미확인"),
            "method": r.get("method", ""),
        }
        
        if r.get("error"):
            result["error"] = r["error"]
            fails += 1
            consecutive_fails += 1
            
            # CAPTCHA 감지
            if r["error"] == "captcha":
                print(f"\n⚠️  CAPTCHA 감지! 비행기모드 on/off 후 Enter...")
                input("  [Enter 누르면 계속]")
                consecutive_fails = 0
                continue
            
            # 연속 실패 → 쿨다운
            if consecutive_fails >= MAX_CONSECUTIVE_FAILS:
                print(f"\n⏸️  연속 {consecutive_fails}회 실패 — {COOLDOWN_SEC}초 대기")
                time.sleep(COOLDOWN_SEC)
                consecutive_fails = 0
        else:
            consecutive_fails = 0
            if result["talktalk"] == "O":
                talk_o += 1
            elif result["talktalk"] == "X":
                talk_x += 1
        
        results[item["key"]] = result
        done += 1
        
        # 진행률 출력
        if done % 10 == 0:
            elapsed = (time.time() - start_time) / 60
            rate = done / max(1, time.time() - start_time)
            eta = (len(todo) - done) / max(0.01, rate) / 60
            print(
                f"  [{done}/{len(todo)}] 💬O:{talk_o} ❌X:{talk_x} "
                f"fail:{fails} | {elapsed:.1f}분 | {rate:.2f}/초 | ETA:{eta:.0f}분"
            )
        
        # 저장
        if done % SAVE_EVERY == 0:
            save_results(results)
        
        time.sleep(DELAY_MS / 1000)
    
    # 최종 저장
    save_results(results)
    
    # 보고
    total_o = sum(1 for r in results.values() if r.get("talktalk") == "O")
    total_x = sum(1 for r in results.values() if r.get("talktalk") == "X")
    total_u = sum(1 for r in results.values() if r.get("talktalk") not in ("O", "X"))
    
    print(f"""
{'═' * 50}
✅ 완료!
📊 결과: 💬O:{total_o} ❌X:{total_x} ?:{total_u}
📈 톡톡 보유율: {total_o / max(1, total_o + total_x) * 100:.1f}%
💾 저장: {RESULTS_FILE}
⏱️  소요: {(time.time() - start_time) / 60:.1f}분

👉 results.json을 서버에 업로드하세요:
   scp results.json onda@서버:/home/onda/projects/onda-hompage/crawler/output/
{'═' * 50}
""")


def save_results(results: dict):
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(list(results.values()), f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
