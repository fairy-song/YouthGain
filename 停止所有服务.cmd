@echo off
chcp 65001 >nul
echo ================================================
echo    强制停止所有服务
echo ================================================
echo.

echo [停止] 正在查找并停止所有相关进程...
echo.

REM 停止所有node进程
echo [处理] 停止所有Node.js进程...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] 已停止Node.js进程
) else (
    echo [提示] 没有运行中的Node.js进程
)

REM 停止所有python进程(可能包含后端)
echo [处理] 停止Python后端进程...
for /f "tokens=2" %%a in ('tasklist ^| findstr "python.exe"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [完成] Python进程处理完成

REM 停止占用3000端口的进程
echo [处理] 清理端口3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM 停止占用5001端口的进程
echo [处理] 清理端口5001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5001"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [等待] 等待端口完全释放（5秒）...
timeout /t 5 /nobreak >nul

echo.
echo [验证] 检查端口状态...
netstat -ano | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [警告] 端口3000仍被占用
) else (
    echo [成功] 端口3000已释放
)

netstat -ano | findstr ":5001" >nul 2>&1
if %errorlevel% equ 0 (
    echo [警告] 端口5001仍被占用
) else (
    echo [成功] 端口5001已释放
)

echo.
echo ================================================
echo    所有服务已停止
echo ================================================
echo.
echo [提示] 现在可以运行 "快速启动.cmd" 启动新服务
echo.

pause
