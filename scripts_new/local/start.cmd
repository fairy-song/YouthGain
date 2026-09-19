@echo off
chcp 65001 >nul
cls
echo ================================================
echo   青盈应用 本地启动程序
echo ================================================
echo.

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..\..
set FRONTEND_PORT=3000
set BACKEND_PORT=5001

echo [1/3] 检查依赖...
if not exist "%ROOT_DIR%\node_modules\express" (
    echo [提示] 安装必要的依赖...
    cd /d %ROOT_DIR%
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
start "青盈-后端服务" /D "%ROOT_DIR%\backend" cmd /k "color 0A & python run_dev_enhanced.py"

echo [3/3] 启动代理服务器...
copy /Y "%ROOT_DIR%\scripts\proxy\proxy-server.js" "%SCRIPT_DIR%\" >nul
start "青盈-代理服务器" /D "%ROOT_DIR%" cmd /k "color 0B & node %SCRIPT_DIR%proxy-server.js %FRONTEND_PORT% %BACKEND_PORT%"

echo.
echo ================================================
echo                  启动完成!
echo ================================================
echo.
echo  本地前端+代理: http://localhost:%FRONTEND_PORT%
echo  本地后端: http://localhost:%BACKEND_PORT%
echo.
echo  如果显示"这是一个测试回复"，请等待1分钟让AI模型初始化
echo.
pause 