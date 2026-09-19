@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ================================================
echo    青盈应用 - 快速启动
echo ================================================
echo.

REM 加载环境变量
if exist .env.local (
    echo [配置] 正在加载环境变量...
    for /f "usebackq tokens=1,* delims==" %%a in (".env.local") do (
        set "line=%%a"
        REM 跳过注释行和空行
        if not "!line:~0,1!"=="#" if not "!line!"=="" (
            set "%%a=%%b"
        )
    )
    echo [成功] 环境变量加载完成
    echo.
) else (
    echo [警告] 未找到 .env.local 文件
    echo [提示] 请复制 .env.example 为 .env.local 并配置API密钥
    echo.
    pause
    exit /b 1
)

REM 检查Node.js是否可用
echo [检查] 正在检测Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] Node.js命令不可用，尝试使用常见安装路径...
    
    REM 尝试常见的Node.js安装路径
    set "NODE_PATH="
    if exist "C:\Program Files\nodejs\node.exe" set "NODE_PATH=C:\Program Files\nodejs\node.exe"
    if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_PATH=C:\Program Files (x86)\nodejs\node.exe"
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_PATH=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_PATH=%ProgramFiles%\nodejs\node.exe"
    
    if defined NODE_PATH (
        echo [成功] 在 !NODE_PATH! 找到Node.js
        set "NODE_CMD=!NODE_PATH!"
    ) else (
        echo [错误] 未找到Node.js！
        echo.
        echo 请先安装Node.js：
        echo 1. 访问 https://nodejs.org/
        echo 2. 下载并安装LTS版本
        echo 3. 重启命令行窗口
        echo.
        echo 或者将Node.js添加到系统PATH环境变量
        echo.
        pause
        exit /b 1
    )
) else (
    REM Node.js在PATH中，直接使用
    set "NODE_CMD=node"
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo [成功] 找到Node.js %NODE_VERSION%
)
echo.

REM 检查npm依赖
echo [检查] 正在检测前端依赖...
if not exist "node_modules\express" (
    echo [警告] 缺少必要的npm依赖包
    echo [提示] 正在自动安装依赖...
    echo.
    call npm install express@4 node-fetch@2
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败！
        echo 请手动运行: npm install express node-fetch@2
        pause
        exit /b 1
    )
    echo [成功] 依赖安装完成
    echo.
) else (
    echo [成功] 前端依赖已就绪
)
echo.

REM 检查Python是否可用
echo [检查] 正在检测Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] Python命令不可用，尝试使用py命令...
    py --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [错误] 未找到Python！
        echo 请先安装Python 3.8或更高版本
        pause
        exit /b 1
    ) else (
        set "PYTHON_CMD=py"
        for /f "tokens=*" %%i in ('py --version') do set PYTHON_VERSION=%%i
        echo [成功] 找到%PYTHON_VERSION%
    )
) else (
    set "PYTHON_CMD=python"
    for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
    echo [成功] 找到%PYTHON_VERSION%
)
echo.

REM 启动后端服务
echo [启动] 正在启动后端服务...
start "青盈-后端" cmd /k "cd /d "%~dp0backend" && %PYTHON_CMD% run_dev_enhanced.py"

REM 等待后端启动
echo [等待] 等待后端服务启动（5秒）...
timeout /t 5 /nobreak >nul

REM 启动前端静态服务
echo [启动] 正在启动前端静态服务...
start "青盈-前端" cmd /k "cd /d "%~dp0" && "!NODE_CMD!" simple-static-server.js 3000 5001"

REM 等待前端启动
echo [等待] 等待前端服务启动（5秒）...
timeout /t 5 /nobreak >nul

echo.
echo ================================================
echo    服务启动中...
echo ================================================
echo.
echo [检查] 正在验证服务状态...
echo.

REM 检查前端服务是否启动
echo [检查] 检测前端服务 (http://localhost:3000)...
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] 前端服务已启动
    set FRONTEND_OK=1
) else (
    echo [警告] 前端服务可能还在启动中...
    set FRONTEND_OK=0
)

REM 检查后端服务是否启动
echo [检查] 检测后端服务 (http://localhost:5001)...
curl -s http://localhost:5001 >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] 后端服务已启动
    set BACKEND_OK=1
) else (
    echo [警告] 后端服务可能还在启动中...
    set BACKEND_OK=0
)

echo.
echo ================================================
echo    启动完成！
echo ================================================
echo.
echo  服务地址：
echo  ✓ 后端服务: http://localhost:5001
echo  ✓ 前端页面: http://localhost:3000
echo.

if !FRONTEND_OK!==1 if !BACKEND_OK!==1 (
    echo  状态：所有服务运行正常 ✓
    echo.
    echo [提示] 正在自动打开浏览器...
    timeout /t 2 /nobreak >nul
    start http://localhost:3000
) else (
    echo  状态：服务正在启动中，请稍候...
    echo.
    echo  请注意：
    echo  - 如果服务还在启动，请等待10-20秒后手动访问
    echo  - 查看打开的两个命令行窗口，确认没有错误信息
    echo  - 首次启动AI模型需要1-2分钟初始化
    echo.
    echo [提示] 等待10秒后尝试打开浏览器...
    timeout /t 10 /nobreak >nul
    start http://localhost:3000
)

echo.
echo  使用说明：
echo  - 已打开两个命令行窗口（后端和前端）
echo  - 关闭这两个窗口将停止服务
echo  - 如果页面显示错误，请检查两个窗口的日志
echo  - 如果端口被占用，请先关闭占用端口的程序
echo.
echo  常见问题：
echo  1. 页面无法访问 → 等待服务完全启动（约20秒）
echo  2. 显示代理错误 → 检查后端窗口是否有错误
echo  3. AI功能不可用 → 检查.env文件中的API密钥配置
echo.
pause
endlocal
