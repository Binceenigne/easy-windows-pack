@echo off
setlocal DisableDelayedExpansion
call "%~dp0startup.cmd" %*
exit /b %errorlevel%