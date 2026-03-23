@echo off
chcp 65001 >nul
echo ========================================
echo   네이버 플레이스 크롤러 EXE 빌드
echo ========================================
echo.

REM Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되지 않았습니다.
    echo https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe
    echo 설치 시 "Add Python to PATH" 체크 필수!
    pause
    exit /b 1
)

echo [1/3] 필요 패키지 설치 중...
pip install pyinstaller openpyxl requests

echo.
echo [2/3] EXE 빌드 중... (1~2분 소요)
pyinstaller --onefile --windowed --name "네이버크롤러" --add-data "crawler_engine.py;." --add-data "districts_data.json;." fill_crawl_gui.py

echo.
echo [3/3] 완료!
echo.
echo ========================================
echo   dist\네이버크롤러.exe 생성 완료!
echo   이 파일 하나만 배포하면 됩니다.
echo ========================================
echo.
pause
