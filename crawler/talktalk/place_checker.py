#!/usr/bin/env python3
"""
네이버 플레이스 톡톡 버튼 체크 API
iwinv 서버(한국 IP)에서 실행 — 플레이스 페이지 접속 → 톡톡 버튼 존재 여부 확인

POST /check
  body: {"name": "업체명", "address": "주소"}
  response: {"place_url": "...", "talktalk": true/false, "talktalk_id": "..."}

GET /health
  response: {"status": "ok"}
"""
import json
import re
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import quote
import requests

PORT = 3200

def search_and_check(name, address=""):
    """
    네이버 통합검색으로 place_id + talk_id 한번에 추출
    Place API/Map API 차단 우회 — search.naver.com은 차단 안 됨
    """
    query = f"{name} {address}".strip()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    
    result = {"place_id": "", "place_url": "", "talktalk": False, "talktalk_id": ""}
    
    try:
        url = f"https://search.naver.com/search.naver?where=nexearch&sm=top_hty&query={quote(query)}"
        r = requests.get(url, headers=headers, timeout=10)
        
        if r.status_code == 200:
            html = r.text
            
            # place ID 추출 (place/숫자 또는 place.숫자)
            place_ids = list(set(re.findall(r'place[/.](\d{5,})', html)))
            if place_ids:
                result["place_id"] = place_ids[0]
                result["place_url"] = f"https://m.place.naver.com/place/{place_ids[0]}"
            
            # talk ID 추출 (talk.naver.com/ct/XXX 또는 talk.naver.com/XXX)
            talk_ids = list(set(re.findall(r'talk\.naver\.com/(?:ct/)?([a-zA-Z0-9]{4,})', html)))
            # 'ch' 같은 공통 패턴 제외
            talk_ids = [t for t in talk_ids if t not in ('ch', 'web', 'profile', 'policy')]
            
            if talk_ids:
                result["talktalk"] = True
                result["talktalk_id"] = talk_ids[0]
            else:
                # 톡톡 관련 키워드 체크 (버튼은 있지만 ID 추출 실패)
                talk_keywords = ['톡톡문의', '톡톡상담', 'naverTalkTalk', 'TALK_TALK', 'talkUrl']
                for kw in talk_keywords:
                    if kw in html:
                        result["talktalk"] = True
                        break
    except Exception as e:
        print(f"  검색 오류: {e}")
    
    return result


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "port": PORT}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        if self.path == "/check":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            
            name = body.get("name", "")
            address = body.get("address", "")
            
            if not name:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "name required"}).encode())
                return
            
            # 통합검색으로 place + talktalk 한번에 체크
            check = search_and_check(name, address)
            result = {"name": name, **check}
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode())
        
        elif self.path == "/batch":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            items = body.get("items", [])
            
            results = []
            for item in items:
                name = item.get("name", "")
                address = item.get("address", "")
                check = search_and_check(name, address)
                r = {"name": name, **check}
                
                results.append(r)
                time.sleep(0.5)  # rate limit
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(results, ensure_ascii=False).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")


if __name__ == "__main__":
    print(f"🚀 Place 톡톡 체커 API 시작 — 포트 {PORT}")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n종료")
