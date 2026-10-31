@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在更新独立演示账户的近期检验数据，请先启动青盈本地服务。
"%~dp0.venv\Scripts\python.exe" "%~dp0scripts\refresh_demo_account.py"
if errorlevel 1 (
  echo 更新失败，请确认本地后台已启动。原有个人账户不会被修改。
) else (
  echo 更新完成。请登录 demo@youthgain.local，开发模式密码可填 123456。
)
pause
