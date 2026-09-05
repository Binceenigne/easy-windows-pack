[CmdletBinding()]
param(
    [ValidateSet('build', 'bundle', 'clean', 'info', 'test')]
    [string]$Command = 'build',
    [switch]$SkipTests,
    [switch]$SkipWheel,
    [switch]$SkipBundle,
    [string]$OutputDir = '',
    [string]$Python = ''
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-PythonExecutable {
    if ($Python) {
        if (-not (Test-Path -LiteralPath $Python)) {
            throw "Python executable not found: $Python"
        }
        return (Resolve-Path -LiteralPath $Python).Path
    }

    $localPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $localPython) {
        return $localPython
    }

    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return $pythonCommand.Source
    }

    $pyCommand = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pyCommand) {
        return $pyCommand.Source
    }

    throw 'Python 3.10 or newer is required. Install Python or pass -Python <path>.'
}

$PythonExecutable = Resolve-PythonExecutable
$CliArguments = @($Command)
if ($OutputDir) { $CliArguments += @('--output-dir', $OutputDir) }
if ($SkipTests) { $CliArguments += '--skip-tests' }
if ($SkipWheel) { $CliArguments += '--skip-wheel' }
if ($SkipBundle) { $CliArguments += '--skip-bundle' }

Push-Location $ProjectRoot
try {
    & $PythonExecutable -m easy_windows_pack.cli @CliArguments
    if ($LASTEXITCODE -ne 0) {
        throw "easy-windows-pack CLI failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
