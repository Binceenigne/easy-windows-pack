@echo off
setlocal DisableDelayedExpansion
call "%~dp0scripts\startup.cmd" %*
exit /b %errorlevel%