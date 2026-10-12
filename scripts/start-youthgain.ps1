[CmdletBinding()]
param([switch]$Restart, [switch]$CheckOnly, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logDir = Join-Path $projectRoot 'logs'
$backendScript = Join-Path $projectRoot 'backend\run_dev_enhanced.py'
$frontendScript = Join-Path $projectRoot 'scripts\start-frontend.js'
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
$started = @()
$startupLock = $null

function Get-Listener([int]$Port) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) { return $null }
    $owners = @($connections.OwningProcess | Sort-Object -Unique)
    if ($owners.Count -ne 1) { throw "端口 $Port 有多个监听进程，请先检查端口占用。" }
    return Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
}

function Test-ProjectProcess($Process, [string]$Script) {
    if ($null -eq $Process) { return $false }
    return ($null -ne $Process.CommandLine -and
        $Process.CommandLine -match ('(?i)(?:^|\s)"?' + [regex]::Escape($Script) + '"?(?=\s|$)'))
}

function Test-Healthy([string]$Url, [switch]$Api) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -ne 200) { return $false }
        if ($Api) { return (($response.Content | ConvertFrom-Json).status -eq 'healthy') }
        return ($response.Content -match '<div\s+id="root"')
    } catch { return $false }
}

function Stop-OwnedProcess($Process, [string]$Script) {
    # Check again before stopping: the PID may have been reused.
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Process.ProcessId)"
    if ($null -eq $current) { return }
    if (-not (Test-ProjectProcess $current $Script) -or $current.CreationDate -ne $Process.CreationDate) {
        throw '进程身份已变化，已取消重启。'
    }
    Stop-Process -Id $current.ProcessId -Force
    for ($i = 0; $i -lt 20; $i++) {
        if ($null -eq (Get-CimInstance Win32_Process -Filter "ProcessId = $($current.ProcessId)")) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "进程 $($current.ProcessId) 未正常停止。"
}

function Start-ServiceProcess([string]$Name, [string]$Executable, [string]$Script) {
    return Start-Process -FilePath $Executable -ArgumentList ('"' + $Script + '"') `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir "$Name.stdout.log") `
        -RedirectStandardError (Join-Path $logDir "$Name.stderr.log")
}

function Wait-Service($Process, [string]$Url, [int]$Seconds, [switch]$Api, [switch]$Frontend) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh()
        if ($Process.HasExited) { throw "服务启动后退出，请查看 $logDir 中的日志。" }
        $compiled = $true
        if ($Frontend) {
            $compileLog = Join-Path $logDir 'frontend.stdout.log'
            $marker = Get-Content -LiteralPath $compileLog -ErrorAction SilentlyContinue |
                Where-Object { $_ -match 'YOUTHGAIN_COMPILE_(READY|ERROR)' } | Select-Object -Last 1
            if ($marker -match 'YOUTHGAIN_COMPILE_ERROR') { throw '前端编译失败，请查看 frontend.stdout.log。' }
            $compiled = $marker -match 'YOUTHGAIN_COMPILE_READY'
        }
        if ($compiled -and (Test-Healthy $Url -Api:$Api)) { return }
        Start-Sleep -Seconds 1
    }
    throw "等待 $Url 就绪超时，请查看 $logDir 中的日志。"
}

