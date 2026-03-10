import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import WalletTransaction from "@/lib/models/WalletTransaction";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();

    const walletTxs = await WalletTransaction.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const isValidTxHash = (hash: string | null | undefined): boolean => {
      if (!hash || typeof hash !== 'string') return false;
      return /^0x[a-fA-F0-9]{64}$/.test(hash);
    };

    const corruptedTxs = walletTxs.map((tx: any) => ({
      id: tx._id,
      paymentMethod: tx.paymentMethod,
      createdAt: tx.createdAt,
      txHash: {
        value: tx.txHash,
        isValid: isValidTxHash(tx.txHash),
        length: typeof tx.txHash === 'string' ? tx.txHash.length : 'N/A',
        type: typeof tx.txHash,
      },
      anchorTxHash: tx.anchorTxHash ? {
        value: tx.anchorTxHash,
        isValid: isValidTxHash(tx.anchorTxHash),
        length: typeof tx.anchorTxHash === 'string' ? tx.anchorTxHash.length : 'N/A',
        type: typeof tx.anchorTxHash,
      } : null,
      settlementProofTxHash: tx.settlementProofTxHash ? {
        value: tx.settlementProofTxHash,
        isValid: isValidTxHash(tx.settlementProofTxHash),
        length: typeof tx.settlementProofTxHash === 'string' ? tx.settlementProofTxHash.length : 'N/A',
        type: typeof tx.settlementProofTxHash,
      } : null,
    }));

    const hasCorrupted = corruptedTxs.filter((tx: any) =>
      !tx.txHash.isValid || (tx.anchorTxHash && !tx.anchorTxHash.isValid) || (tx.settlementProofTxHash && !tx.settlementProofTxHash.isValid)
    );

    return NextResponse.json({
      success: true,
      totalRecords: walletTxs.length,
      corruptedCount: hasCorrupted.length,
      recentTransactions: corruptedTxs,
      corruptedTransactions: hasCorrupted,
      insights: {
        message: `Found ${hasCorrupted.length} transactions with invalid hashes`,
        recommendation: hasCorrupted.length > 0 ? "Review server logs and check blockchain functions" : "All transaction hashes look valid",
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to diagnose transaction hashes" },
      { status: 401 }
    );
  }
}
