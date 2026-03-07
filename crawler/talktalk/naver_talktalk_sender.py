#!/usr/bin/env python3
"""
네이버 톡톡 자동 발송기 v1.0
- 네이버 계정 로그인 → PID로 업체 톡톡 자동 발송
- 봇 차단 우회 (undetected-chromedriver)
- human_being 시뮬레이션 (마우스 움직임, 타이핑 딜레이, 랜덤 대기)
- 크롬 ON/OFF 제어
- 테더링(IP 변경) 연동
"""

import os
import sys
import json
import time
import random
import string
import logging
import argparse
import subprocess
from datetime import datetime
from pathlib import Path

# venv 자동 활성화
VENV_PATH = Path(__file__).parent.parent / 'talktalk-venv'
if VENV_PATH.exists():
    site_packages = list((VENV_PATH / 'lib').glob('python*/site-packages'))
    if site_packages:
        sys.path.insert(0, str(site_packages[0]))

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ── 설정 ──
BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / 'logs'
STATE_FILE = BASE_DIR / 'send_state.json'
CONFIG_FILE = BASE_DIR / 'config.json'
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / f'talktalk_{datetime.now().strftime("%Y%m%d")}.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger('talktalk')

# ── Human Being 시뮬레이터 ──
class HumanBeing:
    """사람처럼 행동하는 시뮬레이터"""
    
    @staticmethod
    def random_sleep(min_sec=1.0, max_sec=3.0):
        """랜덤 대기 (사람 반응속도 시뮬레이션)"""
        delay = random.uniform(min_sec, max_sec)
        time.sleep(delay)
        return delay
    
    @staticmethod
    def human_type(element, text, min_delay=0.05, max_delay=0.15):
        """사람처럼 한 글자씩 타이핑 (속도 변동 포함)"""
        for i, char in enumerate(text):
            element.send_keys(char)
            # 가끔 빠르게, 가끔 느리게 (사람 타이핑 패턴)
            if random.random() < 0.1:  # 10% 확률로 잠시 멈춤 (생각하는 척)
                time.sleep(random.uniform(0.3, 0.8))
            elif random.random() < 0.05:  # 5% 확률로 오타+수정
                wrong = random.choice(string.ascii_lowercase)
                element.send_keys(wrong)
                time.sleep(random.uniform(0.1, 0.3))
                element.send_keys(Keys.BACKSPACE)
                time.sleep(random.uniform(0.1, 0.2))
            else:
                time.sleep(random.uniform(min_delay, max_delay))
    
    @staticmethod
    def human_mouse_move(driver, element):
        """사람처럼 마우스를 움직여서 클릭"""
        actions = ActionChains(driver)
        # 랜덤 오프셋으로 약간 빗나간 후 정확히 이동
        actions.move_to_element_with_offset(element, 
            random.randint(-5, 5), random.randint(-3, 3))
        actions.pause(random.uniform(0.1, 0.3))
        actions.move_to_element(element)
        actions.pause(random.uniform(0.05, 0.15))
        actions.click()
        actions.perform()
    
    @staticmethod
    def random_scroll(driver):
        """랜덤 스크롤 (사람처럼 페이지 둘러보기)"""
        scroll_amount = random.randint(100, 500)
        direction = random.choice([1, -1])
        driver.execute_script(f"window.scrollBy(0, {scroll_amount * direction})")
        time.sleep(random.uniform(0.5, 1.5))
    
    @staticmethod
    def random_page_activity(driver):
        """랜덤 페이지 활동 (봇 탐지 우회용)"""
        activities = [
            lambda: HumanBeing.random_scroll(driver),
            lambda: time.sleep(random.uniform(1, 3)),
            lambda: driver.execute_script("window.scrollTo(0, 0)"),
        ]
        random.choice(activities)()


