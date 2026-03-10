import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ethers } from "ethers";
import { getBlockchainRpcUrl } from "@/lib/chain-config";

function getProvider() {
  return new ethers.JsonRpcProvider(getBlockchainRpcUrl());
}

function getCipherKey() {
  const rawSecret =
    process.env.WALLET_ENCRYPTION_SECRET || process.env.JWT_SECRET || "wallet-secret";
  return createHash("sha256").update(rawSecret).digest();
}

function encryptPrivateKey(privateKey: string) {
  const iv = randomBytes(16);
  const key = getCipherKey();
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPrivateKey(encryptedValue: string) {
  const [ivHex, encryptedHex] = encryptedValue.split(":");
  if (!ivHex || !encryptedHex) {
    throw new Error("Invalid encrypted private key format");
  }

  const key = getCipherKey();
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export async function createCustodialWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    walletAddress: wallet.address,
    walletPrivateKeyEncrypted: encryptPrivateKey(wallet.privateKey),
    walletCreatedAt: new Date(),
  };
}

export async function fundWallet(address: string, amountEthInput?: number) {
  const amountEth =
    typeof amountEthInput === "number"
      ? amountEthInput
      : Number(process.env.WALLET_SIGNUP_FUND_ETH || "1");
  if (!Number.isFinite(amountEth) || amountEth <= 0) {
    return null;
  }

  try {
    const provider = getProvider();
    const signer = await provider.getSigner();
    const tx = await signer.sendTransaction({
      to: address,
      value: ethers.parseEther(amountEth.toString()),
    });
    await tx.wait();
    return tx.hash;
  } catch {
    return null;
  }
}

export async function getWalletBalance(address: string) {
  const provider = getProvider();
  const balanceWei = await provider.getBalance(address);
  return ethers.formatEther(balanceWei);
}

export async function getWalletNetwork() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  if (network.name && network.name !== "unknown") {
    return network.name;
  }
  return `chain-${network.chainId.toString()}`;
}

type TransferInput = {
  fromEncryptedPrivateKey: string;
  toAddress: string;
  amountEth: number;
};

function asEth(wei: bigint) {
  return Number(ethers.formatEther(wei)).toFixed(6);
}

function parseInsufficientFunds(error: unknown) {
  const message = (error as { message?: string })?.message || "";
  if (!message) return null;

  const lowered = message.toLowerCase();
  const likelyInsufficient =
    lowered.includes("insufficient funds") ||
    lowered.includes("sender doesn't have enough funds") ||
    lowered.includes("max upfront cost");
  if (!likelyInsufficient) return null;

  const upfrontMatch = message.match(/max upfront cost is:\s*(\d+)/i);
  const balanceMatch = message.match(/sender'?s balance is:\s*(\d+)/i);

  if (upfrontMatch?.[1] && balanceMatch?.[1]) {
    const requiredWei = BigInt(upfrontMatch[1]);
    const balanceWei = BigInt(balanceMatch[1]);
    const shortfallWei = requiredWei > balanceWei ? requiredWei - balanceWei : BigInt(0);
    return {
      requiredWei,
      balanceWei,
      shortfallWei,
    };
  }

  return {
    requiredWei: null,
    balanceWei: null,
    shortfallWei: null,
  };
}

export async function transferFunds({
  fromEncryptedPrivateKey,
  toAddress,
  amountEth,
}: TransferInput) {
  if (!Number.isFinite(amountEth) || amountEth <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const provider = getProvider();
  const senderPrivateKey = decryptPrivateKey(fromEncryptedPrivateKey);
  const senderWallet = new ethers.Wallet(senderPrivateKey, provider);
  const value = ethers.parseEther(amountEth.toString());

  const senderBalance = await provider.getBalance(senderWallet.address);
  const [estimatedGas, feeData] = await Promise.all([
    provider.estimateGas({
      from: senderWallet.address,
      to: toAddress,
      value,
    }),
    provider.getFeeData(),
  ]);
  const gasPriceForEstimate = feeData.maxFeePerGas ?? feeData.gasPrice ?? BigInt(0);
  const estimatedFee = estimatedGas * gasPriceForEstimate;
  const estimatedRequired = value + estimatedFee;

  if (senderBalance < estimatedRequired) {
    const shortfall = estimatedRequired - senderBalance;
    throw new Error(
      `Insufficient wallet balance for transfer + gas. ` +
        `Available: ${asEth(senderBalance)} ETH, required: at least ${asEth(estimatedRequired)} ETH, ` +
        `short by: ${asEth(shortfall)} ETH.`
    );
  }

  let tx: ethers.TransactionResponse;
  try {
    tx = await senderWallet.sendTransaction({
      to: toAddress,
      value,
    });
  } catch (error) {
    const parsed = parseInsufficientFunds(error);
    if (parsed && parsed.requiredWei !== null && parsed.balanceWei !== null && parsed.shortfallWei !== null) {
      throw new Error(
        `Insufficient wallet balance for transfer + gas. ` +
          `Available: ${asEth(parsed.balanceWei)} ETH, required: ${asEth(parsed.requiredWei)} ETH, ` +
          `short by: ${asEth(parsed.shortfallWei)} ETH.`
      );
    }
    if (parsed) {
      throw new Error("Insufficient wallet balance for transfer + gas.");
    }
    throw error;
  }

  await tx.wait();
  const network = await provider.getNetwork();

  const result = {
    txHash: tx.hash,
    fromAddress: senderWallet.address,
    toAddress,
    network: network.name,
  };

  // Validate transaction hash format
  if (!result.txHash || !/^0x[a-fA-F0-9]{64}$/.test(result.txHash)) {
    console.error(`[ERROR] Invalid txHash from transferFunds:`, {
      txHash: result.txHash,
      type: typeof result.txHash,
      length: result.txHash?.length,
    });
  }

  return result;
}

export async function ensureUserWallet(user: any) {
  if (user.walletAddress && user.walletPrivateKeyEncrypted) {
    return user;
  }

  const walletData = await createCustodialWallet();
  user.walletAddress = walletData.walletAddress;
  user.walletPrivateKeyEncrypted = walletData.walletPrivateKeyEncrypted;
  user.walletCreatedAt = walletData.walletCreatedAt;
  await user.save();

  await fundWallet(walletData.walletAddress);
  return user;
}
