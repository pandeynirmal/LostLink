import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ethers } from "ethers";
import connectDB from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import User from "@/lib/models/User";
import WalletTransaction from "@/lib/models/WalletTransaction";
import { ensureUserWallet, getWalletBalance, getWalletNetwork } from "@/lib/wallet";
import { getUserReputation } from "@/lib/blockchain";
import {
  getBlockchainRpcUrl,
  getExplorerTxUrl,
  isLocalRpcConfigured,
} from "@/lib/chain-config";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;

  return decoded.userId;
}

export async function GET() {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await ensureUserWallet(user);

    const [balance, network, reputation, transactions] = await Promise.all([
      getWalletBalance(user.walletAddress),
      getWalletNetwork(),
      getUserReputation(user.walletAddress),
      WalletTransaction.find({
        $or: [{ fromUserId: user._id }, { toUserId: user._id }],
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("fromUserId", "fullName email")
        .populate("toUserId", "fullName email")
        .populate("itemId", "description"),
    ]);

    const isValidTxHash = (hash: string | undefined) =>
      typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash);

    const provider = new ethers.JsonRpcProvider(
      getBlockchainRpcUrl()
    );
    const txAvailabilityCache = new Map<string, boolean>();
    const checkTxExists = async (hash: string | undefined) => {
      if (!isValidTxHash(hash)) return false;
      if (txAvailabilityCache.has(hash!)) return txAvailabilityCache.get(hash!) as boolean;
      try {
        const [txData, receiptData] = await Promise.all([
          provider.getTransaction(hash!),
          provider.getTransactionReceipt(hash!),
        ]);
        const exists = Boolean(txData || receiptData);
        txAvailabilityCache.set(hash!, exists);
        return exists;
      } catch {
        txAvailabilityCache.set(hash!, false);
        return false;
      }
    };

    const walletTransactions = await Promise.all(transactions.map(async (tx: any) => {
      const txHash = tx.txHash || "";
      const anchorTxHash = tx.anchorTxHash || "";
      const settlementProofTxHash = tx.settlementProofTxHash || "";

      const [txAvailableOnCurrentRpc, anchorTxAvailableOnCurrentRpc, settlementProofTxAvailableOnCurrentRpc] =
        await Promise.all([
          checkTxExists(txHash),
          checkTxExists(anchorTxHash),
          checkTxExists(settlementProofTxHash),
        ]);

      return {
      id: tx._id,
      txHash,
      paymentMethod: tx.paymentMethod,
      anchorTxHash,
      settlementProofTxHash,
      amountEth: tx.amountEth,
      status: tx.status,
      network: tx.network,
      txAvailableOnCurrentRpc,
      anchorTxAvailableOnCurrentRpc,
      settlementProofTxAvailableOnCurrentRpc,
      explorerTxUrl: getExplorerTxUrl(tx.network, txHash),
      anchorExplorerTxUrl: anchorTxHash
        ? getExplorerTxUrl(tx.network, anchorTxHash)
        : "",
      settlementProofExplorerTxUrl: settlementProofTxHash
        ? getExplorerTxUrl(tx.network, settlementProofTxHash)
        : "",
      createdAt: tx.createdAt,
      itemDescription: tx.itemId?.description || "",
      direction: tx.fromUserId?._id?.toString() === user._id.toString() ? "sent" : "received",
      from: {
        fullName: tx.fromUserId?.fullName || "Unknown",
        email: tx.fromUserId?.email || "",
        address: tx.fromAddress,
      },
      to: {
        fullName: tx.toUserId?.fullName || "Unknown",
        email: tx.toUserId?.email || "",
        address: tx.toAddress,
      },
      };
    }));

    const userIdStr = user._id.toString();
    let totalSentEth = 0;
    let totalReceivedEth = 0;
    let onchainSentEth = 0;
    let onchainReceivedEth = 0;
    let offchainSentEth = 0;
    let offchainReceivedEth = 0;

    for (const tx of transactions as any[]) {
      const amount = Number(tx.amountEth || 0);
      const isSender = tx.fromUserId?._id?.toString() === userIdStr;
      const isReceiver = tx.toUserId?._id?.toString() === userIdStr;
      const isOnchain = tx.paymentMethod === "onchain" || tx.paymentMethod === "metamask";

      if (isSender) {
        totalSentEth += amount;
        if (isOnchain) onchainSentEth += amount;
        else offchainSentEth += amount;
      }

      if (isReceiver) {
        totalReceivedEth += amount;
        if (isOnchain) onchainReceivedEth += amount;
        else offchainReceivedEth += amount;
      }
    }

    return NextResponse.json(
      {
        wallet: {
          address: user.walletAddress,
          balanceEth: balance,
          offchainBalance: Number(user.offchainBalance || 0),
          reputation: reputation || 0,
          network,
          verificationMode: isLocalRpcConfigured() ? "local-temporary" : "persistent",
        },
        summary: {
          totalSentEth,
          totalReceivedEth,
          netEth: totalReceivedEth - totalSentEth,
          onchainSentEth,
          onchainReceivedEth,
          onchainNetEth: onchainReceivedEth - onchainSentEth,
          offchainSentEth,
          offchainReceivedEth,
          offchainNetEth: offchainReceivedEth - offchainSentEth,
        },
        transactions: walletTransactions,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Wallet fetch error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
