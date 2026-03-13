import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import ContactRequest from "@/lib/models/ContactRequest";
import Item from "@/lib/models/Item";
import "@/lib/models/User";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

const MIN_CLAIM_MATCH_SCORE = 50;

/* ---------- SCORE NORMALIZATION ---------- */
const normalizeScore = (score: unknown): number => {
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;

  let normalized = score;

  if (normalized <= 1.000001) {
    normalized = normalized * 100;
  }

  normalized = Math.max(0, Math.min(100, normalized));

  return Math.round(normalized * 100) / 100;
};

/* ---------- IMAGE HELPERS ---------- */

const extractFilename = (url: string): string => {
  if (typeof url !== "string") return "";
  try {
    const pathname = new URL(url).pathname;
    return pathname.substring(pathname.lastIndexOf("/") + 1);
  } catch {
    return url;
  }
};

const extractPublicId = (url: string): string => {
  if (typeof url !== "string") return "";

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    const parts = pathname.split("/");
    const uploadIndex = parts.indexOf("upload");

    if (uploadIndex !== -1 && parts.length > uploadIndex + 1) {
      const afterUpload = parts.slice(uploadIndex + 1).join("/");

      return afterUpload.replace(/^v\d+\//, "").replace(/\.[^.]+$/, "");
    }

    return pathname;
  } catch {
    return url;
  }
};

/* ---------- TOKENIZER ---------- */

const tokenize = (value: unknown): string[] => {
  if (typeof value !== "string") return [];

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
};

/* ---------- SIMILARITY ---------- */

const similarityPercent = (
  aDescription: unknown,
  bDescription: unknown,
  aImageUrl?: unknown,
  bImageUrl?: unknown
): number => {
  if (
    typeof aImageUrl === "string" &&
    typeof bImageUrl === "string" &&
    aImageUrl.trim() &&
    bImageUrl.trim()
  ) {
    const aPublicId = extractPublicId(aImageUrl);
    const bPublicId = extractPublicId(bImageUrl);

    if (aPublicId && bPublicId && aPublicId === bPublicId) {
      return 100;
    }

    const aFile = extractFilename(aImageUrl);
    const bFile = extractFilename(bImageUrl);

    if (aFile === bFile) {
      return 100;
    }
  }

  const aTokens = new Set(tokenize(aDescription));
  const bTokens = new Set(tokenize(bDescription));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  const union = new Set([...aTokens, ...bTokens]).size;

  if (union === 0) return 0;

  const score = (intersection / union) * 100;

  return Math.round(score * 100) / 100;
};

/* ---------- AUTH ---------- */

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded) return null;

  return decoded.userId;
}

/* ---------- CREATE CLAIM ---------- */

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId, proposedAmount } = await request.json();

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const item = await Item.findById(itemId);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (item.userId?.toString() === userId) {
      return NextResponse.json(
        { error: "You cannot request contact for your own item" },
        { status: 400 }
      );
    }

    if (item.isClaimed || item.status === "resolved") {
      return NextResponse.json(
        { error: "Item already claimed/resolved" },
        { status: 400 }
      );
    }

    const existingRequest = await ContactRequest.findOne({
      itemId,
      requesterId: userId,
      status: { $in: ["pending", "approved"] },
    });

    if (existingRequest) {
      const already =
        existingRequest.status === "approved"
          ? "Request already sent and approved"
          : "Request already sent";

      return NextResponse.json({ error: already }, { status: 400 });
    }

    let aiMatchScore = normalizeScore(item.matchScore);

    if (aiMatchScore <= 0) {
      const counterpart = await Item.findOne({ matchedItemId: item._id })
        .sort({ matchScore: -1 })
        .select("matchScore");

      aiMatchScore = normalizeScore(counterpart?.matchScore);
    }

    if (aiMatchScore <= 0 || aiMatchScore < MIN_CLAIM_MATCH_SCORE) {
      const requesterType = item.type === "lost" ? "found" : "lost";

      const requesterCandidates = await Item.find({
        userId,
        type: requesterType,
        removedByAdmin: { $ne: true },
        isClaimed: { $ne: true },
      })
        .select("description imageUrl matchScore createdAt")
        .sort({ createdAt: -1 })
        .limit(75)
        .lean();

      let fallbackScore = 0;

      for (const candidate of requesterCandidates) {
        const descSimilarity = similarityPercent(
          item.description,
          candidate.description,
          item.imageUrl,
          candidate.imageUrl
        );

        let simScore = descSimilarity;

        if (descSimilarity > 70) {
          const timeDiff = Math.abs(
            new Date(item.createdAt).getTime() -
              new Date(candidate.createdAt).getTime()
          );

          if (timeDiff < 5 * 60 * 1000) {
            simScore = Math.max(simScore, 100);
          }
        }

        const candidateScore = normalizeScore((candidate as any)?.matchScore);

        fallbackScore = Math.max(fallbackScore, simScore, candidateScore);
      }

      aiMatchScore = fallbackScore;
    }

    if (!aiMatchScore || aiMatchScore < MIN_CLAIM_MATCH_SCORE) {
      return NextResponse.json(
        {
          error: `Claim request rejected. Match score: ${Math.round(
            aiMatchScore || 0
          )}%. Minimum required: ${MIN_CLAIM_MATCH_SCORE}%.`,
        },
        { status: 400 }
      );
    }

    let normalizedProposedAmount = Number(item.rewardAmount || 0);

    if (
      proposedAmount !== undefined &&
      proposedAmount !== null &&
      `${proposedAmount}`.trim() !== ""
    ) {
      const parsed = Number(proposedAmount);

      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: "Proposed amount must be a valid number ≥ 0" },
          { status: 400 }
        );
      }

      normalizedProposedAmount = parsed;
    }

    await ContactRequest.create({
      itemId,
      requesterId: userId,
      ownerId: item.userId,
      aiMatchScore,
      proposedAmount: normalizedProposedAmount,
    });

    return NextResponse.json({
      success: true,
      message: "Claim request sent successfully",
    });
  } catch (error) {
    console.error("Contact Request Error:", error);

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ---------- GET CLAIMS ---------- */

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const requests = await ContactRequest.find({
      ownerId: userId,
      status: { $in: ["pending", "approved"] },
    })
      .sort({ createdAt: -1 })
      .populate("itemId", "description type imageUrl rewardAmount")
      .populate("requesterId", "fullName email")
      .lean();

    return NextResponse.json({ requests });
  } catch (error) {
    console.error(error);

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ---------- DELETE CLAIM ---------- */

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId, deleteAll, scope } = await request.json();
    await connectDB();

    if (deleteAll && scope === "owner") {
      const result = await ContactRequest.deleteMany({ ownerId: userId });
      return NextResponse.json({
        success: true,
        deletedCount: result.deletedCount,
      });
    }

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId required" },
        { status: 400 }
      );
    }
    const deleted = await ContactRequest.findOneAndDelete({
      _id: requestId,
      ownerId: userId,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      message: "Claim deleted",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
