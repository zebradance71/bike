# Verify packaged Windows build before release upload.
# Usage: pwsh -File scripts/verify-dist.ps1 [-ProductDir dist-app\win-unpacked]

param(
  [string]$ProductDir = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent

if (-not $ProductDir) {
  $branding = Get-Content (Join-Path $repo "branding.json") -Raw | ConvertFrom-Json
  $ProductDir = Join-Path $repo "dist-app\win-unpacked"
  $exe = Join-Path $ProductDir "$($branding.productName).exe"
} else {
  $exe = Get-ChildItem -Path $ProductDir -Filter "*.exe" | Select-Object -First 1 -ExpandProperty FullName
}

if (-not (Test-Path $exe)) {
  Write-Error "Main exe not found under $ProductDir — run npm run dist:dir first"
}

$resources = Join-Path $ProductDir "resources"
$fail = @()

function Require-Path($p, $label) {
  if (-not (Test-Path $p)) { $script:fail += $label }
}

Require-Path $exe "main executable"
Require-Path (Join-Path $resources "app.asar") "app.asar"
Require-Path (Join-Path $resources "assets\tray.ico") "tray.ico (extraResources)"

$winNode = Join-Path $resources "app.asar.unpacked\node_modules\active-win\lib\binding\napi-6-win32-unknown-x64\node-active-win.node"
if (-not (Test-Path $winNode)) {
  $fail += "active-win win32 x64 (node-active-win.node)"
} else {
  $script:winNodePath = $winNode
}

if ($fail.Count -gt 0) {
  Write-Host "[verify-dist] FAILED:"
  $fail | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

$sizeMb = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host "[verify-dist] OK"
Write-Host "  exe: $exe ($sizeMb MB)"
Write-Host "  active-win: $winNodePath"
