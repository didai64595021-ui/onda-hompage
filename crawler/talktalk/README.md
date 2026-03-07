# 네이버 톡톡 자동 발송기 v1.0

## 기능
1. **네이버 계정 로그인** → PID로 업체 톡톡 자동 발송
2. **테더링 IP 변경** — N건마다 자동 IP 로테이션 (비행기모드/재연결/수동)
3. **크롬 ON/OFF** — undetected-chromedriver (봇 탐지 우회)
4. **human_being** — 랜덤 타이핑, 마우스 움직임, 스크롤, 오타+수정, 장시간 대기
5. **웹 UI** — 브라우저에서 제어 (localhost:8899)
6. **발송 이력 관리** — 중복 발송 방지, 실패 기록

## 사용법

### 웹 UI (추천)
```bash
source ../talktalk-venv/bin/activate
python naver_talktalk_sender.py ui --port 8899
# → 브라우저에서 http://localhost:8899
```

### CLI
```bash
# 단건 발송
python naver_talktalk_sender.py send --pid 12345678 -m "안녕하세요 {업체명} 대표님..."

# 파일로 일괄 발송
python naver_talktalk_sender.py send --pid-file targets.json -m "메시지" --delay 60 --ip-change 10

# 상태 확인
python naver_talktalk_sender.py status
```

### targets.json 형식
```json
[
  {"pid": "12345678", "name": "업체A"},
  {"pid": "87654321", "name": "업체B"}
]
```

## human_being 기능
- 타이핑: 글자당 50~150ms 랜덤 딜레이, 10% 확률 사고 멈춤, 5% 확률 오타+수정
- 마우스: 약간 빗나간 후 정확히 이동 → 클릭
- 스크롤: 랜덤 방향/거리
- 대기: 발송 간 30~90초 + 15% 확률 장시간 대기 (2~4배)
- 브라우저 재시작: 30건마다

## 봇 차단 우회
- undetected-chromedriver (WebDriver 감지 차단)
- navigator.webdriver = undefined
- 랜덤 User-Agent
- 한국어 locale
- chrome.runtime 정의
- 프로필 유지 (쿠키/세션 보존)

## 필요사항
- Chrome 브라우저 설치
- Python 3.10+
- 네이버 계정
- (선택) USB 테더링 폰 (IP 변경용)
