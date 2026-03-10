# LostLink Project - Startup Guide

## Quick Start

### Prerequisites
- **Node.js** (v16+) installed
- **Python 3.8+** installed
- **MongoDB** running on `localhost:27017`

### Starting the Project

Simply run:
```batch
run.bat
```

This will automatically:
1. ✅ Install all dependencies (if needed)
2. ✅ Start 4 organized terminals with clear labels
3. ✅ Open your browser to `http://localhost:3000`

---

## Terminal Organization (4 Main Terminals)

### Terminal 1: **BLOCKCHAIN NODE** 📦
- **Title:** LOSTLINK - BLOCKCHAIN NODE
- **Port:** 8545
- **Function:** Hardhat local Ethereum blockchain
- **What it does:** 
  - Runs local blockchain for smart contract testing
  - Chain ID: 31337
  - Handles all blockchain transactions

### Terminal 2: **CONTRACT DEPLOYMENT** 🔧
- **Title:** LOSTLINK - CONTRACT DEPLOYMENT
- **Function:** Deploys smart contracts to blockchain
- **What it does:**
  - Automatically deploys LostAndFound.sol contracts
  - Shows deployment logs and contract addresses
  - One-time setup (can close after deployment)

### Terminal 3: **AI SERVICES** 🤖
- **Title:** LOSTLINK - AI SERVICES (Python + Backend)
- **Ports:** 
  - Python Flask: 5001
  - Express Backend: 3001
- **Function:** AI image recognition + backend API
- **What it does:**
  - YOLOv8 object detection
  - ResNet50 image embeddings
  - MongoDB database operations
  - QR code generation
  - Email notifications

### Terminal 4: **FRONTEND** 🌐
- **Title:** LOSTLINK - NEXT.JS FRONTEND
- **Port:** 3000
- **Function:** React/Next.js web application
- **What it does:**
  - User interface
  - Wallet connection
  - Item uploads
  - Chat system
  - Admin dashboard

### Terminal 5: **CONTROLLER** 🎮
- **Title:** LostLink - Project Controller
- **Function:** Status monitor and launcher
- **What it does:**
  - Orchestrates startup sequence
  - Shows service status
  - Auto-opens browser
  - Can be closed after startup

---

## Service Architecture

```
┌─────────────────────────────────────────────────┐
│              User Browser                       │
│           http://localhost:3000                 │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   Next.js Frontend  │  ← Terminal 4
        │      (Port 3000)    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Express Backend    │  ← Terminal 3
        │      (Port 3001)    │
        └─────┬───────┬───────┘
              │       │
    ┌─────────▼─┐   ┌─▼──────────┐
    │  MongoDB  │   │ Python AI  │  ← Terminal 3
    │           │   │  (Port 5001)│
    └───────────┘   └─────┬──────┘
                          │
                ┌─────────▼─────────┐
                │  Blockchain Node  │  ← Terminal 1
                │   (Port 8545)     │
                └───────────────────┘
```

---

## Stopping Services

To stop all services, close each terminal window individually:
1. Close Frontend terminal (Ctrl+C or X button)
2. Close AI Services terminal
3. Close Contract Deployment terminal (if still running)
4. Close Blockchain Node terminal

**Note:** Always close in reverse order (Frontend → Backend → Blockchain)

---

## Troubleshooting

### MongoDB Not Running
**Error:** Cannot connect to MongoDB
**Solution:** Start MongoDB service:
```bash
# Windows (if MongoDB is installed as service)
net start MongoDB

# Or run mongod manually
mongod --dbpath "C:\data\db"
```

### Port Already in Use
**Error:** Port 3000/3001/5001/8545 already in use
**Solution:** Kill the process using that port or change the port in configuration

### Python Virtual Environment Error
**Error:** venv not found or Python not accessible
**Solution:**
```bash
cd python_service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Contract Deployment Fails
**Error:** Cannot deploy contracts
**Solution:** 
1. Ensure Hardhat node is fully started (wait 8 seconds)
2. Check if blockchain terminal shows any errors
3. Delete `blockchain/artifacts` and try again

---

## File Structure

```
submission_final/
├── run.bat                  # Main startup script
├── STARTUP_GUIDE.md         # This file
├── app/                     # Next.js frontend
├── server/                  # Express backend
├── python_service/          # Python AI service
├── blockchain/              # Smart contracts
├── lib/                     # Shared libraries
└── components/              # React components
```

---

## Ports Summary

| Service | Port | Protocol |
|---------|------|----------|
| Next.js Frontend | 3000 | HTTP |
| Express Backend | 3001 | HTTP |
| Python AI Service | 5001 | HTTP |
| Hardhat Blockchain | 8545 | RPC |
| MongoDB | 27017 | Database |

---

## First-Time Setup

If running for the first time:

1. **Install Node.js dependencies:**
   ```bash
   npm install
   cd blockchain && npm install
   cd ../server && npm install
   ```

2. **Setup Python environment:**
   ```bash
   cd python_service
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Start MongoDB:**
   - Ensure MongoDB is installed and running

4. **Run the startup script:**
   ```bash
   run.bat
   ```

The script handles all of this automatically now!

---

## Notes

- **Internet Connection:** Required for npm/pip packages on first run
- **Administrator Rights:** Not required unless installing global packages
- **Disk Space:** ~500MB for dependencies + ~100MB for project files
- **RAM Usage:** ~2-3GB total when all services running

---

## Support

For issues or questions about the LostLink project, check:
- Project documentation
- Smart contract files in `blockchain/contracts/`
- API endpoints in `server/server.js`
- Frontend pages in `app/`

## Running the LostLink Project Manually

If you prefer not to use the `run.bat` controller script, the project can be started manually using multiple terminals.

### Prerequisites

Ensure the following software is installed:

* Node.js (v18 or later recommended)
* Python 3.9+
* MongoDB running locally on `localhost:27017`
* npm

---

### Step 1 — Install Dependencies

From the root project folder:

```
npm install
```

Install backend dependencies:

```
cd server
npm install
cd ..
```

Install blockchain dependencies:

```
cd blockchain
npm install
cd ..
```

Install Python dependencies:

```
cd python_service
python -m venv venv
venv\Scripts\pip install -r requirements.txt
cd ..
```

---

### Step 2 — Start the Blockchain Network

Open a terminal:

```
cd blockchain
npx hardhat node
```

Open another terminal to deploy the contracts:

```
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
```

This starts a local blockchain on:

```
http://127.0.0.1:8545
```

---

### Step 3 — Start the AI Service

Open another terminal:

```
cd python_service
venv\Scripts\activate
python ai_app.py
```

The AI service runs on:

```
http://localhost:5001
```

---

### Step 4 — Start the Backend Server

Open another terminal:

```
cd server
node server.js
```

The backend API runs on:

```
http://localhost:3001
```

---

### Step 5 — Start the Frontend

From the project root:

```
npm run dev
```

The frontend runs on:

```
http://localhost:3000
```

---

### Final System Architecture

The services communicate as follows:

User → Next.js Frontend → Express Backend → Python AI Service → MongoDB + Blockchain

All services must be running simultaneously for the application to function properly.

