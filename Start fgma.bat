@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ================================
echo   f(g)=ma 시작 중...
echo ================================
echo.

:: Node.js 확인
where npm >nul 2>&1
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

:: 패키지 설치
if not exist "node_modules" (
    echo 처음 실행 시 필요한 파일을 설치합니다. 잠시 기다려주세요...
    echo ^(약 1~2분 소요될 수 있습니다^)
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [오류] 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해주세요.
        pause
        exit /b 1
    )
    echo.
)

:: 변경 사항이 있을 때만 빌드
set BUILD_NEEDED=0
if not exist "dist\index.html" set BUILD_NEEDED=1

if "%BUILD_NEEDED%"=="1" (
    echo 앱을 빌드하고 있습니다. 잠시 기다려주세요...
    echo.
    call npm run build
    if errorlevel 1 (
        echo.
        echo [오류] 빌드에 실패했습니다.
        pause
        exit /b 1
    )
    echo.
) else (
    echo 변경된 파일이 없어 기존 빌드를 사용합니다.
    echo.
)

:: 사용 가능한 포트 찾기
set PORT=3000
:find_port
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    set /a PORT+=1
    goto find_port
)

echo.
echo ================================
echo   실행 완료!
echo   브라우저가 자동으로 열립니다.
echo   주소: http://localhost:%PORT%
echo.
echo   이 창을 닫으면 앱이 종료됩니다.
echo ================================
echo.

start "" "http://localhost:%PORT%"

call npx vite preview --host 0.0.0.0 --port %PORT% --strictPort
if errorlevel 1 (
    echo.
    echo [오류] 로컬 서버 실행에 실패했습니다.
    echo 위에 표시된 오류 내용을 확인해주세요.
    echo.
    pause
    exit /b 1
)

echo.
pause
