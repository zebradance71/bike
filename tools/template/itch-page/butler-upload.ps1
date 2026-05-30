# Upload a built Windows artifact to itch.io via butler.
#
# Prerequisites:
#   - butler installed: https://itch.io/docs/butler/
#   - BUTLER_API_KEY env var set (itch.io → API keys)
#
# Usage:
#   $env:BUTLER_API_KEY = "..."
#   .\tools\template\itch-page\butler-upload.ps1 -User yourname -Game slug -Channel windows
#
param(
    [Parameter(Mandatory = $true)][string]$User,
    [Parameter(Mandatory = $true)][string]$Game,
    [string]$Channel = "windows",
    [string]$Artifact = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

if (-not $Artifact) {
    $branding = Get-Content (Join-Path $RepoRoot "branding.json") -Raw | ConvertFrom-Json
    $pkg = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
    $name = "$($branding.productName)-$($pkg.version)-win64.zip"
    $Artifact = Join-Path $RepoRoot "dist-app" $name
}

if (-not (Test-Path $Artifact)) {
    throw "Artifact not found: $Artifact`nRun npm run dist first."
}

if (-not $env:BUTLER_API_KEY) {
    throw "Set BUTLER_API_KEY environment variable."
}

$target = "${User}/${Game}:${Channel}"
Write-Host "[butler] push $Artifact -> $target"
butler push $Artifact $target
