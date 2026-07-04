@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem =====================================================================
rem  PortableAI - Windows fallback launcher
rem  Copyright (C) 2024-2026 Sammuel Oluwaseyi Johnson
rem  Licensed under the GNU Affero General Public License v3.0 only
rem  (AGPL-3.0-only). See the LICENSE file at the repo root or
rem  https://www.gnu.org/licenses/agpl-3.0.html
rem
rem  WHAT THIS DOES
rem    Runs the embedded Ollama server straight from the USB stick and
rem    opens the chat UI in your default browser - WITHOUT Electron.
rem    Use this if the packaged PortableAI.exe will not launch.
rem
rem  IMPORTANT (author cannot test on Windows - written defensively):
rem    - Every path is quoted because the stick paths contain spaces
rem      and parentheses ("Code PAI and App").
rem    - We never write anything to the C: drive. Models + logs stay on
rem      the stick, next to this script.
rem    - Ctrl-C / closing this window stops the Ollama process we started.
rem =====================================================================

rem ---------------------------------------------------------------------
rem 1) Locate ourselves on the stick. %~dp0 = folder this .bat lives in,
rem    always WITH a trailing backslash. This is the USB root.
rem ---------------------------------------------------------------------
set "ROOT=%~dp0"
rem Strip trailing backslash for cleaner joins later.
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

rem The Electron skeleton dir holds resources\ and webui\.
set "APPDIR=%ROOT%\Code PAI and App\PAI\PortableAi_Electron_Skeleton"
set "OLLAMA_BIN=%APPDIR%\resources\ollama-windows-amd64\ollama.exe"
set "OLLAMA_LIBDIR=%APPDIR%\resources\ollama-windows-amd64\lib\ollama"
set "WEBUI=%APPDIR%\webui\index.html"

rem Keep models + log on the stick under app_data (matches the Electron app).
set "MODELS_DIR=%APPDIR%\app_data\models"
set "LOG_FILE=%APPDIR%\app_data\data\ollama.log"

echo.
echo  === PortableAI (Windows fallback launcher) ===
echo  Stick root : "%ROOT%"
echo.

rem ---------------------------------------------------------------------
rem 2) Verify the Ollama binary exists. Clear message if not.
rem ---------------------------------------------------------------------
if not exist "%OLLAMA_BIN%" (
  echo  [ERROR] Ollama binary not found at:
  echo          "%OLLAMA_BIN%"
  echo.
  echo  The Windows Ollama is missing from resources\ollama-windows-amd64\.
  echo  Make sure you copied the WHOLE PortableAI folder to the stick.
  echo.
  pause
  exit /b 1
)

rem Create models + log folders if missing (md is a no-op if they exist).
if not exist "%MODELS_DIR%" md "%MODELS_DIR%" 2>nul
for %%D in ("%LOG_FILE%") do if not exist "%%~dpD" md "%%~dpD" 2>nul

rem ---------------------------------------------------------------------
rem 3) Find a free port in 11434-11440.
rem    Strategy: for each port, check whether an Ollama already answers
rem    (reuse it) OR whether the port is simply free (start our own).
rem    We use PowerShell for both checks so we do not depend on curl.
rem ---------------------------------------------------------------------
set "PORT="
set "REUSE=0"
for %%P in (11434 11435 11436 11437 11438 11439 11440) do (
  if not defined PORT (
    rem 3a) Is an Ollama ALREADY serving on this port? (HTTP 200 on /api/version)
    powershell -NoProfile -Command ^
      "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:%%P/api/version'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
    if !errorlevel! EQU 0 (
      echo  Found a running Ollama on port %%P - reusing it.
      set "PORT=%%P"
      set "REUSE=1"
    ) else (
      rem 3b) Not serving. Is the TCP port free to bind? (no listener present)
      powershell -NoProfile -Command ^
        "$c = Get-NetTCPConnection -State Listen -LocalPort %%P -ErrorAction SilentlyContinue; if ($c) { exit 1 } else { exit 0 }" >nul 2>&1
      if !errorlevel! EQU 0 (
        set "PORT=%%P"
      )
    )
  )
)

if not defined PORT (
  echo  [ERROR] No free port available in range 11434-11440.
  echo          Another program (or a stuck Ollama) is holding all of them.
  echo          Close other Ollama instances and try again.
  echo.
  pause
  exit /b 1
)

echo  Using port : %PORT%   (reuse=%REUSE%)
echo.

rem ---------------------------------------------------------------------
rem 4) Configure the environment for THIS process only (local to this
rem    script thanks to setlocal). These are the same vars the Electron
rem    main process sets:
rem      OLLAMA_HOST       - bind address:port
rem      OLLAMA_MODELS     - keep blobs on the stick, not on C:
rem      OLLAMA_KEEP_ALIVE - keep model resident (-1 = until server exits)
rem      OLLAMA_ORIGINS    - allow the file:// webui page to fetch the API
rem    We deliberately do NOT set any CPU-forcing vars (OLLAMA_NO_GPU,
rem    CUDA_VISIBLE_DEVICES, OLLAMA_LLM_LIBRARY) so the GPU is used.
rem    We DO prepend lib\ollama to PATH so CUDA/Vulkan DLLs resolve.
rem ---------------------------------------------------------------------
set "OLLAMA_HOST=127.0.0.1:%PORT%"
set "OLLAMA_MODELS=%MODELS_DIR%"
set "OLLAMA_KEEP_ALIVE=-1"
rem Ollama derives its config dir (%%USERPROFILE%%\.ollama - keys, history)
rem from the home dir; point the server's home at the stick so nothing lands
rem on C:. Restored right after "start" below - the child keeps the copy it
rem inherited, the rest of this script gets the real profile back.
set "OLLAMA_HOME_DIR=%APPDIR%\app_data\ollama-home"
if not exist "%OLLAMA_HOME_DIR%" mkdir "%OLLAMA_HOME_DIR%" >nul 2>&1
rem Browsers send Origin "null" for file:// pages - this browser-based
rem fallback keeps "*" so any browser works. The packaged Electron app uses a
rem restricted list. (v0.21.2 panicked on a "null" entry; v0.31.1 tolerates it.)
set "OLLAMA_ORIGINS=*"
if exist "%OLLAMA_LIBDIR%" set "PATH=%OLLAMA_LIBDIR%;%PATH%"

