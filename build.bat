@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

rem ============================================================
rem  Szeptucha - skrypt budujacy instalator (Windows)
rem ------------------------------------------------------------
rem  Uzycie:
rem     build.bat            -> instalator NSIS (jeden plik .exe)
rem     build.bat nsis       -> to samo
rem     build.bat msi        -> instalator MSI
rem     build.bat all        -> wszystkie bundle (nsis + msi)
rem
rem  Mozesz nadpisac katalog docelowy zmienna srodowiskowa:
rem     set TARGET_DIR=D:\sz  &  build.bat
rem ============================================================

rem --- przejdz do katalogu skryptu ---
cd /d "%~dp0"

rem --- typ bundla (domyslnie nsis = jeden plik .exe) ---
set "BUNDLES=%~1"
if "%BUNDLES%"=="" set "BUNDLES=nsis"

rem --- krotki katalog docelowy: omija limit MAX_PATH (260 znakow) ---
rem  Bez tego build whisper.cpp / vulkan-shaders-gen pada na FTK1011.
if "%TARGET_DIR%"=="" set "TARGET_DIR=C:\szt"
set "CARGO_TARGET_DIR=%TARGET_DIR%"

echo ============================================================
echo  Szeptucha - build
echo  Bundle:      %BUNDLES%
echo  Target dir:  %CARGO_TARGET_DIR%
echo ============================================================
echo.

rem --- sprawdz wymagane narzedzia ---
where bun >nul 2>nul || (echo [BLAD] Brak 'bun' w PATH. Zainstaluj: https://bun.sh & goto :fail)
where cargo >nul 2>nul || (echo [BLAD] Brak 'cargo' w PATH. Zainstaluj Rust: https://rustup.rs & goto :fail)
where cmake >nul 2>nul || (echo [BLAD] Brak 'cmake' w PATH. Wymagany do whisper.cpp. & goto :fail)

rem --- utworz krotki katalog docelowy ---
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%" 2>nul

rem --- model VAD (wymagany w resources) ---
set "VAD=src-tauri\resources\models\silero_vad_v4.onnx"
if not exist "%VAD%" (
    echo [INFO] Brak modelu VAD - pobieram...
    if not exist "src-tauri\resources\models" mkdir "src-tauri\resources\models"
    curl -L -o "%VAD%" "https://www.aitomate.pl/models/silero_vad_v4.onnx" || (echo [BLAD] Nie udalo sie pobrac modelu VAD. & goto :fail)
) else (
    echo [INFO] Model VAD obecny.
)

rem --- zaleznosci frontendu ---
echo.
echo [1/2] Instaluje zaleznosci JS (bun install)...
call bun install || goto :fail

rem --- build aplikacji + instalator ---
echo.
echo [2/2] Buduje aplikacje i instalator (to potrwa kilka-kilkanascie minut)...
call bun run tauri build --bundles %BUNDLES% || goto :fail

rem --- sukces: pokaz gdzie jest instalator ---
echo.
echo ============================================================
echo  SUKCES - gotowe artefakty:
echo ============================================================
if exist "%TARGET_DIR%\release\bundle\nsis" (
    for %%F in ("%TARGET_DIR%\release\bundle\nsis\*-setup.exe") do echo   NSIS: %%~fF  (%%~zF B)
)
if exist "%TARGET_DIR%\release\bundle\msi" (
    for %%F in ("%TARGET_DIR%\release\bundle\msi\*.msi") do echo   MSI:  %%~fF  (%%~zF B)
)
echo.

rem --- otworz folder z instalatorem ---
if exist "%TARGET_DIR%\release\bundle\nsis" start "" "%TARGET_DIR%\release\bundle\nsis"
endlocal
exit /b 0

:fail
echo.
echo [BLAD] Build przerwany (kod %errorlevel%).
endlocal
exit /b 1
