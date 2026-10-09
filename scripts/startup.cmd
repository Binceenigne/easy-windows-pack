@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
if exist "%~dp0..\.venv\Scripts\python.exe" goto local_python
where py >nul 2>nul
if not errorlevel 1 goto py_launcher
where python >nul 2>nul
if not errorlevel 1 goto path_python
set "EWP_STARTUP_LANG=zh-CN"
set "EWP_STARTUP_ROOT=%~dp0.."
for /f "delims=" %%L in ('powershell.exe -NoProfile -Command "try { $p = ConvertFrom-Json -InputObject (Get-Content -LiteralPath ($env:EWP_STARTUP_ROOT + '/frontend/package.json') -Raw -Encoding UTF8); if ($p.ewp.language -ceq 'en') { 'en' } } catch {}"') do set "EWP_STARTUP_LANG=%%L"
if "%EWP_LANG%"=="en" set "EWP_STARTUP_LANG=en"
if "%EWP_LANG%"=="zh-CN" set "EWP_STARTUP_LANG=zh-CN"
set "EWP_STARTUP_PAUSE="
set "EWP_STARTUP_OVERRIDE="
if "%~1"=="" set "EWP_STARTUP_PAUSE=1"
:language_argument
if "%~1"=="" goto missing_python
if "%~1"=="--" goto missing_python
set "EWP_STARTUP_ARGUMENT=%~1"
if "%EWP_STARTUP_ARGUMENT:~0,7%"=="--lang=" set "EWP_STARTUP_OVERRIDE=%EWP_STARTUP_ARGUMENT:~7%"
if "%~1"=="--lang" set "EWP_STARTUP_OVERRIDE=%~2"
shift
goto language_argument
:missing_python
if "%EWP_STARTUP_OVERRIDE%"=="en" set "EWP_STARTUP_LANG=en"
if "%EWP_STARTUP_OVERRIDE%"=="zh-CN" set "EWP_STARTUP_LANG=zh-CN"
if "%EWP_STARTUP_LANG%"=="en" goto missing_python_en
powershell.exe -NoProfile -Command "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; [Console]::WriteLine((-join [char[]](0x9700,0x8981)) + ' Python 3.10 ' + (-join [char[]](0x6216,0x4ee5,0x4e0a,0x3002,0x8bf7,0x5b89,0x88c5)) + ' Python' + (-join [char[]](0xff0c,0x7136,0x540e,0x8fd0,0x884c)) + ' startup.cmd init' + [char]0x3002)"
goto missing_python_exit
:missing_python_en
echo Python 3.10 or newer is required. Install Python, then run startup.cmd init.
:missing_python_exit
if defined EWP_STARTUP_PAUSE pause >nul
exit /b 1
:local_python
"%~dp0..\.venv\Scripts\python.exe" -X utf8 "%~dp0dev.py" %*
exit /b %errorlevel%
:py_launcher
py -3 -X utf8 "%~dp0dev.py" %*
exit /b %errorlevel%
:path_python
python -X utf8 "%~dp0dev.py" %*
exit /b %errorlevel%