rem ---------------------------------------------------------------------
rem 5) Start the server (unless we are reusing an existing one).
rem    We cd into the binary's folder so it finds its lib\ beside it,
rem    then launch it in a NEW minimized window titled "PortableAI-Ollama"
rem    so we can find and kill exactly that process on exit.
rem ---------------------------------------------------------------------
rem Home override for the server child only. Set/restored OUTSIDE the if-block:
rem %VAR% inside a parenthesized block expands at parse time, which would
rem corrupt the restore. "start" copies the env at spawn, so restoring
rem immediately after the block cannot race the child.
set "REAL_USERPROFILE=%USERPROFILE%"
set "USERPROFILE=%OLLAMA_HOME_DIR%"
set "HOME=%OLLAMA_HOME_DIR%"
if "%REUSE%"=="0" (
  echo  Starting Ollama server...
  pushd "%APPDIR%\resources\ollama-windows-amd64"
  rem Run under a cmd wrapper so the server's output actually lands in the
  rem log file we tell the user to check. taskkill /T on the window title
  rem below kills the wrapper AND the ollama.exe child.
  start "PortableAI-Ollama" /min cmd /c ""%OLLAMA_BIN%" serve >> "%LOG_FILE%" 2>&1"
  popd
) else (
  echo  Skipping start - reusing the server already running.
)
set "USERPROFILE=%REAL_USERPROFILE%"
set "REAL_USERPROFILE="
set "HOME="

rem ---------------------------------------------------------------------
rem 6) Poll /api/version until the server answers (max ~30s).
rem ---------------------------------------------------------------------
echo  Waiting for the server to come up...
set "UP=0"
for /L %%i in (1,1,30) do (
  if "!UP!"=="0" (
    powershell -NoProfile -Command ^
      "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:%PORT%/api/version'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
    if !errorlevel! EQU 0 (
      set "UP=1"
    ) else (
      timeout /t 1 >nul
    )
  )
)

if "%UP%"=="0" (
  echo  [ERROR] Ollama did not respond on port %PORT% within 30 seconds.
  echo          Check the log for details:
  echo          "%LOG_FILE%"
  echo.
  echo  Common causes: missing Visual C++ Redistributable, or antivirus
  echo  blocking the executable on removable media.
  echo.
  goto :cleanup
)

echo  Server is up on http://127.0.0.1:%PORT%
echo.

rem ---------------------------------------------------------------------
rem 7) Open the chat UI. app.js reads window.__OLLAMA_PORT to know which
rem    port to fetch. We pass the port via the URL hash (#port=NNNNN) so
rem    the file:// page can pick it up. OLLAMA_ORIGINS=* above lets the
rem    file:// page make cross-origin calls to 127.0.0.1 without CORS
rem    errors. (If your webui does not yet read the hash, it will fall
rem    back to the default 11434 - so port 11434 is preferred above.)
rem ---------------------------------------------------------------------
if exist "%WEBUI%" (
  echo  Opening the chat UI in your browser...
  rem Must be a file:/// URL: "start" on a plain path with a #fragment looks
  rem for a file literally named "index.html#port=..." and fails.
  set "WEBURL=%WEBUI:\=/%"
  start "" "file:///!WEBURL!#port=%PORT%"
) else (
  echo  [WARN] webui\index.html not found at:
  echo         "%WEBUI%"
  echo         The server is running; you can point any Ollama client at
  echo         http://127.0.0.1:%PORT%
)

echo.
echo  ---------------------------------------------------------------
echo   PortableAI is running.
echo   Keep THIS window open. Closing it (or pressing a key) will
echo   shut the server down.
echo  ---------------------------------------------------------------
echo.
pause

:cleanup
rem ---------------------------------------------------------------------
rem 8) Shut down ONLY the server we started. If we reused an existing
rem    one, leave it alone. We match the window title we launched with.
rem ---------------------------------------------------------------------
if "%REUSE%"=="0" (
  echo  Stopping Ollama server...
  rem Kill by the window title we gave it, tree-kill to catch child workers.
  taskkill /FI "WINDOWTITLE eq PortableAI-Ollama*" /T /F >nul 2>&1
  rem Belt-and-suspenders: kill only ollama.exe processes running FROM THE
  rem STICK (path check) - never a system-installed Ollama from Program Files.
  powershell -NoProfile -Command ^
    "Get-Process ollama -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '%APPDIR%*' } | Stop-Process -Force" >nul 2>&1
)
echo  Done.
endlocal
exit /b 0
