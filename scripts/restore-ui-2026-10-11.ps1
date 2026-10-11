# Restores the exact UI files saved before the 2026-10-11 redesign.
# Run from PowerShell with -WhatIf to preview. Later edits to these files will be overwritten.
[CmdletBinding(SupportsShouldProcess = $true)]
param()
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archivePath = Join-Path $projectRoot 'ui-before-redesign-2026-10-11.zip'
if (-not [System.IO.File]::Exists($archivePath)) { throw "Missing rollback archive: $archivePath" }

$savedFiles = [ordered]@{
  'Layout.js' = 'src/components/Layout.js'
  'Dashboard.js' = 'src/pages/Dashboard.js'
  'navigation.js' = 'src/services/navigation.js'
  'Dashboard.test.js' = 'src/pages/Dashboard.test.js'
  'App.js' = 'src/App.js'
  'FinanceVisuals.js' = 'src/components/FinanceVisuals.js'
}
$newFiles = @(
  'src/pages/TodayHome.js', 'src/pages/TodayHome.css', 'src/pages/TodayHome.test.js',
  'src/components/MemberLayout.js', 'src/components/MemberLayout.css', 'src/components/MemberLayout.test.js',
  'src/pages/DashboardUI.css'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($name in $savedFiles.Keys) {
    if (-not $zip.GetEntry($name)) { throw "Rollback archive is incomplete: $name" }
  }
  foreach ($name in $savedFiles.Keys) {
    $target = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $savedFiles[$name]))
    if (-not $target.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe target: $target" }
    if ($PSCmdlet.ShouldProcess($target, 'Restore pre-redesign file')) {
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry($name), $target, $true)
    }
  }
  foreach ($path in $newFiles) {
    $target = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $path))
    if (-not $target.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe target: $target" }
    if ([System.IO.File]::Exists($target) -and $PSCmdlet.ShouldProcess($target, 'Remove redesign-only file')) {
      Remove-Item -LiteralPath $target
    }
  }
} finally {
  $zip.Dispose()
}
