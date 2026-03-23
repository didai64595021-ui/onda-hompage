# 빈칸채우기 크롤러 GUI

네이버 플레이스/검색에서 업체 정보를 크롤링하여 CSV/엑셀의 빈칸을 채우는 GUI 도구.

## 설치

```bash
pip install -r requirements.txt
```

## 실행

```bash
python fill_crawl_gui.py
```

## exe 빌드

### Windows
```bat
build.bat
```

### Linux/Mac
```bash
chmod +x build.sh
./build.sh
```

## 사용법

1. **입력 CSV**: 업체 목록 CSV 파일 선택
2. **출력 파일**: 결과 저장 경로 (.csv 또는 .xlsx)
3. **프록시**: IP:PORT 목록 텍스트 파일 (선택사항)
4. **딜레이**: 요청 간 대기 시간 (3~8초 권장)
5. **시작** 버튼 클릭

## 채우는 항목

- 안심번호: 네이버 플레이스 HTML에서 추출
- 홈페이지: 네이버 검색 결과에서 추출
- 이메일: 홈페이지 HTML + 네이버 검색 폴백
- 네이버아이디: @naver.com 자동 변환
