@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   我有一个想法 - 一键部署脚本
echo ========================================
echo.
echo 当前目录: %CD%
echo.

if not exist "node_modules" (
    echo [1/2] 正在安装依赖包...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo 依赖安装失败，请检查：
        echo 1. 是否已安装 Node.js (https://nodejs.org/)
        echo 2. 网络连接是否正常
        echo.
        pause
        exit /b 1
    )
    echo.
    echo 依赖安装完成！
    echo.
) else (
    echo [1/2] 依赖已安装，跳过...
    echo.
)

echo [2/2] 正在启动服务器...
echo.
echo ========================================
echo   服务器启动成功！
echo ========================================
echo.
echo 网站地址: http://localhost:3000
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

call npm start


