@echo off
chcp 65001 >/dev/null
cd /d "%~dp0"

echo ================================
echo   포스터 제너레이터 시작 중...
echo ================================
echo.

where npm >/dev/null 2>&1
if %errorlevel% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo.
    echo 아래 주소에서 Node.js를 설치한 후 다시 실행해주세요:
    echo   https://nodejs.org
    echo.
    echo LTS 버전을 다운로드하여 설치하면 됩니다.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 처음 실행 시 필요한 파일을 설치합니다. 잠시 기다려주세요...
    echo ^(약 1~2분 소요될 수 있습니다^)
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo [오류] 설치에 실패했습니다.
        pause
        exit /b 1
    )
    echo.
)

echo 앱을 빌드하고 있습니다. 잠시 기다려주세요...
echo.
npm run build
if %errorlevel% neq 0 (
    echo.
    echo [오류] 빌드에 실패했습니다.
    pause
    exit /b 1
)

set PORT=3000

echo.
echo ================================
echo   실행 완료!
echo   브라우저가 자동으로 열립니다.
echo   주소: http://localhost:%PORT%
echo.
echo   이 창을 닫으면 앱이 종료됩니다.
echo ================================
echo.

start  "http://localhost:%PORT%"

npx vite preview --host 0.0.0.0 --port %PORT%
pause