# ── 테더링 매니저 ──
class TetheringManager:
    """모바일 테더링 IP 변경 관리"""
    
    def __init__(self, method='airplane', interface='usb0'):
        self.method = method  # airplane, reconnect, vpn
        self.interface = interface
        self.change_count = 0
    
    def get_current_ip(self):
        """현재 외부 IP 확인"""
        try:
            import requests
            r = requests.get('https://api.ipify.org?format=json', timeout=10)
            return r.json()['ip']
        except:
            return 'unknown'
    
    def change_ip(self):
        """IP 변경 (테더링 재연결)"""
        log.info(f'🔄 IP 변경 시도 (방법: {self.method})')
        old_ip = self.get_current_ip()
        
        if self.method == 'airplane':
            # ADB로 폰 비행기모드 ON/OFF (USB 테더링 시)
            try:
                subprocess.run(['adb', 'shell', 'settings', 'put', 'global', 'airplane_mode_on', '1'], timeout=5)
                subprocess.run(['adb', 'shell', 'am', 'broadcast', '-a', 'android.intent.action.AIRPLANE_MODE'], timeout=5)
                time.sleep(3)
                subprocess.run(['adb', 'shell', 'settings', 'put', 'global', 'airplane_mode_on', '0'], timeout=5)
                subprocess.run(['adb', 'shell', 'am', 'broadcast', '-a', 'android.intent.action.AIRPLANE_MODE'], timeout=5)
                time.sleep(5)
            except Exception as e:
                log.warning(f'ADB 비행기모드 실패: {e}')
        
        elif self.method == 'reconnect':
            # 네트워크 인터페이스 재연결
            try:
                subprocess.run(['nmcli', 'device', 'disconnect', self.interface], timeout=5)
                time.sleep(2)
                subprocess.run(['nmcli', 'device', 'connect', self.interface], timeout=5)
                time.sleep(5)
            except Exception as e:
                log.warning(f'네트워크 재연결 실패: {e}')
        
        elif self.method == 'manual':
            log.info('📱 수동 IP 변경: 폰 비행기모드 ON → 5초 → OFF 후 Enter')
            input('  [Enter 키를 눌러 계속...]')
        
        new_ip = self.get_current_ip()
        self.change_count += 1
        log.info(f'  IP 변경: {old_ip} → {new_ip} (#{self.change_count})')
        return old_ip != new_ip


