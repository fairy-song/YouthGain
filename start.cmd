@echo off
chcp 65001 >nul
cls
echo ================================================
echo   青盈应用 主菜单
echo ================================================
echo.
echo  请选择要运行的服务:
echo.
echo  [1] 运行前端 (3000端口)
echo  [2] 运行后端 (5001端口)
echo  [3] 运行两者 (推荐)
echo  [0] 退出
echo.
set /p choice=请输入选项 (0-3): 

if "%choice%"=="1" (
    echo.
    echo [启动] 前端代理服务器...
    start "青盈前端" /D "%~dp0" cmd /k "color 0B & node scripts\local\proxy-server.js 3000 5001"
    echo 前端服务已启动，请访问: http://localhost:3000
    pause
    exit
)

if "%choice%"=="2" (
    echo.
    echo [启动] 后端服务...
    start "青盈后端" /D "%~dp0backend" cmd /k "color 0A & python run_dev_enhanced.py"
    echo 后端服务已启动，API地址: http://localhost:5001
    pause
    exit
)

if "%choice%"=="3" (
    echo.
    echo [1/2] 启动后端服务...
    start "青盈后端" /D "%~dp0backend" cmd /k "color 0A & python run_dev_enhanced.py"
    
    echo [2/2] 启动前端代理服务... 
    start "青盈前端" /D "%~dp0" cmd /k "color 0B & node scripts\local\proxy-server.js 3000 5001"
    
    echo.
    echo 所有服务已启动:
    echo - 前端: http://localhost:3000
    echo - 后端: http://localhost:5001
    pause
    exit
)

if "%choice%"=="0" (
    echo 退出程序...
    exit
)

echo.
echo 无效选项，请重新运行脚本。
pause 