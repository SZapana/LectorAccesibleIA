@echo off
title Lector Accesible IA - proxy de voz
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Python en el PATH.
  echo Instala Python 3 y vuelve a ejecutar este archivo.
  echo Alternativa: abre una terminal y ejecuta  python proxy-tts.py
  echo.
  pause
  exit /b 1
)
echo Iniciando proxy de voz en http://127.0.0.1:3902
echo Deja esta ventana abierta mientras uses la extension.
echo.
python proxy-tts.py
echo.
echo El proxy se detuvo. Presiona una tecla para cerrar.
pause >nul
