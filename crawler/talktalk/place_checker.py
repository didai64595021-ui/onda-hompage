#!/usr/bin/env python3
"""Place 톡톡 체커 v3 — place_id + 톡톡O/X만 (frm=pnmb 패턴)"""
import json, re, time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import quote
import requests

PORT = 3201

def search_and_check(name, address=""):
    query = f"{name} {address}".strip()
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"}
    result = {"place_id": "", "place_url": "", "talktalk": False}
    try:
        url = f"https://search.naver.com/search.naver?where=nexearch&query={quote(query)}"
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            return result
        html = r.text
        # place_id
        pids = list(set(re.findall(r'place[/.](\d{5,})', html)))
        if pids:
            result["place_id"] = pids[0]
            result["place_url"] = f"https://m.place.naver.com/place/{pids[0]}"
        # 톡톡: frm=mnmb 또는 frm=pnmb 패턴 = 실제 업체 톡톡
        # \u002F = escaped / in JSON
        talk_match = re.search(r'talk\.naver\.com(?:\\u002F|/)([a-zA-Z0-9]+)\?frm=(?:mnmb|pnmb|nmb)', html)
        if talk_match:
            result["talktalk"] = True
        # 백업: talktalkUrl 키워드
        elif 'talktalkUrl' in html and result["place_id"]:
            # place_id 주변에 talktalkUrl 있는지
            idx = html.find(result["place_id"])
            if idx > 0:
                block = html[max(0,idx-3000):idx+3000]
                if 'talktalkUrl' in block:
                    result["talktalk"] = True
    except Exception as e:
        print(f"  오류: {e}")
    return result

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status":"ok","version":"v3"}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    def do_POST(self):
        if self.path in ("/check", "/batch"):
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            if self.path == "/check":
                name = body.get("name","")
                r = {"name":name, **search_and_check(name, body.get("address",""))}
                self.send_response(200)
                self.send_header("Content-Type","application/json")
                self.end_headers()
                self.wfile.write(json.dumps(r, ensure_ascii=False).encode())
            else:
                items = body.get("items",[])
                results = []
                for item in items:
                    r = {"name":item.get("name",""), **search_and_check(item.get("name",""), item.get("address",""))}
                    results.append(r)
                    time.sleep(0.5)
                self.send_response(200)
                self.send_header("Content-Type","application/json")
                self.end_headers()
                self.wfile.write(json.dumps(results, ensure_ascii=False).encode())
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, format, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")

if __name__ == "__main__":
    print(f"🚀 Place 톡톡 체커 v3 — 포트 {PORT}")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
