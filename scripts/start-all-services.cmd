@echo off
chcp 65001 >nul
cls
echo ================================================
echo   青盈应用 服务启动程序 (简化版)
echo ================================================
echo.

set SCRIPT_DIR=%~dp0
set FRONTEND_PORT=3000
set BACKEND_PORT=5001

echo [1/3] 检查代理服务器依赖...
if not exist "%SCRIPT_DIR%..\node_modules\express" (
    echo [提示] 未找到代理服务器依赖，准备安装...
    cd /d %SCRIPT_DIR%..
    call npm install --save express http-proxy-middleware
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [成功] 依赖安装完成
) else (
    echo [提示] 依赖已安装
)

echo [2/3] 启动后端服务...
echo [提示] 使用增强版后端服务来解决AI服务响应问题
start cmd /k "title 青盈-后端服务 && color 0A && cd /d %SCRIPT_DIR%.. && cd backend && python run_dev_enhanced.py"

echo [3/3] 启动代理服务器...
start cmd /k "title 青盈-代理服务器 && color 0B && cd /d %SCRIPT_DIR% && node proxy\proxy-server.js %FRONTEND_PORT% %BACKEND_PORT%"

echo.
echo ================================================
echo                  启动完成!
echo ================================================
echo.
echo  本地前端+代理: http://localhost:%FRONTEND_PORT%
echo  本地后端: http://localhost:%BACKEND_PORT%
echo  穿透地址: 现有的Sunny-Ngrok隧道地址
echo.
echo ================================================
echo                使用说明
echo ================================================
echo.
echo  1. 已启动后端API服务和代理服务器
echo  2. 请保持现有的Sunny-Ngrok隧道运行
echo  3. 如果显示"这是一个测试回复"，请等待1分钟让AI模型初始化
echo  4. 如需检测AI服务状态: node %SCRIPT_DIR%utils\troubleshoot-ai.js
echo.
echo  常见问题请参考"scripts\docs\AI服务修复说明.md"文件
echo.
pause 