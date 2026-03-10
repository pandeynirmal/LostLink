# 🚀 LostLink - Quick Reference Card

## ⚡ Quick Start (3 Steps)

```bash
# 1. Make sure MongoDB is running
# 2. Run the startup script
run.bat
# 3. Wait for browser to open at http://localhost:3000
```

---

## 📺 Terminal Guide (What Each Window Does)

| # | Window Title | Purpose | Port | Can Close? |
|---|--------------|---------|------|------------|
| 1 | **BLOCKCHAIN NODE** | Hardhat Ethereum node | 8545 | ❌ No |
| 2 | **CONTRACT DEPLOYMENT** | Deploys smart contracts | - | ✅ After deploy |
| 3 | **AI SERVICES** | Python Flask + Express backend | 5001/3001 | ❌ No |
| 4 | **NEXT.JS FRONTEND** | React web app | 3000 | ❌ No |
| 5 | **CONTROLLER** | Status monitor | - | ✅ After startup |

---

## 🔧 Commands Cheat Sheet

### Starting Project
```batch
run.bat
```

### Creating Clean Backup
```powershell
.\backup-project.ps1
```

### Quick Compression
```powershell
.\compress-project.ps1
```

### Manual Service Start (if needed)
```bash
# Blockchain
cd blockchain && npx hardhat node

# Deploy contracts
cd blockchain && npx hardhat run scripts/deploy.js --network localhost

# Python AI
cd python_service && venv\Scripts\python ai_app.py

# Backend
cd server && node server.js

# Frontend
npm run dev
```

---

## 🌐 Ports & URLs

| Service | URL | Protocol |
|---------|-----|----------|
| Frontend | http://localhost:3000 | HTTP |
| Backend API | http://localhost:3001 | HTTP |
| Python AI | http://localhost:5001 | HTTP |
| Blockchain | http://127.0.0.1:8545 | RPC |
| MongoDB | mongodb://localhost:27017 | Database |

---

## ⚠️ Common Issues & Fixes

| Problem | Quick Fix |
|---------|-----------|
| "MongoDB connection failed" | Start MongoDB service |
| "Port already in use" | Close old terminals, restart PC |
| "Python not found" | Install Python 3.8+ |
| "npm install fails" | Delete node_modules, run again |
| Contracts won't deploy | Wait 10s after Hardhat starts |
| Browser doesn't open | Go to http://localhost:3000 manually |

---

## 📁 Important Files

| File | Description |
|------|-------------|
| `run.bat` | Main startup script |
| `STARTUP_GUIDE.md` | Detailed setup guide |
| `SETUP_SUMMARY.md` | Complete overview |
| `README.md` | Project documentation |
| `.env.local` | Environment variables |

---

## 🎯 Stopping Services

**Recommended Order:**
1. Close Frontend terminal (Terminal 4)
2. Close AI Services terminal (Terminal 3)
3. Close Contract Deployment terminal (Terminal 2)
4. Close Blockchain Node terminal (Terminal 1)

**Or simply:** Close all terminals in any order (safe to do)

---

## 💾 Backup Strategy

- **Before deployment:** Use `backup-project.ps1` (clean backup ~10-50 MB)
- **Quick archive:** Use `compress-project.ps1` (full backup ~500+ MB)
- **Manual backup:** Copy entire `submission_final` folder

---

## 📊 System Status Indicators

### ✅ All Good
- All terminals show "Connected" or "Started" messages
- Browser opens automatically
- No error messages in red

### ⚠️ Check These
- MongoDB not started (start MongoDB service)
- One terminal shows errors (check that specific service)
- Browser shows loading forever (check backend logs)

### ❌ Critical Error
- Multiple terminals failing
- Port conflicts
- Python/Node.js not found

---

## 🎨 Application Features

Once running, you can:
- ✅ Upload lost/found items with images
- ✅ AI-powered object detection
- ✅ Blockchain-based ownership verification
- ✅ QR code generation and scanning
- ✅ Chat system between users
- ✅ Admin dashboard for moderation
- ✅ Wallet integration
- ✅ Escrow system for rewards

---

## 📞 Support Resources

- **Project Docs:** `README.md`
- **Setup Guide:** `STARTUP_GUIDE.md`
- **Technical Details:** `TRANSACTION_HASH_FIX.md`
- **Smart Contracts:** `blockchain/contracts/LostAndFound.sol`
- **Backend API:** `server/server.js`
- **Frontend:** `app/` directory

---

**Print this page for quick reference!** 📄
