import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { getBlockchainRpcUrl, resolveReadableNetworkName } from '@/lib/chain-config'

let contract: ethers.Contract | null = null
let provider: ethers.JsonRpcProvider | null = null
let contractAddress: string | null = null
let networkName: string | null = null

export async function initBlockchain() {
    try {
        const contractDataPath = path.join(process.cwd(), 'contract_data.json')

        if (!fs.existsSync(contractDataPath)) {
            console.warn(' contract_data.json not found. Blockchain features disabled.')
            return null
        }

        const contractData = JSON.parse(fs.readFileSync(contractDataPath, 'utf-8'))

        provider = new ethers.JsonRpcProvider(
            getBlockchainRpcUrl()
        )

        const network = await provider.getNetwork()
        networkName = resolveReadableNetworkName(network.name, network.chainId)

        const signer = await provider.getSigner()
        contract = new ethers.Contract(contractData.address, contractData.abi, signer)

        contractAddress = contractData.address

        console.log(' Blockchain connected.')
        console.log('Network:', networkName)
        console.log('Contract:', contractAddress)

        return contract
    } catch (e) {
        console.error(' Blockchain connection failed:', (e as Error).message)
        return null
    }
}

function buildBlockchainResponse(txHash: string) {
    // Validate transaction hash format
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        console.error(`[ERROR] Invalid transaction hash in blockchain response:`, {
            txHash,
            type: typeof txHash,
            length: txHash?.length,
        });
    }

    return {
        txHash,
        network: networkName || 'localhost',
        contractAddress: contractAddress || 'unknown',
        verifiedAt: new Date(),
    }
}

export async function recordMatch(
    lostItemId: string,
    foundItemId: string,
    matchScore: number
) {
    try {
        if (!contract) await initBlockchain()
        if (!contract) return null

        const scoreInt = Math.floor(matchScore * 100)
        const tx = await contract.recordMatch(lostItemId, foundItemId, scoreInt)

        await tx.wait()

        return buildBlockchainResponse(tx.hash)
    } catch (error) {
        console.error(' Blockchain write failed:', (error as Error).message)
        return null
    }
}

export async function registerItem(
    itemId: string,
    itemType: string,
    qrCodeHash: string,
    latitude: number,
    longitude: number,
    description: string,
    rewardAmount: number,
    metadataURI: string = ""
) {
    try {
        if (!contract) await initBlockchain()
        if (!contract) return null

        const rewardInWei = ethers.parseEther(rewardAmount.toString())
        const lat = Math.floor(latitude * 1e6)
        const lon = Math.floor(longitude * 1e6)
        const secretHash = ethers.ZeroHash

        const tx = await contract.registerItem(
            itemId,
            itemType,
            qrCodeHash,
            lat,
            lon,
            description,
            metadataURI,
            secretHash,
            { value: rewardInWei }
        )

        await tx.wait()

        return buildBlockchainResponse(tx.hash)
    } catch (error) {
        console.error(' Blockchain write failed (registerItem):', (error as Error).message)
        return null
    }
}

export async function getUserReputation(userAddress: string) {
    try {
        if (!contract) await initBlockchain()
        if (!contract) return 0

        const reputation = await contract.reputation(userAddress)
        return Number(reputation)
    } catch (error) {
        console.error(' Failed to fetch reputation:', (error as Error).message)
        return 0
    }
}

export async function verifyAndPay(itemId: string, finderAddress: string, secret: string = "") {
    try {
        if (!contract) await initBlockchain()
        if (!contract) return null

        const tx = await contract.verifyAndPay(itemId, finderAddress, secret)

        await tx.wait()

        return buildBlockchainResponse(tx.hash)
    } catch (error) {
        console.error(' Blockchain write failed (verifyAndPay):', (error as Error).message)
        return null
    }
}
export async function getBlockchainStatus() {
    try {
        if (!contract) await initBlockchain()
        if (!provider) return null

        const network = await provider.getNetwork()

        const readableNetwork = resolveReadableNetworkName(network.name, network.chainId)

        return {
            network: readableNetwork,
            contractAddress: contractAddress,
        }
    } catch (error) {
        console.error(" Failed to fetch blockchain status")
        return null
    }
}
export async function getContractBalance() {
    try {
        if (!provider || !contractAddress) await initBlockchain()
        if (!provider || !contractAddress) return null

        const balanceWei = await provider.getBalance(contractAddress)
        const balanceEth = ethers.formatEther(balanceWei)

        return balanceEth
    } catch (error) {
        console.error(" Failed to fetch contract balance")
        return null
    }
}

export async function anchorExternalPayment(payload: {
    itemId: string
    ownerId: string
    requesterId: string
    paymentMethod: string
    externalPaymentId: string
    amountEth: number
}) {
    try {
        if (!provider) await initBlockchain()
        if (!provider) return null

        const signer = await provider.getSigner()
        const payloadHash = ethers.keccak256(
            ethers.toUtf8Bytes(JSON.stringify(payload))
        )

        const tx = await signer.sendTransaction({
            to: await signer.getAddress(),
            value: ethers.parseEther('0'),
            data: payloadHash,
        })

        await tx.wait()

        const network = await provider.getNetwork()
        return {
            txHash: tx.hash,
            payloadHash,
            network: network.name,
        }
    } catch (error) {
        console.error(' Blockchain anchor failed (anchorExternalPayment):', (error as Error).message)
        return null
    }
}

export async function anchorClaimDecision(payload: {
    contactRequestId: string
    itemId: string
    ownerId: string
    requesterId: string
    aiMatchScore: number
    adminId: string
    decision: 'approved' | 'rejected'
    notes?: string
}) {
    try {
        if (!provider) await initBlockchain()
        if (!provider) return null

        const signer = await provider.getSigner()
        const payloadHash = ethers.keccak256(
            ethers.toUtf8Bytes(JSON.stringify(payload))
        )

        const tx = await signer.sendTransaction({
            to: await signer.getAddress(),
            value: ethers.parseEther('0'),
            data: payloadHash,
        })

        await tx.wait()

        const network = await provider.getNetwork()
        return {
            txHash: tx.hash,
            payloadHash,
            network: network.name && network.name !== 'unknown' ? network.name : `chain-${network.chainId.toString()}`,
        }
    } catch (error) {
        console.error(' Blockchain anchor failed (anchorClaimDecision):', (error as Error).message)
        return null
    }
}

export async function anchorClaimSettlement(payload: {
    contactRequestId: string
    itemId: string
    ownerId: string
    requesterId: string
    paymentMethod: 'onchain' | 'metamask' | 'razorpay'
    amountEth: number
    paymentTxHash: string
    externalPaymentId?: string
}) {
    try {
        if (!provider) await initBlockchain()
        if (!provider) return null

        const signer = await provider.getSigner()
        const payloadHash = ethers.keccak256(
            ethers.toUtf8Bytes(JSON.stringify(payload))
        )

        const tx = await signer.sendTransaction({
            to: await signer.getAddress(),
            value: ethers.parseEther('0'),
            data: payloadHash,
        })

        await tx.wait()
        const network = await provider.getNetwork()

        return {
            txHash: tx.hash,
            payloadHash,
            network: network.name && network.name !== 'unknown' ? network.name : `chain-${network.chainId.toString()}`,
        }
    } catch (error) {
        console.error(' Blockchain anchor failed (anchorClaimSettlement):', (error as Error).message)
        return null
    }
}