# ── 크롬 브라우저 매니저 ──
class ChromeManager:
    """크롬 브라우저 ON/OFF 관리 (undetected-chromedriver)"""
    
    def __init__(self, headless=False, profile_dir=None):
        self.driver = None
        self.headless = headless
        self.profile_dir = profile_dir or str(BASE_DIR / 'chrome_profile')
    
    def start(self):
        """크롬 시작 (봇 탐지 우회)"""
        if self.driver:
            log.warning('크롬이 이미 실행 중입니다')
            return self.driver
        
        log.info('🌐 크롬 브라우저 시작...')
        options = uc.ChromeOptions()
        
        # 봇 탐지 우회 옵션
        options.add_argument(f'--user-data-dir={self.profile_dir}')
        options.add_argument('--no-first-run')
        options.add_argument('--no-default-browser-check')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--disable-infobars')
        options.add_argument('--lang=ko-KR')
        options.add_argument('--window-size=1280,900')
        
        # User-Agent 랜덤
        ua_list = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ]
        options.add_argument(f'--user-agent={random.choice(ua_list)}')
        
        if self.headless:
            options.add_argument('--headless=new')
        
        try:
            self.driver = uc.Chrome(options=options, version_main=None)
            # 추가 봇 탐지 우회
            self.driver.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": self.driver.execute_script("return navigator.userAgent").replace("Headless", "")
            })
            self.driver.execute_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                Object.defineProperty(navigator, 'languages', {get: () => ['ko-KR', 'ko', 'en-US', 'en']});
                window.chrome = { runtime: {} };
            """)
            log.info('✅ 크롬 시작 완료')
            return self.driver
        except Exception as e:
            log.error(f'❌ 크롬 시작 실패: {e}')
            raise
    
    def stop(self):
        """크롬 종료"""
        if self.driver:
            log.info('🛑 크롬 브라우저 종료...')
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None
            log.info('✅ 크롬 종료 완료')
    
    def restart(self):
        """크롬 재시작"""
        self.stop()
        time.sleep(2)
        return self.start()
    
    @property
    def is_running(self):
        return self.driver is not None


# ── 네이버 톡톡 발송기 ──
class NaverTalkTalkSender:
    """네이버 톡톡 자동 발송기"""
    
    def __init__(self, config=None):
        self.config = config or {}
        self.chrome = ChromeManager(
            headless=self.config.get('headless', False),
            profile_dir=self.config.get('profile_dir')
        )
        self.tethering = TetheringManager(
            method=self.config.get('tethering_method', 'manual'),
            interface=self.config.get('tethering_interface', 'usb0')
        )
        self.human = HumanBeing()
        self.state = self._load_state()
        self.sent_count = 0
        self.fail_count = 0
        self.session_start = datetime.now()
    
    def _load_state(self):
        """발송 상태 로드"""
        if STATE_FILE.exists():
            return json.loads(STATE_FILE.read_text(encoding='utf-8'))
        return {'sent': {}, 'failed': {}, 'total_sent': 0}
    
    def _save_state(self):
        """발송 상태 저장"""
        STATE_FILE.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), encoding='utf-8')
    
    def login_naver(self, username, password):
        """네이버 로그인 (수동 로그인 지원)"""
        driver = self.chrome.start()
        
        # 이미 로그인 상태 확인
        driver.get('https://www.naver.com')
        self.human.random_sleep(2, 4)
        
        try:
            # 로그인 버튼 확인
            login_area = driver.find_elements(By.CSS_SELECTOR, '.MyView-module__link_login___HpHMW, .link_login, #login_id')
            if not login_area:
                log.info('✅ 이미 로그인 상태')
                return True
        except:
            pass
        
        log.info('🔐 네이버 로그인 시도...')
        driver.get('https://nid.naver.com/nidlogin.login')
        self.human.random_sleep(2, 3)
        
        if username and password:
            # 자동 로그인 시도 (캡차 뜰 수 있음)
            try:
                id_input = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, 'id'))
                )
                # clipboard 방식으로 입력 (키로거 탐지 우회)
                driver.execute_script(f'document.getElementById("id").value = "{username}"')
                self.human.random_sleep(0.5, 1)
                driver.execute_script(f'document.getElementById("pw").value = "{password}"')
                self.human.random_sleep(0.5, 1)
                
                login_btn = driver.find_element(By.ID, 'log.login')
                self.human.human_mouse_move(driver, login_btn)
                self.human.random_sleep(1, 2)
                
                # 캡차 체크
                time.sleep(3)
                if 'captcha' in driver.page_source.lower() or 'recaptcha' in driver.page_source.lower():
                    log.warning('⚠️ 캡차 감지! 수동으로 해결해주세요.')
                    input('  캡차 해결 후 [Enter]...')
                
            except Exception as e:
                log.warning(f'자동 로그인 실패: {e}')
                log.info('📱 수동 로그인: 브라우저에서 직접 로그인 후 Enter')
                input('  로그인 완료 후 [Enter]...')
        else:
            log.info('📱 수동 로그인: 브라우저에서 직접 로그인 후 Enter')
            input('  로그인 완료 후 [Enter]...')
        
        # 로그인 확인
        driver.get('https://www.naver.com')
        self.human.random_sleep(2, 3)
        
        try:
            driver.find_element(By.CSS_SELECTOR, '.MyView-module__link_login___HpHMW, .link_login')
            log.error('❌ 로그인 실패')
            return False
        except:
            log.info('✅ 로그인 성공')
            return True
    
    def send_talktalk(self, pid, message, business_name=''):
        """
        PID로 네이버 톡톡 메시지 발송
        
        Args:
            pid: 네이버 플레이스 고유번호
            message: 발송할 메시지
            business_name: 업체명 (로그용)
        """
        driver = self.chrome.driver
        if not driver:
            log.error('크롬이 실행되지 않았습니다')
            return False
        
        display_name = business_name or pid
        
        # 이미 발송한 PID 스킵
        if str(pid) in self.state['sent']:
            log.info(f'⏭️ [{display_name}] 이미 발송됨 — 스킵')
            return True
        
        try:
            # 1. 네이버 플레이스 페이지 접속
            place_url = f'https://m.place.naver.com/place/{pid}/home'
            log.info(f'📍 [{display_name}] 플레이스 접속: {place_url}')
            driver.get(place_url)
            self.human.random_sleep(3, 5)
            
            # 2. 페이지 둘러보기 (human_being)
            self.human.random_page_activity(driver)
            self.human.random_sleep(1, 2)
            
            # 3. 톡톡 버튼 찾기
            talktalk_btn = None
            selectors = [
                'a[href*="talk.naver.com"]',
                'button[class*="talk"]',
                '[class*="talktalk"]',
                '[class*="TalkTalk"]',
                'a[class*="chat"]',
                '[data-type="talktalk"]',
                'span:contains("톡톡")',
            ]
            
            for sel in selectors:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, sel)
                    if elements:
                        talktalk_btn = elements[0]
                        break
                except:
                    continue
            
            # XPath로도 시도
            if not talktalk_btn:
                try:
                    talktalk_btn = driver.find_element(By.XPATH, 
                        '//*[contains(text(),"톡톡") or contains(text(),"채팅") or contains(@href,"talk.naver")]')
                except:
                    pass
            
            if not talktalk_btn:
                log.warning(f'⚠️ [{display_name}] 톡톡 버튼 없음 — 스킵')
                self.state['failed'][str(pid)] = {'reason': '톡톡없음', 'time': datetime.now().isoformat()}
                self._save_state()
                self.fail_count += 1
                return False
            
            # 4. 톡톡 버튼 클릭 (human_being)
            log.info(f'💬 [{display_name}] 톡톡 클릭')
            self.human.human_mouse_move(driver, talktalk_btn)
            self.human.random_sleep(2, 4)
            
            # 새 탭이 열릴 수 있음
            original_window = driver.current_window_handle
            windows_before = driver.window_handles
            
            # 톡톡 창 대기
            time.sleep(3)
            windows_after = driver.window_handles
            if len(windows_after) > len(windows_before):
                new_window = [w for w in windows_after if w not in windows_before][0]
                driver.switch_to.window(new_window)
                self.human.random_sleep(2, 3)
            
            # 5. 메시지 입력창 찾기
            msg_input = None
            input_selectors = [
                'textarea[class*="input"]',
                'div[contenteditable="true"]',
                'textarea[placeholder*="메시지"]',
                '#message_input',
                'textarea',
                '[class*="ChatInput"]',
                '[class*="chat_input"]',
            ]
            
            for sel in input_selectors:
                try:
                    elements = WebDriverWait(driver, 5).until(
                        EC.presence_of_all_elements_located((By.CSS_SELECTOR, sel))
                    )
                    if elements:
                        msg_input = elements[-1]  # 마지막 것 (보통 입력창)
                        break
                except:
                    continue
            
            if not msg_input:
                log.warning(f'⚠️ [{display_name}] 메시지 입력창 없음')
                self.state['failed'][str(pid)] = {'reason': '입력창없음', 'time': datetime.now().isoformat()}
                self._save_state()
                self.fail_count += 1
                # 새 탭 닫기
                if driver.current_window_handle != original_window:
                    driver.close()
                    driver.switch_to.window(original_window)
                return False
            
            # 6. 메시지 입력 (human_being 타이핑)
            log.info(f'⌨️ [{display_name}] 메시지 입력 중...')
            msg_input.click()
            self.human.random_sleep(0.5, 1)
            
            # 개인화 메시지 치환
            personalized = message.replace('{업체명}', business_name).replace('{pid}', str(pid))
            self.human.human_type(msg_input, personalized)
            self.human.random_sleep(1, 2)
            
            # 7. 전송
            log.info(f'📤 [{display_name}] 전송!')
            msg_input.send_keys(Keys.ENTER)
            self.human.random_sleep(2, 3)
            
            # 8. 성공 기록
            self.state['sent'][str(pid)] = {
                'name': business_name,
                'time': datetime.now().isoformat(),
                'message': personalized[:50] + '...'
            }
            self.state['total_sent'] = len(self.state['sent'])
            self._save_state()
            self.sent_count += 1
            
            log.info(f'✅ [{display_name}] 발송 성공! (#{self.sent_count})')
            
            # 새 탭 닫기
            if driver.current_window_handle != original_window:
                driver.close()
                driver.switch_to.window(original_window)
            
            return True
            
        except Exception as e:
            log.error(f'❌ [{display_name}] 발송 실패: {e}')
            self.state['failed'][str(pid)] = {'reason': str(e)[:100], 'time': datetime.now().isoformat()}
            self._save_state()
            self.fail_count += 1
            return False
    
    def batch_send(self, targets, message, ip_change_every=10, restart_every=30, delay_range=(30, 90)):
        """
        일괄 발송
        
        Args:
            targets: [{'pid': '123', 'name': '업체명'}, ...]
            message: 메시지 ('{업체명}' 치환 가능)
            ip_change_every: N건마다 IP 변경
            restart_every: N건마다 브라우저 재시작
            delay_range: 발송 간 대기 (초) 범위
        """
        total = len(targets)
        log.info(f'\n{"="*60}')
        log.info(f'📮 일괄 발송 시작: {total}건')
        log.info(f'   IP 변경: {ip_change_every}건마다')
        log.info(f'   브라우저 재시작: {restart_every}건마다')
        log.info(f'   발송 간격: {delay_range[0]}~{delay_range[1]}초')
        log.info(f'{"="*60}\n')
        
        for i, target in enumerate(targets, 1):
            pid = target.get('pid', target.get('id', ''))
            name = target.get('name', str(pid))
            
            # 이미 발송한 건 스킵
            if str(pid) in self.state['sent']:
                log.info(f'[{i}/{total}] ⏭️ {name} — 이미 발송됨')
                continue
            
            log.info(f'\n[{i}/{total}] 🎯 {name} (PID: {pid})')
            
            # IP 변경 (N건마다)
            if ip_change_every and i > 1 and (i - 1) % ip_change_every == 0:
                log.info(f'🔄 IP 변경 ({ip_change_every}건마다)')
                self.tethering.change_ip()
                self.human.random_sleep(3, 5)
            
            # 브라우저 재시작 (N건마다)
            if restart_every and i > 1 and (i - 1) % restart_every == 0:
                log.info(f'🔄 브라우저 재시작 ({restart_every}건마다)')
                self.chrome.restart()
                self.human.random_sleep(3, 5)
                # 재로그인 필요할 수 있음
                self.login_naver(
                    self.config.get('naver_id', ''),
                    self.config.get('naver_pw', '')
                )
            
            # 발송
            success = self.send_talktalk(pid, message, name)
            
            # 발송 간 대기 (human_being)
            if i < total:
                wait = random.uniform(delay_range[0], delay_range[1])
                # 가끔 더 오래 쉬기 (사람처럼)
                if random.random() < 0.15:  # 15% 확률로 장시간 대기
                    wait *= random.uniform(2, 4)
                    log.info(f'  ☕ 장시간 대기: {wait:.0f}초')
                else:
                    log.info(f'  ⏳ 대기: {wait:.0f}초')
                time.sleep(wait)
        
        # 최종 통계
        elapsed = (datetime.now() - self.session_start).total_seconds()
        log.info(f'\n{"="*60}')
        log.info(f'📊 발송 완료!')
        log.info(f'  ✅ 성공: {self.sent_count}건')
        log.info(f'  ❌ 실패: {self.fail_count}건')
        log.info(f'  ⏭️ 스킵: {total - self.sent_count - self.fail_count}건')
        log.info(f'  ⏱️ 소요: {elapsed/60:.1f}분')
        log.info(f'  🔄 IP 변경: {self.tethering.change_count}회')
        log.info(f'{"="*60}')
    
    def shutdown(self):
        """종료"""
        self._save_state()
        self.chrome.stop()


# ── CLI 웹 UI (Flask 없이 간단 HTTP) ──
def run_web_ui(port=8899):
    """간단한 웹 UI (브라우저에서 제어)"""
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import urllib.parse
    
    sender = [None]  # mutable reference
    
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/' or self.path == '/index.html':
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(get_ui_html().encode('utf-8'))
            elif self.path == '/api/status':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
                self.wfile.write(json.dumps({
                    'sent': len(state.get('sent', {})),
                    'failed': len(state.get('failed', {})),
                    'chrome': sender[0].chrome.is_running if sender[0] else False,
                }, ensure_ascii=False).encode())
            else:
                self.send_response(404)
                self.end_headers()
        
        def do_POST(self):
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len).decode('utf-8')
            data = json.loads(body) if body else {}
            
            result = {'ok': False, 'message': ''}
            
            if self.path == '/api/start':
                if not sender[0]:
                    sender[0] = NaverTalkTalkSender(data.get('config', {}))
                sender[0].chrome.start()
                result = {'ok': True, 'message': '크롬 시작됨'}
            
            elif self.path == '/api/stop':
                if sender[0]:
                    sender[0].shutdown()
                result = {'ok': True, 'message': '크롬 종료됨'}
            
            elif self.path == '/api/login':
                if sender[0]:
                    ok = sender[0].login_naver(data.get('id',''), data.get('pw',''))
                    result = {'ok': ok, 'message': '로그인 성공' if ok else '로그인 실패'}
            
            elif self.path == '/api/send':
                if sender[0]:
                    ok = sender[0].send_talktalk(data['pid'], data['message'], data.get('name',''))
                    result = {'ok': ok, 'message': '발송 성공' if ok else '발송 실패'}
            
            elif self.path == '/api/change-ip':
                if sender[0]:
                    ok = sender[0].tethering.change_ip()
                    result = {'ok': ok, 'message': 'IP 변경 완료'}
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode())
        
        def log_message(self, format, *args):
            pass  # suppress access logs
    
    log.info(f'🌐 웹 UI 시작: http://localhost:{port}')
    HTTPServer(('0.0.0.0', port), Handler).serve_forever()


def get_ui_html():
    return '''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>네이버 톡톡 자동 발송기</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; }
.container { max-width: 800px; margin: 0 auto; padding: 20px; }
h1 { text-align: center; margin: 20px 0; font-size: 24px; }
h1 span { color: #00d26a; }
.card { background: #16213e; border-radius: 12px; padding: 20px; margin: 15px 0; border: 1px solid #0f3460; }
.card h2 { font-size: 16px; margin-bottom: 15px; color: #e94560; }
.row { display: flex; gap: 10px; margin: 10px 0; }
input, textarea, select { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid #0f3460; background: #0a0a1a; color: #eee; font-size: 14px; }
textarea { height: 120px; resize: vertical; }
button { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; }
.btn-green { background: #00d26a; color: #000; } .btn-green:hover { background: #00b359; }
.btn-red { background: #e94560; color: #fff; } .btn-red:hover { background: #c73650; }
.btn-blue { background: #0f3460; color: #fff; } .btn-blue:hover { background: #1a4a80; }
.btn-yellow { background: #f5a623; color: #000; } .btn-yellow:hover { background: #d4901d; }
.status { display: flex; gap: 15px; justify-content: center; margin: 15px 0; }
.stat { text-align: center; padding: 10px 20px; background: #0a0a1a; border-radius: 8px; min-width: 100px; }
.stat .num { font-size: 28px; font-weight: 700; } .stat .label { font-size: 12px; color: #888; margin-top: 5px; }
.stat.green .num { color: #00d26a; } .stat.red .num { color: #e94560; } .stat.blue .num { color: #4fc3f7; }
.log { background: #0a0a1a; border-radius: 8px; padding: 15px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 13px; line-height: 1.6; }
.controls { display: flex; gap: 10px; flex-wrap: wrap; }
label { display: block; font-size: 13px; color: #888; margin-bottom: 5px; }
</style>
</head>
<body>
<div class="container">
<h1>💬 네이버 톡톡 <span>자동 발송기</span></h1>

<div class="status">
  <div class="stat green"><div class="num" id="sent">0</div><div class="label">발송 성공</div></div>
  <div class="stat red"><div class="num" id="failed">0</div><div class="label">실패</div></div>
  <div class="stat blue"><div class="num" id="chrome">OFF</div><div class="label">크롬 상태</div></div>
</div>

<div class="card">
  <h2>🔐 네이버 로그인</h2>
  <div class="row">
    <div style="flex:1"><label>네이버 ID</label><input id="nid" type="text" placeholder="아이디"></div>
    <div style="flex:1"><label>비밀번호</label><input id="npw" type="password" placeholder="비밀번호"></div>
  </div>
  <div class="controls" style="margin-top:10px">
    <button class="btn-green" onclick="startChrome()">🌐 크롬 시작</button>
    <button class="btn-blue" onclick="login()">🔐 로그인</button>
    <button class="btn-red" onclick="stopChrome()">🛑 크롬 종료</button>
    <button class="btn-yellow" onclick="changeIP()">🔄 IP 변경</button>
  </div>
</div>

<div class="card">
  <h2>📮 발송 설정</h2>
  <div class="row">
    <div style="flex:1">
      <label>PID 목록 (줄바꿈 구분)</label>
      <textarea id="pids" placeholder="12345678&#10;87654321&#10;..."></textarea>
    </div>
    <div style="flex:1">
      <label>메시지 ({업체명} 자동 치환)</label>
      <textarea id="msg" placeholder="안녕하세요 {업체명} 대표님.&#10;홈페이지 모바일 최적화 무료 진단 결과를 공유드립니다..."></textarea>
    </div>
  </div>
  <div class="row">
    <div style="flex:1"><label>발송 간격 (초)</label><input id="delay" type="number" value="60" min="10"></div>
    <div style="flex:1"><label>IP변경 간격 (건)</label><input id="ipInterval" type="number" value="10" min="1"></div>
  </div>
  <div class="controls" style="margin-top:10px">
    <button class="btn-green" onclick="startSend()">🚀 발송 시작</button>
    <button class="btn-red" onclick="stopSend()">⏹️ 발송 중지</button>
  </div>
</div>

<div class="card">
  <h2>📋 로그</h2>
  <div class="log" id="logArea">발송기 준비됨...</div>
</div>
</div>

<script>
const API = '';
let sendInterval = null;
function addLog(msg) { const l=document.getElementById('logArea'); l.innerHTML += '\\n' + new Date().toLocaleTimeString() + ' ' + msg; l.scrollTop = l.scrollHeight; }
async function api(path, data) { const r = await fetch(API+path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); return r.json(); }
async function startChrome() { addLog('🌐 크롬 시작 중...'); const r=await api('/api/start',{}); addLog(r.message); refreshStatus(); }
async function stopChrome() { addLog('🛑 크롬 종료 중...'); const r=await api('/api/stop',{}); addLog(r.message); refreshStatus(); }
async function login() { addLog('🔐 로그인 시도...'); const r=await api('/api/login',{id:document.getElementById('nid').value,pw:document.getElementById('npw').value}); addLog(r.message); }
async function changeIP() { addLog('🔄 IP 변경 중...'); const r=await api('/api/change-ip',{}); addLog(r.message); }
async function refreshStatus() { const r=await fetch(API+'/api/status').then(r=>r.json()); document.getElementById('sent').textContent=r.sent; document.getElementById('failed').textContent=r.failed; document.getElementById('chrome').textContent=r.chrome?'ON':'OFF'; }
async function startSend() {
  const pids = document.getElementById('pids').value.trim().split('\\n').filter(Boolean);
  const msg = document.getElementById('msg').value;
  if (!pids.length||!msg) { addLog('❌ PID와 메시지를 입력하세요'); return; }
  const delay = parseInt(document.getElementById('delay').value)*1000;
  let i=0;
  addLog('🚀 발송 시작: '+pids.length+'건');
  sendInterval = setInterval(async()=>{
    if(i>=pids.length){clearInterval(sendInterval);addLog('✅ 전체 발송 완료!');return;}
    const pid=pids[i].trim();
    addLog('📤 ['+( i+1)+'/'+pids.length+'] PID: '+pid);
    const r=await api('/api/send',{pid:pid,message:msg,name:''});
    addLog(r.ok?'✅ 성공':'❌ 실패: '+r.message);
    refreshStatus(); i++;
  }, delay);
}
function stopSend(){if(sendInterval){clearInterval(sendInterval);sendInterval=null;addLog('⏹️ 발송 중지됨');}}
setInterval(refreshStatus, 5000);
refreshStatus();
</script>
</body></html>'''


# ── CLI 진입점 ──
def main():
    parser = argparse.ArgumentParser(description='네이버 톡톡 자동 발송기')
    sub = parser.add_subparsers(dest='command')
    
    # 웹 UI
    ui_cmd = sub.add_parser('ui', help='웹 UI 실행')
    ui_cmd.add_argument('--port', type=int, default=8899)
    
    # CLI 발송
    send_cmd = sub.add_parser('send', help='CLI 발송')
    send_cmd.add_argument('--pid', help='PID (쉼표 구분)')
    send_cmd.add_argument('--pid-file', help='PID 목록 파일 (JSON/CSV)')
    send_cmd.add_argument('--message', '-m', help='메시지')
    send_cmd.add_argument('--naver-id', help='네이버 ID')
    send_cmd.add_argument('--naver-pw', help='네이버 PW')
    send_cmd.add_argument('--delay', type=int, default=60, help='발송 간격 (초)')
    send_cmd.add_argument('--ip-change', type=int, default=10, help='IP 변경 간격 (건)')
    send_cmd.add_argument('--headless', action='store_true', help='헤드리스 모드')
    send_cmd.add_argument('--tethering', choices=['airplane','reconnect','manual'], default='manual')
    
    # 상태
    stat_cmd = sub.add_parser('status', help='발송 상태 확인')
    
    args = parser.parse_args()
    
    if args.command == 'ui':
        run_web_ui(args.port)
    
    elif args.command == 'send':
        config = {
            'naver_id': args.naver_id or '',
            'naver_pw': args.naver_pw or '',
            'headless': args.headless,
            'tethering_method': args.tethering,
        }
        sender = NaverTalkTalkSender(config)
        
        # 로그인
        sender.login_naver(config['naver_id'], config['naver_pw'])
        
        # PID 목록
        targets = []
        if args.pid:
            for p in args.pid.split(','):
                targets.append({'pid': p.strip(), 'name': ''})
        elif args.pid_file:
            with open(args.pid_file, 'r', encoding='utf-8') as f:
                if args.pid_file.endswith('.json'):
                    targets = json.load(f)
                else:
                    for line in f:
                        parts = line.strip().split(',')
                        targets.append({'pid': parts[0], 'name': parts[1] if len(parts)>1 else ''})
        
        if not targets:
            log.error('PID를 지정하세요 (--pid 또는 --pid-file)')
            return
        
        if not args.message:
            log.error('메시지를 지정하세요 (-m)')
            return
        
        # 발송
        sender.batch_send(targets, args.message, 
                         ip_change_every=args.ip_change,
                         delay_range=(args.delay * 0.7, args.delay * 1.3))
        sender.shutdown()
    
    elif args.command == 'status':
        if STATE_FILE.exists():
            state = json.loads(STATE_FILE.read_text())
            print(f'✅ 발송 성공: {len(state.get("sent", {}))}건')
            print(f'❌ 실패: {len(state.get("failed", {}))}건')
            print(f'📊 총 발송: {state.get("total_sent", 0)}건')
        else:
            print('발송 이력 없음')
    
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
