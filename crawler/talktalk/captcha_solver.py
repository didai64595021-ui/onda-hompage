#!/usr/bin/env python3
"""
AI 캡차 솔버 — 어떤 캡차든 스크린샷 → AI 분석 → 답변
Vision 모델로 캡차 이미지를 읽고 질문에 답함
"""
import base64
import json
import os
import re
import requests
import time

# AI Vision API 키 — 우선순위: Gemini > Anthropic > OpenAI
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# OpenClaw .env에서도 읽기
_openclaw_env = os.path.expanduser("~/.openclaw/.env")
if os.path.exists(_openclaw_env):
    with open(_openclaw_env) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                if k == "GEMINI_API_KEY" and not GEMINI_API_KEY:
                    GEMINI_API_KEY = v
                elif k == "OPENAI_API_KEY" and not OPENAI_API_KEY:
                    OPENAI_API_KEY = v
                elif k == "ANTHROPIC_API_KEY" and not ANTHROPIC_API_KEY:
                    ANTHROPIC_API_KEY = v


def solve_captcha_from_screenshot(screenshot_path, question_text=""):
    """
    스크린샷에서 캡차를 분석하고 답변 반환
    
    Args:
        screenshot_path: 캡차가 포함된 스크린샷 경로
        question_text: 이미 추출된 질문 텍스트 (없으면 이미지에서 추출)
    
    Returns:
        str: 캡차 답변 (숫자, 텍스트 등)
    """
    with open(screenshot_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")
    
    prompt = f"""이 이미지는 네이버 로그인 캡차 화면입니다.
빨간 글씨의 질문을 정확히 읽고 답하세요.

절차:
1. 이미지 속 영수증/종이에 적힌 모든 텍스트를 정확히 읽으세요 (가게이름, 주소, 전화번호 등)
2. 빨간색 질문을 읽으세요
3. 질문에 맞는 정확한 답을 구하세요

예시:
- "가게 전화번호의 두 번째 숫자는?" → 전화번호 641-8653에서 두 번째 숫자 = 4
- "가게 전화번호의 첫 번째 숫자는?" → 전화번호 641-8653에서 첫 번째 숫자 = 6
- "가게 이름의 첫 글자는?" → 가게명에서 첫 글자

중요: 전화번호 숫자를 셀 때 하이픈(-)은 무시하고 숫자만 셉니다.
예: 641-8653 → 6,4,1,8,6,5,3 (7개 숫자)

{f'질문: {question_text}' if question_text else ''}

답변만 출력하세요 (숫자 하나 또는 단어만, 설명 없이):"""

    # Gemini Vision 시도 (무료 + 빠름)
    if GEMINI_API_KEY:
        answer = _solve_with_gemini(img_b64, prompt)
        if answer:
            return answer
    
    # Anthropic Claude 시도
    if ANTHROPIC_API_KEY:
        answer = _solve_with_anthropic(img_b64, prompt)
        if answer:
            return answer
    
    # OpenAI GPT-4o 시도
    if OPENAI_API_KEY:
        answer = _solve_with_openai(img_b64, prompt)
        if answer:
            return answer
    
    # 전부 없으면 로컬 분석 시도
    return _solve_locally(screenshot_path, question_text)


def _solve_with_gemini(img_b64, prompt):
    """Google Gemini Vision으로 캡차 풀기"""
    try:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": img_b64,
                            }
                        }
                    ]
                }],
                "generationConfig": {"maxOutputTokens": 100, "temperature": 0}
            },
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            answer = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            print(f"  🤖 Gemini 답변: {answer}")
            return _clean_answer(answer)
        else:
            print(f"  ⚠️ Gemini 오류: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  ⚠️ Gemini 오류: {e}")
    return None


def _solve_with_anthropic(img_b64, prompt):
    """Anthropic Claude Vision으로 캡차 풀기"""
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "content-type": "application/json",
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 100,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": img_b64,
                            }
                        },
                        {"type": "text", "text": prompt}
                    ]
                }]
            },
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            answer = data["content"][0]["text"].strip()
            print(f"  🤖 Claude 답변: {answer}")
            return _clean_answer(answer)
    except Exception as e:
        print(f"  ⚠️ Anthropic 오류: {e}")
    return None


def _solve_with_openai(img_b64, prompt):
    """OpenAI GPT-4o Vision으로 캡차 풀기"""
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o",
                "max_tokens": 100,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img_b64}",
                                "detail": "high"
                            }
                        }
                    ]
                }]
            },
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            answer = data["choices"][0]["message"]["content"].strip()
            print(f"  🤖 GPT-4o 답변: {answer}")
            return _clean_answer(answer)
    except Exception as e:
        print(f"  ⚠️ OpenAI 오류: {e}")
    return None


def _solve_locally(screenshot_path, question_text):
    """
    API 없이 로컬에서 시도 — 간단한 패턴 매칭
    네이버 캡차는 주로 영수증에서 숫자/텍스트를 읽는 유형
    """
    print("  ⚠️ AI API 키 없음 — 로컬 분석 시도")
    
    # 질문 패턴 분석
    if question_text:
        q = question_text.lower()
        
        # "N번째 숫자" 패턴
        m = re.search(r'(\d+)\s*번째\s*숫자', question_text)
        if not m:
            m = re.search(r'(first|second|third|fourth|fifth|sixth|seventh)', q)
            ordinal_map = {'first':1,'second':2,'third':3,'fourth':4,'fifth':5,'sixth':6,'seventh':7}
            if m:
                pos = ordinal_map.get(m.group(1), 0)
            else:
                pos = 0
        else:
            pos = int(m.group(1))
        
        if pos > 0:
            # 전화번호에서 N번째 숫자 추출 시도
            phone_match = re.search(r'[\d]{3}[-.]?\d{4}', question_text)
            if phone_match:
                digits = re.sub(r'[^\d]', '', phone_match.group())
                if pos <= len(digits):
                    answer = digits[pos - 1]
                    print(f"  📐 로컬 분석 답변: {answer}")
                    return answer
    
    return None


