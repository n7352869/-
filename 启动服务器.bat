@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   我有一个想法 - 网站服务器
echo ========================================
echo.
echo 当前目录: %CD%
echo.
echo 正在启动服务器...
echo 服务器地址: http://localhost:3000
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

if not exist "node_modules" (
    echo 检测到未安装依赖，正在自动安装...
    call npm install
    echo.
)

call npm start


