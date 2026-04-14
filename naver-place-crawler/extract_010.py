#!/usr/bin/env python
"""010 후처리 추출기 — 기존 크롤링 PID에서 010만 강화 추출.
단일 워커 + 안정 딜레이 + 다중 소스 시도. 텔레그램/시트 자동 업데이트.
"""
import sys, os, json, time, threading, glob, random

sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import gspread
import requests
from crawler_engine import CrawlerEngine
import urllib.request

# ═══════════════════════════════════════════
SA_PATH = "google-sa.json"
SHEET_ID = "1T3zN0mecMdfxuaNQLa3wGP2sFgCWI38wrcU8iq3Gz9U"
BOT_TOKEN = "8574880668:AAHb75dmkFchbjBNj7VgPZuKrptFgIjQ_es"
CHAT_ID = "7383805736"

DELAY_MIN = 3.0  # 단일 워커 + 충분한 딜레이
DELAY_MAX = 6.0
MAX_RETRY = 3

gc = gspread.service_account(filename=SA_PATH)
sh = gc.open_by_key(SHEET_ID)

def tg(text):
    try:
        payload = json.dumps({"chat_id": CHAT_ID, "text": text}).encode("utf-8")
        req = urllib.request.Request(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                                     data=payload, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except: pass

def extract_010_robust(pid, name, homepage="", talktalk_url="", session=None):
    """단일 PID에서 010 추출 — 여러 소스 시도"""
    s = session or requests.Session()
    mobile_ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1"

    # ① place HTML (모바일 UA, hospital URL)
    for path in ['hospital', 'place', 'restaurant']:
        url = f"https://m.place.naver.com/{path}/{pid}/home"
        try:
            r = s.get(url, headers={"User-Agent": mobile_ua, "Referer": "https://m.search.naver.com/"}, timeout=8)
            if r.status_code == 200 and len(r.content) > 50000:
                html = r.text
                # bookingBusinessId 추출
                import re
                m = re.search(r'"bookingBusinessId"\s*:\s*"(\d+)"', html)
                if m:
                    biz_id = m.group(1)
                    # booking 페이지에서 010
                    burl = f"https://m.booking.naver.com/booking/13/bizes/{biz_id}"
                    br = s.get(burl, headers={"User-Agent": mobile_ua, "Referer": "https://m.place.naver.com/"}, timeout=6)
                    if br.status_code == 200:
                        bm = re.findall(r'010[-.\s]?\d{4}[-.\s]?\d{4}', br.text)
                        if bm:
                            digits = re.sub(r'\D', '', bm[0])
                            if len(digits) == 11:
                                return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}", "booking"
                # place HTML 직접 010
                hm = re.findall(r'010[-.\s]?\d{4}[-.\s]?\d{4}', html)
                if hm:
                    digits = re.sub(r'\D', '', hm[0])
                    if len(digits) == 11:
                        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}", "html"
                # talktalk URL 추출 후 fetch
                tm = re.search(r'https?://talk\.naver\.com/(?:ct/)?([A-Za-z0-9_]+)', html)
                if tm and tm.group(1).lower() != 'w9ni795':
                    tid = tm.group(1)
                    if not tid.lower().startswith('ct'):
                        turl = f"https://talk.naver.com/ct/{tid}"
                    else:
                        turl = f"https://talk.naver.com/{tid}"
                    tr = s.get(turl, headers={"User-Agent": mobile_ua}, timeout=6)
                    if tr.status_code == 200:
                        tmt = re.findall(r'010[-.\s]?\d{4}[-.\s]?\d{4}', tr.text)
                        if tmt:
                            digits = re.sub(r'\D', '', tmt[0])
                            if len(digits) == 11:
                                return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}", "talk"
                break  # 200 받았으면 다른 path 시도 안 함
        except: pass

    # ② talktalk URL 직접 (있으면)
    if talktalk_url and 'talk.naver.com' in talktalk_url:
        try:
            r = s.get(talktalk_url, headers={"User-Agent": mobile_ua}, timeout=6)
            import re
            m = re.findall(r'010[-.\s]?\d{4}[-.\s]?\d{4}', r.text)
            if m:
                digits = re.sub(r'\D', '', m[0])
                if len(digits) == 11:
                    return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}", "talk-direct"
        except: pass

    # ③ 업체 홈페이지
    if homepage and homepage.startswith('http') and not any(x in homepage for x in ['instagram','blog.naver','pf.kakao','youtube','catchtable','smartstore','bit.ly']):
        try:
            r = s.get(homepage, headers={"User-Agent": mobile_ua}, timeout=8)
            import re
            m = re.findall(r'010[-.\s]?\d{4}[-.\s]?\d{4}', r.text)
            if m:
                digits = re.sub(r'\D', '', m[0])
                if len(digits) == 11:
                    return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}", "homepage"
        except: pass

    return "", ""

