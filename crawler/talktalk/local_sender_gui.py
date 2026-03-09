#!/usr/bin/env python3
"""
🚀 네이버 톡톡 로컬 발송기 (GUI)
- 로컬 PC에서 실행 (Windows/Mac)
- 테더링 IP 자동 변경 (비행기모드)
- Place 링크 → 문의 버튼 클릭 → 톡톡 메시지 전송
- 계정 로테이션 + IP 변경

사용법:
  pip install selenium undetected-chromedriver tkinter
  python local_sender_gui.py
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog, messagebox
import threading
import json
import csv
import time
import os
import subprocess
import platform
from datetime import datetime

# ── Selenium 임포트 ──
try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    HAS_SELENIUM = True
except ImportError:
    HAS_SELENIUM = False


class TetheringManager:
    """테더링 IP 변경 (비행기모드 ON/OFF)"""
    
    def __init__(self):
        self.system = platform.system()  # Windows / Darwin(Mac)
        self.adapter_name = ""  # Wi-Fi 어댑터 이름
    
    def detect_adapter(self):
        """Wi-Fi 어댑터 자동 감지"""
        if self.system == "Windows":
            try:
                result = subprocess.run(
                    ["netsh", "wlan", "show", "interfaces"],
                    capture_output=True, text=True, encoding='cp949'
                )
                for line in result.stdout.split('\n'):
                    if '이름' in line or 'Name' in line:
                        self.adapter_name = line.split(':')[-1].strip()
                        return self.adapter_name
            except:
                pass
            self.adapter_name = "Wi-Fi"
        elif self.system == "Darwin":
            try:
                result = subprocess.run(
                    ["networksetup", "-listallhardwareports"],
                    capture_output=True, text=True
                )
                lines = result.stdout.split('\n')
                for i, line in enumerate(lines):
                    if 'Wi-Fi' in line:
                        self.adapter_name = lines[i+1].split(':')[-1].strip()
                        return self.adapter_name
            except:
                pass
            self.adapter_name = "en0"
        return self.adapter_name
    
    def change_ip(self):
        """테더링 IP 변경 — Wi-Fi OFF → 5초 → ON"""
        try:
            if self.system == "Windows":
                adapter = self.adapter_name or "Wi-Fi"
                subprocess.run(["netsh", "interface", "set", "interface", adapter, "disable"],
                             capture_output=True, timeout=10)
                time.sleep(5)
                subprocess.run(["netsh", "interface", "set", "interface", adapter, "enable"],
                             capture_output=True, timeout=10)
                time.sleep(8)  # 재연결 대기
            elif self.system == "Darwin":
                adapter = self.adapter_name or "en0"
                subprocess.run(["networksetup", "-setairportpower", adapter, "off"],
                             capture_output=True, timeout=10)
                time.sleep(5)
                subprocess.run(["networksetup", "-setairportpower", adapter, "on"],
                             capture_output=True, timeout=10)
                time.sleep(8)
            return True
        except Exception as e:
            return False
    
    def get_current_ip(self):
        """현재 공인 IP 확인"""
        try:
            import urllib.request
            ip = urllib.request.urlopen('https://api.ipify.org', timeout=5).read().decode()
            return ip
        except:
            return "확인불가"


class NaverTalkTalkSender:
    """네이버 톡톡 발송기"""
    
    def __init__(self, log_callback=None, status_callback=None):
        self.driver = None
        self.log = log_callback or print
        self.status = status_callback or (lambda *a: None)
        self.running = False
        self.sent_count = 0
        self.fail_count = 0
        self.skip_count = 0
    
    def create_driver(self, headless=False, mode="incognito"):
        """Chrome 드라이버 생성
        mode: 'incognito' = 시크릿모드 (쿠키 안 남음)
              'fresh' = 매번 새 프로필 (완전 초기화)
              'normal' = 일반모드
        """
        opts = uc.ChromeOptions()
        if headless:
            opts.add_argument("--headless=new")
        
        if mode == "incognito":
            opts.add_argument("--incognito")
        elif mode == "fresh":
            # 임시 프로필 디렉토리 → 매번 새 브라우저
            import tempfile
            self._temp_profile = tempfile.mkdtemp(prefix="naver_talk_")
            opts.add_argument(f"--user-data-dir={self._temp_profile}")
        
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--window-size=480,960")
        # 모바일 UA 제거 — 데스크톱으로 (모바일 UA가 크롬 꺼짐 원인 가능)
        # opts.add_argument("--user-agent=...")  
        
        self.driver = uc.Chrome(options=opts)
        self.driver.set_page_load_timeout(20)
        self.log(f"🌐 Chrome 시작 (모드: {mode})")
        return self.driver
    
    def restart_driver(self, headless=False, mode="incognito"):
        """Chrome 완전 재시작 — 크래시/꺼짐 방지"""
        self.log("🔄 Chrome 재시작...")
        self.close()
        time.sleep(2)
        return self.create_driver(headless=headless, mode=mode)
    
    def login_naver(self, username, password):
        """네이버 로그인"""
        self.log(f"🔑 로그인 시도: {username}")
        try:
            self.driver.get("https://nid.naver.com/nidlogin.login?mode=form")
            time.sleep(2)
            
            # ID 입력
            id_input = self.driver.find_element(By.ID, "id")
            id_input.click()
            self.driver.execute_script(
                f"document.getElementById('id').value='{username}';"
                "document.getElementById('id').dispatchEvent(new Event('input',{bubbles:true}));"
            )
            time.sleep(0.5)
            
            # PW 입력
            pw_input = self.driver.find_element(By.ID, "pw")
            pw_input.click()
            self.driver.execute_script(
                f"document.getElementById('pw').value='{password}';"
                "document.getElementById('pw').dispatchEvent(new Event('input',{bubbles:true}));"
            )
            time.sleep(0.5)
            
            # 로그인 버튼
            self.driver.find_element(By.ID, "log.login").click()
            time.sleep(3)
            
            # 로그인 성공 확인
            if "nid.naver.com" not in self.driver.current_url:
                self.log("✅ 로그인 성공")
                return True
            else:
                # 캡차 또는 2차 인증
                self.log("⚠️ 추가 인증 필요 — 브라우저에서 직접 처리해주세요")
                return "manual"
        except Exception as e:
            self.log(f"❌ 로그인 실패: {e}")
            return False
    
    def send_to_place(self, place_url, message):
        """Place 페이지 → 문의 버튼 → 톡톡 메시지 전송"""
        try:
            self.driver.get(place_url)
            time.sleep(3)
            
            # 문의 버튼 찾기
            inquiry_btn = None
            elements = self.driver.find_elements(By.TAG_NAME, "a")
            for el in elements:
                text = el.text.strip()
                href = el.get_attribute("href") or ""
                if text == "문의" or "talk.naver.com" in href:
                    inquiry_btn = el
                    break
            
            if not inquiry_btn:
                self.log(f"  ⏭️ 문의 버튼 없음 — 스킵")
                self.skip_count += 1
                return "skip"
            
            # 문의 버튼 클릭 → 톡톡 페이지 열림
            talk_url = inquiry_btn.get_attribute("href")
            self.driver.get(talk_url)
            time.sleep(3)
            
            # 메시지 입력
            # execCommand 방식 (React textarea 호환)
            typed = self.driver.execute_script(f"""
                var ta = document.querySelector('textarea, [contenteditable], .txt_area, #chatInput');
                if (!ta) return false;
                ta.focus();
                document.execCommand('insertText', false, `{message}`);
                return true;
            """)
            
            if not typed:
                self.log(f"  ❌ 메시지 입력 실패")
                self.fail_count += 1
                return "fail"
            
            time.sleep(1)
            
            # 전송 버튼 클릭
            sent = self.driver.execute_script("""
                var btns = document.querySelectorAll('button, [role=button]');
                for (var i = 0; i < btns.length; i++) {
                    var t = btns[i].textContent.trim();
                    if (t === '전송' || t === '보내기' || t === 'Send') {
                        btns[i].click();
                        return true;
                    }
                }
                // Enter 키 시도
                var ta = document.querySelector('textarea, [contenteditable]');
                if (ta) {
                    ta.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',keyCode:13,bubbles:true}));
                    return true;
                }
                return false;
            """)
            
            if sent:
                time.sleep(2)
                self.sent_count += 1
                self.log(f"  ✅ 전송 완료 ({self.sent_count}건)")
                return "sent"
            else:
                self.log(f"  ❌ 전송 버튼 못 찾음")
                self.fail_count += 1
                return "fail"
                
        except Exception as e:
            self.log(f"  ❌ 에러: {str(e)[:50]}")
            self.fail_count += 1
            return "fail"
    
    def close(self):
        if self.driver:
            try: self.driver.quit()
            except: pass
            self.driver = None


class SenderGUI:
    """메인 GUI"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("🚀 네이버 톡톡 발송기 v1.0")
        self.root.geometry("900x750")
        self.root.configure(bg="#1e1e2e")
        
        self.sender = None
        self.tethering = TetheringManager()
        self.prospects = []  # [{name, place_url, talktalk, ...}]
        self.accounts = []   # [{username, password}]
        self.current_account_idx = 0
        self.running = False
        
        self._build_ui()
    
    def _build_ui(self):
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TNotebook', background='#1e1e2e')
        style.configure('TFrame', background='#1e1e2e')
        style.configure('TLabel', background='#1e1e2e', foreground='#cdd6f4', font=('맑은 고딕', 10))
        style.configure('TButton', font=('맑은 고딕', 10, 'bold'))
        style.configure('Header.TLabel', font=('맑은 고딕', 14, 'bold'), foreground='#89b4fa')
        
        # 탭
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill='both', expand=True, padx=5, pady=5)
        
        # ── 탭1: 발송 설정 ──
        tab1 = ttk.Frame(notebook)
        notebook.add(tab1, text=" ⚙️ 설정 ")
        
        # 계정
        ttk.Label(tab1, text="📋 네이버 계정", style='Header.TLabel').pack(anchor='w', padx=10, pady=(10,5))
        
        acc_frame = ttk.Frame(tab1)
        acc_frame.pack(fill='x', padx=10)
        
        ttk.Label(acc_frame, text="ID:").grid(row=0, column=0, sticky='w')
        self.entry_id = ttk.Entry(acc_frame, width=20)
        self.entry_id.grid(row=0, column=1, padx=5)
        
        ttk.Label(acc_frame, text="PW:").grid(row=0, column=2, sticky='w')
        self.entry_pw = ttk.Entry(acc_frame, width=20, show='*')
        self.entry_pw.grid(row=0, column=3, padx=5)
        
        ttk.Button(acc_frame, text="➕ 추가", command=self._add_account).grid(row=0, column=4, padx=5)
        
        self.account_list = tk.Listbox(tab1, height=4, bg='#313244', fg='#cdd6f4',
                                        selectbackground='#89b4fa', font=('Consolas', 10))
        self.account_list.pack(fill='x', padx=10, pady=5)
        
        # 데이터 로드
        ttk.Label(tab1, text="📂 발송 대상", style='Header.TLabel').pack(anchor='w', padx=10, pady=(10,5))
        
        data_frame = ttk.Frame(tab1)
        data_frame.pack(fill='x', padx=10)
        
        ttk.Button(data_frame, text="CSV 불러오기", command=self._load_csv).pack(side='left', padx=5)
        ttk.Button(data_frame, text="JSON 불러오기", command=self._load_json).pack(side='left', padx=5)
        self.lbl_data = ttk.Label(data_frame, text="데이터 없음")
        self.lbl_data.pack(side='left', padx=10)
        
        # 메시지 템플릿
        ttk.Label(tab1, text="💬 발송 메시지", style='Header.TLabel').pack(anchor='w', padx=10, pady=(10,5))
        
        self.msg_text = scrolledtext.ScrolledText(tab1, height=6, bg='#313244', fg='#cdd6f4',
                                                   insertbackground='white', font=('맑은 고딕', 10))
        self.msg_text.pack(fill='x', padx=10, pady=5)
        self.msg_text.insert('1.0', """안녕하세요 {name} 담당자님,

온다마케팅입니다. 현재 홈페이지/모바일 최적화가 필요해 보여 연락드립니다.

✅ 반응형 웹 구축 (모바일 최적화)
✅ 네이버 플레이스 연동 강화
✅ 합리적인 비용 (30만원~)

무료 진단 가능합니다. 편하게 답변 주세요!""")
        
        ttk.Label(tab1, text="※ {name}은 업체명으로 자동 치환됩니다", foreground='#6c7086').pack(anchor='w', padx=10)
        
        # 발송 설정
        ttk.Label(tab1, text="⏱️ 발송 설정", style='Header.TLabel').pack(anchor='w', padx=10, pady=(10,5))
        
        set_frame = ttk.Frame(tab1)
        set_frame.pack(fill='x', padx=10)
        
        ttk.Label(set_frame, text="발송 간격(초):").grid(row=0, column=0)
        self.entry_interval = ttk.Entry(set_frame, width=8)
        self.entry_interval.insert(0, "30")
        self.entry_interval.grid(row=0, column=1, padx=5)
        
        ttk.Label(set_frame, text="계정당 발송수:").grid(row=0, column=2, padx=(20,0))
        self.entry_per_account = ttk.Entry(set_frame, width=8)
        self.entry_per_account.insert(0, "50")
        self.entry_per_account.grid(row=0, column=3, padx=5)
        
        ttk.Label(set_frame, text="Chrome 모드:").grid(row=1, column=0, pady=(8,0))
        self.var_chrome_mode = tk.StringVar(value="incognito")
        mode_frame = ttk.Frame(set_frame)
        mode_frame.grid(row=1, column=1, columnspan=5, sticky='w', pady=(8,0))
        ttk.Radiobutton(mode_frame, text="🕶️ 시크릿모드 (추천)", variable=self.var_chrome_mode, value="incognito").pack(side='left', padx=5)
        ttk.Radiobutton(mode_frame, text="🆕 매번 새 프로필", variable=self.var_chrome_mode, value="fresh").pack(side='left', padx=5)
        ttk.Radiobutton(mode_frame, text="📂 일반모드", variable=self.var_chrome_mode, value="normal").pack(side='left', padx=5)
        
        self.var_headless = tk.BooleanVar(value=False)
        ttk.Checkbutton(set_frame, text="헤드리스", variable=self.var_headless).grid(row=2, column=0, pady=(5,0), sticky='w')
        
        self.var_auto_tether = tk.BooleanVar(value=True)
        ttk.Checkbutton(set_frame, text="자동 테더링 IP변경", variable=self.var_auto_tether).grid(row=2, column=1, pady=(5,0), sticky='w')
        
        self.var_restart_chrome = tk.BooleanVar(value=True)
        ttk.Checkbutton(set_frame, text="계정 교체 시 Chrome 재시작", variable=self.var_restart_chrome).grid(row=2, column=2, columnspan=2, pady=(5,0), sticky='w')
        
        # ── 탭2: 발송 실행 ──
        tab2 = ttk.Frame(notebook)
        notebook.add(tab2, text=" 🚀 발송 ")
        
        # 상태
        status_frame = ttk.Frame(tab2)
        status_frame.pack(fill='x', padx=10, pady=10)
        
        self.lbl_status = ttk.Label(status_frame, text="⏸️ 대기중", style='Header.TLabel')
        self.lbl_status.pack(anchor='w')
        
        stats_frame = ttk.Frame(tab2)
        stats_frame.pack(fill='x', padx=10)
        
        self.lbl_sent = ttk.Label(stats_frame, text="✅ 발송: 0", font=('맑은 고딕', 12, 'bold'), foreground='#a6e3a1')
        self.lbl_sent.grid(row=0, column=0, padx=15)
        self.lbl_fail = ttk.Label(stats_frame, text="❌ 실패: 0", font=('맑은 고딕', 12, 'bold'), foreground='#f38ba8')
        self.lbl_fail.grid(row=0, column=1, padx=15)
        self.lbl_skip = ttk.Label(stats_frame, text="⏭️ 스킵: 0", font=('맑은 고딕', 12, 'bold'), foreground='#fab387')
        self.lbl_skip.grid(row=0, column=2, padx=15)
        self.lbl_ip = ttk.Label(stats_frame, text="🌐 IP: -", font=('맑은 고딕', 10))
        self.lbl_ip.grid(row=0, column=3, padx=15)
        self.lbl_account = ttk.Label(stats_frame, text="👤 계정: -", font=('맑은 고딕', 10))
        self.lbl_account.grid(row=0, column=4, padx=15)
        
        # 버튼
        btn_frame = ttk.Frame(tab2)
        btn_frame.pack(fill='x', padx=10, pady=10)
        
        self.btn_start = ttk.Button(btn_frame, text="▶️ 발송 시작", command=self._start_sending)
        self.btn_start.pack(side='left', padx=5)
        self.btn_stop = ttk.Button(btn_frame, text="⏹️ 중지", command=self._stop_sending, state='disabled')
        self.btn_stop.pack(side='left', padx=5)
        ttk.Button(btn_frame, text="🔄 IP 변경 테스트", command=self._test_ip_change).pack(side='left', padx=5)
        ttk.Button(btn_frame, text="🌐 현재 IP", command=self._show_ip).pack(side='left', padx=5)
        
        # 로그
        self.log_text = scrolledtext.ScrolledText(tab2, height=20, bg='#11111b', fg='#a6adc8',
                                                   insertbackground='white', font=('Consolas', 9))
        self.log_text.pack(fill='both', expand=True, padx=10, pady=5)
        
        # ── 탭3: 테더링 ──
        tab3 = ttk.Frame(notebook)
        notebook.add(tab3, text=" 📱 테더링 ")
        
        ttk.Label(tab3, text="📱 테더링 IP 관리", style='Header.TLabel').pack(anchor='w', padx=10, pady=10)
        
        ttk.Label(tab3, text=f"운영체제: {platform.system()}").pack(anchor='w', padx=20)
        
        self.lbl_adapter = ttk.Label(tab3, text="Wi-Fi 어댑터: 감지 중...")
        self.lbl_adapter.pack(anchor='w', padx=20, pady=5)
        
        tether_btn_frame = ttk.Frame(tab3)
        tether_btn_frame.pack(fill='x', padx=20, pady=10)
        
        ttk.Button(tether_btn_frame, text="🔍 어댑터 감지", command=self._detect_adapter).pack(side='left', padx=5)
        ttk.Button(tether_btn_frame, text="🔄 IP 변경", command=self._test_ip_change).pack(side='left', padx=5)
        ttk.Button(tether_btn_frame, text="🌐 IP 확인", command=self._show_ip).pack(side='left', padx=5)
        
        ttk.Label(tab3, text="""
📌 사용법:
1. 스마트폰 핫스팟(테더링) 켜기
2. PC에서 해당 Wi-Fi 연결
3. '어댑터 감지' 클릭
4. 'IP 변경' 클릭 → Wi-Fi OFF/ON → 새 IP 할당

⚡ 자동모드: 계정 교체 시 자동으로 IP 변경
  - Wi-Fi OFF (5초) → ON (8초 대기) → 새 IP 확인

⚠️ Windows: 관리자 권한 필요 (netsh 명령)
⚠️ Mac: networksetup 권한 필요
        """, foreground='#9399b2', justify='left').pack(anchor='w', padx=20)
        
        # 어댑터 자동 감지
        self.root.after(500, self._detect_adapter)
    
    # ── 콜백 ──
    def _log(self, msg):
        ts = datetime.now().strftime('%H:%M:%S')
        self.log_text.insert('end', f"[{ts}] {msg}\n")
        self.log_text.see('end')
    
    def _update_stats(self):
        if self.sender:
            self.lbl_sent.config(text=f"✅ 발송: {self.sender.sent_count}")
            self.lbl_fail.config(text=f"❌ 실패: {self.sender.fail_count}")
            self.lbl_skip.config(text=f"⏭️ 스킵: {self.sender.skip_count}")
    
    def _add_account(self):
        uid = self.entry_id.get().strip()
        pw = self.entry_pw.get().strip()
        if uid and pw:
            self.accounts.append({"username": uid, "password": pw})
            self.account_list.insert('end', f"  {uid} (●●●●)")
            self.entry_id.delete(0, 'end')
            self.entry_pw.delete(0, 'end')
    
    def _load_csv(self):
        path = filedialog.askopenfilename(filetypes=[("CSV", "*.csv")])
        if not path: return
        try:
            self.prospects = []
            with open(path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get('톡톡버튼') == 'O' and row.get('플레이스링크'):
                        self.prospects.append({
                            'name': row.get('업체명', ''),
                            'place_url': row.get('플레이스링크', ''),
                        })
            self.lbl_data.config(text=f"톡톡O 업체: {len(self.prospects)}건")
            self._log(f"📂 CSV 로드: {len(self.prospects)}건 (톡톡O만)")
        except Exception as e:
            messagebox.showerror("에러", str(e))
    
    def _load_json(self):
        path = filedialog.askopenfilename(filetypes=[("JSON", "*.json")])
        if not path: return
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # history.json 형식
            if 'crawled' in data:
                items = data['crawled'].values()
            elif isinstance(data, list):
                items = data
            else:
                items = data.values()
            
            self.prospects = []
            for item in items:
                if item.get('talktalkButton') == 'O' and item.get('placeUrl'):
                    self.prospects.append({
                        'name': item.get('name', ''),
                        'place_url': item.get('placeUrl', ''),
                    })
            
            self.lbl_data.config(text=f"톡톡O 업체: {len(self.prospects)}건")
            self._log(f"📂 JSON 로드: {len(self.prospects)}건 (톡톡O만)")
        except Exception as e:
            messagebox.showerror("에러", str(e))
    
    def _detect_adapter(self):
        name = self.tethering.detect_adapter()
        self.lbl_adapter.config(text=f"Wi-Fi 어댑터: {name}")
    
    def _show_ip(self):
        ip = self.tethering.get_current_ip()
        self.lbl_ip.config(text=f"🌐 IP: {ip}")
        self._log(f"🌐 현재 IP: {ip}")
    
    def _test_ip_change(self):
        self._log("🔄 IP 변경 시도...")
        old_ip = self.tethering.get_current_ip()
        
        def do_change():
            success = self.tethering.change_ip()
            new_ip = self.tethering.get_current_ip()
            self.root.after(0, lambda: self._log(
                f"{'✅' if old_ip != new_ip else '⚠️'} IP 변경: {old_ip} → {new_ip}"
            ))
            self.root.after(0, lambda: self.lbl_ip.config(text=f"🌐 IP: {new_ip}"))
        
        threading.Thread(target=do_change, daemon=True).start()
    
    def _start_sending(self):
        if not self.prospects:
            messagebox.showwarning("경고", "발송 대상을 먼저 로드하세요")
            return
        if not self.accounts:
            messagebox.showwarning("경고", "계정을 추가하세요")
            return
        if not HAS_SELENIUM:
            messagebox.showerror("에러", "pip install undetected-chromedriver selenium")
            return
        
        self.running = True
        self.btn_start.config(state='disabled')
        self.btn_stop.config(state='normal')
        self.lbl_status.config(text="🚀 발송 중...")
        
        threading.Thread(target=self._send_loop, daemon=True).start()
    
    def _stop_sending(self):
        self.running = False
        self.lbl_status.config(text="⏹️ 중지됨")
        self.btn_start.config(state='normal')
        self.btn_stop.config(state='disabled')
        self._log("⏹️ 발송 중지")
    
    def _send_loop(self):
        interval = int(self.entry_interval.get() or 30)
        per_account = int(self.entry_per_account.get() or 50)
        message_template = self.msg_text.get('1.0', 'end').strip()
        
        prospect_idx = 0
        
        while self.running and prospect_idx < len(self.prospects):
            # 계정 선택
            if self.current_account_idx >= len(self.accounts):
                self.root.after(0, lambda: self._log("⚠️ 모든 계정 소진"))
                break
            
            acc = self.accounts[self.current_account_idx]
            self.root.after(0, lambda a=acc: self.lbl_account.config(text=f"👤 {a['username']}"))
            
            # IP 확인
            ip = self.tethering.get_current_ip()
            self.root.after(0, lambda i=ip: self.lbl_ip.config(text=f"🌐 IP: {i}"))
            self.root.after(0, lambda i=ip: self._log(f"🌐 현재 IP: {i}"))
            
            # Chrome 시작 + 로그인
            self.sender = NaverTalkTalkSender(
                log_callback=lambda m: self.root.after(0, lambda msg=m: self._log(msg)),
                status_callback=lambda: self.root.after(0, self._update_stats)
            )
            
            try:
                self.sender.create_driver(headless=self.var_headless.get())
                login_result = self.sender.login_naver(acc['username'], acc['password'])
                
                if login_result == "manual":
                    self.root.after(0, lambda: self._log("⏳ 브라우저에서 수동 인증 완료 후 계속됩니다..."))
                    # 수동 인증 대기 (최대 120초)
                    for _ in range(60):
                        time.sleep(2)
                        if "nid.naver.com" not in self.sender.driver.current_url:
                            break
                
                if login_result is False:
                    self.root.after(0, lambda: self._log(f"❌ 로그인 실패 — 다음 계정"))
                    self.current_account_idx += 1
                    self.sender.close()
                    continue
                
                # 발송 루프
                sent_this_account = 0
                while self.running and prospect_idx < len(self.prospects) and sent_this_account < per_account:
                    prospect = self.prospects[prospect_idx]
                    name = prospect['name']
                    place_url = prospect['place_url']
                    
                    msg = message_template.replace('{name}', name)
                    
                    self.root.after(0, lambda n=name, i=prospect_idx: self._log(
                        f"📤 [{i+1}/{len(self.prospects)}] {n}"
                    ))
                    
                    result = self.sender.send_to_place(place_url, msg)
                    
                    self.root.after(0, self._update_stats)
                    prospect_idx += 1
                    
                    if result == "sent":
                        sent_this_account += 1
                    
                    # 발송 간격
                    if self.running:
                        time.sleep(interval)
                
            except Exception as e:
                self.root.after(0, lambda err=str(e): self._log(f"❌ 에러: {err}"))
            finally:
                self.sender.close()
            
            # 계정 교체 + IP 변경
            self.current_account_idx += 1
            
            if self.running and self.current_account_idx < len(self.accounts):
                if self.var_auto_tether.get():
                    self.root.after(0, lambda: self._log("🔄 IP 변경 중..."))
                    self.tethering.change_ip()
                    new_ip = self.tethering.get_current_ip()
                    self.root.after(0, lambda i=new_ip: self._log(f"✅ 새 IP: {i}"))
                    self.root.after(0, lambda i=new_ip: self.lbl_ip.config(text=f"🌐 IP: {i}"))
        
        self.root.after(0, lambda: self.lbl_status.config(text="✅ 완료"))
        self.root.after(0, lambda: self.btn_start.config(state='normal'))
        self.root.after(0, lambda: self.btn_stop.config(state='disabled'))
        self.root.after(0, lambda: self._log(
            f"\n{'='*40}\n🏁 발송 완료! 성공:{self.sender.sent_count if self.sender else 0} 실패:{self.sender.fail_count if self.sender else 0} 스킵:{self.sender.skip_count if self.sender else 0}"
        ))
    
    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = SenderGUI()
    app.run()
