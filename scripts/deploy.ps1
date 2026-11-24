# 一键部署：先停 DSH，再覆盖安装目录，最后启动 DSH NEXT 并校验。
# 用法: powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
# 选项: -SkipStop 只部署不停止; -NoStart 只停+部署不起; -InstallDir 自定义安装目录
param(
  [string]$InstallDir = 'D:\Downloads\DSH\plugins\dsh-auto-router',
  [string]$HostExe = 'D:\SoftWare\DSH\0.2.0-rc.2\DeepSeek Harness.exe',
  [switch]$SkipStop,
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Capture the host's own launch spec BEFORE stopping it: its CLI args (such as
# --user-data-dir) and DSH_HOME (derived from the host child's profile path).
# Without this, restarting the bare exe would open the DEFAULT profile and
# collide with the other DSH version.
$mainProc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ExecutablePath -eq $HostExe -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch '--expose-internals'
} | Select-Object -First 1
$hostArgs = ''
if ($mainProc -and $mainProc.CommandLine) {
  $m = [regex]::Match($mainProc.CommandLine, '^"[^"]+"\s*(.*)$')
  if ($m.Success) { $hostArgs = $m.Groups[1].Value.Trim() }
}
$dshHome = $null
$hostChild = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'dsh-desktop-host' } | Select-Object -First 1
if ($hostChild -and $hostChild.CommandLine) {
  $pm = [regex]::Match($hostChild.CommandLine, '([A-Za-z]:\\[^"\s]*?\\profiles\\[^"\s]+)')
  if ($pm.Success) { $dshHome = Split-Path (Split-Path $pm.Groups[1].Value -Parent) -Parent }
}

# Only this host's processes are touched. Other DSH versions the user runs
# alongside (low/high) must never be stopped or restarted here.
if (-not $SkipStop) {
  Write-Host "==> 停止本次更新的宿主: $HostExe"
  $hostProcs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $HostExe }
  if (-not $hostProcs) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($HostExe)
    $hostProcs = Get-Process -Name $name -ErrorAction SilentlyContinue
  }
  # Graceful first: lets DSH flush the in-flight conversation to disk.
  foreach ($proc in $hostProcs) { [void]$proc.CloseMainWindow() }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    $left = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $HostExe }
    if (-not $left) { break }
    Start-Sleep -Seconds 1
  }
  $left = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $HostExe }
  if ($left) {
    Write-Host '==> 优雅关闭超时, 强制结束本次宿主'
    $left | Stop-Process -Force -Confirm:$false
  }
  Start-Sleep -Seconds 3
  $still = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $HostExe }
  if ($still) { throw '本次宿主未能全部退出, 已中止部署' }
}

Write-Host "==> 部署到 $InstallDir"
foreach ($dir in @('lib', 'docs', 'locale', 'src', 'test', 'scripts')) {
  $dst = Join-Path $InstallDir $dir
  if (-not (Test-Path -LiteralPath $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }
  Copy-Item -Path (Join-Path $root "$dir\*") -Destination $dst -Force -Recurse
}
foreach ($file in @('package.json', 'CHANGELOG.md', 'README.md', 'cordis.patch.yml')) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $InstallDir $file) -Force
}

$version = (Get-Content -LiteralPath (Join-Path $InstallDir 'package.json') -Raw | ConvertFrom-Json).version
$libCount = (Get-ChildItem -LiteralPath (Join-Path $InstallDir 'lib') -Filter *.js | Measure-Object).Count
Write-Host "==> 部署完成: version=$version, lib=$libCount js"

if (-not $NoStart) {
  # Restart the SAME host with its original args and DSH_HOME, so a second
  # DSH version never boots into another version's profile.
  if ($dshHome) { $env:DSH_HOME = $dshHome; Write-Host "==> DSH_HOME=$dshHome" }
  # Drop inherited sandbox NPM_CONFIG_* so the plugin manager and pnpm see the
  # user's real global configuration.
  Get-ChildItem Env: | Where-Object { $_.Name -like 'NPM_CONFIG_*' -or $_.Name -like 'npm_config_*' } |
    ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  Write-Host "==> 启动宿主: $HostExe $hostArgs"
  if ($hostArgs) { Start-Process -FilePath $HostExe -ArgumentList $hostArgs }
  else { Start-Process -FilePath $HostExe }
  Start-Sleep -Seconds 8
  $running = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $HostExe } | Measure-Object).Count
  Write-Host "==> 宿主进程数: $running"
}
