import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Item from "@/lib/models/Item";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import ContactRequest from "@/lib/models/ContactRequest";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  return decoded.userId;
}

export async function DELETE() {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const userItems = await Item.find({ userId });
    if (userItems.length === 0) {
      return NextResponse.json({ success: true, message: "No items to delete." });
    }

    const itemIds = userItems.map(item => item._id);
    await Item.deleteMany({ userId });
    await ContactRequest.deleteMany({ itemId: { $in: itemIds } });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${userItems.length} items.`,
    });
  } catch (error) {
    console.error("Bulk Delete Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const items = await Item.find({
      userId: userId,
      removedByAdmin: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .populate("matchedItemId", "description imageUrl type matchScore")
      .lean();

    const normalizeScore = (score: unknown): number | null => {
      if (typeof score !== "number" || !Number.isFinite(score)) return null;
      const pct = score <= 1 ? score * 100 : score;
      return Math.round(pct * 100) / 100;
    };

    const tokenize = (value: unknown): string[] => {
      if (typeof value !== "string") return [];
      return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2);
    };

    const similarityPercent = (
      aDescription: unknown,
      bDescription: unknown,
      aImageUrl?: unknown,
      bImageUrl?: unknown
    ): number | null => {
      if (
        typeof aImageUrl === "string" &&
        typeof bImageUrl === "string" &&
        aImageUrl.trim() &&
        aImageUrl.trim() === bImageUrl.trim()
      ) {
        return 100;
      }

      const aTokens = new Set(tokenize(aDescription));
      const bTokens = new Set(tokenize(bDescription));
      if (aTokens.size === 0 || bTokens.size === 0) return null;

      let intersection = 0;
      for (const token of aTokens) {
        if (bTokens.has(token)) intersection += 1;
      }
      const union = new Set([...aTokens, ...bTokens]).size;
      if (union === 0) return null;
      return Math.round((intersection / union) * 10000) / 100;
    };

    const mappedItems = await Promise.all(
      items.map(async (item: any) => {
        let matchedItem: any = item.matchedItemId || null;

        if (!matchedItem) {
          const reverse = await Item.findOne({
            matchedItemId: item._id,
            removedByAdmin: { $ne: true },
          })
            .select("_id description imageUrl type matchScore")
            .lean();
          if (reverse) matchedItem = reverse;
        }

        if (!matchedItem) {
          const oppositeType = item.type === "lost" ? "found" : "lost";
          const candidates = await Item.find({
            type: oppositeType,
            userId: { $ne: item.userId },
            removedByAdmin: { $ne: true },
            isClaimed: { $ne: true },
          })
            .select("_id description imageUrl type matchScore")
            .sort({ createdAt: -1 })
            .limit(75)
            .lean();

          let bestCandidate: any = null;
          let bestScore = -1;
          for (const candidate of candidates) {
            const simScore = similarityPercent(
              item.description,
              candidate.description,
              item.imageUrl,
              candidate.imageUrl
            );
            const candidateAiScore = normalizeScore(candidate.matchScore);
            const combinedScore = Math.max(simScore ?? 0, candidateAiScore ?? 0);
            if (combinedScore > bestScore) {
              bestScore = combinedScore;
              bestCandidate = candidate;
            }
          }

          if (bestCandidate && bestScore >= 50) {
            matchedItem = { ...bestCandidate, matchScore: bestScore };
          }
        }

        const selfScore = normalizeScore(item.matchScore);
        const matchedScore = normalizeScore(matchedItem?.matchScore);
        const effectiveScore = selfScore ?? matchedScore ?? null;
        const effectiveStatus =
          item.status === "matched" || (matchedItem && (effectiveScore ?? 0) >= 50)
            ? "matched"
            : item.status;

        return {
          _id: item._id,
          type: item.type,
          description: item.description,
          imageUrl: item.imageUrl,
          status: effectiveStatus,
          matchScore: effectiveScore,
          rewardAmount: Number(item.rewardAmount || 0),
          isClaimed: Boolean(item.isClaimed),
          txHash: item.blockchain?.txHash || null,
          createdAt: item.createdAt,
          matchedItem: matchedItem
            ? {
                id: matchedItem._id,
                description: matchedItem.description,
                imageUrl: matchedItem.imageUrl,
                type: matchedItem.type,
                matchScore: normalizeScore(matchedItem.matchScore),
              }
            : null,
        };
      })
    );

    return NextResponse.json({ success: true, items: mappedItems });
  } catch (error) {
    console.error("My Uploads Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}