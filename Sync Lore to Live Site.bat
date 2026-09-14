@echo off
cd /d "%~dp0"
echo ==============================================
echo   Syncing the lore vault to the LIVE site...
echo ==============================================
echo.
call npm run sync:live
echo.
echo ==============================================
echo   Done. Review any warnings above.
echo ==============================================
pause
