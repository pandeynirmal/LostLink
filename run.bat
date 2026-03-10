@echo off 
cd /d %~dp0 
title LostLink - Project Controller 

echo =================================== 
echo LostLink Project Startup 
echo =================================== 
echo. 
echo Services that will start: 
echo   1. Hardhat Blockchain Node 
echo   2. Python AI Service 
echo   3. Next.js Frontend + API (Port 3000)
echo   4. Express Backend (Port 3001 - Legacy/Optional)
echo. 
echo IMPORTANT: MongoDB must be running on localhost:27017 
echo. 
pause 

:: =============================== 
:: Step 1: Install Dependencies 
:: =============================== 
echo. 
echo [1/4] Checking dependencies... 

if not exist node_modules ( 
    echo Installing root dependencies... 
    call npm install 
) else ( 
    echo Root dependencies OK 
) 

if not exist blockchain\node_modules ( 
    echo Installing blockchain dependencies... 
    cd blockchain && call npm install && cd .. 
) 

if not exist server\node_modules ( 
    echo Installing backend dependencies... 
    cd server && call npm install && cd .. 
) 

if not exist python_service\venv ( 
    echo Creating Python virtual environment... 
    cd python_service 
    python -m venv venv 
    venv\Scripts\python -m pip install -r requirements.txt 
    cd .. 
) 

echo Dependencies ready. 

:: =============================== 
:: Step 2: Start Blockchain Node 
:: =============================== 
echo. 
echo [2/4] Starting Hardhat blockchain... 

start cmd /k "title LOSTLINK - BLOCKCHAIN NODE && cd /d %~dp0blockchain && npx hardhat node" 

:: Wait for RPC to be available
timeout /t 8 >nul 

start cmd /k "title LOSTLINK - CONTRACT DEPLOYMENT && cd /d %~dp0blockchain && npx hardhat run scripts/deploy.js --network localhost" 

:: =============================== 
:: Step 3: Start AI + Backend 
:: =============================== 
echo. 
echo [3/4] Starting AI and legacy backend services... 

start cmd /k "title LOSTLINK - PYTHON AI SERVICE && cd /d %~dp0python_service && venv\Scripts\python ai_app.py" 

timeout /t 3 >nul 

start cmd /k "title LOSTLINK - EXPRESS BACKEND && cd /d %~dp0server && node server.js" 

:: =============================== 
:: Step 4: Start Frontend 
:: =============================== 
echo. 
echo [4/4] Starting Next.js frontend (Core App)... 

start cmd /k "title LOSTLINK - NEXT.JS FRONTEND && cd /d %~dp0 && set BROWSER=none && npm run dev" 

echo. 
echo =================================== 
echo All services started 
echo =================================== 
echo. 
echo Access the application at: 
echo http://localhost:3000 
echo. 
echo Close individual terminals to stop services. 
echo. 

pause