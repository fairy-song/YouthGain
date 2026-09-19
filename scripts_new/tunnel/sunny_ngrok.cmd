@echo off
chcp 65001 >nul
cls
echo ================================================
echo   青盈应用 Sunny-Ngrok内网穿透
echo ================================================
echo.

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..\..
set PORT=3000

:: 复制Sunny-Ngrok目录，如果不存在
if not exist "%SCRIPT_DIR%\sunnyNgrok" (
    echo [提示] 复制Sunny-Ngrok目录...
    mkdir "%SCRIPT_DIR%\sunnyNgrok"
    xcopy /E /I /Y "%ROOT_DIR%\scripts\tunnel\sunnyNgrok" "%SCRIPT_DIR%\sunnyNgrok" > nul
    echo [成功] 已复制Sunny-Ngrok目录
)

echo [1/2] 启动内网穿透...
start "青盈-内网穿透" /D "%SCRIPT_DIR%\sunnyNgrok" cmd /k "color 0E & sunny.exe clientid 隧道id -p %PORT%"

echo.
echo [2/2] 正在获取域名信息...
timeout /t 3 > nul

echo.
echo ================================================
echo                 穿透已启动!
echo ================================================
echo.
echo  请确保已启动本地服务 (scripts_new\local\start.cmd)
echo  然后通过Sunny-Ngrok提供的域名访问应用
echo.
echo  常见问题:
echo  1. 如果域名无法访问，可能是Sunny-Ngrok配置问题
echo  2. 请确保本地服务已正确启动在端口 %PORT%
echo  3. 您可能需要替换上面的"隧道id"为您自己的ID
echo.
pause 