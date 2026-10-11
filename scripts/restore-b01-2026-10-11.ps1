param([switch]$Apply)

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$archivePath = Join-Path $workspace 'b01-before-2026-10-11.zip'
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw '找不到 B0.1 修改前快照。'
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($entry in $archive.Entries) {
        if ([string]::IsNullOrWhiteSpace($entry.Name)) { continue }
        $destination = [System.IO.Path]::GetFullPath((Join-Path $workspace $entry.FullName))
        if (-not $destination.StartsWith($workspace + [System.IO.Path]::DirectorySeparatorChar,
                [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "快照路径超出项目目录：$($entry.FullName)"
        }
        if ($Apply) {
            [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
            Write-Output "已恢复 $($entry.FullName)"
        } else {
            Write-Output "可恢复 $($entry.FullName)"
        }
    }
} finally {
    $archive.Dispose()
}

if (-not $Apply) {
    Write-Output '以上仅为预览；明确运行本脚本并加 -Apply 才会覆盖这些文件。'
}
