# Lost and Found AI - Blockchain & AI Integration

This project implements a system where users upload images of lost or found items.
- **AI**: Detects objects (YOLOv8) and extracts features (ResNet) to find matches.
- **Blockchain**: Stores match scores and timestamps immutably.
- **Backend**: Orchestrates the flow and provides a simple Web UI.

## Prerequisites
- Node.js & npm
- Python 3.8+
- Hardhat (installed via npm)

## Installation & Running

You will need **3 separate terminals** to run the services.

### Terminal 1: Python AI Service
```bash
cd python_service
# Create venv (optional but recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the app
python ai_app.py
```
*Server starts on port 5001.*

### Terminal 2: Blockchain (Local Hardhat Node)
```bash
cd blockchain
npm install
# Start local blockchain node
npx hardhat node
```
*This starts a local Ethereum network.*

### Terminal 3: Backend & Deployment
Open a new terminal. First, deploy the contract to the local node:
```bash
cd blockchain
# Deploy contract
npx hardhat run scripts/deploy.js --network localhost
```
*This will create a `contract_data.json` file in the root.*

Now, start the Node.js server:
```bash
cd ../server
npm install
node server.js
```
*Server starts on http://localhost:3000.*

## Usage
1. Open http://localhost:3000 in your browser.
2. **Report Lost Item**: Upload an image (e.g., a backpack) and description.
3. **Report Found Item**: Upload a similar image.
4. The system will:
   - Detect the object.
   - Compare it using AI.
   - If a match is found, it records it on the Blockchain.
   - Display the result on the UI.

## Permanent Verification (Deploy-safe)
For development, the project defaults to local Hardhat RPC (`http://127.0.0.1:8545`).
Local chains reset when restarted, so old tx hashes may become unverifiable.

For permanent verification in deployment:
1. Deploy contract to a persistent chain (for example, Sepolia).
2. Set environment variable:
   - `BLOCKCHAIN_RPC_URL=<your persistent RPC URL>`
3. Optional explorer override:
   - `BLOCKCHAIN_EXPLORER_TX_BASE_URL=https://sepolia.etherscan.io/tx`

This does not break local development; without env override, local Hardhat remains default.
