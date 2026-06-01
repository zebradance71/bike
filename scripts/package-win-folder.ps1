# Package win-unpacked into user-friendly ZIPs:
#
#   Ninja2-{version}-win64.zip       — GitHub Release (Ninja2/ at zip root)
#   Ninja2-{version}-win64-itch.zip  — itch.io butler (README.txt + Ninja2/)
#
# itch.io strips a zip when it has a single root folder. The itch zip adds
# README.txt beside Ninja2/ so the folder name survives on download.
#
# Note: inside Ninja2/, Electron requires .dll / .pak next to the exe — that
# layout cannot be cleaned up without breaking the app.
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

function Write-AppReadme {
    param([string]$Dir, [string]$Exe)
    $readme = @"
Ninja2 — 使い方
================

  1. このフォルダの「$Exe」をダブルクリック
  2. タスクバー右下（^）のトレイに忍者アイコンが出ます

※ 同じフォルダにある .dll / .pak などは削除しないでください（起動に必要です）。
  Electron アプリは exe の横にこれらが必要で、サブフォルダへ移せません。

初めての方は ZIP より「インストーラ (*-setup-x64.exe)」がおすすめです。
"@
    Set-Content -Path (Join-Path $Dir "README.txt") -Value $readme -Encoding utf8
}

function Write-ItchZipReadme {
    param([string]$Path, [string]$Folder, [string]$Exe)
    $readme = @"
Ninja2 — ZIP の使い方
=====================

  1. 「$Folder」フォルダを開く
  2. 「$Exe」をダブルクリック
  3. タスクバー右下（^）のトレイに忍者アイコンが出ます

※ $Folder 内の .dll / .pak / resources などは削除しないでください。
  （Chromium / Electron の仕様上、exe の横に並ぶ必要があります）

ZIP が散らかって見える場合 → itch の「インストーラ (*-setup-x64.exe)」を使うと
Program Files に入り、普段フォルダを見ません。
"@
    Set-Content -Path $Path -Value $readme -Encoding utf8
}

function New-ZipFromFolder {
    param(
        [string]$SourceDir,
        [string]$EntryName,
        [string]$ZipPath
    )
    $parent = Split-Path $SourceDir -Parent
    if (Test-Path $ZipPath) {
        Remove-Item $ZipPath -Force
    }
    Push-Location $parent
    try {
        & tar -a -cf $ZipPath $EntryName
        if ($LASTEXITCODE -ne 0) {
            throw "tar failed creating $ZipPath"
        }
    } finally {
        Pop-Location
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

function Test-ZipSingleRoot {
    param(
        [string]$ZipPath,
        [string]$ExpectedRoot
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
        if (@($roots).Count -ne 1 -or $roots[0] -ne $ExpectedRoot) {
            throw "ZIP $ZipPath expected single root '$ExpectedRoot', got: $($roots -join ', ')"
        }
    } finally {
        $archive.Dispose()
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
            throw "ZIP $ZipPath needs multiple zip roots for itch (got: $($roots -join ', '))"
        }
    } finally {
        $archive.Dispose()
    }
}

# --- GitHub zip: Ninja2/ at archive root -----------------------------------

$ghStaging = Join-Path $repo "dist-app\_pack-staging-$version"
$appDir = Join-Path $ghStaging $product
if (Test-Path $ghStaging) {
    Remove-Item $ghStaging -Recurse -Force
}
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Write-Host "[package-win-folder] copying win-unpacked -> $appDir"
Copy-Item -Path (Join-Path $unpacked "*") -Destination $appDir -Recurse -Force
Write-AppReadme -Dir $appDir -Exe $exeName

$zipOut = Join-Path $repo "dist-app\$product-$version-win64.zip"
Write-Host "[package-win-folder] creating $zipOut"
New-ZipFromFolder -SourceDir $appDir -EntryName $product -ZipPath $zipOut
Test-ZipSingleRoot -ZipPath $zipOut -ExpectedRoot $product
Remove-Item $ghStaging -Recurse -Force

# --- itch zip: README.txt + Ninja2/ (two roots — itch must not strip) ----

$itchStaging = Join-Path $repo "dist-app\_itch-staging-$version"
$itchAppDir = Join-Path $itchStaging $product
if (Test-Path $itchStaging) {
    Remove-Item $itchStaging -Recurse -Force
}
New-Item -ItemType Directory -Path $itchAppDir -Force | Out-Null

Write-Host "[package-win-folder] copying win-unpacked -> $itchAppDir (itch zip)"
Copy-Item -Path (Join-Path $unpacked "*") -Destination $itchAppDir -Recurse -Force
Write-AppReadme -Dir $itchAppDir -Exe $exeName
Write-ItchZipReadme -Path (Join-Path $itchStaging "README.txt") -Folder $product -Exe $exeName

$itchZip = Join-Path $repo "dist-app\itch\$product-$version-win64-itch.zip"
$itchZipDir = Split-Path $itchZip -Parent
New-Item -ItemType Directory -Path $itchZipDir -Force | Out-Null
Write-Host "[package-win-folder] creating $itchZip"
New-ZipFromEntries -WorkingDir $itchStaging -Entries @("README.txt", $product) -ZipPath $itchZip
Test-ZipContainsFolder -ZipPath $itchZip -FolderName $product
Remove-Item $itchStaging -Recurse -Force

Write-Host "[package-win-folder] done (github + itch zips)"
