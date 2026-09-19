@echo off
chcp 65001 >nul
cls
echo ================================================
echo   青盈应用 简化版启动程序
echo ================================================
echo.
echo 这是一个简化的启动脚本，只启动必要的服务
echo.

set SCRIPT_DIR=%~dp0

echo [1/2] 启动后端服务...
start cmd /k "title 青盈-后端服务 && color 0A && cd /d %SCRIPT_DIR%.. && cd backend && python run_dev.py"

echo [2/2] 启动代理服务器...
start cmd /k "title 青盈-代理服务器 && color 0B && cd /d %SCRIPT_DIR% && node proxy\proxy-server.js 3000 5001"

echo.
echo ================================================
echo                 服务已启动!
echo ================================================
echo.
echo  本地前端+代理: http://localhost:3000
echo  本地后端: http://localhost:5001
echo.
echo  请确保您的Sunny-Ngrok隧道已启动:
echo  - 隧道本地端口为3000
echo  - 请使用隧道提供的外部URL访问应用
echo.
echo  如遇到"这是一个测试回复"的问题，请等待1-2分钟
echo  让AI模型完全初始化后再尝试。
echo.
echo  按任意键退出该窗口(但保持服务窗口运行)
pause 