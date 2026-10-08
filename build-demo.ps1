[CmdletBinding()]
param([string]$Python = '')

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Python) {
    $LocalPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    $Python = if (Test-Path $LocalPython) { $LocalPython } else { (Get-Command python.exe).Source }
}

Push-Location $ProjectRoot
try {
    & $Python -m PyInstaller --noconfirm --onefile --windowed `
        --name easy-windows-pack-demo --paths $ProjectRoot `
        --distpath (Join-Path $ProjectRoot 'dist') `
        --workpath (Join-Path $ProjectRoot 'build\demo-exe') `
        --specpath (Join-Path $ProjectRoot 'build') `
        --add-data "$(Join-Path $ProjectRoot 'examples\index.html');examples" `
        --add-data "$(Join-Path $ProjectRoot 'frontend');frontend" `
        (Join-Path $ProjectRoot 'examples\demo.py')
    if ($LASTEXITCODE -ne 0) { throw "Demo build failed: $LASTEXITCODE" }
    Write-Host "Demo EXE: $(Join-Path $ProjectRoot 'dist\easy-windows-pack-demo.exe')"
}
finally {
    Pop-Location
}