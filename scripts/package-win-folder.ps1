# Package win-unpacked into a user-friendly ZIP:
#   Ninja2-{version}-win64.zip
#     Ninja2/
#       README.txt
#       Ninja2.exe
#       (runtime files — required, do not delete)
#
# Usage (after npm run dist:dir or full dist):
#   pwsh -File scripts/package-win-folder.ps1

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$branding = Get-Content (Join-Path $repo "branding.json") -Raw | ConvertFrom-Json
$pkg = Get-Content (Join-Path $repo "package.json") -Raw | ConvertFrom-Json

$product = $branding.productName
$version = $pkg.version
$unpacked = Join-Path $repo "dist-app\win-unpacked"
$exeName = "$product.exe"

if (-not (Test-Path (Join-Path $unpacked $exeName))) {
    Write-Error "Run electron-builder first (dist-app\win-unpacked\$exeName missing)"
}

$staging = Join-Path $repo "dist-app\_pack-staging-$version"
$appDir = Join-Path $staging $product
if (Test-Path $staging) {
    Remove-Item $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Write-Host "[package-win-folder] copying win-unpacked -> $appDir"
Copy-Item -Path (Join-Path $unpacked "*") -Destination $appDir -Recurse -Force

$readme = @"
Ninja2 — 使い方
================

  1. このフォルダの「$exeName」をダブルクリック
  2. タスクバー右下（^）のトレイに忍者アイコンが出ます

※ 同じフォルダにある .dll / .pak などは削除しないでください（起動に必要です）。

初めての方は ZIP より「インストーラ (.exe)」がおすすめです。
詳しくは docs/user/download-and-install-ja.md を参照してください。
"@

Set-Content -Path (Join-Path $appDir "README.txt") -Value $readme -Encoding utf8

$zipOut = Join-Path $repo "dist-app\$product-$version-win64.zip"
if (Test-Path $zipOut) {
    Remove-Item $zipOut -Force
}

Write-Host "[package-win-folder] creating $zipOut"
Compress-Archive -Path $appDir -DestinationPath $zipOut -CompressionLevel Optimal

Remove-Item $staging -Recurse -Force
Write-Host "[package-win-folder] done"
