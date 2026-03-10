const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const FormData = require('form-data');
const cors = require('cors');
const QRCodeService = require('./qr-service');

const app = express();
const PORT = 3001;
const PYTHON_SERVICE_URL = 'http://localhost:5001';

// Setup storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const mongoose = require('mongoose');

// --- MongoDB Setup ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blockchain_lost_found';

mongoose.connect(MONGODB_URI)
    .then(() => console.log(' Connected to MongoDB'))
    .catch(err => console.error(' MongoDB Connection Error:', err));

const ItemSchema = new mongoose.Schema({
    type: { type: String, enum: ['lost', 'found'], required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    embedding: { type: [Number], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'matched', 'resolved'], default: 'pending' },
    matchedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    matchScore: Number,
    txHash: String,
    createdAt: { type: Date, default: Date.now },
    latitude: Number,
    longitude: Number,
    location: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number] // [longitude, latitude]
    },
    qrCodeHash: { type: String, unique: true, sparse: true },
    qrCodeUrl: String,
    rewardAmount: { type: Number, default: 0 },
    isClaimed: { type: Boolean, default: false }
});

ItemSchema.index({ location: '2dsphere' });
ItemSchema.index({ qrCodeHash: 1 });

const Item = mongoose.models.Item || mongoose.model('Item', ItemSchema);

// Load Contract Data
let contract;
let signer;

async function initBlockchain() {
    try {
        const contractData = JSON.parse(fs.readFileSync(path.join(__dirname, '../contract_data.json')));
        const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        signer = await provider.getSigner();
        contract = new ethers.Contract(contractData.address, contractData.abi, signer);
        console.log("Blockchain connected. RPC:", rpcUrl, "Contract at:", contractData.address);
    } catch (e) {
        console.log("Blockchain connection failed (check RPC and contract_data.json):", e.message);
    }
}
initBlockchain();

// --- Helper: Call Python AI ---
async function getEmbedding(filePath) {
    const form = new FormData();
    form.append('image', fs.createReadStream(filePath));

    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/process_image`, form, {
            headers: {
                ...form.getHeaders()
            }
        });
        return response.data.embedding; // List of floats
    } catch (error) {
        console.error("AI Service Error:", error.message);
        throw new Error("Failed to process image with AI");
    }
}

async function getMatchScore(emb1, emb2) {
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/match`, {
            embedding1: emb1,
            embedding2: emb2
        });
        return response.data; // { match_score: float, is_match: bool }
    } catch (error) {
        console.error("AI Match Error:", error.message);
        return { match_score: 0, is_match: false };
    }
}

// --- Routes ---

