import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Item from "@/lib/models/Item";
import ContactRequest from "@/lib/models/ContactRequest";
import WalletTransaction from "@/lib/models/WalletTransaction";
import "@/lib/models/User";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded) return null;
  return decoded.userId;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    await connectDB();

    const item = await Item.findOne({
      _id: id,
      userId,
      removedByAdmin: { $ne: true },
    })
      .populate("matchedItemId", "description type imageUrl matchScore")
      .lean();

    if (!item) {
      return NextResponse.json(
        { error: "Item not found or unauthorized" },
        { status: 404 }
      );
    }

    const primaryItemId = item._id;
    const matchedItemId = (item.matchedItemId as any)?._id || item.matchedItemId;
    const relatedItemIds = [primaryItemId];
    if (matchedItemId) {
      relatedItemIds.push(matchedItemId);
    }

    const normalizeScore = (score: unknown): number => {
      if (typeof score !== "number" || !Number.isFinite(score)) return 0;
      return score <= 1 ? score * 100 : score;
    };

    let historyMatchScore = normalizeScore((item as any).matchScore);
    if (historyMatchScore <= 0) {
      historyMatchScore = normalizeScore((item as any)?.matchedItemId?.matchScore);
    }
    if (historyMatchScore <= 0) {
      const counterpart = await Item.findOne({ matchedItemId: item._id })
        .sort({ matchScore: -1 })
        .select("matchScore")
        .lean();
      historyMatchScore = normalizeScore((counterpart as any)?.matchScore);
    }

    const [claims, transactions] = await Promise.all([
      ContactRequest.find({ itemId: { $in: relatedItemIds } })
        .sort({ createdAt: -1 })
        .populate("requesterId", "fullName email walletAddress")
        .populate("ownerId", "fullName email walletAddress")
        .lean(),
      WalletTransaction.find({ itemId: { $in: relatedItemIds } })
        .sort({ createdAt: -1 })
        .populate("fromUserId", "fullName email walletAddress")
        .populate("toUserId", "fullName email walletAddress")
        .lean(),
    ]);

    return NextResponse.json(
      {
        success: true,
        item: {
          id: item._id,
          type: item.type,
          description: item.description,
          imageUrl: item.imageUrl,
          status: item.status,
          rewardAmount: Number(item.rewardAmount || 0),
          isClaimed: Boolean(item.isClaimed),
          matchScore: Math.round(historyMatchScore * 100) / 100,
          rewardTxHash: item.rewardTxHash || "",
          createdAt: item.createdAt,
          matchedItem: item.matchedItemId
            ? {
                id: (item.matchedItemId as any)._id,
                description: (item.matchedItemId as any).description,
                type: (item.matchedItemId as any).type,
                matchScore:
                  Math.round(normalizeScore((item.matchedItemId as any).matchScore) * 100) / 100,
              }
            : null,
        },
        relatedItemIds: relatedItemIds.map((entry: any) => entry.toString()),
        claims: claims.map((claim: any) => ({
          id: claim._id,
          status: claim.status,
          adminStatus: claim.adminStatus || "pending",
          proposedAmount: Number(claim.proposedAmount || 0),
          aiMatchScore: Number(claim.aiMatchScore || 0),
          requester: {
            id: claim.requesterId?._id || "",
            fullName: claim.requesterId?.fullName || "Unknown",
            email: claim.requesterId?.email || "",
            walletAddress: claim.requesterId?.walletAddress || "",
          },
          owner: {
            id: claim.ownerId?._id || "",
            fullName: claim.ownerId?.fullName || "Unknown",
            email: claim.ownerId?.email || "",
            walletAddress: claim.ownerId?.walletAddress || "",
          },
          createdAt: claim.createdAt,
          adminReviewedAt: claim.adminReviewedAt || null,
          adminReviewNotes: claim.adminReviewNotes || "",
        })),
        transactions: transactions.map((tx: any) => ({
          id: tx._id,
          paymentMethod: tx.paymentMethod,
          amountEth: Number(tx.amountEth || 0),
          status: tx.status,
          txHash: tx.txHash || "",
          anchorTxHash: tx.anchorTxHash || "",
          settlementProofTxHash: tx.settlementProofTxHash || "",
          network: tx.network || "",
          from: {
            id: tx.fromUserId?._id || "",
            fullName: tx.fromUserId?.fullName || "Unknown",
            email: tx.fromUserId?.email || "",
            walletAddress: tx.fromAddress || tx.fromUserId?.walletAddress || "",
          },
          to: {
            id: tx.toUserId?._id || "",
            fullName: tx.toUserId?.fullName || "Unknown",
            email: tx.toUserId?.email || "",
            walletAddress: tx.toAddress || tx.toUserId?.walletAddress || "",
          },
          createdAt: tx.createdAt,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Upload history error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