def process_tab(tab_name):
    """시트 탭의 모든 행을 순회하며 010 채우기"""
    print(f"\n{'='*60}\n[{tab_name}] 010 후처리 시작\n{'='*60}", flush=True)
    try:
        ws = sh.worksheet(tab_name)
    except:
        print(f"  탭 없음, 스킵", flush=True)
        return

    vals = ws.get_all_values()
    if len(vals) < 2:
        print(f"  데이터 없음, 스킵", flush=True)
        return

    header = vals[0]
    name_idx = header.index('상호명') if '상호명' in header else 2
    pid_idx = header.index('고유번호') if '고유번호' in header else 20
    p010_idx = header.index('010전화') if '010전화' in header else 6
    hp_idx = header.index('홈페이지URL') if '홈페이지URL' in header else 8
    talk_idx = header.index('톡톡URL') if '톡톡URL' in header else 13

    # 010 비어있는 행만
    targets = []
    for i, r in enumerate(vals[1:], start=2):
        if pid_idx < len(r) and r[pid_idx].strip().isdigit():
            existing_010 = r[p010_idx].strip() if p010_idx < len(r) else ''
            if not existing_010 or existing_010 in ('X', 'None'):
                targets.append({
                    'row': i,
                    'pid': r[pid_idx].strip(),
                    'name': r[name_idx].strip() if name_idx < len(r) else '',
                    'hp': r[hp_idx].strip() if hp_idx < len(r) else '',
                    'talk': r[talk_idx].strip() if talk_idx < len(r) else '',
                })

    total = len(targets)
    print(f"  대상: {total}건 (010 비어있는 행)", flush=True)
    if total == 0:
        return

    tg(f"📞 [{tab_name}] 010 후처리 시작\n대상: {total}건")

    session = requests.Session()
    found = 0
    by_source = {}
    updates = []

    for i, t in enumerate(targets):
        p010, src = extract_010_robust(t['pid'], t['name'], t['hp'], t['talk'], session)
        if p010:
            found += 1
            by_source[src] = by_source.get(src, 0) + 1
            updates.append({'row': t['row'], 'col': p010_idx + 1, 'value': p010})
            print(f"  [{i+1}/{total}] ★ {t['name']}: {p010} ({src})", flush=True)
        elif (i+1) % 50 == 0:
            print(f"  [{i+1}/{total}] 진행중... 발견={found}건 ({found*100//(i+1)}%)", flush=True)

        # 시트 batch update (50건마다)
        if len(updates) >= 30:
            try:
                cells = []
                for u in updates:
                    cells.append(gspread.Cell(row=u['row'], col=u['col'], value=u['value']))
                ws.update_cells(cells, value_input_option='RAW')
                updates = []
            except Exception as e:
                print(f"  [SHEET ERROR] {e}", flush=True)

        # 진행 보고
        if (i+1) % 100 == 0:
            tg(f"📞 [{tab_name}] {i+1}/{total}\n발견 {found}건 ({found*100//(i+1)}%)\n소스별: {by_source}")

        time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

    # 마지막 batch
    if updates:
        try:
            cells = [gspread.Cell(row=u['row'], col=u['col'], value=u['value']) for u in updates]
            ws.update_cells(cells, value_input_option='RAW')
        except Exception as e:
            print(f"  [SHEET ERROR] {e}", flush=True)

    rate = found * 100 // max(total, 1)
    print(f"\n[{tab_name}] 완료: {found}/{total} ({rate}%) — {by_source}", flush=True)
    tg(f"✅ [{tab_name}] 010 후처리 완료\n{found}/{total} ({rate}%)\n소스: {by_source}")

# 모든 크롤링 탭 순회 — 무한 루프 (크롤러 따라가기)
TABS = ['헬스PT_전국', '네일_전국', '피부과_전국', '미용실_전국', '필라테스_전국', '인테리어_전국', '맛집_재시도']

cycle = 0
while True:
    cycle += 1
    print(f"\n{'#'*60}\nCYCLE {cycle} — {time.strftime('%Y-%m-%d %H:%M:%S')}\n{'#'*60}", flush=True)
    for tab in TABS:
        try:
            process_tab(tab)
        except Exception as e:
            print(f"[{tab}] ERROR: {e}", flush=True)
    print(f"\n사이클 {cycle} 완료, 30분 대기 후 신규 데이터 처리...", flush=True)
    tg(f"🔄 010 후처리 사이클 {cycle} 완료. 30분 후 재시작.")
    time.sleep(1800)
