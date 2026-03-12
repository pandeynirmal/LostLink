import { NextRequest, NextResponse } from "next/server";
import {
  anchorClaimDecision,
  anchorClaimSettlement,
  anchorExternalPayment,
  verifyAndPay,
} from "@/lib/blockchain";
import { ethers } from "ethers";
import connectDB from "@/lib/db";
import Item from "@/lib/models/Item";
import ContactRequest from "@/lib/models/ContactRequest";
import User from "@/lib/models/User";
import WalletTransaction from "@/lib/models/WalletTransaction";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { ensureUserWallet } from "@/lib/wallet";
import SystemConfig from "@/lib/models/SystemConfig";
import { getBlockchainRpcUrl, resolveReadableNetworkName } from "@/lib/chain-config";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  return decoded.userId;
}

const normalizeScore = (score: unknown): number => {
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;
  return score <= 1 ? score * 100 : score;
};

function isValidTxHash(hash: string | unknown): boolean {
  if (typeof hash !== "string") return false;
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

async function createDecisionAnchorOrThrow(payload: {
  contactRequestId: string;
  itemId: string;
  ownerId: string;
  requesterId: string;
  aiMatchScore: number;
  adminId: string;
  decision: "approved" | "rejected";
  notes?: string;
}) {
  const anchor = await anchorClaimDecision(payload);
  if (!anchor?.txHash || !isValidTxHash(anchor.txHash)) {
    throw new Error("Claim decision could not be anchored on blockchain.");
  }
  return anchor.txHash;
}

async function maybeAutoApproveClaim({
  item,
  ownerApprovedRequest,
}: {
  item: any;
  ownerApprovedRequest: any;
}) {
  if (!ownerApprovedRequest) return null;

  let aiScore = Number(ownerApprovedRequest.aiMatchScore || 0);
  if (!Number.isFinite(aiScore) || aiScore <= 0) {
    aiScore = normalizeScore(item?.matchScore);
    if (aiScore <= 0) {
      const counterpart = await Item.findOne({ matchedItemId: item._id })
        .sort({ matchScore: -1 })
        .select("matchScore");
      aiScore = normalizeScore(counterpart?.matchScore);
    }
    ownerApprovedRequest.aiMatchScore = aiScore;
  }

  const thresholdConfig = await SystemConfig.findOne({
    key: "auto_admin_approve_match_score",
  });
  const autoApproveThreshold = Number(
    thresholdConfig?.valueNumber ??
      Number(process.env.AUTO_ADMIN_APPROVE_MATCH_SCORE || "90")
  );

  const canAutoApprove =
    Number.isFinite(autoApproveThreshold) && aiScore >= autoApproveThreshold;

  if (!canAutoApprove) {
    if (ownerApprovedRequest.isModified()) {
      await ownerApprovedRequest.save();
    }
    return null;
  }

  const reviewNote = `Auto-approved by AI threshold (${aiScore.toFixed(2)} >= ${autoApproveThreshold}).`;

  let decisionTxHash = "";
  try {
    decisionTxHash = await createDecisionAnchorOrThrow({
      contactRequestId: ownerApprovedRequest._id.toString(),
      itemId: ownerApprovedRequest.itemId.toString(),
      ownerId: ownerApprovedRequest.ownerId.toString(),
      requesterId: ownerApprovedRequest.requesterId.toString(),
      aiMatchScore: aiScore,
      adminId: "system-auto",
      decision: "approved",
      notes: reviewNote,
    });
  } catch {
    console.warn("Blockchain anchor unavailable for auto-approve, proceeding without it.");
  }

  ownerApprovedRequest.adminStatus = "approved";
  ownerApprovedRequest.adminReviewedAt = new Date();
  ownerApprovedRequest.adminReviewNotes = decisionTxHash
    ? reviewNote
    : reviewNote + " (blockchain anchor unavailable)";
  if (decisionTxHash) {
    ownerApprovedRequest.adminDecisionTxHash = decisionTxHash;
  }

  await ownerApprovedRequest.save();
  return ownerApprovedRequest;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      itemId,
      requestId = "",
      paymentMethod = "onchain",
      externalPaymentId = "",
      rewardAmount,
      txHash: submittedTxHash = "",
      fromAddress: submittedFromAddress = "",
      allowOwnerDirectApproval = false,
    } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    }

    if (!["onchain", "razorpay", "metamask"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    await connectDB();

    const item = await Item.findOne({ _id: itemId, userId });
    if (!item) {
      return NextResponse.json({ error: "Item not found or unauthorized" }, { status: 404 });
    }

    const requestIdFilter =
      typeof requestId === "string" && requestId.trim().length > 0 ? requestId.trim() : "";

    const ownerApprovedQuery: Record<string, unknown> = {
      itemId: item._id,
      ownerId: userId,
      status: "approved",
    };

    if (requestIdFilter) {
      ownerApprovedQuery._id = requestIdFilter;
    }

    const ownerApprovedRequest = await ContactRequest.findOne(ownerApprovedQuery).sort({
      createdAt: -1,
    });

    let approvedRequest = await ContactRequest.findOne({
      ...ownerApprovedQuery,
      adminStatus: "approved",
    }).sort({ createdAt: -1 });

    if (!approvedRequest && ownerApprovedRequest && allowOwnerDirectApproval === true) {
      const reviewNote = "Approved during owner payout from claims view.";
      const aiScore =
        Number(ownerApprovedRequest.aiMatchScore || 0) || normalizeScore(item?.matchScore);
      if (!ownerApprovedRequest.aiMatchScore && aiScore > 0) {
        ownerApprovedRequest.aiMatchScore = aiScore;
      }

      let decisionTxHash = "";
      try {
        decisionTxHash = await createDecisionAnchorOrThrow({
          contactRequestId: ownerApprovedRequest._id.toString(),
          itemId: ownerApprovedRequest.itemId.toString(),
          ownerId: ownerApprovedRequest.ownerId.toString(),
          requesterId: ownerApprovedRequest.requesterId.toString(),
          aiMatchScore: aiScore,
          adminId: userId,
          decision: "approved",
          notes: reviewNote,
        });
      } catch {
        // Blockchain anchor unavailable — continue without it
        console.warn("Blockchain anchor unavailable, proceeding without it.");
      }

      ownerApprovedRequest.adminStatus = "approved";
      ownerApprovedRequest.adminReviewedAt = new Date();
      ownerApprovedRequest.adminReviewNotes = decisionTxHash
        ? reviewNote
        : reviewNote + " (blockchain anchor unavailable)";
      if (decisionTxHash) {
        ownerApprovedRequest.adminDecisionTxHash = decisionTxHash;
      }
      await ownerApprovedRequest.save();
      approvedRequest = ownerApprovedRequest;
    }

    if (!approvedRequest && ownerApprovedRequest) {
      try {
        approvedRequest = await maybeAutoApproveClaim({
          item,
          ownerApprovedRequest,
        });
      } catch {
        console.warn("Auto-approval failed, proceeding without blockchain anchor.");
        approvedRequest = ownerApprovedRequest;
      }
    }

    // Blockchain proof is optional — proceed even without valid txHash
    const requesterId = approvedRequest?.requesterId?.toString() || "";

    if (!requesterId) {
      if (ownerApprovedRequest) {
        return NextResponse.json(
          { error: "Claim is pending admin review. Admin must approve before payout." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "No approved claim found. Owner and admin approvals are required before payout." },
        { status: 400 }
      );
    }

    const owner = await User.findById(userId);
    const requester = await User.findById(requesterId);

    if (!owner || !requester) {
      return NextResponse.json({ error: "Owner or requester not found" }, { status: 404 });
    }

    await ensureUserWallet(owner);
    await ensureUserWallet(requester);

    if (item.isClaimed) {
      return NextResponse.json({ error: "Reward already claimed" }, { status: 400 });
    }

    const { default: EscrowCase } = await import("@/lib/models/EscrowCase");
    const activeEscrow = await EscrowCase.findOne({
      itemId: item._id,
      state: { $nin: ["released", "refunded"] },
    });

    if (activeEscrow) {
      return NextResponse.json(
        { error: "Funds are currently locked in an active Escrow. Please use the Escrow Panel to finalize the release." },
        { status: 400 }
      );
    }

    const payoutAmount =
      Number(rewardAmount) > 0
        ? Number(rewardAmount)
        : Number(item.rewardAmount || 0);

    if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return NextResponse.json(
        { error: "Set a reward amount before verification" },
        { status: 400 }
      );
    }

    if (!item.rewardAmount || Number(item.rewardAmount) <= 0) {
      item.rewardAmount = payoutAmount;
    }

    let txHash = "";
    let anchorTxHash = "";
    let network = "";
    let contractAddress = "";
    let transactionDoc: any = null;

    if (paymentMethod === "metamask") {
      if (!submittedTxHash || !submittedFromAddress) {
        return NextResponse.json(
          { error: "txHash and fromAddress are required for MetaMask mode" },
          { status: 400 }
        );
      }

      if (!isValidTxHash(submittedTxHash)) {
        return NextResponse.json(
          { error: "Invalid transaction hash format. Must be a valid blockchain transaction hash (0x followed by 64 hex characters)" },
          { status: 400 }
        );
      }

      const provider = new ethers.JsonRpcProvider(getBlockchainRpcUrl());
      const [tx, receipt, net] = await Promise.all([
        provider.getTransaction(submittedTxHash),
        provider.getTransactionReceipt(submittedTxHash),
        provider.getNetwork(),
      ]);

      if (!tx || !receipt || receipt.status !== 1) {
        return NextResponse.json(
          { error: "MetaMask transaction not confirmed on current chain" },
          { status: 400 }
        );
      }

      const expectedAmountWei = ethers.parseEther(payoutAmount.toString());
      const txFrom = tx.from?.toLowerCase() || "";
      const txTo = tx.to?.toLowerCase() || "";

      if (txFrom !== submittedFromAddress.toLowerCase()) {
        return NextResponse.json(
          { error: "MetaMask sender address does not match submitted address" },
          { status: 400 }
        );
      }

      if (txTo !== requester.walletAddress.toLowerCase()) {
        return NextResponse.json(
          { error: "MetaMask transaction receiver does not match approved requester wallet" },
          { status: 400 }
        );
      }

      if (tx.value < expectedAmountWei) {
        return NextResponse.json(
          { error: "MetaMask transaction value is lower than reward amount" },
          { status: 400 }
        );
      }

      network = resolveReadableNetworkName(net.name, net.chainId);
      txHash = tx.hash;
      contractAddress = "";

      transactionDoc = await WalletTransaction.create({
        fromUserId: owner._id,
        toUserId: requester._id,
        itemId: item._id,
        contactRequestId: approvedRequest?._id,
        paymentMethod: "metamask",
        fromAddress: submittedFromAddress,
        toAddress: requester.walletAddress,
        amountEth: payoutAmount,
        txHash,
        network,
        status: "completed",
      });
    } else if (paymentMethod === "onchain") {
      const ownerBalance = Number(owner.offchainBalance || 0);
      if (ownerBalance < payoutAmount) {
        return NextResponse.json(
          { error: `Insufficient wallet balance. You have ${ownerBalance.toFixed(4)} ETH but need ${payoutAmount} ETH. Please load funds in your wallet first.` },
          { status: 400 }
        );
      }

      await owner.updateOne({ $inc: { offchainBalance: -payoutAmount } });
      await requester.updateOne({ $inc: { offchainBalance: payoutAmount } });

      txHash = "offchain_" + Date.now().toString(16);
      network = "offchain";
      contractAddress = "";

      transactionDoc = await WalletTransaction.create({
        fromUserId: owner._id,
        toUserId: requester._id,
        itemId: item._id,
        contactRequestId: approvedRequest?._id,
        paymentMethod: "onchain",
        fromAddress: owner.walletAddress || "",
        toAddress: requester.walletAddress || "",
        amountEth: payoutAmount,
        txHash,
        network,
        status: "completed",
      });
    } else {
      if (!externalPaymentId) {
        return NextResponse.json(
          { error: "externalPaymentId is required for Razorpay mode" },
          { status: 400 }
        );
      }

      const anchor = await anchorExternalPayment({
        itemId: item._id.toString(),
        ownerId: owner._id.toString(),
        requesterId: requester._id.toString(),
        paymentMethod: "razorpay",
        externalPaymentId,
        amountEth: payoutAmount,
      });

      if (!anchor) {
        return NextResponse.json(
          { error: "Failed to anchor external payment on blockchain" },
          { status: 400 }
        );
      }

      if (!isValidTxHash(anchor.txHash)) {
        return NextResponse.json(
          {
            error: "Blockchain anchor transaction failed - invalid hash returned",
            details: "The system could not properly record this transaction on the blockchain",
          },
          { status: 500 }
        );
      }

      txHash = externalPaymentId;
      anchorTxHash = anchor.txHash;
      network = anchor.network;

      transactionDoc = await WalletTransaction.create({
        fromUserId: owner._id,
        toUserId: requester._id,
        itemId: item._id,
        contactRequestId: approvedRequest?._id,
        paymentMethod: "razorpay",
        fromAddress: owner.walletAddress || "external",
        toAddress: requester.walletAddress,
        amountEth: payoutAmount,
        txHash,
        anchorTxHash,
        network,
        externalPaymentId,
        status: "completed",
      });
    }

    try {
      const settlementAnchor = await anchorClaimSettlement({
        contactRequestId: approvedRequest?._id?.toString() || "",
        itemId: item._id.toString(),
        ownerId: owner._id.toString(),
        requesterId: requester._id.toString(),
        paymentMethod,
        amountEth: payoutAmount,
        paymentTxHash: txHash,
        externalPaymentId: paymentMethod === "razorpay" ? externalPaymentId : undefined,
      });

      if (settlementAnchor?.txHash) {
        if (transactionDoc) {
          transactionDoc.set("settlementProofTxHash", settlementAnchor.txHash);
          await transactionDoc.save();
        }
        anchorTxHash = anchorTxHash || settlementAnchor.txHash;
      }
    } catch {
      console.warn("Settlement anchor unavailable, proceeding without it.");
    }

    item.status = "resolved";
    item.isClaimed = true;
    item.rewardTxHash = paymentMethod === "razorpay" ? anchorTxHash : txHash;
    item.blockchain = {
      ...(item.blockchain || {}),
      txHash: paymentMethod === "onchain" ? txHash : anchorTxHash,
      network,
      contractAddress,
      action: "verify",
      verifiedAt: new Date(),
    };
    await item.save();

    if (paymentMethod !== "onchain") {
      try {
        await requester.updateOne({ $inc: { offchainBalance: payoutAmount } });
        const ownerBalanceAfter = Number(owner.offchainBalance || 0);
        if (ownerBalanceAfter >= payoutAmount) {
          await owner.updateOne({ $inc: { offchainBalance: -payoutAmount } });
        }
      } catch (balanceErr) {
        console.error("Balance update error (non-fatal):", balanceErr);
      }
    }

    if (item.matchedItemId) {
      const counterpart = await Item.findById(item.matchedItemId);
      if (counterpart) {
        counterpart.status = "resolved";
        counterpart.isClaimed = true;
        counterpart.rewardTxHash = paymentMethod === "razorpay" ? anchorTxHash : txHash;
        counterpart.blockchain = {
          ...(counterpart.blockchain || {}),
          txHash: paymentMethod === "onchain" ? txHash : anchorTxHash,
          network,
          contractAddress,
          action: "verify",
          verifiedAt: new Date(),
        };
        await counterpart.save();
      }
    }

    return NextResponse.json({
      success: true,
      message:
        paymentMethod === "metamask"
          ? "MetaMask payment verified on-chain and item resolved"
          : paymentMethod === "onchain"
          ? "Reward paid on-chain and item resolved"
          : "Razorpay payment recorded and anchored on-chain",
      paymentMethod,
      txHash,
      anchorTxHash,
      finderWalletAddress: requester.walletAddress,
      blockchain: item.blockchain,
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const itemId = request.nextUrl.searchParams.get("itemId") || "";
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    await connectDB();

    const item = await Item.findOne({ _id: itemId, userId });
    if (!item) {
      return NextResponse.json({ error: "Item not found or unauthorized" }, { status: 404 });
    }

    const ownerApprovedRequest = await ContactRequest.findOne({
      itemId: item._id,
      ownerId: userId,
      status: "approved",
    }).sort({ createdAt: -1 });

    let approvedRequest = await ContactRequest.findOne({
      itemId: item._id,
      ownerId: userId,
      status: "approved",
      adminStatus: "approved",
    })
      .sort({ createdAt: -1 })
      .select("requesterId adminDecisionTxHash");

    if (!approvedRequest && ownerApprovedRequest) {
      try {
        approvedRequest = await maybeAutoApproveClaim({
          item,
          ownerApprovedRequest,
        });
      } catch {
        approvedRequest = ownerApprovedRequest;
      }
    }

    let requester: any = null;
    if (approvedRequest?.requesterId) {
      requester = await User.findById(approvedRequest.requesterId);
    }

    if (!requester) {
      if (ownerApprovedRequest) {
        return NextResponse.json(
          { error: "Claim is pending admin review." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "No approved claim found yet." },
        { status: 400 }
      );
    }

    await ensureUserWallet(requester);

    return NextResponse.json({
      success: true,
      context: {
        receiverName: requester.fullName || "Receiver",
        receiverWalletAddress: requester.walletAddress,
        rewardAmount: Number(item.rewardAmount || 0),
        itemDescription: item.description,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch verify context", details: (error as Error).message },
      { status: 500 }
    );
  }
}

