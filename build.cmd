@echo off
setlocal
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
if exist "%~dp0.venv\Scripts\python.exe" goto local_python
where py >nul 2>nul
if not errorlevel 1 goto py_launcher
where python >nul 2>nul
if not errorlevel 1 goto path_python
echo Python 3.10 or newer is required. Install Python, then run build.cmd init.
if "%~1"=="" pause
exit /b 1
:local_python
"%~dp0.venv\Scripts\python.exe" -X utf8 "%~dp0scripts\dev.py" %*
exit /b %errorlevel%
:py_launcher
py -3 -X utf8 "%~dp0scripts\dev.py" %*
exit /b %errorlevel%
:path_python
python -X utf8 "%~dp0scripts\dev.py" %*
exit /b %errorlevel%