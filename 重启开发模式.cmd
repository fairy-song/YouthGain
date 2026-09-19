@echo off
chcp 65001 >nul
echo ================================================
echo    停止并重启开发模式
echo ================================================
echo.

echo [步骤1] 正在查找并停止占用端口的进程...
echo.

REM 停止占用3000端口的进程
echo [检查] 检查端口3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do (
    echo [发现] 进程 %%a 占用端口3000
    taskkill /F /PID %%a >nul 2>&1
    if !errorlevel! equ 0 (
        echo [成功] 已停止进程 %%a
    )
)

REM 停止占用5001端口的进程
echo [检查] 检查端口5001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5001"') do (
    echo [发现] 进程 %%a 占用端口5001
    taskkill /F /PID %%a >nul 2>&1
    if !errorlevel! equ 0 (
        echo [成功] 已停止进程 %%a
    )
)

echo.
echo [等待] 等待端口释放（3秒）...
timeout /t 3 /nobreak >nul

echo.
echo [步骤2] 正在启动开发模式...
echo.

REM 启动后端
echo [启动] 正在启动后端服务...
start "青盈-后端(开发模式)" cmd /k "cd /d "%~dp0backend" && python run_dev_enhanced.py"

REM 等待后端启动
echo [等待] 等待后端服务启动（5秒）...
timeout /t 5 /nobreak >nul

REM 启动前端开发服务器
echo [启动] 正在启动前端开发服务器...
echo [提示] 首次启动可能需要较长时间...
start "青盈-前端(开发模式)" cmd /k "cd /d "%~dp0" && npm start"

echo.
echo ================================================
echo    服务启动中...
echo ================================================
echo.
echo [前端] http://localhost:3000 (开发服务器)
echo [后端] http://localhost:5001 (API服务)
echo.
echo [提示] 前端开发服务器启动后会自动打开浏览器
echo [提示] 修改代码后会自动刷新，无需重启
echo [提示] 按 Ctrl+C 可以停止服务
echo.
echo [注意] 请保持两个命令行窗口打开
echo.
echo [说明] 现在可以看到Dashboard的编辑按钮了！
echo        - 储蓄目标卡片右上角有蓝色铅笔图标
echo        - 本月预算卡片右上角有黄色铅笔图标
echo.

pause
