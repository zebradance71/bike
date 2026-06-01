# Package win-unpacked into a user-friendly ZIP:
#
#   Ninja2-{version}-win64.zip
#     README.txt          — 展開後の案内（itch 用に zip ルートにも置く）
#     Ninja2/
#       README.txt
#       Start Ninja2.bat  — ダブルクリック用（exe は dll 群の中にある）
#       Ninja2.exe
#       licenses/         — ライセンス文書のみ分離（実行ファイルは exe 横に必須）
#       locales/
#       resources/
#       *.dll / *.pak     — Chromium 必須（移動不可）
#
# itch.io: zip のみ butler push（setup.exe は GitHub Release のみ）
# itch はルートにフォルダが1つだけの zip を中身ごとフラット化するため、
# README.txt をルートに置いて Ninja2/ フォルダ名を維持する。
#
# Usage (after npm run dist):
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

function Write-AppReadme {
    param([string]$Dir, [string]$Exe)
    $readme = @"
Ninja2 — 使い方
================

  1. 「Start Ninja2.bat」または「$Exe」をダブルクリック
  2. タスクバー右下（^）のトレイに忍者アイコンが出ます

※ 同じフォルダの .dll / .pak / resources / locales は削除しないでください。
  Electron（Chromium）の仕様で exe の横に必要です。

インストーラ版は GitHub Release の *-setup-x64.exe を参照してください。
"@
    Set-Content -Path (Join-Path $Dir "README.txt") -Value $readme -Encoding utf8
}

function Write-ZipRootReadme {
    param([string]$Path, [string]$Folder, [string]$Exe)
    $readme = @"
Ninja2 — ZIP の使い方
=====================

  1. この ZIP を右クリック → 「すべて展開」
  2. 「$Folder」フォルダを開く
  3. 「Start Ninja2.bat」または「$Exe」をダブルクリック

※ $Folder 内の .dll / .pak などは削除しないでください（起動に必要です）。
"@
    Set-Content -Path $Path -Value $readme -Encoding utf8
}

function Write-StartBat {
    param([string]$Dir, [string]$Exe)
    $bat = @"
@echo off
cd /d "%~dp0"
start "" "$Exe"
"@
    Set-Content -Path (Join-Path $Dir "Start Ninja2.bat") -Value $bat -Encoding ascii
}

function Organize-AppDir {
    param([string]$AppDir)
    $licDir = Join-Path $AppDir "licenses"
    New-Item -ItemType Directory -Path $licDir -Force | Out-Null
    foreach ($name in @("LICENSE.electron", "LICENSES.chromium.html")) {
        $src = Join-Path $AppDir $name
        if (Test-Path $src) {
            Move-Item -Path $src -Destination $licDir -Force
        }
    }
}

function New-ZipFromEntries {
    param(
        [string]$WorkingDir,
        [string[]]$Entries,
        [string]$ZipPath
    )
    if (Test-Path $ZipPath) {
        Remove-Item $ZipPath -Force
    }
    Push-Location $WorkingDir
    try {
        & tar -a -cf $ZipPath @Entries
        if ($LASTEXITCODE -ne 0) {
            throw "tar failed creating $ZipPath"
        }
    } finally {
        Pop-Location
    }
}

function Test-ZipContainsFolder {
    param(
        [string]$ZipPath,
        [string]$FolderName
    )
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $roots = @(
            $archive.Entries |
            ForEach-Object { ($_.FullName -replace '\\', '/') -split '/' | Select-Object -First 1 } |
            Where-Object { $_ } |
            Select-Object -Unique
        )
        if ($roots -notcontains $FolderName) {
            throw "ZIP $ZipPath must contain folder '$FolderName', roots: $($roots -join ', ')"
        }
        if (@($roots).Count -lt 2) {
            throw "ZIP $ZipPath needs README + folder at zip root (got: $($roots -join ', '))"
        }
    } finally {
        $archive.Dispose()
    }
}

$staging = Join-Path $repo "dist-app\_pack-staging-$version"
$appDir = Join-Path $staging $product
if (Test-Path $staging) {
    Remove-Item $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Write-Host "[package-win-folder] copying win-unpacked -> $appDir"
Copy-Item -Path (Join-Path $unpacked "*") -Destination $appDir -Recurse -Force
Organize-AppDir -AppDir $appDir
Write-AppReadme -Dir $appDir -Exe $exeName
Write-StartBat -Dir $appDir -Exe $exeName
Write-ZipRootReadme -Path (Join-Path $staging "README.txt") -Folder $product -Exe $exeName

$zipOut = Join-Path $repo "dist-app\$product-$version-win64.zip"
Write-Host "[package-win-folder] creating $zipOut"
New-ZipFromEntries -WorkingDir $staging -Entries @("README.txt", $product) -ZipPath $zipOut
Test-ZipContainsFolder -ZipPath $zipOut -FolderName $product
Remove-Item $staging -Recurse -Force

Write-Host "[package-win-folder] done"
