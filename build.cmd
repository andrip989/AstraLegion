@echo off
rem Pembungkus scripts\build.ps1 (melewati execution policy karena folder ini ada di drive jaringan).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" %*
