param(
    [Parameter(Mandatory=$true)][string]$Bundle,
    [Parameter(Mandatory=$true)][string]$Out,
    [Parameter(Mandatory=$true)][string]$Python
)
$ErrorActionPreference = 'Stop'
$capture = Join-Path $PSScriptRoot 'render-mdl-rtx.py'
$scenes = Get-Content (Join-Path $Bundle 'scenes.json') -Raw | ConvertFrom-Json
foreach ($scene in $scenes.scenes) {
    & $Python $capture --stage (Join-Path $Bundle $scene.stage) --out (Join-Path $Out $scene.name) --verify-inputs (Join-Path $Bundle 'inputs.json')
    if ($LASTEXITCODE -ne 0) { throw ('MDL scene failed: '+$scene.name) }
}
