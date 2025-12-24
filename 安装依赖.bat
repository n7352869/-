@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   安装依赖包
echo ========================================
echo.
echo 当前目录: %CD%
echo.
echo 正在安装依赖包...
call npm install
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo 依赖安装成功！
    echo ========================================
    echo.
    pause
) else (
    echo.
    echo ========================================
    echo 依赖安装失败，请检查网络连接和Node.js环境
    echo ========================================
    echo.
    pause
)


