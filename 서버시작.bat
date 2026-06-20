@echo off
chcp 65001 > nul

:: ── 관리자 권한 확인 및 자동 재실행 ─────────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit
)

title 행정사 2차 합격기원 (통합판) - 서버

:: ── 방화벽 규칙 자동 추가 (최초 1회) ───────────────────────
netsh advfirewall firewall show rule name="행정사공부앱 포트8080" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="행정사공부앱 포트8080" dir=in action=allow protocol=TCP localport=8080 >nul
)

:: ── 로컬 IP 가져오기 ──────────────────────────────────────────
for /f %%a in ('powershell -NoProfile -Command ^
  "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress"') do set IP=%%a

:: ── 화면 출력 ─────────────────────────────────────────────────
cls
echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║      행정사 2차 합격기원 (통합판) - 로컬 서버      ║
echo  ║   📚 실무법 + ⚖️  민법(계약) 통합 학습 앱          ║
echo  ╚════════════════════════════════════════════════════╝
echo.
echo   [PC 브라우저]
echo   http://localhost:8080
echo.
echo   [아이폰 크롬] ← 아이폰에서 이 주소 입력
echo   ┌──────────────────────────────────────────┐
echo   │  http://%IP%:8080
echo   └──────────────────────────────────────────┘
echo.
echo   ※ PC와 아이폰이 같은 와이파이에 연결되어 있어야 합니다.
echo   ※ 이 창을 닫으면 서버가 꺼집니다.
echo.
echo  ────────────────────────────────────────────────
echo   서버 실행 중... (로그)
echo  ────────────────────────────────────────────────

:: ── PC 브라우저 자동 열기 ────────────────────────────────────
start "" http://localhost:8080

:: ── 서버 시작 ────────────────────────────────────────────────
cd /d "%~dp0"
python -m http.server 8080

pause