app.post('/report-lost', upload.single('image'), async (req, res) => {
    try {
        const { description, latitude, longitude, rewardAmount } = req.body;
        const filePath = req.file.path;

        console.log("Processing Lost Item...");
        const embedding = await getEmbedding(filePath);

        const itemId = 'LOST-' + Date.now();

        // Generate QR code
        const qrResult = await QRCodeService.generateQRCode(itemId);

        const item = {
            id: itemId,
            description,
            embedding,
            filePath,
            timestamp: Date.now(),
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            qrCodeHash: qrResult.hash,
            qrCodeUrl: qrResult.dataUrl,
            rewardAmount: rewardAmount ? parseFloat(rewardAmount) : 0
        };
        lostItems.push(item);

        // Register on blockchain if contract available
        if (contract && latitude && longitude) {
            try {
                const lat = Math.floor(parseFloat(latitude) * 1e6);
                const lon = Math.floor(parseFloat(longitude) * 1e6);
                const reward = ethers.parseEther(rewardAmount || '0');
                const mockCid = `Qm${Math.random().toString(36).substring(2, 15)}`;
                const metadataURI = `ipfs://${mockCid}`;

                const tx = await contract.registerItem(
                    itemId,
                    'lost',
                    qrResult.hash,
                    lat,
                    lon,
                    description.substring(0, 32),
                    metadataURI,
                    { value: reward }
                );
                await tx.wait();
                console.log('Item registered on blockchain:', tx.hash);
            } catch (bcError) {
                console.error('Blockchain registration failed:', bcError.message);
            }
        }

        res.json({
            success: true,
            message: "Lost item registered",
            itemId: item.id,
            qrCode: qrResult.dataUrl,
            qrHash: qrResult.hash
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/report-found', upload.single('image'), async (req, res) => {
    try {
        const { description, latitude, longitude } = req.body;
        const filePath = req.file.path;

        console.log("Processing Found Item...");
        const embedding = await getEmbedding(filePath);

        const itemId = 'FOUND-' + Date.now();

        // Generate QR code
        const qrResult = await QRCodeService.generateQRCode(itemId);

        const foundItem = {
            id: itemId,
            description,
            embedding,
            filePath,
            timestamp: Date.now(),
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            qrCodeHash: qrResult.hash,
            qrCodeUrl: qrResult.dataUrl
        };
        foundItems.push(foundItem);

        // Register on blockchain if contract available
        if (contract && latitude && longitude) {
            try {
                const lat = Math.floor(parseFloat(latitude) * 1e6);
                const lon = Math.floor(parseFloat(longitude) * 1e6);
                const mockCid = `Qm${Math.random().toString(36).substring(2, 15)}`;
                const metadataURI = `ipfs://${mockCid}`;

                const tx = await contract.registerItem(
                    itemId,
                    'found',
                    qrResult.hash,
                    lat,
                    lon,
                    description.substring(0, 32),
                    metadataURI,
                    { value: 0 }
                );
                await tx.wait();
                console.log('Found item registered on blockchain:', tx.hash);
            } catch (bcError) {
                console.error('Blockchain registration failed:', bcError.message);
            }
        }

        // Check for matches against ALL lost items
        let bestMatch = null;
        let highestScore = 0;

        for (const lostItem of lostItems) {
            const result = await getMatchScore(lostItem.embedding, embedding);
            console.log(`Checking against ${lostItem.id}: Score ${result.match_score}`);

            if (result.is_match && result.match_score > highestScore) {
                highestScore = result.match_score;
                bestMatch = lostItem;
            }
        }

        if (bestMatch) {
            console.log("MATCH FOUND!", bestMatch.id);

            // Record on Blockchain
            let txHash = null;
            if (contract) {
                try {
                    // Score scaled to integer (0.95 -> 95)
                    const scoreInt = Math.floor(highestScore * 100);
                    const tx = await contract.recordMatch(bestMatch.id, foundItem.id, scoreInt);
                    txHash = tx.hash;
                    console.log("Match recorded on blockchain:", txHash);
                } catch (bcError) {
                    console.error("Blockchain Write Failed:", bcError.message);
                }
            }

            return res.json({
                success: true,
                matchFound: true,
                matchDetails: {
                    lostItemId: bestMatch.id,
                    score: highestScore,
                    txHash: txHash,
                    rewardAmount: bestMatch.rewardAmount || 0
                },
                qrCode: qrResult.dataUrl,
                qrHash: qrResult.hash
            });
        }

        res.json({
            success: true,
            matchFound: false,
            message: "No match found yet. Stored.",
            qrCode: qrResult.dataUrl,
            qrHash: qrResult.hash
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Generate QR code for an item
app.get('/generate-qr/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;

        // Find item in memory
        const item = lostItems.find(i => i.id === itemId) || foundItems.find(i => i.id === itemId);

        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Return existing QR or generate new one
        if (item.qrCodeUrl) {
            res.json({
                qrCode: item.qrCodeUrl,
                hash: item.qrCodeHash
            });
        } else {
            const qrResult = await QRCodeService.generateQRCode(itemId);
            item.qrCodeHash = qrResult.hash;
            item.qrCodeUrl = qrResult.dataUrl;

            res.json({
                qrCode: qrResult.dataUrl,
                hash: qrResult.hash
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Scan QR code and retrieve item details
app.post('/scan-qr', async (req, res) => {
    try {
        const { qrData } = req.body;

        if (!qrData) {
            return res.status(400).json({ error: 'QR data required' });
        }

        // Decode QR data
        const decoded = QRCodeService.decodeQRData(qrData);

        // Try to get from blockchain first
        if (contract) {
            try {
                const itemData = await contract.getItemByQR(decoded.hash);
                return res.json({
                    success: true,
                    source: 'blockchain',
                    item: {
                        id: itemData.id,
                        type: itemData.itemType,
                        reporter: itemData.reporter,
                        latitude: Number(itemData.latitude) / 1e6,
                        longitude: Number(itemData.longitude) / 1e6,
                        rewardAmount: ethers.formatEther(itemData.rewardAmount),
                        isClaimed: itemData.isClaimed,
                        description: itemData.description
                    }
                });
            } catch (bcError) {
                console.log('Blockchain lookup failed, checking memory:', bcError.message);
            }
        }

        // Fallback to memory
        const item = lostItems.find(i => i.qrCodeHash === decoded.hash) ||
            foundItems.find(i => i.qrCodeHash === decoded.hash);

        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        res.json({
            success: true,
            source: 'memory',
            item: {
                id: item.id,
                description: item.description,
                latitude: item.latitude,
                longitude: item.longitude,
                rewardAmount: item.rewardAmount || 0,
                timestamp: item.timestamp
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get items nearby a location
app.get('/items-nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius = 5 } = req.query; // radius in km

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude required' });
        }

        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        const radiusKm = parseFloat(radius);

        // Simple distance calculation (Haversine formula)
        const calculateDistance = (lat1, lon1, lat2, lon2) => {
            const R = 6371; // Earth's radius in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        // Filter items within radius
        const allItems = [...lostItems, ...foundItems];
        const nearbyItems = allItems.filter(item => {
            if (!item.latitude || !item.longitude) return false;
            const distance = calculateDistance(lat, lon, item.latitude, item.longitude);
            return distance <= radiusKm;
        }).map(item => ({
            id: item.id,
            type: item.id.startsWith('LOST') ? 'lost' : 'found',
            description: item.description,
            latitude: item.latitude,
            longitude: item.longitude,
            rewardAmount: item.rewardAmount || 0,
            timestamp: item.timestamp,
            qrCodeHash: item.qrCodeHash
        }));

        res.json({
            success: true,
            count: nearbyItems.length,
            items: nearbyItems
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Deposit reward for an item
app.post('/deposit-reward', async (req, res) => {
    try {
        const { itemId, amount } = req.body;

        if (!itemId || !amount) {
            return res.status(400).json({ error: 'Item ID and amount required' });
        }

        if (!contract) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }

        const rewardWei = ethers.parseEther(amount.toString());
        const tx = await contract.depositReward(itemId, { value: rewardWei });
        await tx.wait();

        // Update memory
        const item = lostItems.find(i => i.id === itemId);
        if (item) {
            item.rewardAmount = (item.rewardAmount || 0) + parseFloat(amount);
        }

        res.json({
            success: true,
            txHash: tx.hash,
            message: 'Reward deposited successfully'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Verify match and pay reward (Owner -> Finder)
app.post('/verify-claim', async (req, res) => {
    try {
        const { itemId, finderAddress } = req.body;

        if (!itemId || !finderAddress) {
            return res.status(400).json({ error: 'Item ID and finder address required' });
        }

        if (!contract) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }

        console.log(`Verifying claim for item ${itemId} and paying finder ${finderAddress}`);

        // This transaction must be signed by the Owner (Server)
        const tx = await contract.verifyAndPay(itemId, finderAddress);
        await tx.wait();

        // Update memory
        const item = lostItems.find(i => i.id === itemId);
        if (item) {
            item.isClaimed = true;
        }

        res.json({
            success: true,
            txHash: tx.hash,
            message: 'Claim verified and reward paid successfully'
        });
    } catch (e) {
        console.error("Verify Claim Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Claim reward (Finder claims after approval)
app.post('/claim-reward', async (req, res) => {
    try {
        const { itemId, claimerAddress } = req.body;

        if (!itemId) {
            return res.status(400).json({ error: 'Item ID required' });
        }

        if (!contract) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }

        // Note: In a real app, the finder would sign this transaction from their wallet.
        // Here, we are simulating it. However, the contract requires msg.sender to be the approved finder.
        // Since the server acts as the signer for now (using the first account usually), 
        // we might not feature true multi-user wallet interactions in this demo unless we use a browser wallet.
        // For this demo, we can assume the server wallet (deployer) is the "Owner" and maybe we use another wallet for "Finder".
        // BUT, since we only have one signer initialized in server.js (`signer = await provider.getSigner();`),
        // we can't easily simulate another user claiming unless we get another signer.

        // For the sake of the demo flow, we will assume the server can execute this or we rely on the frontend to call the contract directly?
        // Actually, the prompt says "Reward system: owner has an option to set reward on or off... system locks reward until verification... transfer to finder".
        // If we want the Backend to handle it, we need to be able to sign as the Finder.
        // Given constraints, I will implement this as:
        // 1. Owner calls /approve-claim (Server signs as Owner? Wait, if Server is Owner, then Server must be the reporter).
        // The current `server.js` uses one signer. This implies the Server is the "System" or "Admin".
        // But `LostAndFound.sol` requires `msg.sender == reporterAddress`.
        // So ALL items are reported by the SERVER's account (the 0th account).
        // This means the Server IS the owner of all items.
        // So /approve-claim works because Server calls it.
        // But for /claim-reward, the `msg.sender` must be `approvedFinder`.
        // If `approvedFinder` is NOT the Server, the Server cannot sign this transaction!
        // 
        // SOLUTION: The Secure Reward Claim MUST be done from the Frontend using a Browser Wallet (Metamask).
        // The Server endpoint `claim-reward` is not useful if it can't sign as the user.
        // However, the prompt asked to "add new modules... Admin Module, Reward System".
        // I will implement the Server endpoint to potentially help, or just leave it for Frontend-Blockchain interaction.
        // But since I need to show I completed the task, I will implement a "Simulated" claim where the server tries to claim?
        // No, that will fail.
        // I will implement the endpoint to RETURN the transaction data for the frontend to sign? 
        // Or I will make the server use a DIFFERENT signer if provided private key? (Unsafe).
        //
        // Better approach:
        // The /claim-reward endpoint in server.js should be removed or marked as "Frontend only".
        // BUT, if I look at existing code:
        // `contract.claimReward(itemId, claimerAddress)` was the OLD function which took an address and sent funds TO it.
        // My NEW function `claimReward(itemId)` uses `msg.sender`.
        // So the Server CANNOT call this function on behalf of the user unless the Server IS the user.

        // So I will update this endpoint to basically say "Please use frontend to claim".
        // OR, I can revert the contract change to allow `claimReward(itemId, address destination)` 
        // BUT protect it with `require(msg.sender == owner && approvedFinder == destination)`.
        // That would allow the Owner (Server) to PUSH the reward to the Finder.
        // That is actually a valid "System locks reward... automatic transfer to finder" flow!
        // "Reward system: owner has an option to set reward... system locks reward until verification and reward AUTOMATIC TRANSFER to the finder".
        // "Automatic transfer" suggests the System (Server/Owner) pushes it.

        // So I should CHANGE the contract potentially?
        // Let's re-read the requirement: "system locks reward until the verification and reward automatic transfer to the finder".
        // "Automatic transfer" -> likely triggered by the verification event.
        // Verification = Owner approves match.
        // So `approveClaim` could AUTO-TRANSFER!

        // Let's modify the contract again to make it simpler and match "Automatic transfer".
        // `approveMatchAndPay(itemId, finderAddress)` -> Checks match, transfers reward to finder.
        // This avoids the Finder needing to claim manually.
        // This fits the "Automatic transfer" requirement perfectly.

        return res.status(400).json({
            error: "Please use the frontend with a connected wallet to claim the reward, or rely on the Owner to trigger payout."
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin Stats
// Admin Stats
// Admin Stats
app.get('/admin/stats', async (req, res) => {
    try {
        const totalItems = await Item.countDocuments();
        const totalLost = await Item.countDocuments({ type: 'lost' });
        const totalFound = await Item.countDocuments({ type: 'found' });
        const claims = await Item.countDocuments({ isClaimed: true });

        res.json({
            totalItems,
            totalLost,
            totalFound,
            claims
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: Get all items
// Admin: Get all items
app.get('/admin/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ createdAt: -1 }).limit(100);
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: Get all matches
app.get('/admin/matches', async (req, res) => {
    try {
        const matches = await Item.find({ status: 'matched' })
            .populate('matchedItemId', 'description imageUrl')
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(matches);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all items (for map display)
app.get('/items/all', async (req, res) => {
    try {
        const { type } = req.query; // 'lost', 'found', or undefined for all

        let items = [...lostItems, ...foundItems];

        if (type) {
            items = items.filter(item =>
                item.id.startsWith(type.toUpperCase())
            );
        }

        const itemsData = items.map(item => ({
            id: item.id,
            type: item.id.startsWith('LOST') ? 'lost' : 'found',
            description: item.description,
            latitude: item.latitude,
            longitude: item.longitude,
            rewardAmount: item.rewardAmount || 0,
            isClaimed: item.isClaimed || false,
            timestamp: item.timestamp,
            qrCodeHash: item.qrCodeHash
        }));

        res.json({
            success: true,
            count: itemsData.length,
            items: itemsData
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

