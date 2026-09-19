 @echo off
chcp 65001 >nul
cls
echo ================================================
echo   青盈应用 启动菜单
echo ================================================
echo.
echo  请选择要执行的操作:
echo.
echo  [1] 启动本地服务 (后端+代理)
echo  [2] 启动内网穿透 (Sunny-Ngrok)
echo  [3] 退出
echo.
set /p choice=请输入选项 (1-3): 

if "%choice%"=="1" (
    call "%~dp0local\start.cmd"
    exit
)
if "%choice%"=="2" (
    call "%~dp0tunnel\sunny_ngrok.cmd"
    exit
)
if "%choice%"=="3" (
    exit
)

echo.
echo 无效的选项，请重新运行脚本。
pause 