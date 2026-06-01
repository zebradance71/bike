# Package win-unpacked into user-friendly ZIPs:
#
#   Ninja2-{version}-win64.zip       — GitHub Release (Ninja2/ at zip root)
#   Ninja2-{version}-itch-win64.zip  — itch.io butler (wrapper so itch strip → Ninja2/)
#
# itch.io extracts uploaded zips and, if there is a single root folder, promotes
# its contents one level up. A zip of only Ninja2/ therefore becomes a flat folder
# on download. The itch zip adds Ninja2-{version}/Ninja2/… so users still get Ninja2/.
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

初めての方は ZIP より「インストーラ (.exe)」がおすすめです。
詳しくは docs/user/download-and-install-ja.md を参照してください。
"@
    Set-Content -Path (Join-Path $Dir "README.txt") -Value $readme -Encoding utf8
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

function Test-ZipSingleRoot {
    param(
        [string]$ZipPath,
        [string]$ExpectedRoot
    )
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $roots = $archive.Entries |
            ForEach-Object { ($_.FullName -replace '\\', '/') -split '/' | Select-Object -First 1 } |
            Where-Object { $_ } |
            Select-Object -Unique
        if ($roots.Count -ne 1 -or $roots[0] -ne $ExpectedRoot) {
            throw "ZIP $ZipPath expected single root '$ExpectedRoot', got: $($roots -join ', ')"
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

# --- itch zip: Ninja2-{version}/Ninja2/ (itch strips outer wrapper) --------

$itchWrapName = "$product-$version"
$itchStaging = Join-Path $repo "dist-app\_itch-staging-$version"
$itchWrapDir = Join-Path $itchStaging $itchWrapName
$itchAppDir = Join-Path $itchWrapDir $product
if (Test-Path $itchStaging) {
    Remove-Item $itchStaging -Recurse -Force
}
New-Item -ItemType Directory -Path $itchAppDir -Force | Out-Null

Write-Host "[package-win-folder] copying win-unpacked -> $itchAppDir (itch wrapper)"
Copy-Item -Path (Join-Path $unpacked "*") -Destination $itchAppDir -Recurse -Force
Write-AppReadme -Dir $itchAppDir -Exe $exeName

$itchZip = Join-Path $repo "dist-app\itch\$product-$version-win64-itch.zip"
$itchZipDir = Split-Path $itchZip -Parent
New-Item -ItemType Directory -Path $itchZipDir -Force | Out-Null
Write-Host "[package-win-folder] creating $itchZip"
New-ZipFromFolder -SourceDir $itchWrapDir -EntryName $itchWrapName -ZipPath $itchZip
Test-ZipSingleRoot -ZipPath $itchZip -ExpectedRoot $itchWrapName
Remove-Item $itchStaging -Recurse -Force

Write-Host "[package-win-folder] done (github + itch zips)"