def _clean_answer(answer):
    """AI 답변에서 실제 답만 추출"""
    # 숫자만 있는 경우
    if re.match(r'^\d+$', answer):
        return answer
    
    # "답: X" 또는 "답변: X" 패턴
    m = re.search(r'[답답변answer][\s:：]*(.+)', answer, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    
    # 첫 줄만
    first_line = answer.split('\n')[0].strip()
    # 짧은 답변이면 그대로
    if len(first_line) <= 10:
        return first_line
    
    # 숫자 추출
    nums = re.findall(r'\d+', answer)
    if nums:
        return nums[0]
    
    return answer.strip()


def solve_naver_captcha(driver, max_retries=3):
    """
    Selenium driver에서 네이버 캡차를 자동으로 풀기
    
    Args:
        driver: Selenium WebDriver
        max_retries: 최대 재시도 횟수
    
    Returns:
        bool: 캡차 풀기 성공 여부
    """
    from selenium.webdriver.common.by import By
    
    for attempt in range(max_retries):
        print(f"\n🔐 캡차 풀기 시도 {attempt + 1}/{max_retries}")
        
        # 캡차 영역 스크린샷
        ss_path = f"/tmp/captcha_attempt_{attempt}.png"
        driver.save_screenshot(ss_path)
        
        # 질문 텍스트 추출 시도
        question = ""
        try:
            # 네이버 캡차 질문은 빨간색 텍스트로 표시됨
            q_elements = driver.find_elements(By.CSS_SELECTOR, ".captcha_question, .u_captcha .question, [class*='captcha'] [class*='question'], span[style*='color']")
            for el in q_elements:
                txt = el.text.strip()
                if txt and len(txt) > 5:
                    question = txt
                    break
            
            if not question:
                # 전체 캡차 영역 텍스트
                captcha_area = driver.find_elements(By.CSS_SELECTOR, "[class*='captcha'], #captcha, .u_captcha")
                for el in captcha_area:
                    txt = el.text.strip()
                    if "?" in txt or "번째" in txt or "무엇" in txt or "number" in txt.lower():
                        # 질문 부분만 추출
                        for line in txt.split('\n'):
                            if "?" in line or "번째" in line or "무엇" in line or "number" in line.lower():
                                question = line.strip()
                                break
        except:
            pass
        
        print(f"  📝 감지된 질문: {question or '(이미지에서 추출 필요)'}")
        
        # AI로 풀기
        answer = solve_captcha_from_screenshot(ss_path, question)
        
        if not answer:
            print("  ❌ 답변 추출 실패")
            # 캡차 새로고침
            try:
                refresh_btn = driver.find_element(By.CSS_SELECTOR, "[class*='captcha'] button[class*='refresh'], .u_captcha .btn_refresh, button[title*='새로']")
                refresh_btn.click()
                time.sleep(2)
            except:
                pass
            continue
        
        print(f"  ✏️ 답변 입력: {answer}")
        
        # 답변 입력
        try:
            captcha_input = driver.find_element(By.CSS_SELECTOR, "input[name='captcha'], input[id*='captcha'], input[class*='captcha'], .u_captcha input[type='text']")
            captcha_input.clear()
            time.sleep(0.3)
            
            # 인간적 타이핑
            for char in str(answer):
                captcha_input.send_keys(char)
                time.sleep(0.1)
            
            time.sleep(0.5)
            
            # 로그인 버튼 클릭
            try:
                login_btn = driver.find_element(By.ID, "log.login")
                login_btn.click()
            except:
                driver.execute_script('document.getElementById("log.login").click()')
            
            time.sleep(3)
            
            # 결과 확인
            current_url = driver.current_url
            if "nidlogin" not in current_url:
                print("  ✅ 캡차 통과! 로그인 성공!")
                return True
            
            # 여전히 로그인 페이지 — 캡차 틀렸거나 새 캡차
            page_src = driver.page_source
            if "captcha" in page_src.lower() or "캡차" in page_src:
                print("  ⚠️ 캡차 오답 또는 새 캡차 — 재시도")
                time.sleep(1)
                # 비밀번호 재입력 (네이버가 초기화할 수 있음)
                try:
                    pw_input = driver.find_element(By.ID, "pw")
                    pw_input.clear()
                    driver.execute_script('document.getElementById("pw").value=""')
                    time.sleep(0.3)
                except:
                    pass
            else:
                # 다른 이유로 실패
                print("  ⚠️ 로그인 실패 (캡차 외 원인)")
                driver.save_screenshot(f"/tmp/login_fail_{attempt}.png")
                
        except Exception as e:
            print(f"  ❌ 입력 오류: {e}")
    
    print(f"  ❌ {max_retries}회 시도 실패")
    return False


if __name__ == "__main__":
    # 테스트: 스크린샷에서 캡차 풀기
    import sys
    if len(sys.argv) > 1:
        ss_path = sys.argv[1]
        question = sys.argv[2] if len(sys.argv) > 2 else ""
        answer = solve_captcha_from_screenshot(ss_path, question)
        print(f"\n답변: {answer}")
    else:
        # 기존 스크린샷으로 테스트
        test_path = os.path.join(os.path.dirname(__file__), "login_debug.png")
        if os.path.exists(test_path):
            answer = solve_captcha_from_screenshot(test_path)
            print(f"\n답변: {answer}")
        else:
            print("사용법: python captcha_solver.py <스크린샷경로> [질문텍스트]")
