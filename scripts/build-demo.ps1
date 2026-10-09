[CmdletBinding()]
param([string]$Python = '')

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ($Python) {
    $Python = (Resolve-Path -LiteralPath $Python).Path
}
if (-not $Python) {
    $LocalPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    $Python = if (Test-Path $LocalPython) { $LocalPython } else { (Get-Command python.exe).Source }
}

Push-Location $ProjectRoot
try {
    & $Python (Join-Path $ProjectRoot 'scripts\dev.py') exe
    $BuildExitCode = $LASTEXITCODE
    if ($BuildExitCode -eq 0) {
        Write-Host "Demo EXE: $(Join-Path $ProjectRoot 'output\exe\easy-windows-pack-demo.exe')"
    }
}
finally {
    Pop-Location
}
exit $BuildExitCode