try {
    Set-Location -LiteralPath $projectRoot
    if ($CheckOnly -and $Restart) { throw '-CheckOnly 与 -Restart 不能同时使用。' }
    Write-Host '青盈：统一启动入口'
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $nodeMajor = [int]((& $nodeExe --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 18) { throw '请安装 Node.js 18 或更高版本。' }
    foreach ($required in @('package.json', 'package-lock.json', 'backend\requirements.txt', 'backend\run_dev_enhanced.py', 'scripts\start-frontend.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $required))) { throw "缺少项目文件：$required" }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env.local')) -and
        -not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
        throw '请先复制 .env.example 为 .env.local 并填写配置。'
    }
    if (-not $CheckOnly) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        try {
            $startupLock = [IO.File]::Open((Join-Path $logDir 'startup.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
        } catch { throw '另一个启动程序正在运行，请等它结束后再试。' }
    }
    if (-not (Test-Path -LiteralPath $pythonExe)) {
        if ($CheckOnly) { throw '缺少 .venv；正常运行快速启动.cmd 将自动创建环境。' }
        $basePython = (Get-Command python.exe -ErrorAction Stop).Source
        & $basePython -m venv (Join-Path $projectRoot '.venv')
        if ($LASTEXITCODE -ne 0) { throw 'Python 虚拟环境创建失败。' }
    }
    & $pythonExe -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'
    if ($LASTEXITCODE -ne 0) { throw '请使用 Python 3.10 或更高版本的 .venv。' }
    $dependencyProbe = @'
import importlib.util, json, os
modules = ['flask', 'flask_cors', 'dotenv', 'openpyxl', 'numpy', 'sklearn', 'diffprivlib', 'requests', 'zhipuai', 'websocket', 'pymysql', 'tzdata']
if importlib.util.find_spec('dotenv'):
    from dotenv import load_dotenv
    load_dotenv('.env.local' if os.path.isfile('.env.local') else '.env')
    bypass = os.getenv('DEV_MODE', '').lower() == 'true' and os.getenv('APP_ENV', 'development').lower() != 'production'
    if not bypass or os.getenv('DB_TYPE') == 'firestore' or os.getenv('FIREBASE_ADMIN_SDK_PATH'):
        modules.append('firebase_admin')
print(json.dumps([name for name in modules if importlib.util.find_spec(name) is None]))
'@
    $probeOutput = & $pythonExe -c $dependencyProbe
    if ($LASTEXITCODE -ne 0) { throw 'Python 依赖检查失败。' }
    $missing = ($probeOutput | Select-Object -Last 1) | ConvertFrom-Json
    if (@($missing).Count -gt 0) {
        if ($CheckOnly) { throw "缺少 Python 依赖：$($missing -join ', ')；正常启动时将安装。" }
        Write-Host '正在安装后端依赖（首次运行可能需要几分钟）…'
        & $pythonExe -m pip install -r (Join-Path $projectRoot 'backend\requirements.txt')
        if ($LASTEXITCODE -ne 0) { throw '后端依赖安装失败，请检查网络后重新启动。' }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\react-scripts\scripts\start.js'))) {
        if ($CheckOnly) { throw '缺少前端依赖；正常启动时将安装。' }
        Write-Host '正在安装前端依赖（首次运行可能需要几分钟）…'
        & (Get-Command npm.cmd -ErrorAction Stop).Source ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败，请检查网络后重新启动。' }
    }

    $backendListener = Get-Listener 5001
    $frontendListener = Get-Listener 3000
    foreach ($entry in @(@{Port=5001; Process=$backendListener; Script=$backendScript},
                         @{Port=3000; Process=$frontendListener; Script=$frontendScript})) {
        if ($null -ne $entry.Process -and -not (Test-ProjectProcess $entry.Process $entry.Script)) {
            throw "端口 $($entry.Port) 被其他服务占用（PID $($entry.Process.ProcessId)），请先关闭对应服务；不会自动结束它。"
        }
    }
    if ($CheckOnly) {
        Write-Host '检查通过：环境、依赖、配置文件和端口均可用于启动。'
        Write-Host '此检查不验证外部 AI / Firebase 凭证，也不启动服务。'
        exit 0
    }
    if ($Restart) {
        Write-Host '正在重启本项目服务…'
        if ($null -ne $frontendListener) { Stop-OwnedProcess $frontendListener $frontendScript }
        if ($null -ne $backendListener) { Stop-OwnedProcess $backendListener $backendScript }
        $frontendListener = $null
        $backendListener = $null
    }
    $env:PYTHONIOENCODING = 'utf-8'
    $env:PYTHONUNBUFFERED = '1'
    $env:HOST = '127.0.0.1'
    $env:PORT = '3000'
    $env:HTTPS = 'false'
    $env:BROWSER = 'none'
    $env:WDS_SOCKET_HOST = 'localhost'
    $env:DANGEROUSLY_DISABLE_HOST_CHECK = 'false'
    Write-Host '正在检查并启动后端…'
    if ($null -eq $backendListener) {
        $backendProcess = Start-ServiceProcess 'backend' $pythonExe $backendScript
        $started += @{Process=$backendProcess; Script=$backendScript; Port=5001}
    } else {
        Write-Host '复用已运行的后端。'
        $backendProcess = Get-Process -Id $backendListener.ProcessId
    }
    Wait-Service $backendProcess 'http://127.0.0.1:5001/api/health' 60 -Api
    Write-Host '正在启动前端并等待当前代码编译…'
    if ($null -eq $frontendListener) {
        $frontendProcess = Start-ServiceProcess 'frontend' $nodeExe $frontendScript
        $started += @{Process=$frontendProcess; Script=$frontendScript; Port=3000}
    } else {
        Write-Host '复用已运行的前端。'
        $frontendProcess = Get-Process -Id $frontendListener.ProcessId
    }
    Wait-Service $frontendProcess 'http://127.0.0.1:3000/' 180 -Frontend
    Wait-Service $frontendProcess 'http://127.0.0.1:3000/api/health' 30 -Api
    # Windows venv may use a parent launcher and a separate listening Python process.
    # Store the listener PID consistently on both first launch and repeated launch.
    $liveBackend = Get-Listener 5001
    $liveFrontend = Get-Listener 3000
    if (-not (Test-ProjectProcess $liveBackend $backendScript) -or
        -not (Test-ProjectProcess $liveFrontend $frontendScript)) { throw '服务进程归属发生变化。' }
    @{projectRoot=$projectRoot; backendPid=$liveBackend.ProcessId; frontendPid=$liveFrontend.ProcessId;
      startedAt=(Get-Date).ToString('o')} | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $logDir 'startup-processes.json') -Encoding UTF8
    Write-Host '启动成功：前端、后端及 API 代理均已就绪。'
    Write-Host '访问 http://localhost:3000/#/；关闭此窗口后服务会继续运行。'
    Write-Host "日志位置：$logDir"
    if (-not $NoBrowser) { Start-Process 'http://localhost:3000/#/' }
    exit 0
} catch {
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    # Roll back only processes created here, preserving any reused services.
    foreach ($entry in $started) {
        try {
            $listener = Get-Listener $entry.Port
            if ($null -ne $listener -and (Test-ProjectProcess $listener $entry.Script) -and
                ($listener.ProcessId -eq $entry.Process.Id -or $listener.ParentProcessId -eq $entry.Process.Id)) {
                Stop-OwnedProcess $listener $entry.Script
            }
            $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.Process.Id)"
            if ($null -ne $process -and (Test-ProjectProcess $process $entry.Script)) {
                Stop-OwnedProcess $process $entry.Script
            }
        } catch { Write-Host '新服务清理失败，请查看日志并检查本项目进程。' }
    }
    exit 1
} finally {
    if ($null -ne $startupLock) { $startupLock.Dispose() }
}
